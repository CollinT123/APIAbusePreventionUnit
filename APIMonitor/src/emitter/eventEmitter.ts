import { appendFile } from "fs/promises";

import { config } from "../config";
import { ApiEvent, EventEmitResult } from "../types/apiEvent";

const BASE_RETRY_DELAY_MS = 200;
const FLUSH_INTERVAL_MS = 2000;
const MAX_BATCH_SIZE = 10;
const FALLBACK_LOG_PATH = "./event-log-fallback.jsonl";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class EventEmitter {
  private readonly batchEvents: boolean;
  private readonly batchUrl: string;
  private readonly buffer: ApiEvent[] = [];
  private flushIntervalId: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor(
    private readonly sinkUrl: string,
    private readonly timeoutMs: number = 3000,
    private readonly maxRetries: number = 2,
    private readonly logLocally: boolean = true,
    batchEvents: boolean = false,
    private readonly localFallbackLog: boolean = true
  ) {
    this.batchEvents = batchEvents;
    this.batchUrl = `${this.sinkUrl.replace(/\/$/, "")}/batch`;

    if (this.batchEvents) {
      this.flushIntervalId = setInterval(() => {
        void this.flush();
      }, FLUSH_INTERVAL_MS);
    }
  }

  async emit(event: ApiEvent): Promise<EventEmitResult> {
    if (this.logLocally) {
      console.log(
        `[EVENT] ${event.method} ${event.route} ${event.statusCode} ${event.latencyMs}ms`
      );
    }

    if (this.batchEvents) {
      this.buffer.push(event);

      if (this.buffer.length >= MAX_BATCH_SIZE) {
        void this.flush();
      }

      return {
        success: true,
        retriesUsed: 0
      };
    }

    return this.sendWithRetries(this.sinkUrl, event);
  }

  async flush(): Promise<EventEmitResult> {
    if (!this.batchEvents || this.buffer.length === 0) {
      return {
        success: true,
        retriesUsed: 0
      };
    }

    if (this.isFlushing) {
      return {
        success: true,
        retriesUsed: 0
      };
    }

    this.isFlushing = true;
    const eventsToFlush = [...this.buffer];
    const result = await this.sendWithRetries(this.batchUrl, eventsToFlush);

    if (result.success) {
      this.buffer.splice(0, eventsToFlush.length);
    }

    this.isFlushing = false;

    return result;
  }

  async shutdown(): Promise<void> {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }

    await this.flush();
  }

  private async sendWithRetries(
    url: string,
    payload: ApiEvent | ApiEvent[]
  ): Promise<EventEmitResult> {
    let retriesUsed = 0;
    let lastError = "Unknown emitter failure";

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return {
            success: true,
            statusCode: response.status,
            retriesUsed: attempt
          };
        }

        lastError = `Sink responded with status ${response.status}`;
      } catch (error) {
        clearTimeout(timeoutId);
        lastError =
          error instanceof Error ? error.message : "Unknown emitter failure";
      }

      retriesUsed = attempt;

      if (attempt < this.maxRetries) {
        await wait(BASE_RETRY_DELAY_MS * 2 ** attempt);
      }
    }

    console.error(`[EVENT_EMIT_FAILED] ${lastError}`);
    await this.writeFallbackLog(payload, lastError);

    return {
      success: false,
      error: lastError,
      retriesUsed
    };
  }

  private async writeFallbackLog(
    payload: ApiEvent | ApiEvent[],
    failureReason: string
  ): Promise<void> {
    if (!this.localFallbackLog) {
      return;
    }

    const events = Array.isArray(payload) ? payload : [payload];
    const lines = events
      .map((event) => JSON.stringify({ ...event, _failureReason: failureReason }))
      .join("\n");

    try {
      await appendFile(FALLBACK_LOG_PATH, `${lines}\n`, "utf8");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown fallback log failure";
      console.error(`[EVENT_FALLBACK_LOG_FAILED] ${message}`);
    }
  }
}

export function createEventEmitter(currentConfig = config): EventEmitter {
  return new EventEmitter(
    currentConfig.EVENT_SINK_URL,
    currentConfig.EVENT_SINK_TIMEOUT_MS,
    currentConfig.EVENT_SINK_RETRY_COUNT,
    currentConfig.LOG_EVENTS_LOCALLY,
    currentConfig.BATCH_EVENTS,
    currentConfig.LOCAL_FALLBACK_LOG
  );
}

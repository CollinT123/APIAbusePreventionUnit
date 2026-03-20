import express from "express";
import { Server } from "http";

import { config } from "./config";
import { EventEmitter } from "./emitter/eventEmitter";
import { fixRegistry } from "./fixes/fixRegistry";
import { removeCache } from "./fixes/strategies/responseCache";
import { fixInterceptor } from "./middleware/fixInterceptor";
import { requestTracker } from "./middleware/requestTracker";
import { EventStore } from "./store/eventStore";

const users = [
  { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
  { id: "2", name: "Grace Hopper", email: "grace@example.com" },
  { id: "3", name: "Margaret Hamilton", email: "margaret@example.com" }
];

const orders = [
  { id: "101", userId: "1", total: 149.99, status: "paid" },
  { id: "102", userId: "2", total: 89.5, status: "processing" },
  { id: "103", userId: "3", total: 24.0, status: "shipped" }
];

function withLatency(handler: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => {
    const delayMs = 50 + Math.floor(Math.random() * 251);

    setTimeout(() => {
      void handler(req, res, next);
    }, delayMs);
  };
}

function getNextChainDepthHeader(currentValue: string | undefined): string {
  const parsedDepth =
    currentValue !== undefined && Number.isFinite(Number(currentValue))
      ? Number(currentValue)
      : 0;

  return String(parsedDepth + 1);
}

function getSinkOrigin(currentConfig = config): string {
  const sinkUrl = new URL(currentConfig.EVENT_SINK_URL);
  return sinkUrl.origin;
}

async function fetchAnalyzedEventsFromSink(currentConfig = config) {
  const response = await fetch(`${getSinkOrigin(currentConfig)}/events/analyzed`);

  if (!response.ok) {
    throw new Error(`Sink status fetch failed with ${response.status}`);
  }

  return response.json() as Promise<
    Array<{
      event: import("./types/rawApiEvent").RawApiEvent;
      analysis: import("./types/analyzedApiEvent").AnalyzedApiEvent;
    }>
  >;
}

function addFixRoutes(app: express.Express, currentConfig = config): void {
  app.post("/fixes", (req, res) => {
    const {
      ruleName,
      route,
      strategy = "response_cache",
      params = { ttlMs: 5000 }
    } = req.body as {
      ruleName?: string;
      route?: string;
      strategy?: string;
      params?: Record<string, unknown>;
    };

    if (!ruleName || !route) {
      res.status(400).json({ error: "ruleName and route are required" });
      return;
    }

    const fix = fixRegistry.applyFix(ruleName, route, strategy, params);
    console.log(`[FIX APPLIED] ${strategy} on ${route} for ${ruleName}`);
    res.status(201).json(fix);
  });

  app.get("/fixes", (_req, res) => {
    res.json(fixRegistry.getAllFixes());
  });

  app.get("/fixes/:id/status", async (req, res) => {
    const fix = fixRegistry.getAllFixes().find((entry) => entry.id === req.params.id);

    if (!fix) {
      res.status(404).json({ error: "Fix not found" });
      return;
    }

    try {
      const analyzedEntries = await fetchAnalyzedEventsFromSink(currentConfig);
      const tempStore = new EventStore();

      for (const { event, analysis } of analyzedEntries) {
        tempStore.add(event);
        tempStore.setAnalysis(event.requestId, analysis);
      }

      const status = fixRegistry.getFixStatus(req.params.id, tempStore);

      if (!status) {
        res.status(404).json({ error: "Fix not found" });
        return;
      }

      res.json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ error: message });
    }
  });

  app.delete("/fixes/:id", (req, res) => {
    const fix = fixRegistry.getAllFixes().find((entry) => entry.id === req.params.id);

    if (!fix) {
      res.status(404).json({ error: "Fix not found" });
      return;
    }

    fixRegistry.removeFix(req.params.id);
    removeCache(fix.route);
    console.log(`[FIX REMOVED] ${req.params.id}`);
    res.json({ removed: true });
  });
}

function addDemoRoutes(app: express.Express): void {
  app.get(
    "/api/users",
    withLatency((_req, res) => {
      res.json(users);
    })
  );

  app.get(
    "/api/users/:id",
    withLatency((req, res) => {
      const user = users.find((entry) => entry.id === req.params.id);

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json(user);
    })
  );

  app.post(
    "/api/users",
    withLatency((req, res) => {
      const createdUser = {
        id: String(users.length + 1),
        name: req.body?.name ?? "New User",
        email: req.body?.email ?? "new.user@example.com"
      };

      res.status(201).json(createdUser);
    })
  );

  app.get(
    "/api/orders",
    withLatency((_req, res) => {
      res.json(orders);
    })
  );

  app.get(
    "/api/orders/:id",
    withLatency(async (req, res) => {
      const order = orders.find((entry) => entry.id === req.params.id);

      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      const host = req.get("host");

      if (host) {
        const protocol = req.protocol || "http";

        try {
          await fetch(`${protocol}://${host}/api/users/${order.userId}`, {
            headers: {
              "x-correlation-id": req.correlationId ?? "",
              "x-chain-depth": getNextChainDepthHeader(req.get("x-chain-depth"))
            }
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown internal lookup failure";
          console.error(`[INTERNAL_LOOKUP_FAILED] ${message}`);
        }
      }

      res.json(order);
    })
  );

  app.get(
    "/api/health",
    withLatency((_req, res) => {
      res.json({ status: "ok" });
    })
  );
}

function createConfiguredApp(
  currentConfig = config,
  emitter = new EventEmitter(
    currentConfig.EVENT_SINK_URL,
    currentConfig.EVENT_SINK_TIMEOUT_MS,
    currentConfig.EVENT_SINK_RETRY_COUNT,
    currentConfig.LOG_EVENTS_LOCALLY,
    currentConfig.BATCH_EVENTS,
    currentConfig.LOCAL_FALLBACK_LOG
  )
): express.Express {
  const app = express();

  app.use(express.json());
  app.use(requestTracker(emitter.emit.bind(emitter)));
  app.use(fixInterceptor());

  addFixRoutes(app, currentConfig);
  addDemoRoutes(app);

  return app;
}

export function createApp(currentConfig = config): express.Express {
  return createConfiguredApp(currentConfig);
}

export function startServer(
  currentConfig = config,
  port = currentConfig.PORT,
  host = "127.0.0.1",
  emitter = new EventEmitter(
    currentConfig.EVENT_SINK_URL,
    currentConfig.EVENT_SINK_TIMEOUT_MS,
    currentConfig.EVENT_SINK_RETRY_COUNT,
    currentConfig.LOG_EVENTS_LOCALLY,
    currentConfig.BATCH_EVENTS,
    currentConfig.LOCAL_FALLBACK_LOG
  )
): Server {
  const app = createConfiguredApp(currentConfig, emitter);

  return app.listen(port, host, () => {
    console.log(
      `API Server listening on port ${port}, emitting events to ${currentConfig.EVENT_SINK_URL}`
    );
  });
}

export function registerGracefulShutdown(
  server: Server,
  emitter?: EventEmitter
): void {
  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}, shutting down`);
    server.close(async () => {
      try {
        await emitter?.shutdown();
      } finally {
        process.exit(0);
      }
    });
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

if (require.main === module) {
  const emitter = new EventEmitter(
    config.EVENT_SINK_URL,
    config.EVENT_SINK_TIMEOUT_MS,
    config.EVENT_SINK_RETRY_COUNT,
    config.LOG_EVENTS_LOCALLY,
    config.BATCH_EVENTS,
    config.LOCAL_FALLBACK_LOG
  );
  const server = startServer(config, config.PORT, "127.0.0.1", emitter);
  registerGracefulShutdown(server, emitter);
}

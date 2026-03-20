import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendFile } from "fs/promises";

vi.mock("fs/promises", () => ({
  appendFile: vi.fn()
}));

import { EventEmitter } from "../src/emitter/eventEmitter";
import { ApiEvent } from "../src/types/apiEvent";

const sampleEvent: ApiEvent = {
  requestId: "request-1",
  correlationId: "correlation-1",
  schemaVersion: "1.0",
  timestamp: "2026-03-20T10:00:00.000Z",
  completedAt: "2026-03-20T10:00:00.100Z",
  latencyMs: 100,
  method: "GET",
  originalUrl: "/api/users/1",
  route: "/api/users/:id",
  queryParams: { expand: "true" },
  fingerprint: "fingerprint-123",
  chainDepth: 0,
  statusCode: 200,
  success: true,
  requestBodySize: null,
  responseSize: 128,
  serviceName: "demo-api",
  environment: "test",
  clientId: "client-1",
  sessionId: "session-1",
  userAgent: "vitest"
};

describe("EventEmitter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(appendFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns success with zero retries on an immediate 200 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const emitter = new EventEmitter("http://localhost:4000/events", 3000, 2, false);
    const result = await emitter.emit(sampleEvent);

    expect(result).toEqual({
      success: true,
      statusCode: 200,
      retriesUsed: 0
    });
  });

  it("retries once after a failure and succeeds on the second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const emitter = new EventEmitter("http://localhost:4000/events", 3000, 2, false);
    const result = await emitter.emit(sampleEvent);

    expect(result).toEqual({
      success: true,
      statusCode: 200,
      retriesUsed: 1
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns failure after all retries are exhausted without throwing", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("sink down"));
    vi.stubGlobal("fetch", fetchMock);

    const emitter = new EventEmitter("http://localhost:4000/events", 3000, 2, false);

    await expect(emitter.emit(sampleEvent)).resolves.toEqual({
      success: false,
      error: "sink down",
      retriesUsed: 2
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("aborts a hanging request when the timeout is reached", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("This operation was aborted"));
          });
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const emitter = new EventEmitter("http://localhost:4000/events", 50, 0, false);
    const emitPromise = emitter.emit(sampleEvent);

    await vi.advanceTimersByTimeAsync(50);

    await expect(emitPromise).resolves.toEqual({
      success: false,
      error: "This operation was aborted",
      retriesUsed: 0
    });
  });

  it("sends the correct Content-Type header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const emitter = new EventEmitter("http://localhost:4000/events", 3000, 2, false);
    await emitter.emit(sampleEvent);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/events",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json"
        })
      })
    );
  });

  it("sends the event as a JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const emitter = new EventEmitter("http://localhost:4000/events", 3000, 2, false);
    await emitter.emit(sampleEvent);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/events",
      expect.objectContaining({
        body: JSON.stringify(sampleEvent)
      })
    );
  });
});

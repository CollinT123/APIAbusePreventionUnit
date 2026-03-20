import { describe, expect, it, vi } from "vitest";

import { requestTracker } from "../src/middleware/requestTracker";
import { ApiEvent } from "../src/types/apiEvent";

type MockRequest = {
  method: string;
  headers: Record<string, string | undefined>;
  originalUrl: string;
  query: Record<string, unknown>;
  body?: unknown;
  route?: { path?: string };
  get: (name: string) => string | undefined;
  requestId?: string;
  correlationId?: string;
};

type MockResponse = {
  statusCode: number;
  setHeader: ReturnType<typeof vi.fn>;
  getHeader: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function createMockRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  const headers = overrides.headers ?? {};

  return {
    method: "GET",
    headers,
    originalUrl: "/api/users/1?expand=true",
    query: { expand: "true" },
    body: undefined,
    route: { path: "/api/users/:id" },
    get: (name: string) => headers[name.toLowerCase()],
    ...overrides
  };
}

function createMockResponse(statusCode = 200): MockResponse & {
  finishListener?: () => void;
} {
  const response: MockResponse & { finishListener?: () => void } = {
    statusCode,
    setHeader: vi.fn(),
    getHeader: vi.fn((name: string) =>
      name === "content-length" ? "123" : undefined
    ),
    on: vi.fn((event: string, listener: () => void) => {
      if (event === "finish") {
        response.finishListener = listener;
      }
    })
  };

  return response;
}

describe("requestTracker", () => {
  it("calls next immediately without waiting for finish", () => {
    const onEvent = vi.fn();
    const middleware = requestTracker(onEvent);
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("sets x-request-id and x-correlation-id response headers", () => {
    const onEvent = vi.fn();
    const middleware = requestTracker(onEvent);
    const req = createMockRequest({
      headers: {
        "x-correlation-id": "provided-correlation-id",
        "x-chain-depth": "2"
      }
    });
    const res = createMockResponse();

    middleware(req as never, res as never, vi.fn());

    expect(res.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      expect.any(String)
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "x-correlation-id",
      "provided-correlation-id"
    );
    expect(res.setHeader).toHaveBeenCalledWith("x-chain-depth", "3");
  });

  it("reuses a provided x-correlation-id", () => {
    const onEvent = vi.fn();
    const middleware = requestTracker(onEvent);
    const req = createMockRequest({
      headers: { "x-correlation-id": "existing-correlation-id" }
    });
    const res = createMockResponse();

    middleware(req as never, res as never, vi.fn());

    expect(req.correlationId).toBe("existing-correlation-id");
  });

  it("generates a correlation id when one is not provided", () => {
    const onEvent = vi.fn();
    const middleware = requestTracker(onEvent);
    const req = createMockRequest({ headers: {} });
    const res = createMockResponse();

    middleware(req as never, res as never, vi.fn());

    expect(req.correlationId).toEqual(expect.any(String));
    expect(req.correlationId).not.toBe("");
  });

  it("calls onEvent with a valid ApiEvent when the response finishes", () => {
    const onEvent = vi.fn<(event: ApiEvent) => void>();
    const middleware = requestTracker(onEvent);
    const req = createMockRequest({
      headers: {
        "x-correlation-id": "corr-123",
        "x-client-id": "client-1",
        "x-session-id": "session-1",
        "user-agent": "vitest-agent"
      }
    });
    const res = createMockResponse(201);

    middleware(req as never, res as never, vi.fn());
    res.finishListener?.();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String),
        correlationId: "corr-123",
        schemaVersion: "1.0",
        method: "GET",
        originalUrl: "/api/users/1?expand=true",
        route: "/api/users/:id",
        chainDepth: 0,
        statusCode: 201,
        requestBodySize: null,
        responseSize: 123,
        serviceName: expect.any(String),
        environment: expect.any(String),
        clientId: "client-1",
        sessionId: "session-1",
        userAgent: "vitest-agent"
      })
    );
  });

  it("emits the correct method, originalUrl, and statusCode", () => {
    const onEvent = vi.fn();
    const middleware = requestTracker(onEvent);
    const req = createMockRequest({
      method: "POST",
      originalUrl: "/api/users",
      route: { path: "/api/users" }
    });
    const res = createMockResponse(201);

    middleware(req as never, res as never, vi.fn());
    res.finishListener?.();

    const event = onEvent.mock.calls[0][0] as ApiEvent;

    expect(event.method).toBe("POST");
    expect(event.originalUrl).toBe("/api/users");
    expect(event.statusCode).toBe(201);
  });

  it("emits a positive latency and a non-empty fingerprint", () => {
    const onEvent = vi.fn();
    const middleware = requestTracker(onEvent);
    const req = createMockRequest();
    const res = createMockResponse();

    middleware(req as never, res as never, vi.fn());
    res.finishListener?.();

    const event = onEvent.mock.calls[0][0] as ApiEvent;

    expect(event.latencyMs).toBeGreaterThanOrEqual(0);
    expect(event.fingerprint).toEqual(expect.any(String));
    expect(event.fingerprint.length).toBeGreaterThan(0);
  });

  it("defaults chainDepth to 0 and emits the provided inbound depth when present", () => {
    const defaultHandler = vi.fn();
    const providedHandler = vi.fn();
    const defaultMiddleware = requestTracker(defaultHandler);
    const providedMiddleware = requestTracker(providedHandler);

    const defaultReq = createMockRequest();
    const defaultRes = createMockResponse();
    defaultMiddleware(defaultReq as never, defaultRes as never, vi.fn());
    defaultRes.finishListener?.();

    const providedReq = createMockRequest({
      headers: { "x-chain-depth": "4" }
    });
    const providedRes = createMockResponse();
    providedMiddleware(providedReq as never, providedRes as never, vi.fn());
    providedRes.finishListener?.();

    expect((defaultHandler.mock.calls[0][0] as ApiEvent).chainDepth).toBe(0);
    expect((providedHandler.mock.calls[0][0] as ApiEvent).chainDepth).toBe(4);
  });

  it("sets success to true for status codes below 400 and false otherwise", () => {
    const successHandler = vi.fn();
    const failureHandler = vi.fn();
    const middlewareForSuccess = requestTracker(successHandler);
    const middlewareForFailure = requestTracker(failureHandler);

    const successReq = createMockRequest();
    const successRes = createMockResponse(204);
    middlewareForSuccess(successReq as never, successRes as never, vi.fn());
    successRes.finishListener?.();

    const failureReq = createMockRequest();
    const failureRes = createMockResponse(404);
    middlewareForFailure(failureReq as never, failureRes as never, vi.fn());
    failureRes.finishListener?.();

    expect((successHandler.mock.calls[0][0] as ApiEvent).success).toBe(true);
    expect((failureHandler.mock.calls[0][0] as ApiEvent).success).toBe(false);
  });
});

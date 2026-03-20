import type { RawApiEvent } from "../../src/types/rawApiEvent";

export function makeRawEvent(input: Partial<RawApiEvent> & { requestId: string; timestamp: string; route: string }): RawApiEvent {
  const { requestId, timestamp, route, ...rest } = input;

  return {
    schemaVersion: input.schemaVersion ?? "1.0",
    requestId,
    correlationId: rest.correlationId ?? "corr-1",
    timestamp,
    completedAt: rest.completedAt ?? timestamp,
    latencyMs: rest.latencyMs ?? 120,
    method: rest.method ?? "GET",
    originalUrl: rest.originalUrl ?? route,
    route,
    queryParams: rest.queryParams ?? {},
    fingerprint: rest.fingerprint ?? `fp:${rest.method ?? "GET"}:${route}`,
    chainDepth: rest.chainDepth ?? 1,
    statusCode: rest.statusCode ?? 200,
    success: rest.success ?? true,
    requestBodySize: rest.requestBodySize ?? null,
    responseSize: rest.responseSize ?? null,
    serviceName: rest.serviceName ?? "student-service",
    environment: rest.environment ?? "dev",
    clientId: rest.clientId ?? "client-1",
    sessionId: rest.sessionId ?? "sess-1",
    userAgent: rest.userAgent ?? "unit-test-agent/1.0"
  };
}


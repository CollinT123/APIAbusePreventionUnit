import type { RawApiEvent } from "../types/rawApiEvent";

export function buildSourceKey(event: RawApiEvent): string {
  const clientId = event.clientId ?? "none";
  const sessionId = event.sessionId ?? "none";
  const serviceName = event.serviceName ?? "unknown-service";
  const userAgent = event.userAgent ?? "none-ua";
  return `clientId:${clientId}|sessionId:${sessionId}|service:${serviceName}|ua:${userAgent}`;
}

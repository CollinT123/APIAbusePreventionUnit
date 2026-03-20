import type { RawApiEvent } from "../types/rawApiEvent";

/**
 * Best-effort "source identity" builder for abuse detection.
 *
 * Limitations (important for MVP):
 * - If both `clientId` and `sessionId` are null/missing, many distinct users may share the same key
 *   (e.g., same `serviceName` and `userAgent` behind a NAT/proxy).
 * - If `userAgent` is unstable or null, identity can fragment and reduce rule accuracy.
 * - This is not a substitute for IP-based identity; it is only meant to be "good enough" for grouping.
 */
export function buildSourceKey(event: RawApiEvent): string {
  const clientId = event.clientId ?? "none";
  const sessionId = event.sessionId ?? "none";
  const serviceName = event.serviceName ?? "unknown-service";
  const userAgent = event.userAgent ?? "none-ua";
  return `clientId:${clientId}|sessionId:${sessionId}|service:${serviceName}|ua:${userAgent}`;
}


import { z } from "zod";
import type { RawApiEvent } from "../types/rawApiEvent";

export const rawApiEventSchema = z.object({
  schemaVersion: z.string(),
  requestId: z.string(),
  correlationId: z.string(),
  timestamp: z.string(),
  completedAt: z.string(),
  latencyMs: z.number(),
  method: z.string(),
  originalUrl: z.string(),
  route: z.string(),
  queryParams: z.record(z.string(), z.string()),
  fingerprint: z.string(),
  chainDepth: z.number(),
  statusCode: z.number(),
  success: z.boolean(),
  requestBodySize: z.number().nullable(),
  responseSize: z.number().nullable(),
  serviceName: z.string(),
  environment: z.string(),
  clientId: z.string().nullable(),
  sessionId: z.string().nullable(),
  userAgent: z.string().nullable()
});

export function parseRawApiEvent(input: unknown): RawApiEvent {
  return rawApiEventSchema.parse(input) as RawApiEvent;
}

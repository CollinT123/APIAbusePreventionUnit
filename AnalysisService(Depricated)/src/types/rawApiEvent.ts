export interface RawApiEvent {
  schemaVersion: string;
  requestId: string;
  correlationId: string;
  timestamp: string;
  completedAt: string;
  latencyMs: number;
  method: string;
  originalUrl: string;
  route: string;
  queryParams: Record<string, string>;
  fingerprint: string;
  chainDepth: number;
  statusCode: number;
  success: boolean;
  requestBodySize: number | null;
  responseSize: number | null;
  serviceName: string;
  environment: string;
  clientId: string | null;
  sessionId: string | null;
  userAgent: string | null;
}


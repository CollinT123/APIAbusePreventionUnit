export interface ApiEvent {
  /** Unique identifier for this emitted request event. */
  requestId: string;
  /** Identifier used to correlate related requests across services. */
  correlationId: string;
  /** Schema version string (e.g. '1.0') — lets downstream handle event schema evolution */
  schemaVersion: string;
  /** ISO 8601 timestamp for when the request was first observed. */
  timestamp: string;
  /** ISO 8601 timestamp for when request processing completed. */
  completedAt: string;
  /** Total request processing time in milliseconds. */
  latencyMs: number;
  /** HTTP method used for the request. */
  method: string;
  /** Original request URL as received by Express. */
  originalUrl: string;
  /** Normalized Express route pattern for the matched endpoint. */
  route: string;
  /** Query string parameters normalized into string key-value pairs. */
  queryParams: Record<string, string>;
  /** Stable request fingerprint used for abuse detection and grouping. */
  fingerprint: string;
  /** Depth of the inbound service-to-service request chain. */
  chainDepth: number;
  /** HTTP response status code returned to the client. */
  statusCode: number;
  /** Indicates whether the response should be treated as successful. */
  success: boolean;
  /** Request payload size in bytes when known, otherwise null. */
  requestBodySize: number | null;
  /** Response payload size in bytes when known, otherwise null. */
  responseSize: number | null;
  /** Service name that emitted the event. */
  serviceName: string;
  /** Deployment environment for the emitting service. */
  environment: string;
  /** Client identifier extracted from the request when available. */
  clientId: string | null;
  /** Session identifier associated with the request when available. */
  sessionId: string | null;
  /** User-Agent header value when provided by the client. */
  userAgent: string | null;
}

export type EventEmitResult = {
  /** Whether the event emission completed successfully. */
  success: boolean;
  /** HTTP status code returned by the sink when available. */
  statusCode?: number;
  /** Error message captured when emission fails. */
  error?: string;
  /** Number of retries used before the final result. */
  retriesUsed: number;
};

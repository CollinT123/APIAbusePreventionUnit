export const config = {
  SERVICE_NAME: process.env.SERVICE_NAME ?? "demo-api",
  ENVIRONMENT: process.env.ENVIRONMENT ?? "development",
  SCHEMA_VERSION: "1.0",
  EVENT_SINK_URL: process.env.EVENT_SINK_URL ?? "http://localhost:4000/events",
  EVENT_SINK_TIMEOUT_MS: Number(process.env.EVENT_SINK_TIMEOUT_MS ?? 3000),
  EVENT_SINK_RETRY_COUNT: Number(process.env.EVENT_SINK_RETRY_COUNT ?? 2),
  BATCH_EVENTS:
    process.env.BATCH_EVENTS === undefined
      ? false
      : process.env.BATCH_EVENTS.toLowerCase() === "true",
  LOCAL_FALLBACK_LOG:
    process.env.LOCAL_FALLBACK_LOG === undefined
      ? true
      : process.env.LOCAL_FALLBACK_LOG.toLowerCase() === "true",
  PORT: Number(process.env.PORT ?? 3000),
  LOG_EVENTS_LOCALLY:
    process.env.LOG_EVENTS_LOCALLY === undefined
      ? true
      : process.env.LOG_EVENTS_LOCALLY.toLowerCase() === "true"
};

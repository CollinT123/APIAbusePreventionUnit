# api-event-emitter

Project root for this package is now:

```text
APIMonitor/
```

Run all commands in this README from inside `APIMonitor/`.

## What This Does

This subsystem instruments Express API traffic and emits structured request-completion events via HTTP `POST` to whatever event sink URL you configure. It is designed for demos and hackathon integration work: requests are observed in middleware, normalized into a stable event schema, and sent asynchronously to a downstream analytics or monitoring service after the API response has finished. It also supports optional batching, request-chain tracking, and a local JSONL fallback log if the sink is unavailable.

## Quick Start

1. Install dependencies:

```bash
cd APIMonitor
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env
```

This may already be done in your local checkout.

### File Layout

Key files now live under these paths:

- `APIMonitor/package.json`
- `APIMonitor/tsconfig.json`
- `APIMonitor/.env.example`
- `APIMonitor/src/index.ts`
- `APIMonitor/src/config.ts`
- `APIMonitor/src/middleware/requestTracker.ts`
- `APIMonitor/src/emitter/eventEmitter.ts`
- `APIMonitor/src/types/apiEvent.ts`
- `APIMonitor/src/utils/fingerprint.ts`
- `APIMonitor/src/utils/sanitize.ts`
- `APIMonitor/mock-sink/index.ts`
- `APIMonitor/scripts/simulate.ts`
- `APIMonitor/tests/*.test.ts`
- `APIMonitor/sample-events.json`

3. Start the mock event sink in one terminal:

```bash
npm run sink
```

4. Start the API in a second terminal:

```bash
npm run dev
```

5. Run the traffic simulator in a third terminal:

```bash
npm run simulate
```

`npm run simulate` sends a sequence of realistic requests to `http://localhost:3000` to prove the instrumentation is working and to generate useful demo data in the sink. It runs the following scenarios in order, with a 2-second gap between each one:

- Normal browsing: `GET /api/users`, `GET /api/users/1`, `GET /api/orders`
- Duplicate calls: the same `GET /api/users/1` request 5 times within 500ms
- Retry storm: `POST /api/users` 8 times rapidly
- Polling: `GET /api/orders` once per second for 10 iterations
- 404 hammering: `GET /api/users/999` 4 times
- Mixed burst: 20 random requests across the demo routes over roughly 3 seconds

These scenarios are intended to show the kinds of patterns a downstream analytics system should detect:

- Stable duplicate fingerprints for repeated structurally identical calls
- Bursty write traffic that looks like naive retries
- Inefficient polling behavior over time
- Repeated not-found traffic that may indicate bad clients or enumeration attempts
- Mixed real-world traffic across healthy and failing endpoints

One additional demo behavior is built into the API itself: `GET /api/orders/:id` performs an internal lookup to `GET /api/users/:userId` before returning. That produces two linked events for one logical request. The downstream team can use `correlationId` to connect them and `chainDepth` to see the service-to-service hop count.

6. Inspect the aggregated event summary:

```bash
curl http://localhost:4000/events/summary
```

## Event Schema

The emitted event type is `ApiEvent`.

Source of truth for the schema lives in:

```text
APIMonitor/src/types/apiEvent.ts
```

| Field | Type | Description |
| --- | --- | --- |
| `requestId` | `string` | Unique identifier for the emitted request event. |
| `correlationId` | `string` | Identifier used to trace related requests across services. |
| `schemaVersion` | `string` | Schema version for downstream compatibility and evolution handling. |
| `timestamp` | `string` | ISO 8601 timestamp for when the request was first observed. |
| `completedAt` | `string` | ISO 8601 timestamp for when response processing completed. |
| `latencyMs` | `number` | End-to-end request latency in milliseconds. |
| `method` | `string` | HTTP method, normalized to the request method used by Express. |
| `originalUrl` | `string` | Original URL from the incoming request, including query string if present. |
| `route` | `string` | Normalized Express route pattern such as `/api/users/:id`. |
| `queryParams` | `Record<string, string>` | Sanitized query parameters with sensitive values redacted. |
| `fingerprint` | `string` | SHA-256 hash derived from method, route, and sorted query keys. |
| `chainDepth` | `number` | Inbound request-chain depth from `x-chain-depth`, used to spot chatty service chains. |
| `statusCode` | `number` | Final HTTP status code returned to the client. |
| `success` | `boolean` | `true` for responses below `400`, otherwise `false`. |
| `requestBodySize` | `number \| null` | Request body size in bytes when available from the request `content-length` header or computed from `req.body`. |
| `responseSize` | `number \| null` | Response size in bytes when available from the `content-length` header. |
| `serviceName` | `string` | Name of the emitting service. |
| `environment` | `string` | Environment label for the emitting service. |
| `clientId` | `string \| null` | Optional client identifier from the `x-client-id` header. |
| `sessionId` | `string \| null` | Optional session identifier from the `x-session-id` header. |
| `userAgent` | `string \| null` | Optional user agent captured from the incoming request. |

## Integration Guide

- How to receive events: expose an HTTP endpoint that accepts `POST /events` with an `ApiEvent` JSON body.
- The contract: you will receive one event per API request, emitted after the API response completes.
- Delivery semantics: events are sent asynchronously and best-effort. They are retried a small number of times, but delivery is not guaranteed.
- Batching: when `BATCH_EVENTS=true`, events are buffered and sent as a JSON array to `POST /events/batch` every 2 seconds or when 10 events are queued.
- Local fallback: if delivery still fails after retries, each failed event is appended locally to `./event-log-fallback.jsonl` with a `_failureReason` field when `LOCAL_FALLBACK_LOG=true`.
- `fingerprint`: this field groups structurally similar requests by hashing `METHOD + route + sorted query keys`, ignoring query values. It helps detect duplicate calls, retry storms, and noisy polling patterns.
- `correlationId`: this field links related requests across services. If an upstream service sends `x-correlation-id`, it is preserved; otherwise a new one is generated.
- `chainDepth`: this field tells you how deep into a service-to-service chain the current request is. The middleware also sets `x-chain-depth` on the response as `currentDepth + 1` so downstream services can propagate it.

Relevant implementation paths:

- Middleware: `APIMonitor/src/middleware/requestTracker.ts`
- Emitter: `APIMonitor/src/emitter/eventEmitter.ts`
- Demo API: `APIMonitor/src/index.ts`
- Mock sink: `APIMonitor/mock-sink/index.ts`
- Simulator: `APIMonitor/scripts/simulate.ts`

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `SERVICE_NAME` | `demo-api` | Name attached to every emitted event. |
| `ENVIRONMENT` | `development` | Environment label attached to every event. |
| `EVENT_SINK_URL` | `http://localhost:4000/events` | Destination URL for emitted events. |
| `EVENT_SINK_TIMEOUT_MS` | `3000` | Per-attempt timeout for sink delivery. |
| `EVENT_SINK_RETRY_COUNT` | `2` | Number of retries after the initial failed send. |
| `BATCH_EVENTS` | `false` | When `true`, buffers events and sends them in batches to `/events/batch`. |
| `LOCAL_FALLBACK_LOG` | `true` | When `true`, writes permanently failed events to `./event-log-fallback.jsonl`. |
| `PORT` | `3000` | Port used by the demo API. |
| `LOG_EVENTS_LOCALLY` | `true` | When enabled, logs a compact local event summary for debugging. |
| `SCHEMA_VERSION` | `1.0` | Code-level constant attached to all emitted events. Not sourced from env. |

## Assumptions

- We assume the downstream sink is HTTP and accepts JSON.
- We do not persist events in a durable queue. Optional batching is in-memory only.
- Event emission is fire-and-forget from the middleware perspective and never blocks the API response path.
- Sensitive query parameter values are redacted, but request and response bodies are not captured.
- Only request and response sizes are captured, not payload contents.
- The fingerprint compares structural request shape, not exact values.
- The local fallback log is intended for development and demo resilience, not as a production-grade delivery pipeline.

## What I Need From You

- Give me the URL of your event sink and I will configure `EVENT_SINK_URL`.
- Confirm your sink accepts `POST` requests with `Content-Type: application/json`.
- Tell me if you need additional fields in `ApiEvent` and I will extend the schema.

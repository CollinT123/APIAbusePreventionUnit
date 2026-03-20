# api-event-emitter

This subsystem is Express middleware that intercepts every API request/response cycle, captures structured metadata such as timing, route, fingerprint, status, and correlation IDs, and emits it as a JSON event via HTTP POST to a configurable downstream service. It does not store, analyze, or visualize anything itself; it only captures request metadata and forwards it.

## Quick Start

Run these commands from the `APIMonitor/` directory.

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env
```

3. Start the mock event sink:

```bash
npm run sink
```

This runs on port `4000`.

4. In a second terminal, start the API:

```bash
npm run dev
```

This runs on port `3000`.

5. In a third terminal, run the traffic simulator:

```bash
npm run simulate
```

6. View captured events:

```bash
curl http://localhost:4000/events/summary
```

## Architecture

```text
Incoming request
    |
    v
requestTracker middleware
  - assigns requestId
  - reads or creates correlationId
  - records startTime
  - tracks chainDepth
    |
    v
normal route handler
    |
    v
response finish hook
  - computes latency
  - sanitizes query params
  - builds ApiEvent
  - calls EventEmitter
    |
    v
HTTP POST to event sink
```

```text
APIMonitor/
├── .env.example                 # Example local environment configuration
├── .gitignore                   # Project-level ignore rules
├── README.md                    # Project overview, setup, schema, and integration guide
├── mock-sink/
│   └── index.ts                 # Reference sink implementation for receiving/storing events
├── package-lock.json            # Locked dependency graph
├── package.json                 # Project metadata and npm scripts
├── sample-events.json           # Example ApiEvent payloads for teammates
├── scripts/
│   └── simulate.ts              # Traffic generator for demo scenarios
├── src/
│   ├── config.ts                # Runtime configuration derived from env vars and constants
│   ├── emitter/
│   │   └── eventEmitter.ts      # Event delivery, retries, batching, fallback logging
│   ├── index.ts                 # Demo Express API server and routes
│   ├── middleware/
│   │   └── requestTracker.ts    # Core middleware that captures request metadata
│   ├── types/
│   │   └── apiEvent.ts          # ApiEvent and EventEmitResult type definitions
│   └── utils/
│       ├── fingerprint.ts       # Stable request fingerprint generation
│       └── sanitize.ts          # Query param sanitization and redaction
├── tests/
│   ├── eventEmitter.test.ts     # Event emitter unit tests
│   ├── fingerprint.test.ts      # Fingerprint utility tests
│   ├── integration.test.ts      # End-to-end API to sink integration test
│   ├── requestTracker.test.ts   # Middleware unit tests
│   └── sanitize.test.ts         # Query sanitization tests
└── tsconfig.json                # TypeScript compiler configuration
```

## Event Schema

| Field | Type | Description |
| --- | --- | --- |
| `schemaVersion` | `string` | Event schema version, currently `"1.0"`. |
| `requestId` | `string` | UUID v4 generated per request. |
| `correlationId` | `string` | From `x-correlation-id` header when present, otherwise auto-generated. |
| `timestamp` | `string` | ISO 8601 timestamp for when the request arrived. |
| `completedAt` | `string` | ISO 8601 timestamp for when the response finished. |
| `latencyMs` | `number` | Response time in milliseconds. |
| `method` | `string` | HTTP method such as `GET` or `POST`. |
| `originalUrl` | `string` | Full URL path as received by Express, including query string. |
| `route` | `string` | Normalized Express route pattern such as `/api/users/:id`. |
| `queryParams` | `Record<string, string>` | Sanitized query parameters with sensitive values redacted. |
| `fingerprint` | `string` | SHA-256 hash of method + route + sorted query keys. |
| `chainDepth` | `number` | Current request-chain depth derived from `x-chain-depth`. Useful for tracing service-to-service hops. |
| `statusCode` | `number` | HTTP response status code. |
| `success` | `boolean` | `true` if `statusCode < 400`. |
| `requestBodySize` | `number \| null` | Request size in bytes when available from `content-length` or computed from parsed body. |
| `responseSize` | `number \| null` | `content-length` in bytes if available. |
| `serviceName` | `string` | From config; identifies the source service. |
| `environment` | `string` | From config, such as `development`, `staging`, or `production`. |
| `clientId` | `string \| null` | From `x-client-id` header if present. |
| `sessionId` | `string \| null` | From `x-session-id` header if present. |
| `userAgent` | `string \| null` | `User-Agent` header value. |

## Fingerprint Explanation

The fingerprint is calculated as:

```text
sha256(METHOD + ":" + normalizedRoute + ":" + sortedQueryKeys.join(","))
```

It captures the structural shape of a request while ignoring parameter values. For example, `GET /api/users/1?include=profile` and `GET /api/users/42?include=profile` produce the same fingerprint because they share the same method, normalized route shape, and query parameter keys. This lets downstream systems detect duplicate calls, retry storms, and polling patterns without depending on exact IDs or query values.

## How to Integrate (For Teammates)

- Your service should accept HTTP POST at an endpoint of your choice, such as `/events`.
- Set the `EVENT_SINK_URL` environment variable to point at your endpoint.
- Each POST body is a single JSON object matching the `ApiEvent` schema above.
- Events are sent asynchronously after the response completes, so they do not block API requests.
- Delivery is best-effort with retry: 2 retries with exponential backoff (`200ms`, `400ms`), then the event is logged locally and dropped.
- The mock sink at `mock-sink/index.ts` is a reference implementation you can inspect.
- To detect duplicates, group events by `fingerprint` within a time window.
- To trace request chains, group events by `correlationId`.
- `schemaVersion` will be incremented if fields are added or changed.

Example sink POST:

```bash
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{"schemaVersion":"1.0","requestId":"...","method":"GET","route":"/api/users","statusCode":200,"latencyMs":142,...}'
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `SERVICE_NAME` | `"demo-api"` | Identifies this service in emitted events. |
| `ENVIRONMENT` | `"development"` | Environment tag attached to every event. |
| `EVENT_SINK_URL` | `"http://localhost:4000/events"` | Where events are POSTed. |
| `EVENT_SINK_TIMEOUT_MS` | `3000` | Timeout for event POST requests. |
| `EVENT_SINK_RETRY_COUNT` | `2` | Retries before giving up on delivery. |
| `BATCH_EVENTS` | `false` | When `true`, buffers events and POSTs JSON arrays to `/events/batch`. |
| `LOCAL_FALLBACK_LOG` | `true` | When `true`, permanently failed events are appended to `event-log-fallback.jsonl`. |
| `PORT` | `3000` | Express server port. |
| `LOG_EVENTS_LOCALLY` | `true` | Prints compact one-line event summaries to stdout. |

`SCHEMA_VERSION` is hardcoded to `"1.0"` in `src/config.ts`; it is not an environment variable.

## Available Scripts

| Script | Command | What it does |
| --- | --- | --- |
| `npm run dev` | `nodemon --exec ts-node src/index.ts` | Starts the API server with nodemon/ts-node hot reload. |
| `npm run sink` | `ts-node mock-sink/index.ts` | Starts the mock event sink on port `4000`. |
| `npm run simulate` | `ts-node scripts/simulate.ts` | Runs the traffic simulator against the API. |
| `npm test` | `vitest run` | Runs the full Vitest test suite. |
| `npm run build` | `tsc` | Compiles TypeScript to `dist/`. |

## Mock Event Sink

`mock-sink/index.ts` is a standalone Express server that receives and stores events in memory. It is meant as a simple reference sink for local development and demos.

Endpoints:

- `POST /events` — receives an `ApiEvent`, logs it, stores it.
- `GET /events` — returns all stored events as a JSON array.
- `GET /events/summary` — returns total count, count by route, count by fingerprint for spotting duplicates, and average latency per route.
- `DELETE /events` — clears all stored events.

It also exposes `POST /events/batch` for batched delivery and has CORS enabled so browser-based dashboards can call it directly.

## Traffic Simulator

`scripts/simulate.ts` generates realistic API traffic patterns designed to produce the exact anti-patterns the analytics layer is trying to detect:

- Normal browsing: baseline traffic against common endpoints.
- Duplicate calls: the same endpoint hit 5 times in 500ms.
- Retry storms: `POST` sent 8 times rapidly.
- Inefficient polling: the same `GET` every 1 second for 10 iterations.
- 404 hammering: repeated requests to nonexistent resources.
- Mixed burst: 20 random requests in 3 seconds.

## Assumptions and Limitations

- Event delivery is best-effort, not guaranteed. There is no persistent queue.
- Request and response bodies are not captured; only metadata is emitted.
- Sensitive query parameter values are redacted for keys containing `token`, `key`, `secret`, `password`, `auth`, `credential`, or `apikey`.
- The fingerprint ignores parameter values. It only captures structural request shape.
- No authentication is implemented on the demo API or mock sink.
- This project is designed for hackathon demo purposes, not production observability.

## What I Need From You

- [ ] Give me the URL of your event sink endpoint so I can set `EVENT_SINK_URL`
- [ ] Confirm your endpoint accepts `POST` with `Content-Type: application/json`
- [ ] Let me know if you need additional fields on the event and I'll add them
- [ ] If you change the expected schema, tell me so I can bump `schemaVersion`

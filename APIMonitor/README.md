# APIMonitor

APIMonitor is a two-service hackathon demo for API observability and runtime mitigation. The API Server on port `3000` serves a demo Express API, tracks every completed request, and emits structured events. The Analysis Sink on port `4000` receives those events, stores them in memory, runs abuse-pattern analysis rules, and exposes issue data for a frontend dashboard. Users can then apply runtime fixes, such as response caching, back to the API server.

## What Runs Where

There are two distinct services:

- API Server: [`src/index.ts`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor/src/index.ts)
  - port `3000`
  - serves demo API routes
  - runs `requestTracker`
  - runs `fixInterceptor`
  - emits events to the sink
  - owns `/fixes` endpoints

- Analysis Sink: [`mock-sink/index.ts`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor/mock-sink/index.ts)
  - port `4000`
  - receives `/events`
  - stores events in memory
  - runs analysis rules
  - exposes `/flagged`, `/events`, `/events/summary`, and `/routes`

High-level flow:

```text
Client / Simulator
      |
      v
API Server :3000
  - requestTracker captures metadata
  - fixInterceptor may serve cached response
  - route handler returns JSON
      |
      v
EventEmitter POSTs ApiEvent
      |
      v
Analysis Sink :4000
  - validates event
  - stores event
  - runs analysis rules
  - exposes results to frontend
```

Fix flow:

```text
Frontend / User
      |
      v
POST /fixes on API Server :3000
      |
      v
fixRegistry stores active fix
      |
      v
future matching API requests hit fixInterceptor
      |
      v
response_cache may short-circuit route handler
```

## Quick Start

Run everything from [`APIMonitor`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor).

1. Install dependencies:

```bash
npm install
```

2. Copy the env template if needed:

```bash
cp .env.example .env
```

3. Start the Analysis Sink in Terminal 1:

```bash
npm run sink
```

Expected log:

```text
Analysis Sink listening on port 4000
```

4. Start the API Server in Terminal 2:

```bash
npm run dev
```

Expected log:

```text
API Server listening on port 3000, emitting events to http://localhost:4000/events
```

5. Generate traffic in Terminal 3:

```bash
npm run simulate
```

6. Inspect live analysis output:

```bash
curl http://localhost:4000/events/summary
curl http://localhost:4000/flagged
curl http://localhost:4000/routes
```

## Demo Scripts

The project includes targeted scripts for the presentation flow.

Reset the demo state:

```bash
npm run demo:reset
```

This:

- removes all active fixes from the API server
- clears all stored events and analyses from the sink

Generate normal tracking traffic:

```bash
npm run demo:tracking
```

This is useful for showing:

- events flowing into the sink
- live counters on the frontend
- normal baseline traffic before any issue is triggered

Trigger a fix-worthy issue:

```bash
npm run demo:attack
```

This sends repeated `GET /api/users/1` requests and is intended to trigger:

- `duplicateRequests`
- sometimes `excessivePolling` as a secondary rule hit

Keep the existing full simulator:

```bash
npm run simulate
```

This still runs the broader scenario set:

- normal browsing
- duplicate calls
- retry storm
- polling
- 404 hammering
- mixed burst
- fix demo sequence

## Recommended Demo Flow

Clean presenter flow:

1. Reset:

```bash
npm run demo:reset
```

2. Show baseline tracking:

```bash
npm run demo:tracking
```

3. Trigger a visible issue:

```bash
npm run demo:attack
```

4. In the frontend, inspect:

- `GET /events/summary` output
- `GET /flagged` output
- `GET /routes` output
- grouped `duplicateRequests`

5. Apply the fix from the frontend by calling:

```http
POST http://localhost:3000/fixes
```

with:

```json
{
  "ruleName": "duplicateRequests",
  "route": "/api/users/:id",
  "strategy": "response_cache",
  "params": {
    "ttlMs": 5000
  }
}
```

6. Prove the fix is active:

```bash
curl -i http://localhost:3000/api/users/1
curl -i http://localhost:3000/api/users/1
```

What to look for:

- first response:
  - `x-fix-applied: response_cache`
  - `x-cache-hit: false`
- second response:
  - `x-fix-applied: response_cache`
  - `x-cache-hit: true`

7. Optionally rerun:

```bash
npm run demo:attack
```

Because reset is now split out, `demo:attack` can be reused after the fix is applied without clearing it first.

## Project Structure

```text
APIMonitor/
├── .env.example                       # Example local configuration
├── .gitignore                         # Ignore rules for package artifacts
├── FRONTEND_INTEGRATION.md            # Frontend-facing API/data contract guide
├── README.md                          # Project overview and demo instructions
├── mock-sink/
│   └── index.ts                       # Analysis Sink service on port 4000
├── package-lock.json                  # Locked dependency graph
├── package.json                       # Scripts and dependencies
├── sample-events.json                 # Example ApiEvent payloads
├── scripts/
│   ├── demo-attack.ts                 # Reusable attack script for duplicate requests
│   ├── demo-reset.ts                  # Clears fixes and sink state
│   ├── demo-tracking.ts               # Generates normal baseline traffic
│   ├── demoHelpers.ts                 # Shared script helpers and response types
│   └── simulate.ts                    # Broader multi-scenario simulator
├── src/
│   ├── analysis/
│   │   └── runAnalysis.ts             # Thin wrapper from EventStore to rule engine
│   ├── config/
│   │   └── mvpConfig.ts               # Analysis rule configuration
│   ├── config.ts                      # Runtime app config and env parsing
│   ├── emitter/
│   │   └── eventEmitter.ts            # Event delivery, retry, batching, fallback logging
│   ├── fixes/
│   │   ├── strategies/
│   │   │   └── responseCache.ts       # Current runtime fix strategy
│   │   └── fixRegistry.ts             # In-memory active fix registry
│   ├── index.ts                       # API Server on port 3000
│   ├── middleware/
│   │   ├── fixInterceptor.ts          # Applies runtime fixes before route handlers
│   │   └── requestTracker.ts          # Captures request metadata and emits events
│   ├── ruleEngine/
│   │   └── analyzeEvent.ts            # Rule orchestration
│   ├── rules/                         # Individual issue detection rules
│   ├── store/
│   │   └── eventStore.ts              # In-memory event + analysis storage
│   ├── types/                         # Shared API, event, rule, fix, and severity types
│   ├── utils/                         # Fingerprint, sanitization, and time helpers
│   └── validation/
│       └── rawApiEventSchema.ts       # Zod validation for sink ingestion
├── tests/                             # Unit and integration tests
└── tsconfig.json                      # TypeScript config
```

## API Server Responsibilities

The API server in [`src/index.ts`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor/src/index.ts) keeps only application-facing responsibilities:

- `express.json()` middleware
- `requestTracker(emitter.emit.bind(emitter))`
- `fixInterceptor()` after tracking and before routes
- demo routes:
  - `GET /api/users`
  - `GET /api/users/:id`
  - `POST /api/users`
  - `GET /api/orders`
  - `GET /api/orders/:id`
  - `GET /api/health`
- fix endpoints:
  - `POST /fixes`
  - `GET /fixes`
  - `GET /fixes/:id/status`
  - `DELETE /fixes/:id`

Important behavior:

- `GET /api/orders/:id` makes an internal call to `GET /api/users/:userId`
- that reuses `correlationId`
- it increments `chainDepth`
- so one logical request can create two linked events

## Analysis Sink Responsibilities

The sink in [`mock-sink/index.ts`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor/mock-sink/index.ts) owns analysis and issue data:

- `POST /events`
- `POST /events/batch`
- `GET /events`
- `GET /events/analyzed`
- `GET /events/summary`
- `GET /flagged`
- `GET /routes`
- `GET /routes/:route`
- `DELETE /events`

Important current behavior:

- sink data is stored in memory
- there is no longer any automatic pruning
- events and analyses remain until:
  - the sink restarts, or
  - `DELETE /events` is called

That means frontend analytics now persist for the full sink session and will not disappear after 2 minutes.

## Route Analytics Endpoints

The Analysis Sink now exposes route-level aggregation endpoints for dashboard pages and drill-downs:

- `GET /routes`
  - returns all known routes sorted by `totalRequests` descending
  - includes:
    - request counts
    - last seen timestamp
    - method list
    - status breakdown
    - aggregated issues
    - active fix for that route
    - performance metrics such as average, min, max, p50, p95, p99 latency, success rate, and latency trend

- `GET /routes/:route`
  - accepts a URL-encoded route pattern such as:

```text
/routes/%2Fapi%2Fusers%2F%3Aid
```

  - returns:
    - the same route summary fields as `/routes`
    - up to 50 most recent raw events for that route
    - analyzed events for that route
    - current and past fixes for that route
    - `performanceOverTime` in 5-second buckets for simple charting

Example:

```bash
curl http://localhost:4000/routes
curl http://localhost:4000/routes/%2Fapi%2Fusers%2F%3Aid
```

## Event Schema

The API emits `ApiEvent` payloads with these fields:

| Field | Type | Description |
| --- | --- | --- |
| `requestId` | `string` | Unique emitted request identifier. |
| `correlationId` | `string` | Correlates related requests across services. |
| `schemaVersion` | `string` | Current event schema version, `"1.0"`. |
| `timestamp` | `string` | ISO timestamp when the request arrived. |
| `completedAt` | `string` | ISO timestamp when the response finished. |
| `latencyMs` | `number` | End-to-end latency in milliseconds. |
| `method` | `string` | HTTP method. |
| `originalUrl` | `string` | Original request URL. |
| `route` | `string` | Normalized Express route pattern. |
| `queryParams` | `Record<string, string>` | Sanitized query params. |
| `fingerprint` | `string` | SHA-256 hash of method + route + sorted query keys. |
| `chainDepth` | `number` | Current service-to-service chain depth. |
| `statusCode` | `number` | HTTP response status. |
| `success` | `boolean` | `true` when `statusCode` is in the successful range. |
| `requestBodySize` | `number \| null` | Request body size when known. |
| `responseSize` | `number \| null` | Response size when known. |
| `serviceName` | `string` | Source service name. |
| `environment` | `string` | Environment tag. |
| `clientId` | `string \| null` | Optional client ID from header. |
| `sessionId` | `string \| null` | Optional session ID from header. |
| `userAgent` | `string \| null` | User-Agent header value. |

## What Gets Detected

The current analysis rules in [`src/rules`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor/src/rules) can detect:

- `duplicateRequests`
  - same request fingerprint from the same source repeated quickly
- `burstTraffic`
  - high volume of similar requests in a short time
- `excessivePolling`
  - repeated calls at polling-like intervals
- `retryStorm`
  - repeated failed requests that look like bad retries
- `costlyApi`
  - overuse of expensive configured routes
- `authenticationAbuse`
  - repeated failed auth-like requests
- `endpointHotspots`
  - route-level hotspots

The main live demo focuses on:

- `duplicateRequests`
- sometimes `excessivePolling` as an additional signal on the same traffic

## What Gets Fixed

Right now, the only implemented runtime mitigation strategy is:

- `response_cache`

That strategy is implemented in:

- [`src/fixes/strategies/responseCache.ts`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor/src/fixes/strategies/responseCache.ts)
- [`src/middleware/fixInterceptor.ts`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor/src/middleware/fixInterceptor.ts)

It is best suited for:

- repeated identical `GET` requests
- duplicate reads
- some polling cases

It is not yet a full mitigation for:

- rate limiting
- authentication abuse blocking
- write-side request collapsing
- durable retry control

## Fingerprint Explanation

Request fingerprint is generated by:

```text
sha256(METHOD + ":" + normalizedRoute + ":" + sortedQueryKeys.join(","))
```

That means:

- values are ignored
- structure is preserved

So these share the same fingerprint:

- `GET /api/users/1?include=profile`
- `GET /api/users/42?include=profile`

Why this matters:

- duplicate patterns become easy to group
- polling is detectable
- retry storms are detectable
- different concrete IDs still collapse to the same route shape

## Configuration

Runtime config comes from [`src/config.ts`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor/src/config.ts).

| Variable | Default | Description |
| --- | --- | --- |
| `SERVICE_NAME` | `"demo-api"` | Source service name written into events. |
| `ENVIRONMENT` | `"development"` | Environment tag. |
| `EVENT_SINK_URL` | `"http://localhost:4000/events"` | Sink endpoint the API emits events to. |
| `EVENT_SINK_TIMEOUT_MS` | `3000` | Per-request sink timeout. |
| `EVENT_SINK_RETRY_COUNT` | `2` | Number of emitter retries before failure. |
| `BATCH_EVENTS` | `false` | Enables buffered POSTs to `/events/batch`. |
| `LOCAL_FALLBACK_LOG` | `true` | Writes failed event deliveries to `event-log-fallback.jsonl`. |
| `PORT` | `3000` | API server port. |
| `LOG_EVENTS_LOCALLY` | `true` | Logs one-line event summaries on the API server. |

Hardcoded:

- `SCHEMA_VERSION = "1.0"`

Current `.env.example` values:

```dotenv
SERVICE_NAME=demo-api
ENVIRONMENT=development
EVENT_SINK_URL=http://localhost:4000/events
EVENT_SINK_TIMEOUT_MS=3000
EVENT_SINK_RETRY_COUNT=2
PORT=3000
LOG_EVENTS_LOCALLY=true
```

## Available Scripts

| Script | Command | What it does |
| --- | --- | --- |
| `npm run dev` | `nodemon --exec ts-node src/index.ts` | Starts the API Server on port `3000`. |
| `npm run sink` | `ts-node mock-sink/index.ts` | Starts the Analysis Sink on port `4000`. |
| `npm run simulate` | `ts-node scripts/simulate.ts` | Runs the broader traffic simulator. |
| `npm run demo:reset` | `ts-node scripts/demo-reset.ts` | Clears sink state and removes active fixes. |
| `npm run demo:tracking` | `ts-node scripts/demo-tracking.ts` | Generates baseline traffic for frontend tracking demos. |
| `npm run demo:attack` | `ts-node scripts/demo-attack.ts` | Generates duplicate traffic that should be flagged. |
| `npm test` | `vitest run` | Runs tests. |
| `npm run build` | `tsc` | Compiles TypeScript to `dist/`. |

## Frontend Notes

For frontend integration details, see:

- [`FRONTEND_INTEGRATION.md`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor/FRONTEND_INTEGRATION.md)

Important current browser note:

- the Analysis Sink on port `4000` enables CORS
- the API Server on port `3000` does not currently enable CORS

So if your frontend runs on a different origin, you may need:

- a dev proxy for `/fixes`, or
- same-origin serving, or
- a future API CORS change

## Limitations

- All event data is in memory only.
- All analysis results are in memory only.
- All fix state is in memory only.
- Restarting the sink clears events and analyses.
- Restarting the API clears active fixes and response caches.
- Only `response_cache` is implemented as a runtime fix today.
- There is no authentication on either service.
- This is a hackathon demo architecture, not a production observability stack.

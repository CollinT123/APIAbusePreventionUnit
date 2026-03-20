# Frontend Integration Guide

This document is for frontend developers building a dashboard on top of the `APIMonitor` backend. It is based on the actual code in [`src/index.ts`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor/src/index.ts), [`mock-sink/index.ts`](/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor/mock-sink/index.ts), the analysis engine, the in-memory store, and the fix system.

## Architecture Overview

The backend is split into two HTTP services with different responsibilities:

- API Server on port `3000`: serves the monitored demo API, emits request events to the sink, and manages runtime fixes.
- Analysis Sink on port `4000`: receives raw events, validates them, stores them in memory, runs the analysis rules, and exposes issue data for the dashboard.

The frontend talks to both services:

- Read issue data, event data, and live summaries from the Analysis Sink on port `4000`.
- Apply and remove fixes on the API Server on port `3000`.

Important implementation note from the actual code:

- The Analysis Sink enables CORS for browser access.
- The API Server does not currently enable CORS.
- That means browser-based calls to port `4000` work directly from another origin, but browser-based calls to port `3000` will need either:
  - a frontend dev proxy, or
  - the frontend served from the same origin, or
  - a future API-server CORS change.

ASCII flow:

```text
User / Browser
      |
      v
+----------------------+
| API Server :3000     |
| - Demo API routes    |
| - requestTracker     |
| - fixInterceptor     |
| - /fixes endpoints   |
+----------------------+
      |
      | emits ApiEvent via HTTP POST
      v
+----------------------+
| Analysis Sink :4000  |
| - /events            |
| - EventStore         |
| - runAnalysis()      |
| - /flagged           |
| - /events/summary    |
+----------------------+
      |
      v
Frontend reads issue/event data
```

Fix flow:

```text
Frontend
   |
   | POST /fixes
   v
API Server :3000
   |
   | fixRegistry stores active fix
   | fixInterceptor checks each matching route
   v
Repeated request gets cache hit / mitigation behavior
```

## Quick Start for Frontend Devs

1. Install dependencies:

```bash
cd /Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/APIMonitor
npm install
```

2. Start the Analysis Sink in Terminal 1:

```bash
npm run sink
```

Expected log:

```text
Analysis Sink listening on port 4000
```

3. Start the API Server in Terminal 2:

```bash
npm run dev
```

Expected log:

```text
API Server listening on port 3000, emitting events to http://localhost:4000/events
```

4. Generate traffic in Terminal 3:

```bash
npm run simulate
```

5. Inspect detected issues:

```bash
curl http://localhost:4000/flagged
```

6. Useful optional demo scripts:

```bash
npm run demo:reset
npm run demo:tracking
npm run demo:attack
```

Notes:

- CORS is enabled on the sink at port `4000`, so browser requests to the sink work directly.
- The API server on port `3000` does not currently enable CORS, so frontend calls to `/fixes` may need a dev proxy if your frontend runs on another port.

## API Reference — Analysis Sink (Port 4000)

Base URL:

```text
http://localhost:4000
```

### `POST /events`

What it does:

- Accepts one raw event, validates it with `parseRawApiEvent`, stores it, analyzes it, and returns the analysis result.

Request body type:

```ts
type PostEventsRequest = RawApiEvent;
```

Example request body:

```json
{
  "schemaVersion": "1.0",
  "requestId": "2af0dc1b-6d5c-4deb-adc2-4bc074dc6852",
  "correlationId": "61b90c15-c22a-4066-b3f7-122e4eafed8a",
  "timestamp": "2026-03-20T21:19:41.507Z",
  "completedAt": "2026-03-20T21:19:41.664Z",
  "latencyMs": 156.910083,
  "method": "GET",
  "originalUrl": "/api/users/1",
  "route": "/api/users/:id",
  "queryParams": {},
  "fingerprint": "158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
  "chainDepth": 0,
  "statusCode": 200,
  "success": true,
  "requestBodySize": null,
  "responseSize": 58,
  "serviceName": "demo-api",
  "environment": "development",
  "clientId": "simulator",
  "sessionId": "sess-1",
  "userAgent": "curl/8.7.1"
}
```

Response body type:

```ts
type PostEventsResponse = {
  received: true;
  analysis: AnalyzedApiEvent;
};
```

Example response body:

```json
{
  "received": true,
  "analysis": {
    "flagged": false,
    "severity": "NONE",
    "ruleHits": [],
    "reasonSummary": "No suspicious behavior detected",
    "recommendedAction": "monitor_only",
    "analyzedAt": "2026-03-20T21:19:41.670Z",
    "sourceKey": "clientId:simulator|sessionId:sess-1|service:demo-api|ua:curl/8.7.1"
  }
}
```

curl example:

```bash
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{
    "schemaVersion":"1.0",
    "requestId":"2af0dc1b-6d5c-4deb-adc2-4bc074dc6852",
    "correlationId":"61b90c15-c22a-4066-b3f7-122e4eafed8a",
    "timestamp":"2026-03-20T21:19:41.507Z",
    "completedAt":"2026-03-20T21:19:41.664Z",
    "latencyMs":156.910083,
    "method":"GET",
    "originalUrl":"/api/users/1",
    "route":"/api/users/:id",
    "queryParams":{},
    "fingerprint":"158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
    "chainDepth":0,
    "statusCode":200,
    "success":true,
    "requestBodySize":null,
    "responseSize":58,
    "serviceName":"demo-api",
    "environment":"development",
    "clientId":"simulator",
    "sessionId":"sess-1",
    "userAgent":"curl/8.7.1"
  }'
```

### `POST /events/batch`

What it does:

- Accepts an array of raw events, processes each one through validation, storage, and analysis, and returns all analyses.

Request body type:

```ts
type PostEventsBatchRequest = RawApiEvent[];
```

Example request body:

```json
[
  {
    "schemaVersion": "1.0",
    "requestId": "evt-1",
    "correlationId": "corr-1",
    "timestamp": "2026-03-20T21:19:41.507Z",
    "completedAt": "2026-03-20T21:19:41.664Z",
    "latencyMs": 156.91,
    "method": "GET",
    "originalUrl": "/api/users/1",
    "route": "/api/users/:id",
    "queryParams": {},
    "fingerprint": "fp-1",
    "chainDepth": 0,
    "statusCode": 200,
    "success": true,
    "requestBodySize": null,
    "responseSize": 58,
    "serviceName": "demo-api",
    "environment": "development",
    "clientId": "simulator",
    "sessionId": "sess-1",
    "userAgent": "curl/8.7.1"
  },
  {
    "schemaVersion": "1.0",
    "requestId": "evt-2",
    "correlationId": "corr-2",
    "timestamp": "2026-03-20T21:19:41.700Z",
    "completedAt": "2026-03-20T21:19:41.910Z",
    "latencyMs": 210.12,
    "method": "GET",
    "originalUrl": "/api/orders",
    "route": "/api/orders",
    "queryParams": {},
    "fingerprint": "fp-2",
    "chainDepth": 0,
    "statusCode": 200,
    "success": true,
    "requestBodySize": null,
    "responseSize": 120,
    "serviceName": "demo-api",
    "environment": "development",
    "clientId": "simulator",
    "sessionId": "sess-1",
    "userAgent": "curl/8.7.1"
  }
]
```

Response body type:

```ts
type PostEventsBatchResponse = {
  received: true;
  count: number;
  analyses: AnalyzedApiEvent[];
};
```

Example response body:

```json
{
  "received": true,
  "count": 2,
  "analyses": [
    {
      "flagged": false,
      "severity": "NONE",
      "ruleHits": [],
      "reasonSummary": "No suspicious behavior detected",
      "recommendedAction": "monitor_only",
      "analyzedAt": "2026-03-20T21:19:41.700Z",
      "sourceKey": "clientId:simulator|sessionId:sess-1|service:demo-api|ua:curl/8.7.1"
    },
    {
      "flagged": false,
      "severity": "NONE",
      "ruleHits": [],
      "reasonSummary": "No suspicious behavior detected",
      "recommendedAction": "monitor_only",
      "analyzedAt": "2026-03-20T21:19:41.950Z",
      "sourceKey": "clientId:simulator|sessionId:sess-1|service:demo-api|ua:curl/8.7.1"
    }
  ]
}
```

curl example:

```bash
curl -X POST http://localhost:4000/events/batch \
  -H "Content-Type: application/json" \
  -d '[{"schemaVersion":"1.0","requestId":"evt-1","correlationId":"corr-1","timestamp":"2026-03-20T21:19:41.507Z","completedAt":"2026-03-20T21:19:41.664Z","latencyMs":156.91,"method":"GET","originalUrl":"/api/users/1","route":"/api/users/:id","queryParams":{},"fingerprint":"fp-1","chainDepth":0,"statusCode":200,"success":true,"requestBodySize":null,"responseSize":58,"serviceName":"demo-api","environment":"development","clientId":"simulator","sessionId":"sess-1","userAgent":"curl/8.7.1"}]'
```

### `GET /events`

What it does:

- Returns every raw event currently stored in memory.

Request body:

- None

Response body type:

```ts
type GetEventsResponse = RawApiEvent[];
```

Example response body:

```json
[
  {
    "schemaVersion": "1.0",
    "requestId": "2af0dc1b-6d5c-4deb-adc2-4bc074dc6852",
    "correlationId": "61b90c15-c22a-4066-b3f7-122e4eafed8a",
    "timestamp": "2026-03-20T21:19:41.507Z",
    "completedAt": "2026-03-20T21:19:41.664Z",
    "latencyMs": 156.910083,
    "method": "GET",
    "originalUrl": "/api/users/1",
    "route": "/api/users/:id",
    "queryParams": {},
    "fingerprint": "158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
    "chainDepth": 0,
    "statusCode": 200,
    "success": true,
    "requestBodySize": null,
    "responseSize": 58,
    "serviceName": "demo-api",
    "environment": "development",
    "clientId": null,
    "sessionId": null,
    "userAgent": "curl/8.7.1"
  }
]
```

curl example:

```bash
curl http://localhost:4000/events
```

### `GET /events/analyzed`

What it does:

- Returns every stored event paired with its analysis result.
- This endpoint is used internally by the API server to compute `GET /fixes/:id/status`.
- Frontend code can use it for debugging, but it is not the primary dashboard endpoint.

Request body:

- None

Response body type:

```ts
type GetEventsAnalyzedResponse = Array<{
  event: RawApiEvent;
  analysis: AnalyzedApiEvent;
}>;
```

Example response body:

```json
[
  {
    "event": {
      "schemaVersion": "1.0",
      "requestId": "2af0dc1b-6d5c-4deb-adc2-4bc074dc6852",
      "correlationId": "61b90c15-c22a-4066-b3f7-122e4eafed8a",
      "timestamp": "2026-03-20T21:19:41.507Z",
      "completedAt": "2026-03-20T21:19:41.664Z",
      "latencyMs": 156.910083,
      "method": "GET",
      "originalUrl": "/api/users/1",
      "route": "/api/users/:id",
      "queryParams": {},
      "fingerprint": "158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
      "chainDepth": 0,
      "statusCode": 200,
      "success": true,
      "requestBodySize": null,
      "responseSize": 58,
      "serviceName": "demo-api",
      "environment": "development",
      "clientId": null,
      "sessionId": null,
      "userAgent": "curl/8.7.1"
    },
    "analysis": {
      "flagged": false,
      "severity": "NONE",
      "ruleHits": [],
      "reasonSummary": "No suspicious behavior detected",
      "recommendedAction": "monitor_only",
      "analyzedAt": "2026-03-20T21:19:41.670Z",
      "sourceKey": "clientId:none|sessionId:none|service:demo-api|ua:curl/8.7.1"
    }
  }
]
```

curl example:

```bash
curl http://localhost:4000/events/analyzed
```

### `GET /events/summary`

What it does:

- Returns live aggregate counters for all events currently in memory.

Request body:

- None

Response body type:

```ts
type GetEventsSummaryResponse = {
  totalEventCount: number;
  flaggedEventCount: number;
  flaggedByRule: Record<string, number>;
  averageLatencyPerRoute: Record<string, number>;
};
```

Example response body:

```json
{
  "totalEventCount": 12,
  "flaggedEventCount": 4,
  "flaggedByRule": {
    "duplicateRequests": 2,
    "retryStorm": 1,
    "excessivePolling": 1
  },
  "averageLatencyPerRoute": {
    "/api/users": 147.408833,
    "/api/users/:id": 158.22025,
    "/api/orders": 186.1,
    "/api/orders/:id": 204.5
  }
}
```

curl example:

```bash
curl http://localhost:4000/events/summary
```

### `GET /flagged`

What it does:

- Returns all currently flagged events, grouped by the first rule hit's `ruleName`.

Request body:

- None

Response body type:

```ts
type GetFlaggedResponse = {
  issues: Record<string, Array<{ event: RawApiEvent; analysis: AnalyzedApiEvent }>>;
};
```

Complete realistic example response:

```json
{
  "issues": {
    "duplicateRequests": [
      {
        "event": {
          "schemaVersion": "1.0",
          "requestId": "270637eb-b34b-48d7-857b-170a15b9ca9e",
          "correlationId": "d2ef445f-a1a9-4b5e-922c-ba9ce4d58efa",
          "timestamp": "2026-03-20T21:19:41.676Z",
          "completedAt": "2026-03-20T21:19:41.825Z",
          "latencyMs": 148.982917,
          "method": "GET",
          "originalUrl": "/api/users/1",
          "route": "/api/users/:id",
          "queryParams": {},
          "fingerprint": "158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
          "chainDepth": 0,
          "statusCode": 200,
          "success": true,
          "requestBodySize": null,
          "responseSize": 58,
          "serviceName": "demo-api",
          "environment": "development",
          "clientId": null,
          "sessionId": null,
          "userAgent": "curl/8.7.1"
        },
        "analysis": {
          "flagged": true,
          "severity": "ORANGE",
          "ruleHits": [
            {
              "matched": true,
              "ruleName": "duplicateRequests",
              "severity": "ORANGE",
              "reason": "Duplicate API requests from the same source detected (3 in 431ms).",
              "recommendedAction": "dedupe_inflight_requests",
              "evidence": {
                "fingerprint": "158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
                "sourceKey": "clientId:none|sessionId:none|service:demo-api|ua:curl/8.7.1",
                "occurrencesIncludingCurrent": 3,
                "windowMs": 10000
              }
            },
            {
              "matched": true,
              "ruleName": "excessivePolling",
              "severity": "YELLOW",
              "reason": "Potential polling detected (3 calls with min interval 169ms).",
              "recommendedAction": "debounce_client_requests",
              "evidence": {
                "fingerprint": "158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
                "sourceKey": "clientId:none|sessionId:none|service:demo-api|ua:curl/8.7.1",
                "occurrencesIncludingCurrent": 3,
                "minIntervalMs": 169,
                "windowMs": 10000
              }
            }
          ],
          "reasonSummary": "Duplicate API requests from the same source detected (3 in 431ms). | Potential polling detected (3 calls with min interval 169ms).",
          "recommendedAction": "dedupe_inflight_requests",
          "analyzedAt": "2026-03-20T21:19:41.828Z",
          "sourceKey": "clientId:none|sessionId:none|service:demo-api|ua:curl/8.7.1",
          "evidence": {
            "duplicateRequests": {
              "fingerprint": "158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
              "sourceKey": "clientId:none|sessionId:none|service:demo-api|ua:curl/8.7.1",
              "occurrencesIncludingCurrent": 3,
              "windowMs": 10000
            },
            "excessivePolling": {
              "fingerprint": "158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
              "sourceKey": "clientId:none|sessionId:none|service:demo-api|ua:curl/8.7.1",
              "occurrencesIncludingCurrent": 3,
              "minIntervalMs": 169,
              "windowMs": 10000
            }
          }
        }
      }
    ],
    "excessivePolling": [
      {
        "event": {
          "schemaVersion": "1.0",
          "requestId": "poll-5",
          "correlationId": "poll-corr-5",
          "timestamp": "2026-03-20T21:20:11.000Z",
          "completedAt": "2026-03-20T21:20:11.080Z",
          "latencyMs": 80,
          "method": "GET",
          "originalUrl": "/api/orders",
          "route": "/api/orders",
          "queryParams": {},
          "fingerprint": "poll-fingerprint",
          "chainDepth": 0,
          "statusCode": 200,
          "success": true,
          "requestBodySize": null,
          "responseSize": 128,
          "serviceName": "demo-api",
          "environment": "development",
          "clientId": "simulator",
          "sessionId": "session-poll",
          "userAgent": "node"
        },
        "analysis": {
          "flagged": true,
          "severity": "ORANGE",
          "ruleHits": [
            {
              "matched": true,
              "ruleName": "excessivePolling",
              "severity": "ORANGE",
              "reason": "Excessive polling pattern detected (5 calls with min interval 200ms).",
              "recommendedAction": "debounce_client_requests",
              "evidence": {
                "fingerprint": "poll-fingerprint",
                "sourceKey": "clientId:simulator|sessionId:session-poll|service:demo-api|ua:node",
                "occurrencesIncludingCurrent": 5,
                "minIntervalMs": 200,
                "windowMs": 10000
              }
            }
          ],
          "reasonSummary": "Excessive polling pattern detected (5 calls with min interval 200ms).",
          "recommendedAction": "debounce_client_requests",
          "analyzedAt": "2026-03-20T21:20:11.081Z",
          "sourceKey": "clientId:simulator|sessionId:session-poll|service:demo-api|ua:node",
          "evidence": {
            "excessivePolling": {
              "fingerprint": "poll-fingerprint",
              "sourceKey": "clientId:simulator|sessionId:session-poll|service:demo-api|ua:node",
              "occurrencesIncludingCurrent": 5,
              "minIntervalMs": 200,
              "windowMs": 10000
            }
          }
        }
      }
    ],
    "retryStorm": [
      {
        "event": {
          "schemaVersion": "1.0",
          "requestId": "retry-4",
          "correlationId": "retry-corr-4",
          "timestamp": "2026-03-20T21:20:40.000Z",
          "completedAt": "2026-03-20T21:20:40.120Z",
          "latencyMs": 120,
          "method": "POST",
          "originalUrl": "/api/payments/charge",
          "route": "/api/payments/charge",
          "queryParams": {},
          "fingerprint": "retry-fingerprint",
          "chainDepth": 0,
          "statusCode": 500,
          "success": false,
          "requestBodySize": 128,
          "responseSize": 42,
          "serviceName": "demo-api",
          "environment": "development",
          "clientId": "simulator",
          "sessionId": "session-retry",
          "userAgent": "node"
        },
        "analysis": {
          "flagged": true,
          "severity": "ORANGE",
          "ruleHits": [
            {
              "matched": true,
              "ruleName": "retryStorm",
              "severity": "ORANGE",
              "reason": "Retry storm suspected: 4 failed attempts within 5000ms (plus 0 non-failed retries).",
              "recommendedAction": "add_retry_backoff",
              "evidence": {
                "fingerprint": "retry-fingerprint",
                "sourceKey": "clientId:simulator|sessionId:session-retry|service:demo-api|ua:node",
                "failuresCount": 4,
                "attemptsCount": 4,
                "failureLookbackMs": 5000,
                "firstFailureMs": 1774041640000,
                "lastFailureMs": 1774041644000
              }
            }
          ],
          "reasonSummary": "Retry storm suspected: 4 failed attempts within 5000ms (plus 0 non-failed retries).",
          "recommendedAction": "add_retry_backoff",
          "analyzedAt": "2026-03-20T21:20:40.121Z",
          "sourceKey": "clientId:simulator|sessionId:session-retry|service:demo-api|ua:node",
          "evidence": {
            "retryStorm": {
              "fingerprint": "retry-fingerprint",
              "sourceKey": "clientId:simulator|sessionId:session-retry|service:demo-api|ua:node",
              "failuresCount": 4,
              "attemptsCount": 4,
              "failureLookbackMs": 5000,
              "firstFailureMs": 1774041640000,
              "lastFailureMs": 1774041644000
            }
          }
        }
      }
    ]
  }
}
```

curl example:

```bash
curl http://localhost:4000/flagged
```

### `DELETE /events`

What it does:

- Clears all stored events and all stored analyses from the in-memory sink store.

Request body:

- None

Response body type:

```ts
type DeleteEventsResponse = {
  cleared: true;
};
```

Example response body:

```json
{
  "cleared": true
}
```

curl example:

```bash
curl -X DELETE http://localhost:4000/events
```

## API Reference — API Server (Port 3000)

Base URL:

```text
http://localhost:3000
```

Frontend note:

- These endpoints are on the API service, not the sink.
- `GET /fixes/:id/status` lives on the API server and internally reads analyzed events from the sink.

### `POST /fixes`

What it does:

- Creates an active runtime fix for a route.

Request body type:

```ts
type PostFixesRequest = {
  ruleName: string;
  route: string;
  strategy?: string;
  params?: Record<string, unknown>;
};
```

Current defaults from code:

- `strategy` defaults to `"response_cache"`
- `params` defaults to `{ ttlMs: 5000 }`

Supported `ruleName` values based on the analysis rule files:

- `"duplicateRequests"`
- `"burstTraffic"`
- `"excessivePolling"`
- `"retryStorm"`
- `"costlyApi"`
- `"authenticationAbuse"`
- `"endpointHotspots"`

Important implementation note:

- The server only checks that `ruleName` and `route` are present.
- It does not currently validate `ruleName` against this list.
- The list above is the supported semantic set from the actual analysis engine.

Supported `strategy` values:

- `"response_cache"`

Strategy params:

- `response_cache`
  - params shape:

```ts
{
  ttlMs: number;
}
```

Example request body:

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

Response body type:

```ts
type PostFixesResponse = FixConfig;
```

Example response body:

```json
{
  "id": "1e0455b0-6476-4406-9b67-6317eac93ad4",
  "ruleName": "duplicateRequests",
  "route": "/api/users/:id",
  "strategy": "response_cache",
  "params": {
    "ttlMs": 5000
  },
  "appliedAt": "2026-03-20T21:19:42.867Z",
  "status": "active"
}
```

curl example:

```bash
curl -X POST http://localhost:3000/fixes \
  -H "Content-Type: application/json" \
  -d '{"ruleName":"duplicateRequests","route":"/api/users/:id","strategy":"response_cache","params":{"ttlMs":5000}}'
```

### `GET /fixes`

What it does:

- Returns all active fixes stored in the API server's in-memory fix registry.

Request body:

- None

Response body type:

```ts
type GetFixesResponse = FixConfig[];
```

Example response body:

```json
[
  {
    "id": "1e0455b0-6476-4406-9b67-6317eac93ad4",
    "ruleName": "duplicateRequests",
    "route": "/api/users/:id",
    "strategy": "response_cache",
    "params": {
      "ttlMs": 5000
    },
    "appliedAt": "2026-03-20T21:19:42.867Z",
    "status": "active"
  }
]
```

curl example:

```bash
curl http://localhost:3000/fixes
```

### `GET /fixes/:id/status`

What it does:

- Computes effectiveness for one fix by combining:
  - the active fix config on the API server
  - analyzed events retrieved from the sink's `GET /events/analyzed`

Request body:

- None

Response body type:

```ts
type GetFixStatusResponse = FixStatus;
```

Example response body:

```json
{
  "fix": {
    "id": "1e0455b0-6476-4406-9b67-6317eac93ad4",
    "ruleName": "duplicateRequests",
    "route": "/api/users/:id",
    "strategy": "response_cache",
    "params": {
      "ttlMs": 5000
    },
    "appliedAt": "2026-03-20T21:19:42.867Z",
    "status": "active"
  },
  "eventsBeforeFix": 2,
  "eventsSinceFix": 1,
  "issuesSinceFix": 1,
  "effective": false
}
```

Possible error responses:

```json
{ "error": "Fix not found" }
```

```json
{ "error": "Sink status fetch failed with 500" }
```

curl example:

```bash
curl http://localhost:3000/fixes/1e0455b0-6476-4406-9b67-6317eac93ad4/status
```

### `DELETE /fixes/:id`

What it does:

- Removes a fix from the API server and clears the response cache associated with that route.

Request body:

- None

Response body type:

```ts
type DeleteFixResponse = {
  removed: true;
};
```

Example response body:

```json
{
  "removed": true
}
```

curl example:

```bash
curl -X DELETE http://localhost:3000/fixes/1e0455b0-6476-4406-9b67-6317eac93ad4
```

### `GET /api/health`

What it does:

- Returns a simple health payload from the demo API.

Request body:

- None

Response body type:

```ts
type GetHealthResponse = {
  status: "ok";
};
```

Example response body:

```json
{
  "status": "ok"
}
```

curl example:

```bash
curl http://localhost:3000/api/health
```

## Data Types Reference

### 1. `RawApiEvent`

TypeScript definition:

```ts
interface RawApiEvent {
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
```

Example JSON:

```json
{
  "schemaVersion": "1.0",
  "requestId": "2af0dc1b-6d5c-4deb-adc2-4bc074dc6852",
  "correlationId": "61b90c15-c22a-4066-b3f7-122e4eafed8a",
  "timestamp": "2026-03-20T21:19:41.507Z",
  "completedAt": "2026-03-20T21:19:41.664Z",
  "latencyMs": 156.910083,
  "method": "GET",
  "originalUrl": "/api/users/1",
  "route": "/api/users/:id",
  "queryParams": {},
  "fingerprint": "158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
  "chainDepth": 0,
  "statusCode": 200,
  "success": true,
  "requestBodySize": null,
  "responseSize": 58,
  "serviceName": "demo-api",
  "environment": "development",
  "clientId": null,
  "sessionId": null,
  "userAgent": "curl/8.7.1"
}
```

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `string` | Event schema version, currently emitted from `config.SCHEMA_VERSION`. |
| `requestId` | `string` | Unique per-request identifier generated by the API server. |
| `correlationId` | `string` | Correlates related requests across services and internal calls. |
| `timestamp` | `string` | ISO timestamp when the request was first observed. |
| `completedAt` | `string` | ISO timestamp when the response finished. |
| `latencyMs` | `number` | End-to-end request processing time in milliseconds. |
| `method` | `string` | HTTP verb such as `GET` or `POST`. |
| `originalUrl` | `string` | Original request URL, including the concrete path. |
| `route` | `string` | Normalized Express route pattern such as `/api/users/:id`. |
| `queryParams` | `Record<string, string>` | Sanitized query params; sensitive values are redacted. |
| `fingerprint` | `string` | SHA-256 fingerprint of method + normalized route + sorted query keys. |
| `chainDepth` | `number` | Service-call depth, used to track internal chaining. |
| `statusCode` | `number` | HTTP response status code. |
| `success` | `boolean` | `true` when the API considered the response successful. |
| `requestBodySize` | `number \| null` | Request body size in bytes when known. |
| `responseSize` | `number \| null` | Response body size in bytes when known. |
| `serviceName` | `string` | Name of the emitting service. |
| `environment` | `string` | Environment tag such as `development`. |
| `clientId` | `string \| null` | Optional client identifier from the request headers. |
| `sessionId` | `string \| null` | Optional session identifier from the request headers. |
| `userAgent` | `string \| null` | Optional `User-Agent` header value. |

### 2. `AnalyzedApiEvent`

TypeScript definition:

```ts
interface AnalyzedApiEvent {
  flagged: boolean;
  severity: Severity;
  ruleHits: RuleHit[];
  reasonSummary: string;
  recommendedAction: RecommendedAction;
  analyzedAt: string;
  sourceKey: string;
  evidence?: Record<string, unknown>;
}
```

Example JSON:

```json
{
  "flagged": true,
  "severity": "ORANGE",
  "ruleHits": [
    {
      "matched": true,
      "ruleName": "duplicateRequests",
      "severity": "ORANGE",
      "reason": "Duplicate API requests from the same source detected (3 in 431ms).",
      "recommendedAction": "dedupe_inflight_requests",
      "evidence": {
        "fingerprint": "158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
        "sourceKey": "clientId:none|sessionId:none|service:demo-api|ua:curl/8.7.1",
        "occurrencesIncludingCurrent": 3,
        "windowMs": 10000
      }
    }
  ],
  "reasonSummary": "Duplicate API requests from the same source detected (3 in 431ms).",
  "recommendedAction": "dedupe_inflight_requests",
  "analyzedAt": "2026-03-20T21:19:41.828Z",
  "sourceKey": "clientId:none|sessionId:none|service:demo-api|ua:curl/8.7.1",
  "evidence": {
    "duplicateRequests": {
      "fingerprint": "158b68fd3485f1e364a38c76a48145f0703a0439f134dbd5777c5d7cdb5e62d3",
      "sourceKey": "clientId:none|sessionId:none|service:demo-api|ua:curl/8.7.1",
      "occurrencesIncludingCurrent": 3,
      "windowMs": 10000
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `flagged` | `boolean` | Whether any analysis rule matched with non-`NONE` severity. |
| `severity` | `Severity` | Highest severity across all matched rules. |
| `ruleHits` | `RuleHit[]` | Detailed matched rule objects. |
| `reasonSummary` | `string` | A short combined explanation based on the top matched rules. |
| `recommendedAction` | `RecommendedAction` | Suggested mitigation action chosen from the highest-severity hit. |
| `analyzedAt` | `string` | ISO timestamp when analysis completed. |
| `sourceKey` | `string` | Derived source identity used by the analysis engine. |
| `evidence` | `Record<string, unknown> \| undefined` | Optional per-rule evidence payloads. |

### 3. `RuleHit`

TypeScript definition:

```ts
interface RuleHit {
  matched: true;
  ruleName: string;
  severity: Severity;
  reason: string;
  recommendedAction: RecommendedAction;
  evidence?: Record<string, unknown>;
}
```

Example JSON:

```json
{
  "matched": true,
  "ruleName": "retryStorm",
  "severity": "ORANGE",
  "reason": "Retry storm suspected: 4 failed attempts within 5000ms (plus 0 non-failed retries).",
  "recommendedAction": "add_retry_backoff",
  "evidence": {
    "fingerprint": "retry-fingerprint",
    "sourceKey": "clientId:simulator|sessionId:session-retry|service:demo-api|ua:node",
    "failuresCount": 4,
    "attemptsCount": 4,
    "failureLookbackMs": 5000,
    "firstFailureMs": 1774041640000,
    "lastFailureMs": 1774041644000
  }
}
```

| Field | Type | Description |
|---|---|---|
| `matched` | `true` | Always `true` for a matched rule hit. |
| `ruleName` | `string` | Rule identifier such as `duplicateRequests` or `retryStorm`. |
| `severity` | `Severity` | Severity assigned by the rule. |
| `reason` | `string` | Human-readable explanation for why the rule matched. |
| `recommendedAction` | `RecommendedAction` | Rule-specific recommended next step. |
| `evidence` | `Record<string, unknown> \| undefined` | Rule-specific structured evidence. |

### 4. `Severity`

TypeScript definition:

```ts
type Severity = "NONE" | "YELLOW" | "ORANGE" | "RED";
```

Example JSON:

```json
{
  "severityExamples": ["NONE", "YELLOW", "ORANGE", "RED"]
}
```

| Value | Meaning |
|---|---|
| `NONE` | No suspicious behavior detected. |
| `YELLOW` | Low-confidence or lower-severity issue worth watching. |
| `ORANGE` | Clear issue that should likely be addressed. |
| `RED` | High-severity issue that likely needs immediate attention. |

### 5. `RecommendedAction`

TypeScript definition:

```ts
type RecommendedAction =
  | "monitor_only"
  | "debounce_client_requests"
  | "dedupe_inflight_requests"
  | "add_short_ttl_cache"
  | "add_retry_backoff"
  | "rate_limit_source"
  | "inspect_auth_abuse";
```

Example JSON:

```json
{
  "recommendedActionExamples": [
    "monitor_only",
    "debounce_client_requests",
    "dedupe_inflight_requests",
    "add_short_ttl_cache",
    "add_retry_backoff",
    "rate_limit_source",
    "inspect_auth_abuse"
  ]
}
```

| Value | Meaning |
|---|---|
| `monitor_only` | Display the issue but do not suggest automated mitigation yet. |
| `debounce_client_requests` | Reduce repeated client calls by debouncing. |
| `dedupe_inflight_requests` | Collapse duplicate in-flight requests. |
| `add_short_ttl_cache` | Consider short-lived caching for repeated reads. |
| `add_retry_backoff` | Add or strengthen exponential retry backoff. |
| `rate_limit_source` | Rate limit the request source. |
| `inspect_auth_abuse` | Investigate possible abuse around auth flows. |

### 6. `FixConfig`

TypeScript definition:

```ts
interface FixConfig {
  id: string;
  ruleName: string;
  route: string;
  strategy: string;
  params: Record<string, unknown>;
  appliedAt: string;
  status: "active" | "disabled";
}
```

Example JSON:

```json
{
  "id": "1e0455b0-6476-4406-9b67-6317eac93ad4",
  "ruleName": "duplicateRequests",
  "route": "/api/users/:id",
  "strategy": "response_cache",
  "params": {
    "ttlMs": 5000
  },
  "appliedAt": "2026-03-20T21:19:42.867Z",
  "status": "active"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | UUID for the fix instance. |
| `ruleName` | `string` | Issue type the fix is intended to address. |
| `route` | `string` | Route pattern the fix applies to, such as `/api/users/:id`. |
| `strategy` | `string` | Mitigation strategy name; currently `response_cache`. |
| `params` | `Record<string, unknown>` | Strategy-specific config, for example `{ ttlMs: 5000 }`. |
| `appliedAt` | `string` | ISO timestamp for when the fix was activated. |
| `status` | `"active" \| "disabled"` | Current lifecycle state. |

### 7. `FixStatus`

TypeScript definition:

```ts
interface FixStatus {
  fix: FixConfig;
  eventsBeforeFix: number;
  eventsSinceFix: number;
  issuesSinceFix: number;
  effective: boolean;
}
```

Example JSON:

```json
{
  "fix": {
    "id": "1e0455b0-6476-4406-9b67-6317eac93ad4",
    "ruleName": "duplicateRequests",
    "route": "/api/users/:id",
    "strategy": "response_cache",
    "params": {
      "ttlMs": 5000
    },
    "appliedAt": "2026-03-20T21:19:42.867Z",
    "status": "active"
  },
  "eventsBeforeFix": 2,
  "eventsSinceFix": 1,
  "issuesSinceFix": 1,
  "effective": false
}
```

| Field | Type | Description |
|---|---|---|
| `fix` | `FixConfig` | The active fix this status describes. |
| `eventsBeforeFix` | `number` | Count of events on that route that matched the same rule before the fix. |
| `eventsSinceFix` | `number` | Count of route events seen after the fix was applied. |
| `issuesSinceFix` | `number` | Count of events after the fix that still match the same rule. |
| `effective` | `boolean` | `true` when `issuesSinceFix === 0`. |

## Issue Types Reference

### 1. `duplicateRequests`

- Detects repeated requests with the same fingerprint from the same source within the duplicate window.
- Config defaults:
  - window: `10000ms`
  - threshold: `2` occurrences including current
  - severity: `ORANGE`
- Evidence fields:
  - `fingerprint`
  - `sourceKey`
  - `occurrencesIncludingCurrent`
  - `windowMs`
- Recommended action:
  - `dedupe_inflight_requests`
- Example trigger:
  - `GET /api/users/1` called 5 times in under one second from the same client/session.

### 2. `burstTraffic`

- Detects a rapid spike of many similar requests from the same source.
- Config defaults:
  - window: `2000ms`
  - threshold: `8` occurrences including current
  - severity: `RED`
- Evidence fields:
  - `fingerprint`
  - `sourceKey`
  - `occurrencesIncludingCurrent`
  - `windowMs`
- Recommended action:
  - `rate_limit_source`
- Example trigger:
  - 8 identical requests to the same endpoint shape in about 2 seconds.

### 3. `excessivePolling`

- Detects repeated calls that look like aggressive polling based on frequency and interval.
- Config defaults:
  - yellow: `3` calls with min interval `<= 1000ms`
  - orange: `5` calls with min interval `<= 300ms`
- Evidence fields:
  - `fingerprint`
  - `sourceKey`
  - `occurrencesIncludingCurrent`
  - `minIntervalMs`
  - `windowMs`
- Recommended action:
  - `debounce_client_requests`
- Example trigger:
  - the same `GET /api/orders` every 200ms from one client.

### 4. `retryStorm`

- Detects repeated failed requests for the same fingerprint from the same source within the retry lookback window.
- Config defaults:
  - failure lookback: `5000ms`
  - yellow: `2` failures
  - orange: `4` failures
  - red: `6` failures
- Evidence fields:
  - `fingerprint`
  - `sourceKey`
  - `failuresCount`
  - `attemptsCount`
  - `failureLookbackMs`
  - `firstFailureMs`
  - `lastFailureMs`
- Recommended action:
  - `add_retry_backoff`
- Example trigger:
  - the same failing `POST` retried four times in five seconds.

### 5. `costlyApi`

- Detects heavy use of routes configured as expensive.
- Config defaults:
  - expensive routes:
    - `/api/reports/export`
    - `/api/payments/charge`
  - yellow at `15`
  - orange at `25`
  - red at `40`
- Evidence fields:
  - `route`
  - `sourceKey`
  - `countIncludingCurrent`
  - `windowMs`
- Recommended action:
  - `rate_limit_source`
- Example trigger:
  - a source repeatedly hits `/api/payments/charge` many times within 30 seconds.

### 6. `authenticationAbuse`

- Detects repeated failed requests on auth-like routes from the same source.
- Config defaults:
  - auth routes:
    - `/auth/login`
    - `/auth/token/refresh`
  - red threshold: `5` failed attempts
- Evidence fields:
  - `route`
  - `sourceKey`
  - `failedIncludingCurrent`
  - `attemptsIncludingCurrent`
  - `windowMs`
  - `lastStatusCode`
- Recommended action:
  - `inspect_auth_abuse`
- Example trigger:
  - 5 failed login attempts to `/auth/login` in 30 seconds.

### 7. `endpointHotspots`

- Detects route-level hotspots independent of source identity.
- Config defaults:
  - disabled by default
  - yellow at `100`
  - orange at `200`
- Evidence fields:
  - `route`
  - `countIncludingCurrent`
  - `windowMs`
- Recommended action:
  - `monitor_only`
- Example trigger:
  - one route receives 100+ requests in the hotspot window when the rule is enabled.

## Frontend User Flow

1. Dashboard loads.
   - Fetch `GET http://localhost:4000/flagged`
   - Group and display issues by rule type.

2. Dashboard also fetches summary data.
   - Fetch `GET http://localhost:4000/events/summary`
   - Show total events, flagged events, and route latency metrics.

3. User sees a flagged issue.
   - Example:
     - “Duplicate API requests from the same source detected”
     - route: `/api/users/:id`
     - severity: `ORANGE`

4. User clicks `Apply Fix`.
   - Frontend sends `POST http://localhost:3000/fixes`
   - Include:
     - `ruleName`
     - `route`
     - `strategy`
     - `params`

5. Dashboard shows the active fix.
   - Fetch `GET http://localhost:3000/fixes`
   - Render current active fixes.

6. User checks whether the fix helped.
   - Fetch `GET http://localhost:3000/fixes/:id/status`
   - Show:
     - `eventsBeforeFix`
     - `eventsSinceFix`
     - `issuesSinceFix`
     - `effective`

7. User removes the fix.
   - Send `DELETE http://localhost:3000/fixes/:id`

Suggested polling intervals during the demo:

- `GET /flagged`: every `3-5s`, or provide a refresh button.
- `GET /fixes`: every `5s`, or refresh on user actions.
- `GET /events/summary`: every `5s` for live counters.

## Suggested Frontend Components

- Issue list or grouped cards by rule type.
  - Show severity badge, route, reason text, fingerprint/source snippets, and timestamp.

- Rule detail drawer or modal.
  - Show `ruleHits`, `reasonSummary`, and structured `evidence`.

- Fix panel.
  - Show currently active fixes from `GET /fixes`.
  - Show route, strategy, applied time, and status.

- Fix application modal.
  - Pre-fill route and rule name from the selected issue.
  - Allow strategy selection.
  - For `response_cache`, render a `ttlMs` numeric input.

- Fix effectiveness card.
  - Use `GET /fixes/:id/status`.
  - Show before/after counts and a simple effective/not-effective indicator.

- Summary header.
  - Show total events, flagged count, and flagged percentage.
  - Show average latency per route.

- Event table or timeline.
  - Use `GET /events` or `GET /events/analyzed` for debugging and drill-down.

## Environment & Config

- Analysis Sink URL:
  - `http://localhost:4000`
- API Server URL:
  - `http://localhost:3000`
- Sink CORS:
  - enabled
- API server CORS:
  - not currently enabled in code
- Authentication:
  - none
- Response format:
  - JSON

Suggested frontend environment variables:

```text
VITE_ANALYSIS_SINK_URL=http://localhost:4000
VITE_API_SERVER_URL=http://localhost:3000
```

or, for Next.js:

```text
NEXT_PUBLIC_ANALYSIS_SINK_URL=http://localhost:4000
NEXT_PUBLIC_API_SERVER_URL=http://localhost:3000
```

## Known Limitations

- Event data is in-memory only.
  - Restarting the sink clears all events and all analysis results.
  - Calling `DELETE /events` also clears all events and analyses.

- Fix state is in-memory on the API server.
  - Restarting the API server clears all active fixes.

- The only implemented mitigation strategy is `response_cache`.
  - Rate limiting, dedupe-in-flight, and retry controls are not yet implemented as runtime fixes.

- The sink no longer auto-prunes event history.
  - Events and analyses stay available for the lifetime of the sink process.
  - The dashboard can treat the current sink session as a live, growing in-memory dataset.

- `GET /flagged` returns all currently flagged events in memory.
  - There is no pagination.

- `GET /fixes/:id/status` depends on the sink being reachable.
  - The API server computes status by fetching analyzed events from the sink.

- Browser-based direct calls to the sink work cross-origin because CORS is enabled there.

- Browser-based direct calls to the API server may require a proxy or a same-origin deployment because CORS is not currently enabled in `src/index.ts`.

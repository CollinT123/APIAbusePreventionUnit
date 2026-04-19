# APIAbusePreventionUnit

A two-service API observability and mitigation system that detects abuse patterns and applies runtime fixes to reduce repeated load.

APIAbusePreventionUnit tracks live API traffic, emits structured request events, analyzes suspicious behavior, and lets operators apply mitigations such as response caching while the system is running. It demonstrates a practical abuse-prevention loop: observe traffic, detect risk, surface evidence, and respond without redeploying the API.

## About

APIAbusePreventionUnit is designed around a common production problem: APIs often fail silently under duplicate requests, retry storms, burst traffic, excessive polling, and expensive endpoint abuse until latency or infrastructure cost spikes.

This project models that problem with a demo Express API, a separate analysis sink, and a Next.js dashboard. The API Server records completed requests and emits normalized telemetry. The Analysis Sink stores events in memory, runs rule-based detection against recent traffic history, and exposes summaries, flagged issues, route analytics, and fix state. Runtime fixes can then be applied back to the API Server, where middleware intercepts matching routes and applies mitigation behavior.

## Key Features

- **Request tracking and observability:** captures request IDs, correlation IDs, route fingerprints, latency, status codes, payload sizes, client/session IDs, user agents, and chain depth.
- **Structured event pipeline:** emits request events from the API Server to the Analysis Sink with retry support, optional batching, local logging, and JSONL fallback logging.
- **Rule-based abuse detection:** detects duplicate requests, burst traffic, excessive polling, retry storms, costly API abuse, authentication abuse, and endpoint hotspots.
- **Runtime mitigation:** applies route-level fixes through a fix registry and response-cache strategy without restarting the API server.
- **Multi-service architecture:** separates request serving, event analysis, and dashboard visualization across dedicated services.
- **Dashboard visibility:** shows route health, flagged issues, active fixes, connection status, route details, and performance analytics.

## Architecture

```text
Client
  |
  v
API Server :3000
  - serves demo API routes
  - tracks completed requests
  - emits structured events
  - applies active runtime fixes
  |
  | POST /events or /events/batch
  v
Analysis Sink :4000
  - validates incoming events
  - stores events in memory
  - runs abuse detection rules
  - exposes summaries, routes, and flagged issues
  |
  v
Dashboard :3001
  - reads sink analytics
  - reads and applies API fixes
  - displays route health and mitigation state
```

### How It Works

1. A client calls a demo route on the API Server, such as `GET /api/users` or `GET /api/orders/:id`.
2. `requestTracker` measures the completed request and builds a structured event.
3. `EventEmitter` sends the event to the Analysis Sink at `http://localhost:4000/events`.
4. The sink validates the payload with Zod, stores it in `EventStore`, and calls the rule engine.
5. Detection rules compare the current event against recent fingerprint and route history.
6. Flagged issues are exposed through sink endpoints such as `/flagged`, `/events/summary`, and `/routes`.
7. A fix can be applied through the API Server `POST /fixes` endpoint.
8. `fixInterceptor` checks each request for an active route fix and applies the configured strategy, such as `response_cache`.

## Tech Stack

- **Node.js**
- **Express 5**
- **TypeScript**
- **Next.js 16**
- **React 19**
- **SWR**
- **Tailwind CSS 4**
- **lucide-react**

## Project Structure

```text
.
+-- APIMonitor/
|   +-- src/
|   |   +-- index.ts                     # API Server entry point and demo routes
|   |   +-- middleware/
|   |   |   +-- requestTracker.ts        # Request telemetry collection
|   |   |   +-- fixInterceptor.ts        # Runtime fix application
|   |   +-- emitter/eventEmitter.ts      # Event delivery, retries, batching, fallback log
|   |   +-- ruleEngine/analyzeEvent.ts   # Rule orchestration and severity selection
|   |   +-- rules/                       # Abuse detection rules
|   |   +-- fixes/                       # Fix registry and mitigation strategies
|   |   +-- store/eventStore.ts          # In-memory event and analysis store
|   |   +-- validation/                  # Raw event validation
|   +-- mock-sink/index.ts               # Analysis Sink service on port 4000
|   +-- scripts/                         # Demo traffic and reset scripts
|   +-- tests/                           # Unit and integration tests
|
+-- dashboard/
    +-- src/app/                         # Next.js routes
    +-- src/components/                  # Dashboard UI components
    +-- src/lib/                         # API client, hooks, and shared types
```

## Usage

This project demonstrates an end-to-end abuse prevention workflow:

- generate realistic API traffic against demo routes
- observe request volume, latency, status codes, and route health
- detect suspicious patterns with explainable rule hits
- review flagged issues in the dashboard
- apply a runtime mitigation to a route
- verify whether issues continue after the fix is active

The API Server exposes demo resources under `/api/*` and fix management under `/fixes`. The Analysis Sink exposes event and analytics endpoints used by the dashboard.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Git

### Installation

```bash
git clone https://github.com/CollinT123/APIAbusePreventionUnit.git
cd APIAbusePreventionUnit

cd APIMonitor
npm install

cd ../dashboard
npm install
```

### Running the Project

Start the Analysis Sink on port `4000`:

```bash
cd APIMonitor
npm run sink
```

In a second terminal, start the API Server on port `3000`:

```bash
cd APIMonitor
npm run dev
```

In a third terminal, start the dashboard on port `3001`:

```bash
cd dashboard
npm run dev
```

Open the dashboard:

```text
http://localhost:3001
```

### Generate Demo Traffic

From the `APIMonitor` folder:

```bash
npm run simulate
```

Additional demo scripts:

```bash
npm run demo:tracking
npm run demo:attack
npm run demo:reset
```

### Run Tests

```bash
cd APIMonitor
npm test
```

## Example Workflow

1. A client sends repeated requests to `GET /api/users`.
2. The API Server handles each request and records telemetry when the response finishes.
3. A structured event is emitted to the Analysis Sink.
4. The sink stores the event, compares it against recent history, and runs rules such as duplicate request detection or burst traffic detection.
5. If a rule is triggered, the event is flagged with severity, evidence, and a recommended action.
6. The dashboard displays the affected route, issue count, rule hit, and route performance.
7. A user applies a `response_cache` fix for the route.
8. The API Server begins serving matching requests from cache while the fix is active.
9. The dashboard can compare events before and after the fix to show whether the mitigation is effective.

## API Reference

### API Server `:3000`

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/users` | Demo users route |
| `GET` | `/api/users/:id` | Demo user detail route |
| `POST` | `/api/users` | Demo user creation route |
| `GET` | `/api/orders` | Demo orders route |
| `GET` | `/api/orders/:id` | Demo order detail route with internal user lookup |
| `GET` | `/api/health` | Demo health route |
| `GET` | `/fixes` | List active fixes |
| `POST` | `/fixes` | Apply a runtime fix |
| `GET` | `/fixes/:id/status` | Inspect fix effectiveness |
| `DELETE` | `/fixes/:id` | Remove an active fix |

### Analysis Sink `:4000`

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/events` | Receive and analyze one event |
| `POST` | `/events/batch` | Receive and analyze multiple events |
| `GET` | `/events` | List raw events |
| `GET` | `/events/analyzed` | List events with analysis results |
| `GET` | `/events/summary` | Return event counts, flagged counts, rule totals, and route latency |
| `GET` | `/flagged` | Return flagged issues grouped by rule |
| `GET` | `/routes` | Return route-level summaries |
| `GET` | `/routes/:route` | Return detail for one route |
| `DELETE` | `/events` | Clear in-memory event data |

## Engineering Decisions

- **Service separation:** request handling and analysis run as separate processes so telemetry collection does not depend on dashboard rendering or rule evaluation.
- **Structured telemetry:** events use normalized fields and route fingerprints so rules can reason about repeated behavior instead of raw URLs alone.
- **Explainable rules:** each rule returns severity, evidence, reason summaries, and recommended actions to make findings easy to inspect.
- **Runtime fix registry:** fixes are stored independently from route handlers, allowing mitigation behavior to be added or removed dynamically.
- **Graceful event delivery:** the emitter supports retries, timeouts, optional batching, local event logs, and fallback JSONL output if the sink is unavailable.
- **In-memory analysis store:** the sink uses an in-memory store for fast hackathon/demo iteration without adding database setup.

## Future Improvements

- Persist events and analysis results in a database for longer retention.
- Add source-level rate limiting as a mitigation strategy.
- Expand fix strategies beyond response caching, such as retry backoff hints or request deduplication.
- Add authentication and role-based access for applying fixes.
- Stream events to the dashboard with WebSockets or Server-Sent Events.
- Add deployment configuration for running all services together.

## License

No open-source license is currently included.

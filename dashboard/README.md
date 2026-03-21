# API Monitor Dashboard

A real-time dashboard for monitoring API abuse detection, viewing flagged issues, applying mitigations (fixes), and tracking their effectiveness. The dashboard connects to the APIMonitor backend services to display live metrics, grouped issue reports, and active fixes with before/after effectiveness data.

## Prerequisites

- **Node.js 18+**
- **APIMonitor backends running:**
  - Analysis Sink (port 4000) — receives and analyzes API events
  - API Server (port 3000) — serves the demo API and fix management

## Quick Start

```bash
npm install
npm run dev
```

The dashboard runs at [http://localhost:3001](http://localhost:3001) by default.

## Pages

| Page | Description |
|------|-------------|
| **Issues** | Flagged API abuse events grouped by rule type (duplicate requests, retry storms, excessive polling, etc.). Shows event details, severity, and evidence. Apply fixes from the Fix button on each issue group. |
| **Fixes** | Active mitigations with effectiveness metrics. See before/after event counts and whether each fix is working. Remove fixes with the Remove Fix button. |
| **Overview** | High-level system health banner, metrics grid (total events, average latency, active fixes, issues by type), route performance table, and last event indicator. |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_SINK_URL` | `http://localhost:4000` | Analysis Sink base URL (events, flagged, summary) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | API Server base URL (fixes CRUD) |

Create a `.env.local` file to override defaults.

## Demo Flow

1. Start the sink: `cd ../APIMonitor && npm run sink`
2. Start the API: `cd ../APIMonitor && npm run dev`
3. Start the dashboard: `npm run dev`
4. Run the traffic simulator: `cd ../APIMonitor && npm run simulate`
5. Watch the Issues page populate with flagged events
6. Click **Fix** on an issue group, configure the response cache, and apply
7. Navigate to Fixes to see effectiveness metrics
8. Navigate to Overview for the system health summary

## Graceful Degradation

- **Sink down:** Connection indicator shows Disconnected; backend banner appears; Issues and Overview show empty/default data; no crash.
- **API server down:** Fixes endpoints return empty/fail; Apply Fix and Remove Fix show error messages; backend banner appears.
- **No events yet:** All pages render empty states (e.g., "No issues detected", "No active fixes", "No events yet").

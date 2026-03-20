# AnalysisService (MVP)

`AnalysisService` is a Firebase Cloud Functions (2nd gen) backend that inspects each newly-created raw API event in Firestore, runs a small set of rule-based severity checks (no ML), and writes an `analysis` object back to the same document for the frontend dashboard to query.

## What it does

1. Triggers on new documents in `rawApiEvents/{docId}`.
2. Validates the event against the expected raw event schema.
3. Fetches a small recent history window needed for MVP rules (fingerprint + route).
4. Runs rule modules (duplicate requests, burst traffic, excessive polling, retry storms, costly endpoint abuse, auth abuse; hotspot is optional).
5. Computes a final severity (`NONE | YELLOW | ORANGE | RED`) as the highest severity among matched rules.
6. Writes back `analysis` to the same Firestore document (idempotent).

## Key modules

- `src/ruleEngine/analyzeEvent.ts`: orchestration + final severity merge
- `src/rules/*.ts`: one module per rule
- `src/firestore/history.ts`: short-window history lookups
- `src/validation/rawApiEventSchema.ts`: Zod runtime validation for the raw schema
- `src/index.ts`: Firestore trigger function

## Running locally (tests / typecheck)

From `AnalysisService/`:

```bash
npm test
npm run typecheck
```

## Idempotency / loop prevention

The function writes an `analysis` field back to `rawApiEvents/{docId}` using `set(..., { merge: true })`.
It skips execution when `analysis.severity` already exists, preventing repeated analysis loops on retries.

## Source identity limitation (MVP)

Rules use a best-effort `sourceKey` built from `clientId + sessionId + serviceName + userAgent`.
This is not as reliable as IP-based identity; behind proxies/NAT multiple users may share the same key and reduce accuracy.

## Firestore Schema (MVP)

### Collection: `rawApiEvents`

This is the only collection this MVP needs.

The AnalysisService trigger runs on document creation:
- `rawApiEvents/{docId}`

The raw emitter should write the **raw event fields** (schema below).
The AnalysisService will write back an `analysis` field onto the same document.

### Raw API event document (required fields)

Your raw document (stored as `rawApiEvents/{docId}`) must match this schema:

```ts
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
```

### Analysis output (written by this service)

```ts
export interface AnalyzedApiEvent {
  analysis?: {
    flagged: boolean;
    severity: "NONE" | "YELLOW" | "ORANGE" | "RED";
    ruleHits: Array<{
      matched: true;
      ruleName: string;
      severity: "NONE" | "YELLOW" | "ORANGE" | "RED";
      reason: string;
      recommendedAction: string;
      evidence?: Record<string, unknown>;
    }>;
    reasonSummary: string;
    recommendedAction: string;
    analyzedAt: string; // ISO timestamp
    sourceKey: string;
    evidence?: Record<string, unknown>;
  };
}
```

Important: AnalysisService writes `analysis` with `{ merge: true }`, so your raw fields remain intact.

### Dashboard queries (flagged + grouped by severity)

Firestore cannot do server-side “group by”, so the usual approach is:
1. Query flagged events, either per severity (simple/clear), or with `in` then group client-side.
2. Display by severity in the frontend.

Recommended pattern (4 separate queries):

```js
// Common base:
const base = db.collection("rawApiEvents")
  .where("analysis.flagged", "==", true)
  .orderBy("analysis.analyzedAt", "desc")
  .limit(50);

// Then run these in parallel:
const red = base.where("analysis.severity", "==", "RED");
const orange = base.where("analysis.severity", "==", "ORANGE");
const yellow = base.where("analysis.severity", "==", "YELLOW");
const none = base.where("analysis.severity", "==", "NONE"); // typically empty if you enforce flagged==true
```

Alternative pattern (1 query with `in`, then group client-side):

```js
const flaggedSeverities = db.collection("rawApiEvents")
  .where("analysis.flagged", "==", true)
  .where("analysis.severity", "in", ["RED", "ORANGE", "YELLOW"])
  .orderBy("analysis.analyzedAt", "desc")
  .limit(200);
```

### Required indexes (you may see “missing index” prompts)

History lookups done by the trigger:
- `rawApiEvents` where `fingerprint == X` and `timestamp >= Y` ordered by `timestamp`
- `rawApiEvents` where `route == R` and `timestamp >= Y` ordered by `timestamp`

Dashboard queries likely need composite indexes for:
- `analysis.flagged` + `analysis.analyzedAt` (if you use `where(...flagged...)` + `orderBy(analyzedAt)`)
- `analysis.severity` + `analysis.analyzedAt` (if you query by severity + orderBy)

If Firestore asks for an index, copy the suggested index from the console UI.

## What you need to do next (connect to Firestore)

1. Create/choose a Firebase project and enable Firestore.
2. Ensure your existing “raw event writer” component writes documents into `rawApiEvents/{docId}` with the raw schema fields listed above (especially `timestamp`, `route`, `fingerprint`, `success`, `statusCode`, and `analysis` must be omitted initially).
3. Deploy this AnalysisService function to the same Firebase project:
   - The function relies on Firebase default credentials in the deployed environment (no manual key handling required).
4. Verify permissions:
   - The Cloud Functions service account needs permission to read `rawApiEvents` and write back `analysis` on those documents.

## Firestore Security Rules (dashboard)

For a student-friendly MVP, a common starting point is:

```txt
match /rawApiEvents/{docId} {
  allow read: if request.auth != null && resource.data.analysis.flagged == true;
}
```

Tune this to your auth model (public vs logged-in dashboard). If you use the emulator, adapt paths/hosts accordingly.


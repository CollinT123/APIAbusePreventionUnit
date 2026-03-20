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


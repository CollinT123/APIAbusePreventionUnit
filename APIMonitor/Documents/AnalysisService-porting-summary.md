# AnalysisService Code Export

## TypeScript Files

Command run:

```bash
find . -name "*.ts" -not -path "*/node_modules/*" | sort
```

Output:

```text
./src/config/mvpConfig.ts
./src/firestore/history.ts
./src/index.ts
./src/ruleEngine/analyzeEvent.ts
./src/rules/authenticationAbuseRule.ts
./src/rules/burstTrafficRule.ts
./src/rules/costlyApiAbuseRule.ts
./src/rules/duplicateRequestsRule.ts
./src/rules/endpointHotspotsRule.ts
./src/rules/excessivePollingRule.ts
./src/rules/retryStormRule.ts
./src/types/analyzedApiEvent.ts
./src/types/rawApiEvent.ts
./src/types/ruleResult.ts
./src/types/severity.ts
./src/utils/sourceKey.ts
./src/utils/time.ts
./src/validation/rawApiEventSchema.ts
./tests/analyzeEvent.test.ts
./tests/fixtures/rawEvents.ts
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/config/mvpConfig.ts`

```ts
import type { RecommendedAction } from "../types/ruleResult";
import type { Severity } from "../types/severity";

export interface AnalysisConfig {
  // History windows (ms) used for querying short recent history.
  windowsMs: {
    duplicates: number; // fingerprint + same source within this window
    burst: number; // high volume window
    polling: number; // polling frequency window
    retry: number; // retry storm window
    auth: number; // authentication abuse window
    cost: number; // costly endpoint abuse window
    hotspot: number; // optional endpoint hotspots window
  };

  // Duplicate requests
  duplicateRequests: {
    minOccurrences: number; // count including the current event
    severity: Severity; // expected ORANGE in MVP
  };

  // Burst traffic / spamming
  burstTraffic: {
    minOccurrences: number; // count including the current event
    severity: Severity; // expected RED in MVP
    // We only consider events within this sub-window for the burst rule.
    windowMs: number;
  };

  // Excessive polling
  excessivePolling: {
    // Count threshold (including current event) to even consider it polling.
    minOccurrencesForYellow: number;
    minIntervalMsForYellow: number; // if minimum inter-arrival interval is <= this => YELLOW

    minOccurrencesForOrange: number;
    minIntervalMsForOrange: number; // if minimum interval is <= this => ORANGE
  };

  // Retry storms (failed requests repeating quickly)
  retryStorm: {
    // Consider recent failures in this lookback window before the current event.
    failureLookbackMs: number;
    // Severity thresholds based on failed request counts (within retry window).
    failuresForYellow: number;
    failuresForOrange: number;
    failuresForRed: number;
  };

  // Costly API abuse
  costlyApi: {
    expensiveRoutes: string[]; // match by exact `event.route`
    // Severity thresholds based on access count (including current) per source.
    yellowAt: number;
    orangeAt: number;
    redAt: number;
  };

  // Authentication abuse
  authAbuse: {
    // If non-empty, match these routes exactly. Otherwise apply a heuristic: route includes "login" or "auth".
    authRoutes: string[];
    redAt: number; // failed attempts including current
  };

  // Endpoint hotspots (optional)
  endpointHotspots: {
    enabled: boolean;
    yellowAt: number;
    orangeAt: number;
  };

  // Mapping of rule names to default recommended actions.
  recommendedActions: {
    duplicateRequests: RecommendedAction;
    burstTraffic: RecommendedAction;
    excessivePolling: RecommendedAction;
    retryStorm: RecommendedAction;
    costlyApi: RecommendedAction;
    authAbuse: RecommendedAction;
    endpointHotspots: RecommendedAction;
    // Used as a fallback when a rule returns severity but no action.
    monitorOnly: RecommendedAction;
  };
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  windowsMs: {
    duplicates: 10_000,
    burst: 2_000,
    polling: 10_000,
    retry: 30_000,
    auth: 30_000,
    cost: 30_000,
    hotspot: 30_000
  },
  duplicateRequests: {
    minOccurrences: 2,
    severity: "ORANGE"
  },
  burstTraffic: {
    minOccurrences: 8,
    severity: "RED",
    windowMs: 2_000
  },
  excessivePolling: {
    minOccurrencesForYellow: 3,
    minIntervalMsForYellow: 1_000,
    minOccurrencesForOrange: 5,
    minIntervalMsForOrange: 300
  },
  retryStorm: {
    failureLookbackMs: 5_000,
    failuresForYellow: 2,
    failuresForOrange: 4,
    failuresForRed: 6
  },
  costlyApi: {
    expensiveRoutes: ["/api/reports/export", "/api/payments/charge"],
    yellowAt: 15,
    orangeAt: 25,
    redAt: 40
  },
  authAbuse: {
    authRoutes: ["/auth/login", "/auth/token/refresh"],
    redAt: 5
  },
  endpointHotspots: {
    enabled: false,
    yellowAt: 100,
    orangeAt: 200
  },
  recommendedActions: {
    duplicateRequests: "dedupe_inflight_requests",
    burstTraffic: "rate_limit_source",
    excessivePolling: "debounce_client_requests",
    retryStorm: "add_retry_backoff",
    costlyApi: "rate_limit_source",
    authAbuse: "inspect_auth_abuse",
    endpointHotspots: "monitor_only",
    monitorOnly: "monitor_only"
  }
};
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`

```ts
import { getFirestore } from "firebase-admin/firestore";
import type { RawApiEvent } from "../types/rawApiEvent";
import { parseRawApiEvent } from "../validation/rawApiEventSchema";
import { isoTimestampFromMs } from "../utils/time";

export async function fetchFingerprintHistory(input: {
  fingerprint: string;
  windowStartMs: number;
  windowEndMs: number;
  limit: number;
}): Promise<RawApiEvent[]> {
  const db = getFirestore();

  // Firestore history lookup uses the raw event's ISO timestamp string.
  // ISO 8601 lex ordering matches chronological ordering, so `>=` range works.
  const windowStartIso = isoTimestampFromMs(input.windowStartMs);
  const snapshot = await db
    .collection("rawApiEvents")
    .where("fingerprint", "==", input.fingerprint)
    .where("timestamp", ">=", windowStartIso)
    .orderBy("timestamp", "desc")
    .limit(input.limit)
    .get();

  const endMs = input.windowEndMs;
  const events: RawApiEvent[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const parsed = parseRawApiEvent(data);
    const t = new Date(parsed.timestamp).getTime();
    if (t <= endMs) events.push(parsed);
  });
  return events;
}

export async function fetchRouteHistory(input: {
  route: string;
  windowStartMs: number;
  windowEndMs: number;
  limit: number;
}): Promise<RawApiEvent[]> {
  const db = getFirestore();

  const windowStartIso = isoTimestampFromMs(input.windowStartMs);
  const snapshot = await db
    .collection("rawApiEvents")
    .where("route", "==", input.route)
    .where("timestamp", ">=", windowStartIso)
    .orderBy("timestamp", "desc")
    .limit(input.limit)
    .get();

  const endMs = input.windowEndMs;
  const events: RawApiEvent[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const parsed = parseRawApiEvent(data);
    const t = new Date(parsed.timestamp).getTime();
    if (t <= endMs) events.push(parsed);
  });
  return events;
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/index.ts`

```ts
import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";

import { analyzeEvent } from "./ruleEngine/analyzeEvent";
import { DEFAULT_ANALYSIS_CONFIG } from "./config/mvpConfig";
import { parseIsoTimestampToMs } from "./utils/time";
import { fetchFingerprintHistory, fetchRouteHistory } from "./firestore/history";
import { parseRawApiEvent } from "./validation/rawApiEventSchema";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const ANALYSIS_FIELD = "analysis";

function alreadyAnalyzed(docData: unknown): boolean {
  const anyData = docData as any;
  return Boolean(anyData?.[ANALYSIS_FIELD]?.severity);
}

export const analyzeApiEvent = onDocumentCreated("rawApiEvents/{docId}", async (event: any) => {
  // `event.data` can be undefined in edge cases (should be rare for onDocumentCreated).
  const snapshot = event.data as any;
  if (!snapshot) return;

  // Re-read the document to make retries idempotent (Cloud Functions is at-least-once).
  const liveSnap = await snapshot.ref.get();
  const docData = liveSnap.data();
  if (!docData) return;

  if (alreadyAnalyzed(docData)) {
    console.log(`Analysis already exists; skipping. docId=${snapshot.id}`);
    return;
  }

  // Validate raw event schema.
  let rawEvent;
  try {
    rawEvent = parseRawApiEvent(docData);
  } catch (err) {
    console.error("Raw event validation failed. docId=", snapshot.id, err);
    return;
  }

  const currentMs = parseIsoTimestampToMs(rawEvent.timestamp);

  // Fetch just enough history to support MVP rules.
  const fingerprintWindowMs = Math.max(
    DEFAULT_ANALYSIS_CONFIG.windowsMs.duplicates,
    DEFAULT_ANALYSIS_CONFIG.windowsMs.burst,
    DEFAULT_ANALYSIS_CONFIG.windowsMs.polling,
    DEFAULT_ANALYSIS_CONFIG.windowsMs.retry
  );

  const routeWindowMs = Math.max(
    DEFAULT_ANALYSIS_CONFIG.windowsMs.cost,
    DEFAULT_ANALYSIS_CONFIG.windowsMs.auth,
    DEFAULT_ANALYSIS_CONFIG.windowsMs.hotspot
  );

  const fingerprintHistory = await fetchFingerprintHistory({
    fingerprint: rawEvent.fingerprint,
    windowStartMs: currentMs - fingerprintWindowMs,
    windowEndMs: currentMs,
    limit: 500
  });

  const routeHistory = await fetchRouteHistory({
    route: rawEvent.route,
    windowStartMs: currentMs - routeWindowMs,
    windowEndMs: currentMs,
    limit: 500
  });

  const analyzed = analyzeEvent({
    currentEvent: rawEvent,
    fingerprintHistory,
    routeHistory,
    config: DEFAULT_ANALYSIS_CONFIG
  });

  const db = getFirestore();
  // Write back to the same document to keep the frontend query simple (`rawApiEvents where analysis.flagged==true`).
  await db
    .collection("rawApiEvents")
    .doc(snapshot.id)
    .set(
      {
        analysis: analyzed
      },
      { merge: true }
    );
});
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/ruleEngine/analyzeEvent.ts`

```ts
import type { AnalysisConfig } from "../config/mvpConfig";
import { DEFAULT_ANALYSIS_CONFIG } from "../config/mvpConfig";
import type { RawApiEvent } from "../types/rawApiEvent";
import type { AnalyzedApiEvent } from "../types/analyzedApiEvent";
import type { RuleHit } from "../types/ruleResult";
import { maxSeverity, severityRank } from "../types/severity";
import type { Severity } from "../types/severity";
import type { RecommendedAction } from "../types/ruleResult";
import { parseIsoTimestampToMs } from "../utils/time";

import { buildSourceKey } from "../utils/sourceKey";

import { duplicateRequestsRule } from "../rules/duplicateRequestsRule";
import { burstTrafficRule } from "../rules/burstTrafficRule";
import { excessivePollingRule } from "../rules/excessivePollingRule";
import { retryStormRule } from "../rules/retryStormRule";
import { costlyApiAbuseRule } from "../rules/costlyApiAbuseRule";
import { authenticationAbuseRule } from "../rules/authenticationAbuseRule";
import { endpointHotspotsRule } from "../rules/endpointHotspotsRule";

export interface AnalyzeEventInput {
  currentEvent: RawApiEvent;
  // Short recent history for fingerprint-grouped rules.
  fingerprintHistory: RawApiEvent[]; // should include other events only; current is allowed but will be filtered
  // Short recent history for route-grouped rules.
  routeHistory: RawApiEvent[];
  config?: AnalysisConfig;
}

function severitySortDesc(a: Severity, b: Severity) {
  // Higher severity ranks first.
  return severityRank[b] - severityRank[a];
}

function chooseRecommendedAction(hits: RuleHit[], fallback: RecommendedAction): RecommendedAction {
  if (hits.length === 0) return fallback;
  // Choose action from the highest-severity hit.
  const sorted = [...hits].sort((h1, h2) => severitySortDesc(h1.severity, h2.severity));
  return sorted[0].recommendedAction ?? fallback;
}

export function analyzeEvent(input: AnalyzeEventInput): AnalyzedApiEvent {
  const config = input.config ?? DEFAULT_ANALYSIS_CONFIG;

  const current = input.currentEvent;
  const sourceKey = buildSourceKey(current);

  const currentMs = parseIsoTimestampToMs(current.timestamp);

  // Partition history into "past events within window" sets.
  const fingerprintPast = input.fingerprintHistory
    .filter((e) => e.requestId !== current.requestId)
    .map((e) => ({ e, t: parseIsoTimestampToMs(e.timestamp) }))
    .filter((x) => x.t <= currentMs)
    .sort((a, b) => a.t - b.t);

  const routePast = input.routeHistory
    .filter((e) => e.requestId !== current.requestId)
    .map((e) => ({ e, t: parseIsoTimestampToMs(e.timestamp) }))
    .filter((x) => x.t <= currentMs)
    .sort((a, b) => a.t - b.t);

  const within = (arr: Array<{ e: RawApiEvent; t: number }>, windowMs: number): RawApiEvent[] => {
    const start = currentMs - windowMs;
    return arr.filter((x) => x.t >= start).map((x) => x.e);
  };

  const duplicatesHistory = within(fingerprintPast, config.windowsMs.duplicates);
  const burstHistory = within(fingerprintPast, config.windowsMs.burst);
  const pollingHistory = within(fingerprintPast, config.windowsMs.polling);
  const retryHistory = within(fingerprintPast, config.windowsMs.retry);

  const costHistory = within(routePast, config.windowsMs.cost);
  const authHistory = within(routePast, config.windowsMs.auth);
  const hotspotHistory = within(routePast, config.windowsMs.hotspot);

  const ruleHits: RuleHit[] = [];

  const duplicateHit = duplicateRequestsRule({
    current,
    currentSourceKey: sourceKey,
    history: duplicatesHistory,
    config
  });
  if (duplicateHit) ruleHits.push(duplicateHit);

  const burstHit = burstTrafficRule({
    current,
    currentSourceKey: sourceKey,
    history: burstHistory,
    config
  });
  if (burstHit) ruleHits.push(burstHit);

  const pollingHit = excessivePollingRule({
    current,
    currentSourceKey: sourceKey,
    history: pollingHistory,
    config
  });
  if (pollingHit) ruleHits.push(pollingHit);

  const retryHit = retryStormRule({
    current,
    currentSourceKey: sourceKey,
    history: retryHistory,
    config
  });
  if (retryHit) ruleHits.push(retryHit);

  const costlyHit = costlyApiAbuseRule({
    current,
    currentSourceKey: sourceKey,
    history: costHistory,
    config
  });
  if (costlyHit) ruleHits.push(costlyHit);

  const authHit = authenticationAbuseRule({
    current,
    currentSourceKey: sourceKey,
    history: authHistory,
    config
  });
  if (authHit) ruleHits.push(authHit);

  const hotspotHit = endpointHotspotsRule({
    current,
    history: hotspotHistory,
    config
  });
  if (hotspotHit) ruleHits.push(hotspotHit);

  // Compute final severity: highest among matched rules.
  let finalSeverity: Severity = "NONE";
  for (const hit of ruleHits) {
    finalSeverity = maxSeverity(finalSeverity, hit.severity);
  }

  const flagged = finalSeverity !== "NONE";

  const sortedHits = [...ruleHits].sort((a, b) => severitySortDesc(a.severity, b.severity));

  const topReasons = sortedHits.slice(0, 2).map((h) => h.reason);
  const reasonSummary = topReasons.length > 0 ? topReasons.join(" | ") : "No suspicious behavior detected";

  const recommendedAction = chooseRecommendedAction(
    ruleHits,
    config.recommendedActions.monitorOnly
  );

  const analyzedAt = new Date().toISOString();

  // Lightweight evidence combination (useful for debugging without requiring deep analytics).
  const evidence = ruleHits.reduce<Record<string, unknown>>((acc, hit) => {
    if (hit.evidence && hit.evidence.ruleEvidenceKey) {
      // If a rule provides a stable key, store it.
      acc[String(hit.evidence.ruleEvidenceKey)] = hit.evidence;
    } else if (hit.evidence) {
      acc[hit.ruleName] = hit.evidence;
    }
    return acc;
  }, {});

  return {
    flagged,
    severity: finalSeverity,
    ruleHits,
    reasonSummary,
    recommendedAction,
    analyzedAt,
    sourceKey,
    ...(Object.keys(evidence).length > 0 ? { evidence } : {})
  };
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/authenticationAbuseRule.ts`

```ts
import type { AnalysisConfig } from "../config/mvpConfig";
import type { RawApiEvent } from "../types/rawApiEvent";
import type { RuleHit } from "../types/ruleResult";
import { parseIsoTimestampToMs } from "../utils/time";
import { buildSourceKey } from "../utils/sourceKey";

function isFailure(e: RawApiEvent): boolean {
  return !e.success || e.statusCode >= 400;
}

function isAuthRoute(route: string, config: AnalysisConfig): boolean {
  const list = config.authAbuse.authRoutes;
  if (list.length > 0) return list.includes(route);
  const r = route.toLowerCase();
  return r.includes("login") || r.includes("auth") || r.includes("token");
}

export function authenticationAbuseRule(input: {
  current: RawApiEvent;
  currentSourceKey: string;
  history: RawApiEvent[];
  config: AnalysisConfig;
}): RuleHit | null {
  const { current, currentSourceKey, history, config } = input;

  const route = current.route;
  if (!isAuthRoute(route, config)) return null;

  const currentMs = parseIsoTimestampToMs(current.timestamp);
  const windowStartMs = currentMs - config.windowsMs.auth;

  const relevant = history
    .filter((e) => e.route === route)
    .filter((e) => {
      const t = parseIsoTimestampToMs(e.timestamp);
      return t >= windowStartMs && t <= currentMs;
    })
    .filter((e) => buildSourceKey(e) === currentSourceKey);

  const failures = relevant.filter((e) => isFailure(e));
  const failedIncludingCurrent = failures.length + (isFailure(current) ? 1 : 0);

  if (failedIncludingCurrent < config.authAbuse.redAt) return null;

  const attemptsIncludingCurrent = relevant.length + 1;
  return {
    matched: true,
    ruleName: "authenticationAbuse",
    severity: "RED",
    reason: `Authentication abuse suspected: ${failedIncludingCurrent} failed auth attempts for ${route} from the same source in ${config.windowsMs.auth}ms.`,
    recommendedAction: config.recommendedActions.authAbuse,
    evidence: {
      route,
      sourceKey: currentSourceKey,
      failedIncludingCurrent,
      attemptsIncludingCurrent,
      windowMs: config.windowsMs.auth,
      lastStatusCode: current.statusCode
    }
  };
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/burstTrafficRule.ts`

```ts
import type { AnalysisConfig } from "../config/mvpConfig";
import type { RawApiEvent } from "../types/rawApiEvent";
import type { RuleHit } from "../types/ruleResult";
import { parseIsoTimestampToMs } from "../utils/time";
import { buildSourceKey } from "../utils/sourceKey";

export function burstTrafficRule(input: {
  current: RawApiEvent;
  currentSourceKey: string;
  history: RawApiEvent[];
  config: AnalysisConfig;
}): RuleHit | null {
  const { current, currentSourceKey, history, config } = input;

  const currentMs = parseIsoTimestampToMs(current.timestamp);
  const windowStartMs = currentMs - config.burstTraffic.windowMs;

  const relevant = history
    .filter((e) => e.fingerprint === current.fingerprint)
    .filter((e) => parseIsoTimestampToMs(e.timestamp) >= windowStartMs && parseIsoTimestampToMs(e.timestamp) <= currentMs)
    .filter((e) => buildSourceKey(e) === currentSourceKey);

  const occurrencesIncludingCurrent = relevant.length + 1;
  if (occurrencesIncludingCurrent < config.burstTraffic.minOccurrences) return null;

  const firstMs = Math.min(...relevant.map((e) => parseIsoTimestampToMs(e.timestamp)).concat([currentMs]));
  const lastMs = Math.max(...relevant.map((e) => parseIsoTimestampToMs(e.timestamp)).concat([currentMs]));

  return {
    matched: true,
    ruleName: "burstTraffic",
    severity: config.burstTraffic.severity,
    reason: `Burst traffic detected (${occurrencesIncludingCurrent} requests from the same source within ~${lastMs - firstMs}ms).`,
    recommendedAction: config.recommendedActions.burstTraffic,
    evidence: {
      fingerprint: current.fingerprint,
      sourceKey: currentSourceKey,
      occurrencesIncludingCurrent,
      windowMs: config.burstTraffic.windowMs
    }
  };
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/costlyApiAbuseRule.ts`

```ts
import type { AnalysisConfig } from "../config/mvpConfig";
import type { RawApiEvent } from "../types/rawApiEvent";
import type { RuleHit } from "../types/ruleResult";
import { parseIsoTimestampToMs } from "../utils/time";
import { buildSourceKey } from "../utils/sourceKey";

export function costlyApiAbuseRule(input: {
  current: RawApiEvent;
  currentSourceKey: string;
  history: RawApiEvent[];
  config: AnalysisConfig;
}): RuleHit | null {
  const { current, currentSourceKey, history, config } = input;

  const route = current.route;
  if (!config.costlyApi.expensiveRoutes.includes(route)) return null;

  const currentMs = parseIsoTimestampToMs(current.timestamp);
  const windowStartMs = currentMs - config.windowsMs.cost;

  const relevant = history
    .filter((e) => e.route === route)
    .filter((e) => parseIsoTimestampToMs(e.timestamp) >= windowStartMs && parseIsoTimestampToMs(e.timestamp) <= currentMs)
    .filter((e) => buildSourceKey(e) === currentSourceKey);

  const countIncludingCurrent = relevant.length + 1;
  if (countIncludingCurrent < config.costlyApi.yellowAt) return null;

  let severity: "YELLOW" | "ORANGE" | "RED";
  if (countIncludingCurrent >= config.costlyApi.redAt) severity = "RED";
  else if (countIncludingCurrent >= config.costlyApi.orangeAt) severity = "ORANGE";
  else severity = "YELLOW";

  return {
    matched: true,
    ruleName: "costlyApi",
    severity,
    reason: `Costly endpoint abuse: ${route} called ${countIncludingCurrent} times by the same source within ${config.windowsMs.cost}ms.`,
    recommendedAction: config.recommendedActions.costlyApi,
    evidence: {
      route,
      sourceKey: currentSourceKey,
      countIncludingCurrent,
      windowMs: config.windowsMs.cost
    }
  };
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/duplicateRequestsRule.ts`

```ts
import type { AnalysisConfig } from "../config/mvpConfig";
import type { RawApiEvent } from "../types/rawApiEvent";
import type { RuleHit } from "../types/ruleResult";
import { parseIsoTimestampToMs } from "../utils/time";
import { buildSourceKey } from "../utils/sourceKey";

export function duplicateRequestsRule(input: {
  current: RawApiEvent;
  currentSourceKey: string;
  history: RawApiEvent[];
  config: AnalysisConfig;
}): RuleHit | null {
  const { current, currentSourceKey, history, config } = input;

  const currentMs = parseIsoTimestampToMs(current.timestamp);
  const windowStartMs = currentMs - config.windowsMs.duplicates;

  const sameSource = history
    .filter((e) => e.fingerprint === current.fingerprint)
    .filter((e) => {
      const t = parseIsoTimestampToMs(e.timestamp);
      return t >= windowStartMs && t <= currentMs;
    })
    .filter((e) => buildSourceKey(e) === currentSourceKey);

  const occurrencesIncludingCurrent = sameSource.length + 1;
  if (occurrencesIncludingCurrent < config.duplicateRequests.minOccurrences) return null;

  const firstMs = Math.min(...sameSource.map((e) => parseIsoTimestampToMs(e.timestamp)).concat([currentMs]));
  const lastMs = Math.max(...sameSource.map((e) => parseIsoTimestampToMs(e.timestamp)).concat([currentMs]));

  return {
    matched: true,
    ruleName: "duplicateRequests",
    severity: config.duplicateRequests.severity,
    reason: `Duplicate API requests from the same source detected (${occurrencesIncludingCurrent} in ${Math.max(
      1,
      lastMs - firstMs
    )}ms).`,
    recommendedAction: config.recommendedActions.duplicateRequests,
    evidence: {
      fingerprint: current.fingerprint,
      sourceKey: currentSourceKey,
      occurrencesIncludingCurrent,
      windowMs: config.windowsMs.duplicates
    }
  };
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/endpointHotspotsRule.ts`

```ts
import type { AnalysisConfig } from "../config/mvpConfig";
import type { RawApiEvent } from "../types/rawApiEvent";
import type { RuleHit } from "../types/ruleResult";
import { parseIsoTimestampToMs } from "../utils/time";

export function endpointHotspotsRule(input: {
  current: RawApiEvent;
  history: RawApiEvent[];
  config: AnalysisConfig;
}): RuleHit | null {
  const { current, history, config } = input;
  if (!config.endpointHotspots.enabled) return null;

  const route = current.route;
  const currentMs = parseIsoTimestampToMs(current.timestamp);
  const windowStartMs = currentMs - config.windowsMs.hotspot;

  const relevant = history
    .filter((e) => e.route === route)
    .filter((e) => {
      const t = parseIsoTimestampToMs(e.timestamp);
      return t >= windowStartMs && t <= currentMs;
    });

  const countIncludingCurrent = relevant.length + 1;
  if (countIncludingCurrent < config.endpointHotspots.yellowAt) return null;

  const severity = countIncludingCurrent >= config.endpointHotspots.orangeAt ? "ORANGE" : "YELLOW";

  return {
    matched: true,
    ruleName: "endpointHotspots",
    severity,
    reason: `Endpoint hotspot detected: ${route} received ${countIncludingCurrent} requests within ${config.windowsMs.hotspot}ms.`,
    recommendedAction: config.recommendedActions.endpointHotspots,
    evidence: {
      route,
      countIncludingCurrent,
      windowMs: config.windowsMs.hotspot
    }
  };
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/excessivePollingRule.ts`

```ts
import type { AnalysisConfig } from "../config/mvpConfig";
import type { RawApiEvent } from "../types/rawApiEvent";
import type { RuleHit } from "../types/ruleResult";
import { parseIsoTimestampToMs } from "../utils/time";
import { buildSourceKey } from "../utils/sourceKey";

export function excessivePollingRule(input: {
  current: RawApiEvent;
  currentSourceKey: string;
  history: RawApiEvent[];
  config: AnalysisConfig;
}): RuleHit | null {
  const { current, currentSourceKey, history, config } = input;

  const currentMs = parseIsoTimestampToMs(current.timestamp);
  const windowStartMs = currentMs - config.windowsMs.polling;

  const relevant = history
    .filter((e) => e.fingerprint === current.fingerprint)
    .filter((e) => {
      const t = parseIsoTimestampToMs(e.timestamp);
      return t >= windowStartMs && t <= currentMs;
    })
    .filter((e) => buildSourceKey(e) === currentSourceKey);

  const allEvents = [...relevant, current].sort(
    (a, b) => parseIsoTimestampToMs(a.timestamp) - parseIsoTimestampToMs(b.timestamp)
  );

  const occurrencesIncludingCurrent = allEvents.length;
  if (occurrencesIncludingCurrent < config.excessivePolling.minOccurrencesForYellow) return null;

  // Compute minimum inter-arrival interval.
  const times = allEvents.map((e) => parseIsoTimestampToMs(e.timestamp));
  let minIntervalMs = Number.POSITIVE_INFINITY;
  for (let i = 1; i < times.length; i++) {
    const interval = times[i] - times[i - 1];
    if (interval < minIntervalMs) minIntervalMs = interval;
  }

  if (
    occurrencesIncludingCurrent >= config.excessivePolling.minOccurrencesForOrange &&
    minIntervalMs <= config.excessivePolling.minIntervalMsForOrange
  ) {
    return {
      matched: true,
      ruleName: "excessivePolling",
      severity: "ORANGE",
      reason: `Excessive polling pattern detected (${occurrencesIncludingCurrent} calls with min interval ${minIntervalMs}ms).`,
      recommendedAction: config.recommendedActions.excessivePolling,
      evidence: {
        fingerprint: current.fingerprint,
        sourceKey: currentSourceKey,
        occurrencesIncludingCurrent,
        minIntervalMs,
        windowMs: config.windowsMs.polling
      }
    };
  }

  if (
    occurrencesIncludingCurrent >= config.excessivePolling.minOccurrencesForYellow &&
    minIntervalMs <= config.excessivePolling.minIntervalMsForYellow
  ) {
    return {
      matched: true,
      ruleName: "excessivePolling",
      severity: "YELLOW",
      reason: `Potential polling detected (${occurrencesIncludingCurrent} calls with min interval ${minIntervalMs}ms).`,
      recommendedAction: config.recommendedActions.excessivePolling,
      evidence: {
        fingerprint: current.fingerprint,
        sourceKey: currentSourceKey,
        occurrencesIncludingCurrent,
        minIntervalMs,
        windowMs: config.windowsMs.polling
      }
    };
  }

  return null;
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/retryStormRule.ts`

```ts
import type { AnalysisConfig } from "../config/mvpConfig";
import type { RawApiEvent } from "../types/rawApiEvent";
import type { RuleHit } from "../types/ruleResult";
import { parseIsoTimestampToMs } from "../utils/time";
import { buildSourceKey } from "../utils/sourceKey";

function isFailure(e: RawApiEvent): boolean {
  // MVP heuristic: treat unsuccessful requests (or HTTP 4xx/5xx) as failures.
  return !e.success || e.statusCode >= 400;
}

export function retryStormRule(input: {
  current: RawApiEvent;
  currentSourceKey: string;
  history: RawApiEvent[];
  config: AnalysisConfig;
}): RuleHit | null {
  const { current, currentSourceKey, history, config } = input;

  const currentMs = parseIsoTimestampToMs(current.timestamp);
  const lookbackStartMs = currentMs - config.retryStorm.failureLookbackMs;

  const relevantPast = history
    .filter((e) => e.fingerprint === current.fingerprint)
    .filter((e) => {
      const t = parseIsoTimestampToMs(e.timestamp);
      return t <= currentMs && t >= lookbackStartMs;
    })
    .filter((e) => buildSourceKey(e) === currentSourceKey);

  const allRelevant = [...relevantPast, current].sort(
    (a, b) => parseIsoTimestampToMs(a.timestamp) - parseIsoTimestampToMs(b.timestamp)
  );

  const failures = allRelevant.filter((e) => {
    const t = parseIsoTimestampToMs(e.timestamp);
    return t >= lookbackStartMs && t <= currentMs && isFailure(e);
  });

  const failuresCount = failures.length;
  if (failuresCount < config.retryStorm.failuresForYellow) return null;

  const attemptsCount = allRelevant.length;

  let severity: "YELLOW" | "ORANGE" | "RED";
  if (failuresCount >= config.retryStorm.failuresForRed) severity = "RED";
  else if (failuresCount >= config.retryStorm.failuresForOrange) severity = "ORANGE";
  else severity = "YELLOW";

  const firstFailureMs = failures.length
    ? Math.min(...failures.map((e) => parseIsoTimestampToMs(e.timestamp)))
    : currentMs;

  const lastFailureMs = failures.length
    ? Math.max(...failures.map((e) => parseIsoTimestampToMs(e.timestamp)))
    : currentMs;

  return {
    matched: true,
    ruleName: "retryStorm",
    severity,
    reason: `Retry storm suspected: ${failuresCount} failed attempts within ${config.retryStorm.failureLookbackMs}ms (plus ${attemptsCount - failuresCount} non-failed retries).`,
    recommendedAction: config.recommendedActions.retryStorm,
    evidence: {
      fingerprint: current.fingerprint,
      sourceKey: currentSourceKey,
      failuresCount,
      attemptsCount,
      failureLookbackMs: config.retryStorm.failureLookbackMs,
      firstFailureMs,
      lastFailureMs
    }
  };
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/types/analyzedApiEvent.ts`

```ts
import type { RuleHit, RecommendedAction } from "./ruleResult";
import type { Severity } from "./severity";

export interface AnalyzedApiEvent {
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

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/types/rawApiEvent.ts`

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

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/types/ruleResult.ts`

```ts
import type { Severity } from "./severity";

export type RecommendedAction =
  | "monitor_only"
  | "debounce_client_requests"
  | "dedupe_inflight_requests"
  | "add_short_ttl_cache"
  | "add_retry_backoff"
  | "rate_limit_source"
  | "inspect_auth_abuse";

export interface RuleHit {
  matched: true;
  ruleName: string;
  severity: Severity;
  reason: string;
  recommendedAction: RecommendedAction;
  evidence?: Record<string, unknown>;
}

export interface RuleMiss {
  matched: false;
}

export type RuleResult = RuleHit | RuleMiss;
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/types/severity.ts`

```ts
export const SEVERITY_LEVELS = ["NONE", "YELLOW", "ORANGE", "RED"] as const;

export type Severity = (typeof SEVERITY_LEVELS)[number];

export const severityRank: Record<Severity, number> = {
  NONE: 0,
  YELLOW: 1,
  ORANGE: 2,
  RED: 3
};

export function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank[a] >= severityRank[b] ? a : b;
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/utils/sourceKey.ts`

```ts
import type { RawApiEvent } from "../types/rawApiEvent";

/**
 * Best-effort "source identity" builder for abuse detection.
 *
 * Limitations (important for MVP):
 * - If both `clientId` and `sessionId` are null/missing, many distinct users may share the same key
 *   (e.g., same `serviceName` and `userAgent` behind a NAT/proxy).
 * - If `userAgent` is unstable or null, identity can fragment and reduce rule accuracy.
 * - This is not a substitute for IP-based identity; it is only meant to be "good enough" for grouping.
 */
export function buildSourceKey(event: RawApiEvent): string {
  const clientId = event.clientId ?? "none";
  const sessionId = event.sessionId ?? "none";
  const serviceName = event.serviceName ?? "unknown-service";
  const userAgent = event.userAgent ?? "none-ua";
  return `clientId:${clientId}|sessionId:${sessionId}|service:${serviceName}|ua:${userAgent}`;
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/utils/time.ts`

```ts
export function parseIsoTimestampToMs(iso: string): number {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid ISO timestamp: ${iso}`);
  }
  return ms;
}

export function isoTimestampFromMs(ms: number): string {
  return new Date(ms).toISOString();
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/validation/rawApiEventSchema.ts`

```ts
import { z } from "zod";
import type { RawApiEvent } from "../types/rawApiEvent";

// Runtime validator for the exact event schema produced by `APIMonitor`.
// Note: We intentionally do not call `.strict()` so Firestore-enriched fields (like `analysis`)
// won't break parsing when we re-read existing documents.
export const rawApiEventSchema = z.object({
  schemaVersion: z.string(),
  requestId: z.string(),
  correlationId: z.string(),
  timestamp: z.string(),
  completedAt: z.string(),
  latencyMs: z.number(),
  method: z.string(),
  originalUrl: z.string(),
  route: z.string(),
  queryParams: z.record(z.string(), z.string()),
  fingerprint: z.string(),
  chainDepth: z.number(),
  statusCode: z.number(),
  success: z.boolean(),
  requestBodySize: z.number().nullable(),
  responseSize: z.number().nullable(),
  serviceName: z.string(),
  environment: z.string(),
  clientId: z.string().nullable(),
  sessionId: z.string().nullable(),
  userAgent: z.string().nullable()
});

export type RawApiEventValidation = z.infer<typeof rawApiEventSchema>;

export function parseRawApiEvent(input: unknown): RawApiEvent {
  return rawApiEventSchema.parse(input) as RawApiEvent;
}
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/tests/analyzeEvent.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { analyzeEvent } from "../src/ruleEngine/analyzeEvent";
import { DEFAULT_ANALYSIS_CONFIG } from "../src/config/mvpConfig";
import { makeRawEvent } from "./fixtures/rawEvents";

const testConfig = {
  ...DEFAULT_ANALYSIS_CONFIG,
  endpointHotspots: {
    ...DEFAULT_ANALYSIS_CONFIG.endpointHotspots,
    enabled: false
  }
};

describe("AnalysisService rule engine (MVP)", () => {
  it("flags duplicate API requests (ORANGE)", () => {
    const t1 = "2026-03-20T10:00:00.000Z";
    const t2 = "2026-03-20T10:00:01.000Z";
    const route = "/api/users/{id}";
    const fingerprint = "fp:GET:/api/users/{id}:include=profile";

    const e1 = makeRawEvent({
      requestId: "r1",
      timestamp: t1,
      method: "GET",
      route,
      fingerprint,
      clientId: "client-1",
      sessionId: "sess-1",
      userAgent: "ua-a"
    });
    const e2 = makeRawEvent({
      requestId: "r2",
      timestamp: t2,
      method: "GET",
      route,
      fingerprint,
      clientId: "client-1",
      sessionId: "sess-1",
      userAgent: "ua-a"
    });

    const analyzed = analyzeEvent({
      currentEvent: e2,
      fingerprintHistory: [e1],
      routeHistory: [e1],
      config: testConfig
    });

    expect(analyzed.flagged).toBe(true);
    expect(analyzed.severity).toBe("ORANGE");
    expect(analyzed.ruleHits.some((h) => h.ruleName === "duplicateRequests")).toBe(true);
  });

  it("flags burst traffic (RED)", () => {
    const base = new Date("2026-03-20T10:00:00.000Z").getTime();
    const route = "/api/search";
    const fingerprint = "fp:GET:/api/search:q=*";

    const events = Array.from({ length: 8 }).map((_, i) => {
      const t = new Date(base + i * 200).toISOString(); // 0..1400ms
      return makeRawEvent({
        requestId: `b${i + 1}`,
        timestamp: t,
        method: "GET",
        route,
        fingerprint,
        clientId: "client-burst",
        sessionId: "sess-burst",
        userAgent: "ua-burst"
      });
    });

    const current = events[7];
    const history = events.slice(0, 7);

    const analyzed = analyzeEvent({
      currentEvent: current,
      fingerprintHistory: history,
      routeHistory: history,
      config: testConfig
    });

    expect(analyzed.severity).toBe("RED");
    expect(analyzed.ruleHits.some((h) => h.ruleName === "burstTraffic")).toBe(true);
  });

  it("flags excessive polling (ORANGE)", () => {
    const base = new Date("2026-03-20T10:00:00.000Z").getTime();
    const route = "/api/notifications/stream";
    const fingerprint = "fp:GET:/api/notifications/stream";

    const events = Array.from({ length: 5 }).map((_, i) => {
      const t = new Date(base + i * 200).toISOString(); // min interval 200ms
      return makeRawEvent({
        requestId: `p${i + 1}`,
        timestamp: t,
        method: "GET",
        route,
        fingerprint,
        clientId: "client-poll",
        sessionId: "sess-poll",
        userAgent: "ua-poll"
      });
    });

    const current = events[4];
    const history = events.slice(0, 4);

    const analyzed = analyzeEvent({
      currentEvent: current,
      fingerprintHistory: history,
      routeHistory: history,
      config: testConfig
    });

    expect(analyzed.severity).toBe("ORANGE");
    const pollingHit = analyzed.ruleHits.find((h) => h.ruleName === "excessivePolling");
    expect(pollingHit).toBeTruthy();
    expect(pollingHit?.severity).toBe("ORANGE");
  });

  it("flags retry storm (ORANGE)", () => {
    const base = new Date("2026-03-20T10:00:00.000Z").getTime();
    const route = "/api/payments/charge";
    const fingerprint = "fp:POST:/api/payments/charge";

    const events = Array.from({ length: 4 }).map((_, i) => {
      const t = new Date(base + i * 700).toISOString(); // failures within 5s
      return makeRawEvent({
        requestId: `rt${i + 1}`,
        timestamp: t,
        method: "POST",
        route,
        fingerprint,
        clientId: "client-retry",
        sessionId: "sess-retry",
        userAgent: "ua-retry",
        success: false,
        statusCode: 500
      });
    });

    const current = events[3];
    const history = events.slice(0, 3);

    const analyzed = analyzeEvent({
      currentEvent: current,
      fingerprintHistory: history,
      routeHistory: history,
      config: testConfig
    });

    expect(analyzed.ruleHits.some((h) => h.ruleName === "retryStorm")).toBe(true);
    const retryHit = analyzed.ruleHits.find((h) => h.ruleName === "retryStorm");
    expect(retryHit?.severity).toBe("ORANGE");
  });

  it("flags authentication abuse (RED)", () => {
    const base = new Date("2026-03-20T10:00:00.000Z").getTime();
    const route = "/auth/login";
    const fingerprint = "fp:POST:/auth/login";

    const events = Array.from({ length: 5 }).map((_, i) => {
      const t = new Date(base + i * 900).toISOString(); // all within 30s
      return makeRawEvent({
        requestId: `a${i + 1}`,
        timestamp: t,
        method: "POST",
        route,
        fingerprint,
        clientId: "client-auth",
        sessionId: "sess-auth",
        userAgent: "ua-auth",
        success: false,
        statusCode: 401
      });
    });

    const current = events[4];
    const history = events.slice(0, 4);

    const analyzed = analyzeEvent({
      currentEvent: current,
      fingerprintHistory: history,
      routeHistory: history,
      config: testConfig
    });

    expect(analyzed.severity).toBe("RED");
    const hit = analyzed.ruleHits.find((h) => h.ruleName === "authenticationAbuse");
    expect(hit?.severity).toBe("RED");
  });
});
```

## File: `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/tests/fixtures/rawEvents.ts`

```ts
import type { RawApiEvent } from "../../src/types/rawApiEvent";

export function makeRawEvent(input: Partial<RawApiEvent> & { requestId: string; timestamp: string; route: string }): RawApiEvent {
  const { requestId, timestamp, route, ...rest } = input;

  return {
    schemaVersion: input.schemaVersion ?? "1.0",
    requestId,
    correlationId: rest.correlationId ?? "corr-1",
    timestamp,
    completedAt: rest.completedAt ?? timestamp,
    latencyMs: rest.latencyMs ?? 120,
    method: rest.method ?? "GET",
    originalUrl: rest.originalUrl ?? route,
    route,
    queryParams: rest.queryParams ?? {},
    fingerprint: rest.fingerprint ?? `fp:${rest.method ?? "GET"}:${route}`,
    chainDepth: rest.chainDepth ?? 1,
    statusCode: rest.statusCode ?? 200,
    success: rest.success ?? true,
    requestBodySize: rest.requestBodySize ?? null,
    responseSize: rest.responseSize ?? null,
    serviceName: rest.serviceName ?? "student-service",
    environment: rest.environment ?? "dev",
    clientId: rest.clientId ?? "client-1",
    sessionId: rest.sessionId ?? "sess-1",
    userAgent: rest.userAgent ?? "unit-test-agent/1.0"
  };
}
```

## Dependencies

### `dependencies`
- `firebase-admin` `^13.7.0`
- `firebase-functions` `^7.2.2`
- `zod` `^4.3.6`

### `devDependencies`
- `@types/node` `^25.5.0`
- `ts-node` `^10.9.2`
- `typescript` `^5.9.3`
- `vitest` `^4.1.0`

### Firebase-specific
- `firebase-admin`
- `firebase-functions`

### General-purpose
- `zod`
- `@types/node`
- `ts-node`
- `typescript`
- `vitest`

## Firebase Touchpoints

- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/index.ts`: 1: `import * as admin from "firebase-admin";`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/index.ts`: 2: `import { onDocumentCreated } from "firebase-functions/v2/firestore";`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/index.ts`: 3: `import { getFirestore } from "firebase-admin/firestore";`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/index.ts`: 12: `admin.initializeApp();`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/index.ts`: 22: `export const analyzeApiEvent = onDocumentCreated("rawApiEvents/{docId}", async (event: any) => {`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/index.ts`: 28: `const liveSnap = await snapshot.ref.get();`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/index.ts`: 83: `const db = getFirestore();`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/index.ts`: 86: `.collection("rawApiEvents")`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/index.ts`: 87: `.doc(snapshot.id)`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/index.ts`: 88: `.set(`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 1: `import { getFirestore } from "firebase-admin/firestore";`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 12: `const db = getFirestore();`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 18: `.collection("rawApiEvents")`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 19: `.where("fingerprint", "==", input.fingerprint)`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 20: `.where("timestamp", ">=", windowStartIso)`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 21: `.orderBy("timestamp", "desc")`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 22: `.limit(input.limit)`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 23: `.get();`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 42: `const db = getFirestore();`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 46: `.collection("rawApiEvents")`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 47: `.where("route", "==", input.route)`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 48: `.where("timestamp", ">=", windowStartIso)`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 49: `.orderBy("timestamp", "desc")`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 50: `.limit(input.limit)`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/firestore/history.ts`: 51: `.get();`

## Pure Logic (No Firebase)

These files have zero Firebase imports and can be copied as-is into another project:

- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/config/mvpConfig.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/ruleEngine/analyzeEvent.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/authenticationAbuseRule.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/burstTrafficRule.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/costlyApiAbuseRule.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/duplicateRequestsRule.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/endpointHotspotsRule.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/excessivePollingRule.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/rules/retryStormRule.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/types/analyzedApiEvent.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/types/rawApiEvent.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/types/ruleResult.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/types/severity.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/utils/sourceKey.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/utils/time.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/src/validation/rawApiEventSchema.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/tests/analyzeEvent.test.ts`
- `/Users/collintucker/Workspace/HackathonSpring2026/APIAbusePreventionUnit/AnalysisService/tests/fixtures/rawEvents.ts`

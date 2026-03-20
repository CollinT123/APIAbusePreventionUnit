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

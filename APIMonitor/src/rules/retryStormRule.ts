import type { AnalysisConfig } from "../config/mvpConfig";
import type { RawApiEvent } from "../types/rawApiEvent";
import type { RuleHit } from "../types/ruleResult";
import { parseIsoTimestampToMs } from "../utils/time";
import { buildSourceKey } from "../utils/sourceKey";

function isFailure(e: RawApiEvent): boolean { return !e.success || e.statusCode >= 400; }

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
    .filter((e) => { const t = parseIsoTimestampToMs(e.timestamp); return t <= currentMs && t >= lookbackStartMs; })
    .filter((e) => buildSourceKey(e) === currentSourceKey);
  const allRelevant = [...relevantPast, current].sort((a, b) => parseIsoTimestampToMs(a.timestamp) - parseIsoTimestampToMs(b.timestamp));
  const failures = allRelevant.filter((e) => { const t = parseIsoTimestampToMs(e.timestamp); return t >= lookbackStartMs && t <= currentMs && isFailure(e); });
  const failuresCount = failures.length;
  if (failuresCount < config.retryStorm.failuresForYellow) return null;
  const attemptsCount = allRelevant.length;
  let severity: "YELLOW" | "ORANGE" | "RED";
  if (failuresCount >= config.retryStorm.failuresForRed) severity = "RED";
  else if (failuresCount >= config.retryStorm.failuresForOrange) severity = "ORANGE";
  else severity = "YELLOW";
  const firstFailureMs = failures.length ? Math.min(...failures.map((e) => parseIsoTimestampToMs(e.timestamp))) : currentMs;
  const lastFailureMs = failures.length ? Math.max(...failures.map((e) => parseIsoTimestampToMs(e.timestamp))) : currentMs;
  return { matched: true, ruleName: "retryStorm", severity,
    reason: `Retry storm suspected: ${failuresCount} failed attempts within ${config.retryStorm.failureLookbackMs}ms (plus ${attemptsCount - failuresCount} non-failed retries).`,
    recommendedAction: config.recommendedActions.retryStorm,
    evidence: { fingerprint: current.fingerprint, sourceKey: currentSourceKey, failuresCount, attemptsCount, failureLookbackMs: config.retryStorm.failureLookbackMs, firstFailureMs, lastFailureMs } };
}

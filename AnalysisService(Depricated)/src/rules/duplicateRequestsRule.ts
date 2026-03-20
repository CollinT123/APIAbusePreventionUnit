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


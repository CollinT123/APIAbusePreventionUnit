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


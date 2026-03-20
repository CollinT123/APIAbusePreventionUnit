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


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
  return { matched: true, ruleName: "costlyApi", severity,
    reason: `Costly endpoint abuse: ${route} called ${countIncludingCurrent} times by the same source within ${config.windowsMs.cost}ms.`,
    recommendedAction: config.recommendedActions.costlyApi,
    evidence: { route, sourceKey: currentSourceKey, countIncludingCurrent, windowMs: config.windowsMs.cost } };
}

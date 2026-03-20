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


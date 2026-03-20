import { DEFAULT_ANALYSIS_CONFIG } from "../config/mvpConfig";
import { analyzeEvent } from "../ruleEngine/analyzeEvent";
import type { EventStore } from "../store/eventStore";
import type { AnalyzedApiEvent } from "../types/analyzedApiEvent";
import type { RawApiEvent } from "../types/rawApiEvent";
import { parseIsoTimestampToMs } from "../utils/time";

export function runAnalysis(
  event: RawApiEvent,
  store: EventStore
): AnalyzedApiEvent {
  const currentMs = parseIsoTimestampToMs(event.timestamp);

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

  const fingerprintHistory = store.queryByFingerprint(
    event.fingerprint,
    currentMs - fingerprintWindowMs,
    currentMs,
    500
  );

  const routeHistory = store.queryByRoute(
    event.route,
    currentMs - routeWindowMs,
    currentMs,
    500
  );

  return analyzeEvent({
    currentEvent: event,
    fingerprintHistory,
    routeHistory,
    config: DEFAULT_ANALYSIS_CONFIG
  });
}

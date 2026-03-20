import type { RecommendedAction } from "../types/ruleResult";
import type { Severity } from "../types/severity";

export interface AnalysisConfig {
  windowsMs: {
    duplicates: number;
    burst: number;
    polling: number;
    retry: number;
    auth: number;
    cost: number;
    hotspot: number;
  };
  duplicateRequests: {
    minOccurrences: number;
    severity: Severity;
  };
  burstTraffic: {
    minOccurrences: number;
    severity: Severity;
    windowMs: number;
  };
  excessivePolling: {
    minOccurrencesForYellow: number;
    minIntervalMsForYellow: number;
    minOccurrencesForOrange: number;
    minIntervalMsForOrange: number;
  };
  retryStorm: {
    failureLookbackMs: number;
    failuresForYellow: number;
    failuresForOrange: number;
    failuresForRed: number;
  };
  costlyApi: {
    expensiveRoutes: string[];
    yellowAt: number;
    orangeAt: number;
    redAt: number;
  };
  authAbuse: {
    authRoutes: string[];
    redAt: number;
  };
  endpointHotspots: {
    enabled: boolean;
    yellowAt: number;
    orangeAt: number;
  };
  recommendedActions: {
    duplicateRequests: RecommendedAction;
    burstTraffic: RecommendedAction;
    excessivePolling: RecommendedAction;
    retryStorm: RecommendedAction;
    costlyApi: RecommendedAction;
    authAbuse: RecommendedAction;
    endpointHotspots: RecommendedAction;
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
  duplicateRequests: { minOccurrences: 2, severity: "ORANGE" },
  burstTraffic: { minOccurrences: 8, severity: "RED", windowMs: 2_000 },
  excessivePolling: {
    minOccurrencesForYellow: 3,
    minIntervalMsForYellow: 1_000,
    minOccurrencesForOrange: 5,
    minIntervalMsForOrange: 300
  },
  retryStorm: { failureLookbackMs: 5_000, failuresForYellow: 2, failuresForOrange: 4, failuresForRed: 6 },
  costlyApi: {
    expensiveRoutes: ["/api/reports/export", "/api/payments/charge"],
    yellowAt: 15, orangeAt: 25, redAt: 40
  },
  authAbuse: { authRoutes: ["/auth/login", "/auth/token/refresh"], redAt: 5 },
  endpointHotspots: { enabled: false, yellowAt: 100, orangeAt: 200 },
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

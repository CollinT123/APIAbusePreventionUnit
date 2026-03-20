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


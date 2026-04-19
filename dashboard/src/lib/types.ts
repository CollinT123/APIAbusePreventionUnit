export interface RawApiEvent {
  schemaVersion: string;
  requestId: string;
  correlationId: string;
  timestamp: string;
  completedAt: string;
  latencyMs: number;
  method: string;
  originalUrl: string;
  route: string;
  queryParams: Record<string, string>;
  fingerprint: string;
  chainDepth: number;
  statusCode: number;
  success: boolean;
  requestBodySize: number | null;
  responseSize: number | null;
  serviceName: string;
  environment: string;
  clientId: string | null;
  sessionId: string | null;
  userAgent: string | null;
}

export type Severity = "NONE" | "YELLOW" | "ORANGE" | "RED";

export interface RuleHit {
  matched: true;
  ruleName: string;
  severity: Severity;
  reason: string;
  recommendedAction: string;
  evidence?: Record<string, unknown>;
}

export interface AnalyzedApiEvent {
  flagged: boolean;
  severity: Severity;
  ruleHits: RuleHit[];
  reasonSummary: string;
  recommendedAction: string;
  analyzedAt: string;
  sourceKey: string;
  evidence?: Record<string, unknown>;
}

export interface FixConfig {
  id: string;
  ruleName: string;
  route: string;
  strategy: string;
  params: Record<string, unknown>;
  appliedAt: string;
  status: "active" | "disabled";
}

export interface FixStatus {
  fix: FixConfig;
  eventsBeforeFix: number;
  eventsSinceFix: number;
  issuesSinceFix: number;
  effective: boolean;
}

export interface FlaggedResponse {
  issues: Record<string, Array<{ event: RawApiEvent; analysis: AnalyzedApiEvent }>>;
}

export interface EventsSummary {
  totalEventCount: number;
  flaggedEventCount: number;
  flaggedByRule: Record<string, number>;
  averageLatencyPerRoute: Record<string, number>;
}

export interface RouteSummary {
  route: string;
  totalRequests: number;
  lastSeen: string;
  methods: string[];
  statusBreakdown: {
    success: number;
    clientError: number;
    serverError: number;
  };
  issues: Array<{
    ruleName: string;
    severity: string;
    count: number;
    latestReason: string;
  }>;
  activeFix: FixConfig | null;
  performance?: {
    successRate: number;
    avgLatencyMs?: number;
  };
}

export interface RoutesResponse {
  routes: RouteSummary[];
}

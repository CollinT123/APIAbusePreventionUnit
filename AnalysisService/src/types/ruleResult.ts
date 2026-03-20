import type { Severity } from "./severity";

export type RecommendedAction =
  | "monitor_only"
  | "debounce_client_requests"
  | "dedupe_inflight_requests"
  | "add_short_ttl_cache"
  | "add_retry_backoff"
  | "rate_limit_source"
  | "inspect_auth_abuse";

export interface RuleHit {
  matched: true;
  ruleName: string;
  severity: Severity;
  reason: string;
  recommendedAction: RecommendedAction;
  evidence?: Record<string, unknown>;
}

export interface RuleMiss {
  matched: false;
}

export type RuleResult = RuleHit | RuleMiss;


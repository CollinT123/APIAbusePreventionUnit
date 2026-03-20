import type { RuleHit, RecommendedAction } from "./ruleResult";
import type { Severity } from "./severity";

export interface AnalyzedApiEvent {
  flagged: boolean;
  severity: Severity;
  ruleHits: RuleHit[];
  reasonSummary: string;
  recommendedAction: RecommendedAction;
  analyzedAt: string;
  sourceKey: string;
  evidence?: Record<string, unknown>;
}

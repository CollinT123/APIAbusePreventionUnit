import type { AnalysisConfig } from "../config/mvpConfig";
import type { RawApiEvent } from "../types/rawApiEvent";
import type { RuleHit } from "../types/ruleResult";
import { parseIsoTimestampToMs } from "../utils/time";
import { buildSourceKey } from "../utils/sourceKey";

function isFailure(e: RawApiEvent): boolean { return !e.success || e.statusCode >= 400; }

function isAuthRoute(route: string, config: AnalysisConfig): boolean {
  const list = config.authAbuse.authRoutes;
  if (list.length > 0) return list.includes(route);
  const r = route.toLowerCase();
  return r.includes("login") || r.includes("auth") || r.includes("token");
}

export function authenticationAbuseRule(input: {
  current: RawApiEvent;
  currentSourceKey: string;
  history: RawApiEvent[];
  config: AnalysisConfig;
}): RuleHit | null {
  const { current, currentSourceKey, history, config } = input;
  const route = current.route;
  if (!isAuthRoute(route, config)) return null;
  const currentMs = parseIsoTimestampToMs(current.timestamp);
  const windowStartMs = currentMs - config.windowsMs.auth;
  const relevant = history
    .filter((e) => e.route === route)
    .filter((e) => { const t = parseIsoTimestampToMs(e.timestamp); return t >= windowStartMs && t <= currentMs; })
    .filter((e) => buildSourceKey(e) === currentSourceKey);
  const failures = relevant.filter((e) => isFailure(e));
  const failedIncludingCurrent = failures.length + (isFailure(current) ? 1 : 0);
  if (failedIncludingCurrent < config.authAbuse.redAt) return null;
  const attemptsIncludingCurrent = relevant.length + 1;
  return { matched: true, ruleName: "authenticationAbuse", severity: "RED",
    reason: `Authentication abuse suspected: ${failedIncludingCurrent} failed auth attempts for ${route} from the same source in ${config.windowsMs.auth}ms.`,
    recommendedAction: config.recommendedActions.authAbuse,
    evidence: { route, sourceKey: currentSourceKey, failedIncludingCurrent, attemptsIncludingCurrent, windowMs: config.windowsMs.auth, lastStatusCode: current.statusCode } };
}

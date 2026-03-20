export const SEVERITY_LEVELS = ["NONE", "YELLOW", "ORANGE", "RED"] as const;

export type Severity = (typeof SEVERITY_LEVELS)[number];

export const severityRank: Record<Severity, number> = {
  NONE: 0,
  YELLOW: 1,
  ORANGE: 2,
  RED: 3
};

export function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank[a] >= severityRank[b] ? a : b;
}

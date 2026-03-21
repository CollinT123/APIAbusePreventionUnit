"use client";

import type { Severity } from "@/lib/types";

const SEVERITY_STYLES: Record<
  Severity,
  { dot: string; badge: string; label: string }
> = {
  NONE: { dot: "bg-gray-500", badge: "bg-gray-500/20 text-gray-400 shadow-[0_0_8px_rgba(107,114,128,0.3)]", label: "None" },
  YELLOW: {
    dot: "bg-yellow-400",
    badge: "bg-yellow-400/20 text-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.3)]",
    label: "Yellow",
  },
  ORANGE: {
    dot: "bg-amber-500",
    badge: "bg-amber-500/20 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.3)]",
    label: "Orange",
  },
  RED: {
    dot: "bg-rose-500",
    badge: "bg-rose-500/20 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.3)]",
    label: "Red",
  },
};

interface SeverityBadgeProps {
  severity: Severity;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function SeverityBadge({
  severity,
  showLabel = true,
  size = "sm",
}: SeverityBadgeProps) {
  const styles = SEVERITY_STYLES[severity];
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 ${styles.badge} ${textSize}`}
      role="status"
    >
      <span
        className={`${dotSize} rounded-full ${styles.dot}`}
        aria-hidden
      />
      {showLabel && <span>{styles.label}</span>}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: Severity }) {
  const styles = SEVERITY_STYLES[severity];
  return (
    <span
      className={`h-2 w-2 rounded-full flex-shrink-0 ${styles.dot}`}
      aria-hidden
      title={styles.label}
    />
  );
}

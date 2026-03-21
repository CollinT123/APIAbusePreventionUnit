"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Wrench, Check } from "lucide-react";
import { SeverityDot } from "./SeverityBadge";
import { EventCard } from "./EventCard";
import type { RawApiEvent, AnalyzedApiEvent, FixConfig } from "@/lib/types";

const STRATEGY_LABELS: Record<string, string> = {
  response_cache: "Response Cache",
};

function formatRuleName(ruleName: string): string {
  return ruleName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

function formatFixDescription(fix: FixConfig): string {
  const label = STRATEGY_LABELS[fix.strategy] ?? fix.strategy;
  if (fix.strategy === "response_cache" && typeof fix.params?.ttlMs === "number") {
    const ttlSec = fix.params.ttlMs / 1000;
    return `${label} (${ttlSec}s TTL)`;
  }
  return label;
}

interface IssueGroupProps {
  ruleName: string;
  severity: "NONE" | "YELLOW" | "ORANGE" | "RED";
  entries: Array<{ event: RawApiEvent; analysis: AnalyzedApiEvent }>;
  activeFixes: FixConfig[];
  newRequestIds?: Set<string>;
  onFixClick?: (data: { ruleName: string; route: string; eventCount: number; severity: "NONE" | "YELLOW" | "ORANGE" | "RED" }) => void;
}

export function IssueGroup({
  ruleName,
  severity,
  entries,
  activeFixes,
  newRequestIds,
  onFixClick,
}: IssueGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const count = entries.length;
  const firstRoute = entries[0]?.event.route ?? "";
  const fixForRule = activeFixes.find((f) => f.ruleName === ruleName);
  const hasFixForRule = !!fixForRule;
  const canShowFix = !hasFixForRule && onFixClick && count > 0;

  const { uniqueRouteCount, mostRecentTime, displayedEntries } = useMemo(() => {
    const sorted = [...entries].sort(
      (a, b) =>
        new Date(b.event.timestamp).getTime() - new Date(a.event.timestamp).getTime()
    );
    const uniqueRoutes = new Set(sorted.map((e) => e.event.route)).size;
    const mostRecent = sorted[0]?.event.timestamp;
    const displayed = showAllEvents ? sorted : sorted.slice(0, 5);
    return {
      uniqueRouteCount: uniqueRoutes,
      mostRecentTime: mostRecent ? formatRelativeTime(mostRecent) : null,
      displayedEntries: displayed,
    };
  }, [entries, showAllEvents]);

  const hasMore = count > 5;

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50 transition-colors hover:border-zinc-700">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-zinc-800/50"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-zinc-500" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-zinc-500" />
          )}
          <SeverityDot severity={severity} />
          <span className="font-medium text-zinc-100 truncate">
            {formatRuleName(ruleName)}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-zinc-500 font-mono tabular-nums">
            {count} {count === 1 ? "event" : "events"}
          </span>
          {hasFixForRule && fixForRule ? (
            <span
              className="flex flex-col items-end rounded bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-400"
              title={formatFixDescription(fixForRule)}
            >
              <span className="flex items-center gap-1.5">
                <Check className="h-3 w-3" />
                Fix Active
              </span>
              <span className="text-[10px] font-normal text-emerald-400/90 leading-tight">
                {formatFixDescription(fixForRule)}
              </span>
            </span>
          ) : canShowFix ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFixClick?.({ ruleName, route: firstRoute, eventCount: count, severity });
              }}
              className="flex items-center gap-1.5 rounded bg-sky-500 px-3 py-1.5 text-sm font-medium text-white transition-all hover:scale-[1.02] hover:bg-sky-600 active:scale-[0.98]"
              title="Apply: Response Cache (5s TTL)"
            >
              <Wrench className="h-3.5 w-3.5" />
              Fix
            </button>
          ) : null}
        </div>
      </button>
      <div
        className={`overflow-hidden border-t border-zinc-800 transition-all duration-200 ease-out ${
          expanded ? "max-h-[2000px]" : "max-h-0"
        }`}
      >
        <div className="p-3 space-y-2">
          <p className="text-xs text-zinc-500">
            Affecting {uniqueRouteCount} unique route{uniqueRouteCount !== 1 ? "s" : ""}
            {mostRecentTime ? ` · Most recent: ${mostRecentTime}` : ""}
          </p>
          {displayedEntries.map(({ event, analysis }) => (
            <EventCard
              key={event.requestId}
              event={event}
              analysis={analysis}
              isNew={newRequestIds?.has(event.requestId)}
            />
          ))}
          {hasMore && expanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowAllEvents(!showAllEvents);
              }}
              className="w-full rounded border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              {showAllEvents ? "Show first 5" : `Show all ${count} events`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

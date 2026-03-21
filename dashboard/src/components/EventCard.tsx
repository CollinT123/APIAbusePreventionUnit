"use client";

import { SeverityBadge } from "./SeverityBadge";
import type { RawApiEvent, AnalyzedApiEvent, Severity } from "@/lib/types";

interface EventCardProps {
  event: RawApiEvent;
  analysis: AnalyzedApiEvent;
  isNew?: boolean;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  } catch {
    return iso;
  }
}

function statusCodeColor(code: number): string {
  if (code >= 200 && code < 300) return "text-emerald-500";
  if (code >= 400 && code < 500) return "text-yellow-400";
  if (code >= 500) return "text-rose-500";
  return "text-zinc-400";
}

function formatEvidence(evidence: Record<string, unknown> | undefined): string | null {
  if (!evidence) return null;

  const parts: string[] = [];

  if (typeof evidence.occurrencesIncludingCurrent === "number") {
    parts.push(`${evidence.occurrencesIncludingCurrent} occurrences`);
  }
  if (typeof evidence.windowMs === "number") {
    parts.push(`in ${evidence.windowMs}ms`);
  }
  if (typeof evidence.minIntervalMs === "number") {
    parts.push(`(min interval ${evidence.minIntervalMs}ms)`);
  }
  if (typeof evidence.failuresCount === "number") {
    parts.push(`${evidence.failuresCount} failures`);
  }
  if (typeof evidence.countIncludingCurrent === "number") {
    parts.push(`${evidence.countIncludingCurrent} calls`);
  }

  if (parts.length === 0) return null;
  return parts.join(" ");
}

export function EventCard({ event, analysis, isNew }: EventCardProps) {
  const primaryEvidence = analysis.ruleHits[0]?.evidence;
  const evidenceText = formatEvidence(primaryEvidence as Record<string, unknown>);

  return (
    <div
      className={`flex flex-col gap-1.5 rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm animate-[fade-in_0.2s_ease-out_both] ${
        isNew ? "animate-[issue-highlight_1.5s_ease-out_forwards]" : ""
      }`}
      data-event-id={event.requestId}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-zinc-100">
          {event.method} {event.route}
        </span>
        <span className={`font-mono text-xs ${statusCodeColor(event.statusCode)}`}>
          {event.statusCode}
        </span>
        <span className="font-mono text-xs text-zinc-500">
          {event.latencyMs === 0 ? "< 1ms" : `${event.latencyMs.toFixed(0)}ms`}
        </span>
        <span className="font-mono text-xs text-zinc-600">
          {formatTimestamp(event.timestamp)}
        </span>
        <SeverityBadge severity={analysis.severity} size="sm" />
      </div>
      <p className="text-xs text-zinc-400 leading-snug">{analysis.reasonSummary}</p>
      {evidenceText && (
        <p className="font-mono text-xs text-zinc-500">{evidenceText}</p>
      )}
    </div>
  );
}

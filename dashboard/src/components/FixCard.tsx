"use client";

import { useState, useRef } from "react";
import { Shield, Check, AlertTriangle, Trash2 } from "lucide-react";
import { useFixStatus } from "@/lib/hooks";
import type { FixConfig } from "@/lib/types";

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
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

function isRecentlyApplied(appliedAt: string, thresholdMs = 10000): boolean {
  return Date.now() - new Date(appliedAt).getTime() < thresholdMs;
}

interface FixCardProps {
  fix: FixConfig;
  onRemove: (fixId: string) => Promise<void>;
}

export function FixCard({ fix, onRemove }: FixCardProps) {
  const { data: status, isLoading } = useFixStatus(fix.id);
  const [exiting, setExiting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const hasCalledRemove = useRef(false);

  const strategyLabel =
    STRATEGY_LABELS[fix.strategy] ?? fix.strategy;
  const borderColor = isLoading
    ? "border-l-zinc-700"
    : status?.effective
      ? "border-l-emerald-500"
      : "border-l-amber-500";
  const showPulse = isRecentlyApplied(fix.appliedAt);

  const handleRemove = () => {
    if (hasCalledRemove.current) return;
    hasCalledRemove.current = true;
    setExiting(true);
    setRemoving(true);
    setTimeout(async () => {
      try {
        await onRemove(fix.id);
      } catch {
        setExiting(false);
        hasCalledRemove.current = false;
      } finally {
        setRemoving(false);
      }
    }, 200);
  };

  return (
    <div
      className={`overflow-hidden rounded-lg border border-zinc-800 border-l-4 bg-zinc-900 transition-all duration-200 ease-out hover:border-zinc-700 ${
        exiting
          ? "max-h-0 opacity-0"
          : "max-h-[400px] opacity-100"
      } ${borderColor}`}
    >
      <div className="flex w-full flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="flex-shrink-0">
            <Shield className="h-8 w-8 text-sky-500" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-zinc-100">{strategyLabel}</p>
            <p className="font-mono text-sm text-zinc-400">{fix.route}</p>
            <p className="text-sm text-zinc-500">
              Fixes: {formatRuleName(fix.ruleName)}
            </p>
            <p className="text-xs text-zinc-600">
              Applied {formatRelativeTime(fix.appliedAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <div
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm ${
              showPulse ? "animate-pulse" : ""
            }`}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-pulse rounded bg-zinc-700" />
                <span className="text-zinc-500">Evaluating…</span>
              </div>
            ) : status ? (
              <>
                {status.effective ? (
                  <>
                    <Check className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                    <span className="text-emerald-500">Fix is working</span>
                    <span className="text-zinc-500">
                      0 issues since applied
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
                    <span className="text-amber-500">Issues still occurring</span>
                    <span className="text-zinc-500">
                      {status.issuesSinceFix} issues since applied
                    </span>
                  </>
                )}
              </>
            ) : null}
          </div>

          {status && (
            <div className="font-mono text-xs text-zinc-500 space-y-0.5">
              <p>Before: {status.eventsBeforeFix} flagged events</p>
              <p>After: {status.issuesSinceFix} flagged events</p>
            </div>
          )}

          {isLoading && (
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
              <div className="h-4 w-20 animate-pulse rounded bg-zinc-800" />
            </div>
          )}

          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="flex items-center gap-2 rounded bg-rose-500/20 px-3 py-1.5 text-sm text-rose-400 transition-all hover:scale-[1.02] hover:bg-rose-500/30 active:scale-[0.98] disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove Fix
          </button>
        </div>
      </div>
    </div>
  );
}

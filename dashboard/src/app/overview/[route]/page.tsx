"use client";

import { use, useMemo, useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { EventCard } from "@/components/EventCard";
import { FixCard } from "@/components/FixCard";
import { Toast } from "@/components/Toast";
import { useRouteDetail, useFlagged, useFixes } from "@/lib/hooks";
import { removeFix } from "@/lib/api";
import type { RawApiEvent, FixConfig } from "@/lib/types";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/20 text-emerald-400",
  POST: "bg-sky-500/20 text-sky-400",
  PUT: "bg-amber-500/20 text-amber-400",
  PATCH: "bg-violet-500/20 text-violet-400",
  DELETE: "bg-rose-500/20 text-rose-400",
};

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

function latencyColorClass(latencyMs: number): string {
  if (latencyMs < 100) return "text-emerald-400";
  if (latencyMs < 300) return "text-amber-400";
  return "text-rose-400";
}

function statusPillClass(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return "bg-emerald-500/20 text-emerald-400";
  if (statusCode >= 400 && statusCode < 500) return "bg-amber-500/20 text-amber-400";
  if (statusCode >= 500) return "bg-rose-500/20 text-rose-400";
  return "bg-zinc-500/20 text-zinc-400";
}

function truncateFingerprint(fp: string, len = 12): string {
  if (fp.length <= len) return fp;
  return `${fp.slice(0, len)}…`;
}

interface RouteDetailData {
  route: string;
  totalRequests: number;
  lastSeen: string;
  methods: string[];
  statusBreakdown: { success: number; clientError: number; serverError: number };
  issues: Array<{ ruleName: string; severity: string; count: number; latestReason: string }>;
  activeFix: FixConfig | null;
  performance?: {
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    successRate: number;
    errorRate: number;
    requestsPerSecond: number;
  };
  events?: RawApiEvent[];
  performanceOverTime?: Array<{
    windowStart: string;
    windowEnd: string;
    requestCount: number;
    avgLatencyMs: number;
  }>;
}

export default function RouteDetailPage({
  params,
}: {
  params: Promise<{ route: string }>;
}) {
  const { route } = use(params);
  const decodedRoute = decodeURIComponent(route);
  const { data, isLoading, error } = useRouteDetail(decodedRoute);
  const { data: flagged, mutate: mutateFlagged } = useFlagged();
  const { data: fixes, mutate: mutateFixes } = useFixes();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleRemoveFix = useCallback(
    async (fixId: string) => {
      try {
        await removeFix(fixId);
        mutateFixes((prev) => (prev ?? []).filter((f) => f.id !== fixId), { revalidate: true });
        mutateFlagged();
        setToastMessage("Fix removed");
      } catch {
        setToastMessage("Failed to remove fix. Is the API server running?");
        throw new Error("Remove failed");
      }
    },
    [mutateFixes, mutateFlagged]
  );

  const routeIssues = useMemo(() => {
    const entries: Array<{ event: RawApiEvent; analysis: import("@/lib/types").AnalyzedApiEvent }> = [];
    for (const ruleEntries of Object.values(flagged.issues)) {
      for (const entry of ruleEntries) {
        if (entry.event.route === decodedRoute) {
          entries.push(entry);
        }
      }
    }
    return entries.sort(
      (a, b) =>
        new Date(b.event.timestamp).getTime() - new Date(a.event.timestamp).getTime()
    );
  }, [flagged.issues, decodedRoute]);

  const activeFixForRoute = useMemo(
    () => fixes?.find((f) => f.route === decodedRoute) ?? null,
    [fixes, decodedRoute]
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Link
          href="/overview"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          ← Back to Overview
        </Link>
        <div className="h-64 animate-pulse rounded-lg bg-zinc-800" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <Link
          href="/overview"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          ← Back to Overview
        </Link>
        <p className="text-rose-400">Route not found or failed to load.</p>
      </div>
    );
  }

  const detail = data as RouteDetailData;
  const perf = detail.performance ?? {
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    successRate: 0,
    errorRate: 0,
    requestsPerSecond: 0,
  };
  const recentEvents = (detail.events ?? []).slice(0, 20);
  const perfOverTime = detail.performanceOverTime ?? [];
  const maxLatency =
    perfOverTime.length > 0
      ? Math.max(...perfOverTime.map((b) => b.avgLatencyMs), 1)
      : 1;

  return (
    <div className="space-y-8 animate-[page-in_0.2s_ease-out_both]">
      <Toast
        message={toastMessage ?? ""}
        visible={toastMessage !== null}
        onDismiss={() => setToastMessage(null)}
        duration={3000}
      />

      <Link
        href="/overview"
        className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        ← Back to Overview
      </Link>

      <div>
        <h1 className="font-mono text-2xl font-semibold text-zinc-100">
          {detail.route}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {detail.methods.map((m) => (
            <span
              key={m}
              className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-medium ${
                METHOD_COLORS[m] ?? "bg-zinc-600/30 text-zinc-400"
              }`}
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">
          Performance metrics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className={`text-2xl font-mono font-semibold tabular-nums ${latencyColorClass(perf.avgLatencyMs)}`}>
              {perf.avgLatencyMs > 0 ? `${perf.avgLatencyMs.toFixed(0)} ms` : "—"}
            </p>
            <p className="mt-1 text-sm text-zinc-400">Avg Latency</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className={`text-2xl font-mono font-semibold tabular-nums ${latencyColorClass(perf.p50LatencyMs)}`}>
              {perf.p50LatencyMs > 0 ? `${perf.p50LatencyMs.toFixed(0)} ms` : "—"}
            </p>
            <p className="mt-1 text-sm text-zinc-400">P50 Latency</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className={`text-2xl font-mono font-semibold tabular-nums ${latencyColorClass(perf.p95LatencyMs)}`}>
              {perf.p95LatencyMs > 0 ? `${perf.p95LatencyMs.toFixed(0)} ms` : "—"}
            </p>
            <p className="mt-1 text-sm text-zinc-400">P95 Latency</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className={`text-2xl font-mono font-semibold tabular-nums ${latencyColorClass(perf.p99LatencyMs)}`}>
              {perf.p99LatencyMs > 0 ? `${perf.p99LatencyMs.toFixed(0)} ms` : "—"}
            </p>
            <p className="mt-1 text-sm text-zinc-400">P99 Latency</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className="text-2xl font-mono font-semibold tabular-nums text-zinc-100">
              {detail.totalRequests.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-zinc-400">Total Requests</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className="text-2xl font-mono font-semibold tabular-nums text-zinc-100">
              {perf.requestsPerSecond > 0 ? perf.requestsPerSecond.toFixed(1) : "—"}
            </p>
            <p className="mt-1 text-sm text-zinc-400">Requests/sec</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className="text-2xl font-mono font-semibold tabular-nums text-zinc-100">
              {perf.successRate > 0 ? `${perf.successRate.toFixed(1)}%` : "—"}
            </p>
            <p className="mt-1 text-sm text-zinc-400">Success Rate</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className="text-2xl font-mono font-semibold tabular-nums text-zinc-100">
              {perf.errorRate > 0 ? `${perf.errorRate.toFixed(1)}%` : "—"}
            </p>
            <p className="mt-1 text-sm text-zinc-400">Error Rate</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">
          Latency Over Time
        </h2>
        {perfOverTime.length < 2 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-sm text-zinc-500">
            Not enough data to chart.
          </p>
        ) : (
          <div
            className="flex gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
            style={{ minHeight: "100px", maxHeight: "120px" }}
          >
            {perfOverTime.map((bucket, i) => {
              const pct = maxLatency > 0 ? (bucket.avgLatencyMs / maxLatency) * 100 : 0;
              const barColor =
                bucket.avgLatencyMs < 100
                  ? "bg-emerald-500"
                  : bucket.avgLatencyMs < 300
                    ? "bg-amber-500"
                    : "bg-rose-500";
              return (
                <div
                  key={i}
                  className={`flex-1 min-w-[4px] self-end rounded-t transition-all ${barColor}`}
                  style={{ height: `${Math.max(4, pct)}%` }}
                  title={`${bucket.avgLatencyMs.toFixed(0)}ms avg`}
                />
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Issues</h2>
        {routeIssues.length === 0 && !activeFixForRoute ? (
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-emerald-400">
            <Check className="h-5 w-5" />
            No issues detected for this route ✓
          </div>
        ) : (
          <div className="space-y-4">
            {activeFixForRoute && (
              <FixCard fix={activeFixForRoute} onRemove={handleRemoveFix} />
            )}
            <div className="space-y-2">
              {routeIssues.map(({ event, analysis }) => (
                <EventCard key={event.requestId} event={event} analysis={analysis} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">
          Recent traffic
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-800/80">
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                  Time
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                  Method
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                  Status
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-zinc-400">
                  Latency
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                  Fingerprint
                </th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.length === 0 ? (
                <tr className="bg-zinc-900">
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-500">
                    No events yet
                  </td>
                </tr>
              ) : (
                recentEvents.map((event) => {
                  const isFlagged = routeIssues.some(
                    (e) => e.event.requestId === event.requestId
                  );
                  return (
                    <tr
                      key={event.requestId}
                      className={`border-b border-zinc-800 last:border-0 ${
                        isFlagged ? "border-l-2 border-l-rose-500 bg-rose-500/5" : ""
                      }`}
                    >
                      <td className="px-4 py-2 font-mono text-xs text-zinc-400">
                        {formatRelativeTime(event.timestamp)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-300">
                        {event.method}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusPillClass(
                            event.statusCode
                          )}`}
                        >
                          {event.statusCode}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-zinc-300">
                        {event.latencyMs} ms
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-500 truncate max-w-[120px]">
                        {truncateFingerprint(event.fingerprint)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

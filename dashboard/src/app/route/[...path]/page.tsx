"use client";

import { use, useMemo, useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, ChevronRight } from "lucide-react";
import { Wrench } from "lucide-react";
import { FixCard } from "@/components/FixCard";
import { FixModal } from "@/components/FixModal";
import { MetricCard } from "@/components/MetricCard";
import { SeverityDot } from "@/components/SeverityBadge";
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

type Severity = "NONE" | "YELLOW" | "ORANGE" | "RED";

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
  params: Promise<{ path: string[] }>;
}) {
  const { path } = use(params);
  const decodedRoute = path && path.length > 0 ? `/${path.map((p) => decodeURIComponent(p)).join("/")}` : "";
  const { data, isLoading, error } = useRouteDetail(decodedRoute);
  const { data: flagged, mutate: mutateFlagged } = useFlagged();
  const { data: fixes, mutate: mutateFixes } = useFixes();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [requestLogExpanded, setRequestLogExpanded] = useState(false);
  const [fixModalData, setFixModalData] = useState<{
    ruleName: string;
    route: string;
    eventCount: number;
    severity: Severity;
  } | null>(null);

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

  const handleApplySuccess = useCallback(
    (message: string) => {
      setFixModalData(null);
      mutateFixes();
      mutateFlagged();
      setToastMessage(message);
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

  const issuesByRule = useMemo(() => {
    const map = new Map<string, typeof routeIssues>();
    for (const entry of routeIssues) {
      const rule = entry.analysis.ruleHits[0]?.ruleName ?? "unknown";
      const list = map.get(rule) ?? [];
      list.push(entry);
      map.set(rule, list);
    }
    return map;
  }, [routeIssues]);

  const activeFixForRoute = useMemo(
    () => fixes?.find((f) => f.route === decodedRoute) ?? null,
    [fixes, decodedRoute]
  );

  if (!decodedRoute) {
    return (
      <div className="space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All Routes
        </Link>
        <p className="text-rose-400">Invalid route.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All Routes
        </Link>
        <div className="h-64 animate-pulse rounded-lg bg-zinc-800" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All Routes
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
  const recentEvents = (detail.events ?? []).slice(0, 30);
  const perfOverTime = detail.performanceOverTime ?? [];
  const maxLatency =
    perfOverTime.length > 0
      ? Math.max(...perfOverTime.map((b) => b.avgLatencyMs), 1)
      : 1;

  const overallStatus =
    routeIssues.length > 0 && !activeFixForRoute
      ? "Issues Detected"
      : activeFixForRoute
        ? "Fix Active"
        : "Healthy";

  const overallStatusClass =
    overallStatus === "Healthy"
      ? "bg-emerald-500/20 text-emerald-400"
      : overallStatus === "Fix Active"
        ? "bg-emerald-500/20 text-emerald-400"
        : "bg-rose-500/20 text-rose-400";

  return (
    <div className="space-y-8 animate-[page-in_0.2s_ease-out_both]">
      <Toast
        message={toastMessage ?? ""}
        visible={toastMessage !== null}
        onDismiss={() => setToastMessage(null)}
        duration={3000}
      />

      {fixModalData && (
        <FixModal
          isOpen={true}
          onClose={() => setFixModalData(null)}
          ruleName={fixModalData.ruleName}
          route={fixModalData.route}
          eventCount={fixModalData.eventCount}
          severity={fixModalData.severity}
          onApplySuccess={handleApplySuccess}
        />
      )}

      <div>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All Routes
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold text-zinc-100">
            {detail.route}
          </h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${overallStatusClass}`}
          >
            {overallStatus}
          </span>
        </div>
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

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">
          Performance analytics
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
          <MetricCard label="Total Requests" value={detail.totalRequests.toLocaleString()} />
          <MetricCard
            label="Requests/sec"
            value={perf.requestsPerSecond > 0 ? perf.requestsPerSecond.toFixed(1) : "—"}
          />
          <MetricCard
            label="Success Rate"
            value={perf.successRate > 0 ? `${perf.successRate.toFixed(1)}%` : "—"}
          />
          <MetricCard
            label="Error Rate"
            value={perf.errorRate > 0 ? `${perf.errorRate.toFixed(1)}%` : "—"}
          />
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-xs font-medium text-zinc-500">
            Latency over time
          </h3>
          {perfOverTime.length < 2 ? (
            <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-500">
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
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Issues & Fixes</h2>
        {routeIssues.length === 0 && !activeFixForRoute ? (
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-emerald-400">
            <Check className="h-5 w-5" />
            No issues detected — this route is healthy ✓
          </div>
        ) : (
          <div className="space-y-4">
            {activeFixForRoute && (
              <FixCard fix={activeFixForRoute} onRemove={handleRemoveFix} />
            )}
            {activeFixForRoute && routeIssues.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-400">
                <Check className="h-4 w-4" />
                Fix is working — no issues since applied ✓
              </div>
            ) : null}
            {routeIssues.length > 0 && (
              <div className="space-y-2">
                {Array.from(issuesByRule.entries()).map(([ruleName, entries]) => {
                  const hasFixForRule = fixes?.some((f) => f.ruleName === ruleName);
                  const first = entries[0];
                  const severity = (first?.analysis.severity as Severity) ?? "NONE";
                  return (
                    <div
                      key={ruleName}
                      className="flex items-center justify-between gap-4 rounded border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <SeverityDot severity={severity} />
                        <div>
                          <p className="font-medium text-zinc-200">
                            {formatRuleName(ruleName)}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {entries.length} event{entries.length !== 1 ? "s" : ""} ·{" "}
                            {first?.analysis.reasonSummary ?? ""}
                          </p>
                        </div>
                      </div>
                      {!hasFixForRule && (
                        <button
                          type="button"
                          onClick={() =>
                            setFixModalData({
                              ruleName,
                              route: decodedRoute,
                              eventCount: entries.length,
                              severity,
                            })
                          }
                          className="flex items-center gap-1.5 rounded bg-sky-500 px-3 py-1.5 text-sm font-medium text-white transition-all hover:scale-[1.02] hover:bg-sky-600 active:scale-[0.98]"
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          Fix
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => setRequestLogExpanded(!requestLogExpanded)}
          className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-left transition-colors hover:bg-zinc-800/50"
        >
          <span className="text-sm font-medium text-zinc-400">
            Request Log
            <span className="ml-2 rounded bg-zinc-700 px-2 py-0.5 font-mono text-xs text-zinc-300">
              {recentEvents.length}
            </span>
          </span>
          {requestLogExpanded ? (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          )}
        </button>
        {!requestLogExpanded ? (
          <p className="mt-1 pl-4 text-xs text-zinc-500">
            {recentEvents.length} requests · Click to expand
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-800">
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
                    Flagged
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.length === 0 ? (
                  <tr className="bg-zinc-900">
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-zinc-500"
                    >
                      No events yet
                    </td>
                  </tr>
                ) : (
                  recentEvents.map((event, i) => {
                    const isFlagged = routeIssues.some(
                      (e) => e.event.requestId === event.requestId
                    );
                    const flaggedEntry = routeIssues.find(
                      (e) => e.event.requestId === event.requestId
                    );
                    const severity = (flaggedEntry?.analysis.severity as Severity) ?? "NONE";
                    return (
                      <tr
                        key={event.requestId}
                        className={`border-b border-zinc-800 last:border-0 ${
                          i % 2 === 1 ? "bg-zinc-900/50" : ""
                        } ${isFlagged ? "bg-rose-500/5" : ""}`}
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
                          {event.latencyMs === 0 ? "< 1" : event.latencyMs} ms
                        </td>
                        <td className="px-4 py-2">
                          {isFlagged ? (
                            <SeverityDot severity={severity} />
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

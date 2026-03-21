"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useSummary, useFixes, useEvents, useRoutes } from "@/lib/hooks";

const SEVERITY_DOT: Record<string, string> = {
  duplicateRequests: "bg-amber-500",
  excessivePolling: "bg-amber-500",
  retryStorm: "bg-amber-500",
  burstTraffic: "bg-rose-500",
  costlyApi: "bg-rose-500",
  authenticationAbuse: "bg-rose-500",
  endpointHotspots: "bg-yellow-400",
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
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function latencyStatus(latencyMs: number): {
  color: string;
  label: string;
} {
  if (latencyMs > 500) return { color: "bg-rose-500", label: "High" };
  if (latencyMs > 200) return { color: "bg-amber-500", label: "Elevated" };
  return { color: "bg-emerald-500", label: "OK" };
}

function successRateBadge(rate: number): { className: string; label: string } {
  if (rate > 95) return { className: "bg-emerald-500/20 text-emerald-400", label: `${rate.toFixed(1)}%` };
  if (rate > 80) return { className: "bg-amber-500/20 text-amber-400", label: `${rate.toFixed(1)}%` };
  return { className: "bg-rose-500/20 text-rose-400", label: `${rate.toFixed(1)}%` };
}

function getLatencyBuckets(
  events: Array<{ timestamp: string; latencyMs: number }>
): number[] {
  if (events.length === 0) return [];
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const e of events) {
    const ts = new Date(e.timestamp).getTime();
    const key = Math.floor(ts / 5000) * 5000;
    const b = buckets.get(key) ?? { sum: 0, count: 0 };
    b.sum += e.latencyMs;
    b.count += 1;
    buckets.set(key, b);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, b]) => b.sum / b.count);
}

function getTrendColor(values: number[]): "green" | "amber" | "red" {
  if (values.length < 2) return "green";
  const mid = Math.ceil(values.length / 2);
  const first = values.slice(0, mid);
  const second = values.slice(mid);
  const avg1 = first.reduce((a, b) => a + b, 0) / first.length;
  const avg2 = second.reduce((a, b) => a + b, 0) / second.length;
  if (avg1 === 0) return "green";
  const ratio = avg2 / avg1;
  if (ratio < 0.8) return "green"; // improving
  if (ratio <= 1.2) return "green"; // stable
  if (ratio <= 1.5) return "amber"; // slightly degrading
  return "red"; // significantly degrading
}

function LatencySparkline({
  events,
  width = 60,
  height = 20,
}: {
  events: Array<{ timestamp: string; latencyMs: number }>;
  width?: number;
  height?: number;
}) {
  if (events.length < 3) return <span className="text-zinc-500">—</span>;

  const buckets = getLatencyBuckets(events);
  if (buckets.length < 2) return <span className="text-zinc-500">—</span>;

  const max = Math.max(...buckets, 1);
  const color = getTrendColor(buckets);
  const stroke =
    color === "green" ? "#22c55e" : color === "amber" ? "#f59e0b" : "#f43f5e";

  const points = buckets.map((v, i) => {
    const x = (i / (buckets.length - 1)) * (width - 2) + 1;
    const y = height - 2 - (v / max) * (height - 4);
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(" L ")}`;

  return (
    <svg
      width={width}
      height={height}
      className="inline-block"
      aria-hidden
    >
      <path
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function OverviewPage() {
  const router = useRouter();
  const { data: summary, isLoading: summaryLoading } = useSummary();
  const { data: fixes, isLoading: fixesLoading } = useFixes();
  const { data: events } = useEvents();
  const { data: routesData } = useRoutes();

  const isLoading = summaryLoading || fixesLoading;

  const totalEvents = summary.totalEventCount;
  const flaggedCount = summary.flaggedEventCount;
  const activeFixesCount = fixes?.length ?? 0;
  const avgLatencyByRoute = summary.averageLatencyPerRoute ?? {};
  const flaggedByRule = summary.flaggedByRule ?? {};
  const routes = routesData.routes ?? [];

  const avgLatency = useMemo(() => {
    const latencies = Object.values(avgLatencyByRoute);
    if (latencies.length === 0) return 0;
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }, [avgLatencyByRoute]);

  const tableRows = useMemo(() => {
    if (routes.length > 0) {
      return routes
        .map((r) => ({
          route: r.route,
          totalRequests: r.totalRequests,
          successRate: r.performance?.successRate ?? 0,
          avgLatencyMs: r.performance?.avgLatencyMs ?? avgLatencyByRoute[r.route] ?? 0,
        }))
        .sort((a, b) => (b.avgLatencyMs || 0) - (a.avgLatencyMs || 0));
    }
    return Object.entries(avgLatencyByRoute).map(([route, latency]) => ({
      route,
      totalRequests: 0,
      successRate: 0,
      avgLatencyMs: latency,
    })).sort((a, b) => b.avgLatencyMs - a.avgLatencyMs);
  }, [routes, avgLatencyByRoute]);

  const eventsByRoute = useMemo(() => {
    const map = new Map<string, Array<{ timestamp: string; latencyMs: number }>>();
    for (const e of events ?? []) {
      const list = map.get(e.route) ?? [];
      list.push({ timestamp: e.timestamp, latencyMs: e.latencyMs });
      map.set(e.route, list);
    }
    return map;
  }, [events]);

  const lastEventTimestamp = useMemo(() => {
    if (!events?.length) return null;
    return events.reduce((max, e) => {
      const t = new Date(e.timestamp).getTime();
      return t > max ? t : max;
    }, 0);
  }, [events]);

  const healthStatus = useMemo(() => {
    if (flaggedCount === 0 && activeFixesCount === 0) {
      return { type: "healthy" as const, message: "System Healthy — No issues detected" };
    }
    if (flaggedCount > 0 && activeFixesCount > 0) {
      return {
        type: "amber" as const,
        message: `Issues detected — ${activeFixesCount} fix${activeFixesCount === 1 ? "" : "es"} active`,
      };
    }
    return {
      type: "red" as const,
      message: `Attention needed — ${flaggedCount} unresolved issue${flaggedCount === 1 ? "" : "s"}`,
    };
  }, [flaggedCount, activeFixesCount]);

  if (isLoading && totalEvents === 0) {
    return (
      <div className="space-y-8">
        <div className="h-16 w-full animate-pulse rounded-xl bg-zinc-800" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-800" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-zinc-800" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-[page-in_0.2s_ease-out_both]">
      <div
        className={`rounded-xl px-6 py-5 text-lg font-semibold text-white ${
          healthStatus.type === "healthy"
            ? "bg-gradient-to-r from-emerald-600 to-emerald-500"
            : healthStatus.type === "amber"
              ? "bg-gradient-to-r from-amber-600 to-amber-500"
              : "bg-gradient-to-r from-rose-600 to-rose-500"
        }`}
      >
        {healthStatus.message}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm text-zinc-500">Total Events Processed</p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-zinc-100">
            {totalEvents}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm text-zinc-500">Average Latency</p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-zinc-100">
            {avgLatency > 0 ? `${avgLatency.toFixed(0)} ms` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm text-zinc-500">Active Fixes</p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-zinc-100">
            {activeFixesCount}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm text-zinc-500">Issues by Type</p>
          <div className="mt-2 space-y-1.5">
            {Object.keys(flaggedByRule).length === 0 ? (
              <p className="font-mono text-sm text-zinc-500">None</p>
            ) : (
              Object.entries(flaggedByRule).map(([rule, count]) => (
                <div
                  key={rule}
                  className="flex items-center gap-2 font-mono text-sm"
                >
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      SEVERITY_DOT[rule] ?? "bg-zinc-500"
                    }`}
                  />
                  <span className="text-zinc-400 truncate">
                    {formatRuleName(rule)}
                  </span>
                  <span className="tabular-nums text-zinc-100">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">
          Route Performance
        </h2>
        <div className="overflow-x-auto overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-800/80">
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">
                  Route
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-zinc-400">
                  Requests
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-zinc-400">
                  Avg Latency
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-zinc-400">
                  Trend
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-zinc-400">
                  Success Rate
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-zinc-400">
                  Status
                </th>
                <th className="w-8 px-2" />
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr className="bg-zinc-900">
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center font-mono text-sm text-zinc-500"
                  >
                    No routes yet
                  </td>
                </tr>
              ) : (
                tableRows.map((row, i) => {
                  const status = latencyStatus(row.avgLatencyMs);
                  const successBadge = row.successRate > 0
                    ? successRateBadge(row.successRate)
                    : null;
                  return (
                    <tr
                      key={row.route}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        router.push(`/overview/${encodeURIComponent(row.route)}`)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/overview/${encodeURIComponent(row.route)}`);
                        }
                      }}
                      className={`border-b border-zinc-800 last:border-0 transition-colors cursor-pointer ${
                        i % 2 === 0 ? "bg-zinc-900 hover:bg-zinc-800/80" : "bg-zinc-800/50 hover:bg-zinc-800"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-sm text-zinc-300">
                        {row.route}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-zinc-300 whitespace-nowrap">
                        {row.totalRequests > 0 ? row.totalRequests.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-zinc-300 whitespace-nowrap">
                        {row.avgLatencyMs > 0 ? `${row.avgLatencyMs.toFixed(0)} ms` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center align-middle">
                        <LatencySparkline events={eventsByRoute.get(row.route) ?? []} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {successBadge ? (
                          <span
                            className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${successBadge.className}`}
                          >
                            {successBadge.label}
                          </span>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs ${
                            status.color === "bg-rose-500"
                              ? "bg-rose-500/20 text-rose-400"
                              : status.color === "bg-amber-500"
                                ? "bg-amber-500/20 text-amber-400"
                                : "bg-emerald-500/20 text-emerald-400"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${status.color}`}
                          />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-zinc-500">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="font-mono text-sm text-zinc-500">
        {totalEvents === 0 ? (
          "No events yet"
        ) : lastEventTimestamp ? (
          <>Last event: {formatRelativeTime(new Date(lastEventTimestamp).toISOString())}</>
        ) : (
          `${totalEvents} events recorded`
        )}
      </p>
    </div>
  );
}

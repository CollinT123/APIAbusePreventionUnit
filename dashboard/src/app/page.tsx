"use client";

import { useMemo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { MetricCard } from "@/components/MetricCard";
import { Toast } from "@/components/Toast";
import {
  useSummary,
  useFixes,
  useFlagged,
  useRoutes,
} from "@/lib/hooks";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/20 text-emerald-400",
  POST: "bg-sky-500/20 text-sky-400",
  PUT: "bg-amber-500/20 text-amber-400",
  PATCH: "bg-violet-500/20 text-violet-400",
  DELETE: "bg-rose-500/20 text-rose-400",
};

function latencyColorClass(latencyMs: number): string {
  if (latencyMs < 100) return "text-emerald-400";
  if (latencyMs < 300) return "text-amber-400";
  return "text-rose-400";
}

function successRateBadge(rate: number): { className: string; label: string } {
  if (rate > 95) return { className: "bg-emerald-500/20 text-emerald-400", label: `${rate.toFixed(1)}%` };
  if (rate > 80) return { className: "bg-amber-500/20 text-amber-400", label: `${rate.toFixed(1)}%` };
  return { className: "bg-rose-500/20 text-rose-400", label: `${rate.toFixed(1)}%` };
}

export default function HomePage() {
  const router = useRouter();
  const { data: summary, isLoading: summaryLoading, mutate: mutateSummary } = useSummary();
  const { data: fixes, isLoading: fixesLoading, mutate: mutateFixes } = useFixes();
  const { data: flagged, mutate: mutateFlagged } = useFlagged();
  const { data: routesData } = useRoutes();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isLoading = summaryLoading || fixesLoading;

  const totalEvents = summary.totalEventCount;
  const flaggedCount = summary.flaggedEventCount;
  const activeFixesCount = fixes?.length ?? 0;
  const avgLatencyByRoute = summary.averageLatencyPerRoute ?? {};
  const routes = routesData.routes ?? [];

  const routesWithIssues = useMemo(() => {
    const set = new Set<string>();
    for (const entries of Object.values(flagged.issues)) {
      for (const { event } of entries) {
        set.add(event.route);
      }
    }
    return set;
  }, [flagged.issues]);

  const routesWithFixes = useMemo(
    () => new Set((fixes ?? []).map((f) => f.route)),
    [fixes]
  );

  const issueCountByRoute = useMemo(() => {
    const map = new Map<string, number>();
    for (const [, entries] of Object.entries(flagged.issues)) {
      for (const { event } of entries) {
        map.set(event.route, (map.get(event.route) ?? 0) + 1);
      }
    }
    return map;
  }, [flagged.issues]);

  const unresolvedIssueCount = useMemo(() => {
    let count = 0;

    for (const route of routesWithIssues) {
      if (!routesWithFixes.has(route)) {
        count += issueCountByRoute.get(route) ?? 0;
      }
    }

    return count;
  }, [routesWithIssues, routesWithFixes, issueCountByRoute]);

  const totalRoutes = useMemo(() => {
    const routeSet = new Set<string>();
    for (const r of Object.keys(avgLatencyByRoute)) routeSet.add(r);
    for (const r of routes) routeSet.add(r.route);
    return routeSet.size;
  }, [routes, avgLatencyByRoute]);

  const routeCards = useMemo(() => {
    const cards: Array<{
      route: string;
      methods: string[];
      avgLatencyMs: number;
      totalRequests: number;
      successRate: number;
      hasIssues: boolean;
      issueCount: number;
      hasFix: boolean;
      sortOrder: number;
    }> = [];

    const seen = new Set<string>();

    for (const r of routes) {
      if (seen.has(r.route)) continue;
      seen.add(r.route);
      const hasFix = routesWithFixes.has(r.route);
      const hasIssues = routesWithIssues.has(r.route) && !hasFix;
      let sortOrder = 2; // healthy
      if (hasFix) sortOrder = 1;
      else if (hasIssues) sortOrder = 0;

      cards.push({
        route: r.route,
        methods: r.methods ?? [],
        avgLatencyMs: r.performance?.avgLatencyMs ?? avgLatencyByRoute[r.route] ?? 0,
        totalRequests: r.totalRequests ?? 0,
        successRate: r.performance?.successRate ?? 0,
        hasIssues,
        issueCount: hasFix ? 0 : issueCountByRoute.get(r.route) ?? 0,
        hasFix,
        sortOrder,
      });
    }

    for (const [route, latency] of Object.entries(avgLatencyByRoute)) {
      if (seen.has(route)) continue;
      seen.add(route);
      const hasFix = routesWithFixes.has(route);
      const hasIssues = routesWithIssues.has(route) && !hasFix;
      let sortOrder = 2;
      if (hasFix) sortOrder = 1;
      else if (hasIssues) sortOrder = 0;

      cards.push({
        route,
        methods: [],
        avgLatencyMs: latency,
        totalRequests: 0,
        successRate: 0,
        hasIssues,
        issueCount: hasFix ? 0 : issueCountByRoute.get(route) ?? 0,
        hasFix,
        sortOrder,
      });
    }

    return cards.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return (b.avgLatencyMs || 0) - (a.avgLatencyMs || 0);
    });
  }, [
    routes,
    avgLatencyByRoute,
    routesWithIssues,
    routesWithFixes,
    issueCountByRoute,
  ]);

  const healthStatus = useMemo(() => {
    if (flaggedCount === 0 && activeFixesCount === 0) {
      return { type: "healthy" as const, message: "System Healthy — No issues detected" };
    }
    if (unresolvedIssueCount === 0) {
      return {
        type: "healthy" as const,
        message: "System Healthy — Zero unresolved issues",
      };
    }
    if (activeFixesCount > 0) {
      return {
        type: "amber" as const,
        message: `Issues detected — ${activeFixesCount} fix${activeFixesCount === 1 ? "" : "es"} active`,
      };
    }
    return {
      type: "red" as const,
      message: `Attention needed — ${flaggedCount} unresolved issue${flaggedCount === 1 ? "" : "s"}`,
    };
  }, [flaggedCount, activeFixesCount, unresolvedIssueCount]);

  if (isLoading && totalEvents === 0) {
    return (
      <div className="space-y-8">
        <div className="h-16 w-full animate-pulse rounded-xl bg-zinc-800" />
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 w-32 flex-1 animate-pulse rounded-lg bg-zinc-800" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-lg bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-[page-in_0.2s_ease-out_both]">
      <Toast
        message={toastMessage ?? ""}
        visible={toastMessage !== null}
        onDismiss={() => setToastMessage(null)}
        duration={3000}
      />

      <div className="flex flex-col gap-4">
        <div
          className={`flex-1 rounded-xl px-6 py-5 text-lg font-semibold text-white ${
            healthStatus.type === "healthy"
              ? "bg-gradient-to-r from-emerald-600 to-emerald-500"
              : healthStatus.type === "amber"
                ? "bg-gradient-to-r from-amber-600 to-amber-500"
                : "bg-gradient-to-r from-rose-600 to-rose-500"
          }`}
        >
          {healthStatus.message}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <MetricCard label="Total Events" value={totalEvents} loading={isLoading} />
        <MetricCard label="Total Routes" value={totalRoutes} loading={isLoading} />
        <MetricCard
          label="Flagged Routes"
          value={routesWithIssues.size}
          variant={routesWithIssues.size > 0 ? "highlight" : "default"}
          loading={isLoading}
        />
        <MetricCard label="Active Fixes" value={activeFixesCount} loading={isLoading} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {routeCards.length === 0 ? (
          <div className="col-span-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-8 py-16 text-center font-mono text-sm text-zinc-500">
            No routes yet — run the traffic simulator to generate data
          </div>
        ) : (
          routeCards.map((card) => {
            const borderColor = card.hasFix
              ? "border-l-emerald-500"
              : card.hasIssues
                ? "border-l-rose-500"
                : "border-l-zinc-800";
            const successBadge = card.successRate > 0 ? successRateBadge(card.successRate) : null;

            return (
              <button
                key={card.route}
                type="button"
                onClick={() =>
                  router.push(`/route${card.route}`)
                }
                className={`flex flex-col rounded-lg border border-zinc-800 border-l-[3px] bg-zinc-900 p-4 text-left transition-all hover:border-zinc-700 hover:bg-zinc-800/80 ${borderColor}`}
              >
                <p className="font-mono text-sm font-medium text-zinc-100 truncate">
                  {card.route}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {card.methods.map((m) => (
                    <span
                      key={m}
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium ${
                        METHOD_COLORS[m] ?? "bg-zinc-600/30 text-zinc-400"
                      }`}
                    >
                      {m}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className={`font-mono tabular-nums ${latencyColorClass(card.avgLatencyMs)}`}>
                    {card.avgLatencyMs > 0 ? `${card.avgLatencyMs.toFixed(0)}ms` : "—"}
                  </span>
                  <span className="font-mono tabular-nums text-zinc-400">
                    {card.totalRequests > 0 ? card.totalRequests.toLocaleString() : "0"} req
                  </span>
                  {successBadge && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${successBadge.className}`}>
                      {successBadge.label}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2 font-mono text-xs">
                  {card.hasIssues ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                      <span className={card.issueCount > 10 ? "text-rose-400" : "text-amber-400"}>
                        {card.issueCount} issues
                      </span>
                    </>
                  ) : card.hasFix ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="text-emerald-400">Fix Active</span>
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="text-emerald-400">Healthy</span>
                    </>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

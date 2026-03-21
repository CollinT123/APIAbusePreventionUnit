import express from "express";
import { Server } from "http";

import { runAnalysis } from "../src/analysis/runAnalysis";
import { fixRegistry } from "../src/fixes/fixRegistry";
import { eventStore } from "../src/store/eventStore";
import type { AnalyzedApiEvent } from "../src/types/analyzedApiEvent";
import type { RawApiEvent } from "../src/types/rawApiEvent";
import { parseRawApiEvent } from "../src/validation/rawApiEventSchema";

type RouteIssueSummary = {
  ruleName: string;
  severity: string;
  count: number;
  latestReason: string;
};

type RoutePerformance = {
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgResponseSize: number | null;
  requestsPerSecond: number;
  successRate: number;
  errorRate: number;
  latencyTrend: "improving" | "degrading" | "stable";
};

type RouteSummary = {
  route: string;
  totalRequests: number;
  lastSeen: string;
  methods: string[];
  statusBreakdown: {
    success: number;
    clientError: number;
    serverError: number;
  };
  issues: RouteIssueSummary[];
  activeFix: ReturnType<typeof fixRegistry.getFixForRoute>;
  performance: RoutePerformance;
};

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getPercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.floor(percentile * sortedValues.length)
  );
  return sortedValues[index];
}

function getLatencyTrend(sortedByTime: RawApiEvent[]): "improving" | "degrading" | "stable" {
  if (sortedByTime.length < 2) {
    return "stable";
  }

  const midpoint = Math.ceil(sortedByTime.length / 2);
  const firstHalfAverage = average(
    sortedByTime.slice(0, midpoint).map((event) => event.latencyMs)
  );
  const secondHalfAverage = average(
    sortedByTime.slice(midpoint).map((event) => event.latencyMs)
  );

  if (firstHalfAverage === 0) {
    return "stable";
  }

  if (secondHalfAverage < firstHalfAverage * 0.8) {
    return "improving";
  }

  if (secondHalfAverage > firstHalfAverage * 1.2) {
    return "degrading";
  }

  return "stable";
}

function buildRouteIssues(
  analyzedEntries: Array<{ event: RawApiEvent; analysis: AnalyzedApiEvent }>
): RouteIssueSummary[] {
  const issuesByRule = new Map<string, RouteIssueSummary>();

  for (const { analysis } of analyzedEntries.filter(({ analysis }) => analysis.flagged)) {
    for (const hit of analysis.ruleHits) {
      const existing = issuesByRule.get(hit.ruleName);

      if (existing) {
        existing.count += 1;
        existing.latestReason = hit.reason;
        existing.severity = hit.severity;
      } else {
        issuesByRule.set(hit.ruleName, {
          ruleName: hit.ruleName,
          severity: hit.severity,
          count: 1,
          latestReason: hit.reason
        });
      }
    }
  }

  return Array.from(issuesByRule.values()).sort((a, b) => b.count - a.count);
}

function buildRoutePerformance(events: RawApiEvent[]): RoutePerformance {
  const sortedLatencies = events.map((event) => event.latencyMs).sort((a, b) => a - b);
  const sortedByTime = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const responseSizes = events
    .map((event) => event.responseSize)
    .filter((value): value is number => value !== null);
  const earliest = sortedByTime[0];
  const latest = sortedByTime[sortedByTime.length - 1];
  const spanSeconds =
    events.length <= 1
      ? 0
      : (new Date(latest.timestamp).getTime() - new Date(earliest.timestamp).getTime()) /
        1000;
  const successCount = events.filter((event) => event.success).length;
  const errorCount = events.filter((event) => event.statusCode >= 400).length;

  return {
    avgLatencyMs: average(sortedLatencies),
    minLatencyMs: sortedLatencies[0] ?? 0,
    maxLatencyMs: sortedLatencies[sortedLatencies.length - 1] ?? 0,
    p50LatencyMs: getPercentile(sortedLatencies, 0.5),
    p95LatencyMs: getPercentile(sortedLatencies, 0.95),
    p99LatencyMs: getPercentile(sortedLatencies, 0.99),
    avgResponseSize: responseSizes.length > 0 ? average(responseSizes) : null,
    requestsPerSecond: spanSeconds > 0 ? events.length / spanSeconds : 0,
    successRate: events.length > 0 ? (successCount / events.length) * 100 : 0,
    errorRate: events.length > 0 ? (errorCount / events.length) * 100 : 0,
    latencyTrend: getLatencyTrend(sortedByTime)
  };
}

function buildRouteSummary(
  route: string,
  events: RawApiEvent[],
  analyzedEntries: Array<{ event: RawApiEvent; analysis: AnalyzedApiEvent }>
): RouteSummary {
  const mostRecentEvent = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )[0];
  const methods = Array.from(new Set(events.map((event) => event.method))).sort();
  const statusBreakdown = {
    success: events.filter((event) => event.statusCode >= 200 && event.statusCode < 300)
      .length,
    clientError: events.filter(
      (event) => event.statusCode >= 400 && event.statusCode < 500
    ).length,
    serverError: events.filter((event) => event.statusCode >= 500).length
  };

  return {
    route,
    totalRequests: events.length,
    lastSeen: mostRecentEvent?.timestamp ?? new Date(0).toISOString(),
    methods,
    statusBreakdown,
    issues: buildRouteIssues(analyzedEntries),
    activeFix: fixRegistry.getFixForRoute(route),
    performance: buildRoutePerformance(events)
  };
}

function buildPerformanceOverTime(events: RawApiEvent[]) {
  if (events.length === 0) {
    return [];
  }

  const buckets = new Map<
    number,
    { windowStart: string; windowEnd: string; requestCount: number; avgLatencyMs: number; errorCount: number }
  >();

  for (const event of events) {
    const timestampMs = new Date(event.timestamp).getTime();
    const bucketStartMs = Math.floor(timestampMs / 5000) * 5000;
    const bucket = buckets.get(bucketStartMs) ?? {
      windowStart: new Date(bucketStartMs).toISOString(),
      windowEnd: new Date(bucketStartMs + 5000).toISOString(),
      requestCount: 0,
      avgLatencyMs: 0,
      errorCount: 0
    };

    bucket.requestCount += 1;
    bucket.avgLatencyMs += event.latencyMs;
    if (event.statusCode >= 400) {
      bucket.errorCount += 1;
    }

    buckets.set(bucketStartMs, bucket);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, bucket]) => ({
      ...bucket,
      avgLatencyMs: bucket.requestCount > 0 ? bucket.avgLatencyMs / bucket.requestCount : 0
    }));
}

function createAnalysisSinkApp(): express.Express {
  const app = express();

  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.post("/events", (req, res) => {
    try {
      const event = parseRawApiEvent(req.body);
      eventStore.add(event);
      const analysis = runAnalysis(event, eventStore);
      eventStore.setAnalysis(event.requestId, analysis);

      console.log(
        `[ANALYSIS] ${event.method} ${event.route} -> ${analysis.severity} (${analysis.ruleHits.length} rules hit)`
      );

      res.status(200).json({ received: true, analysis });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.post("/events/batch", (req, res) => {
    if (!Array.isArray(req.body)) {
      res.status(400).json({ error: "Expected an array of events" });
      return;
    }

    try {
      const analyses = req.body.map((rawEvent) => {
        const event = parseRawApiEvent(rawEvent);
        eventStore.add(event);
        const analysis = runAnalysis(event, eventStore);
        eventStore.setAnalysis(event.requestId, analysis);

        console.log(
          `[ANALYSIS] ${event.method} ${event.route} -> ${analysis.severity} (${analysis.ruleHits.length} rules hit)`
        );

        return analysis;
      });

      res.status(200).json({
        received: true,
        count: analyses.length,
        analyses
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.get("/events", (_req, res) => {
    res.json(eventStore.getAll());
  });

  app.get("/events/analyzed", (_req, res) => {
    res.json(eventStore.getAllAnalyzed());
  });

  app.get("/events/summary", (_req, res) => {
    const flaggedEvents = eventStore.getFlaggedEvents();
    const flaggedByRule: Record<string, number> = {};
    const routeLatencyTotals: Record<string, { total: number; count: number }> = {};

    for (const event of eventStore.getAll()) {
      const latencyBucket = routeLatencyTotals[event.route] ?? {
        total: 0,
        count: 0
      };
      latencyBucket.total += event.latencyMs;
      latencyBucket.count += 1;
      routeLatencyTotals[event.route] = latencyBucket;
    }

    for (const { analysis } of flaggedEvents) {
      const ruleName = analysis.ruleHits[0]?.ruleName ?? "unknown";
      flaggedByRule[ruleName] = (flaggedByRule[ruleName] ?? 0) + 1;
    }

    const averageLatencyPerRoute: Record<string, number> = {};

    for (const [route, totals] of Object.entries(routeLatencyTotals)) {
      averageLatencyPerRoute[route] = totals.total / totals.count;
    }

    res.json({
      totalEventCount: eventStore.getAll().length,
      flaggedEventCount: flaggedEvents.length,
      flaggedByRule,
      averageLatencyPerRoute
    });
  });

  app.get("/flagged", (_req, res) => {
    const issues: Record<string, Array<{ event: unknown; analysis: unknown }>> = {};

    for (const entry of eventStore.getFlaggedEvents()) {
      const ruleName = entry.analysis.ruleHits[0]?.ruleName ?? "unknown";
      issues[ruleName] ??= [];
      issues[ruleName].push(entry);
    }

    res.json({ issues });
  });

  app.get("/routes", (_req, res) => {
    const allEvents = eventStore.getAll();
    const allAnalyzed = eventStore.getAllAnalyzed();
    const eventsByRoute = new Map<string, RawApiEvent[]>();

    for (const event of allEvents) {
      const routeEvents = eventsByRoute.get(event.route) ?? [];
      routeEvents.push(event);
      eventsByRoute.set(event.route, routeEvents);
    }

    const routes = Array.from(eventsByRoute.entries())
      .map(([route, events]) => {
        const analyzedEntries = allAnalyzed.filter(({ event }) => event.route === route);
        return buildRouteSummary(route, events, analyzedEntries);
      })
      .sort((a, b) => b.totalRequests - a.totalRequests);

    res.json({ routes });
  });

  app.get(/^\/routes\/(.+)$/, (req, res) => {
    const route = decodeURIComponent(req.params[0]);
    const routeEvents = eventStore
      .getAll()
      .filter((event) => event.route === route)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (routeEvents.length === 0) {
      res.status(404).json({ error: "Route not found" });
      return;
    }

    const routeAnalyses = eventStore
      .getAllAnalyzed()
      .filter(({ event }) => event.route === route)
      .sort(
        (a, b) =>
          new Date(b.event.timestamp).getTime() - new Date(a.event.timestamp).getTime()
      );

    res.json({
      ...buildRouteSummary(route, routeEvents, routeAnalyses),
      events: routeEvents.slice(0, 50),
      analyses: routeAnalyses,
      fixes: fixRegistry.getFixHistoryForRoute(route),
      performanceOverTime: buildPerformanceOverTime(routeEvents)
    });
  });

  app.delete("/events", (_req, res) => {
    eventStore.clear();
    res.json({ cleared: true });
  });

  return app;
}

export function startAnalysisSink(
  port = 4000,
  host = "127.0.0.1"
): { app: express.Express; server: Server } {
  const app = createAnalysisSinkApp();
  const server = app.listen(port, host, () => {
    console.log(`Analysis Sink listening on port ${port}`);
  });

  return { app, server };
}

export function registerAnalysisSinkGracefulShutdown(server: Server): void {
  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}, shutting down analysis sink`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

if (require.main === module) {
  const { server } = startAnalysisSink();
  registerAnalysisSinkGracefulShutdown(server);
}

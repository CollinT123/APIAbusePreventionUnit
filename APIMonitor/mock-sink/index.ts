import express from "express";
import { Server } from "http";

import { runAnalysis } from "../src/analysis/runAnalysis";
import { eventStore } from "../src/store/eventStore";
import { parseRawApiEvent } from "../src/validation/rawApiEventSchema";

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

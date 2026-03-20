import express from "express";
import { Server } from "http";

import { ApiEvent } from "../src/types/apiEvent";

export function createMockSinkApp(events: ApiEvent[] = []): express.Express {
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
    const event = req.body as ApiEvent;

    events.push(event);

    console.log("========================================");
    console.log(`timestamp: ${event.timestamp}`);
    console.log(`requestId: ${event.requestId}`);
    console.log(`method: ${event.method}`);
    console.log(`route: ${event.route}`);
    console.log(`statusCode: ${event.statusCode}`);
    console.log(`latencyMs: ${event.latencyMs}`);
    console.log(`fingerprint: ${event.fingerprint}`);
    console.log(JSON.stringify(event, null, 2));

    res.status(202).json({ received: true, totalEvents: events.length });
  });

  app.post("/events/batch", (req, res) => {
    const batch = req.body as ApiEvent[];

    for (const event of batch) {
      events.push(event);

      console.log("========================================");
      console.log(`timestamp: ${event.timestamp}`);
      console.log(`requestId: ${event.requestId}`);
      console.log(`method: ${event.method}`);
      console.log(`route: ${event.route}`);
      console.log(`statusCode: ${event.statusCode}`);
      console.log(`latencyMs: ${event.latencyMs}`);
      console.log(`fingerprint: ${event.fingerprint}`);
      console.log(JSON.stringify(event, null, 2));
    }

    res.status(202).json({ received: true, batchSize: batch.length, totalEvents: events.length });
  });

  app.get("/events", (_req, res) => {
    res.json(events);
  });

  app.get("/events/summary", (_req, res) => {
    const routeCounts: Record<string, number> = {};
    const fingerprintCounts: Record<string, number> = {};
    const routeLatencyTotals: Record<string, { total: number; count: number }> = {};

    for (const event of events) {
      routeCounts[event.route] = (routeCounts[event.route] ?? 0) + 1;
      fingerprintCounts[event.fingerprint] =
        (fingerprintCounts[event.fingerprint] ?? 0) + 1;

      const latencyBucket = routeLatencyTotals[event.route] ?? {
        total: 0,
        count: 0
      };
      latencyBucket.total += event.latencyMs;
      latencyBucket.count += 1;
      routeLatencyTotals[event.route] = latencyBucket;
    }

    const averageLatencyPerRoute: Record<string, number> = {};

    for (const [route, totals] of Object.entries(routeLatencyTotals)) {
      averageLatencyPerRoute[route] = totals.total / totals.count;
    }

    res.json({
      totalEventCount: events.length,
      byRoute: routeCounts,
      byFingerprint: fingerprintCounts,
      averageLatencyPerRoute
    });
  });

  app.delete("/events", (_req, res) => {
    events.length = 0;
    res.json({ cleared: true });
  });

  return app;
}

export function startMockSink(
  port = 4000,
  events: ApiEvent[] = [],
  host = "127.0.0.1"
): { app: express.Express; server: Server; events: ApiEvent[] } {
  const app = createMockSinkApp(events);
  const server = app.listen(port, host, () => {
    console.log(`Mock sink listening on port ${port}`);
  });

  return { app, server, events };
}

export function registerMockSinkGracefulShutdown(server: Server): void {
  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}, shutting down mock sink`);
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
  const { server } = startMockSink();
  registerMockSinkGracefulShutdown(server);
}

import express from "express";
import { Server } from "http";

import { config } from "./config";
import { EventEmitter } from "./emitter/eventEmitter";
import { requestTracker } from "./middleware/requestTracker";

const users = [
  { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
  { id: "2", name: "Grace Hopper", email: "grace@example.com" },
  { id: "3", name: "Margaret Hamilton", email: "margaret@example.com" }
];

const orders = [
  { id: "101", userId: "1", total: 149.99, status: "paid" },
  { id: "102", userId: "2", total: 89.5, status: "processing" },
  { id: "103", userId: "3", total: 24.0, status: "shipped" }
];

function withLatency(handler: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => {
    const delayMs = 50 + Math.floor(Math.random() * 251);

    setTimeout(() => {
      void handler(req, res, next);
    }, delayMs);
  };
}

function getNextChainDepthHeader(currentValue: string | undefined): string {
  const parsedDepth =
    currentValue !== undefined && Number.isFinite(Number(currentValue))
      ? Number(currentValue)
      : 0;

  return String(parsedDepth + 1);
}

export function createApp(currentConfig = config): express.Express {
  const app = express();
  const emitter = new EventEmitter(
    currentConfig.EVENT_SINK_URL,
    currentConfig.EVENT_SINK_TIMEOUT_MS,
    currentConfig.EVENT_SINK_RETRY_COUNT,
    currentConfig.LOG_EVENTS_LOCALLY,
    currentConfig.BATCH_EVENTS,
    currentConfig.LOCAL_FALLBACK_LOG
  );

  app.use(express.json());
  app.use(requestTracker(emitter.emit.bind(emitter)));

  app.get(
    "/api/users",
    withLatency((_req, res) => {
      res.json(users);
    })
  );

  app.get(
    "/api/users/:id",
    withLatency((req, res) => {
      const user = users.find((entry) => entry.id === req.params.id);

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json(user);
    })
  );

  app.post(
    "/api/users",
    withLatency((req, res) => {
      const createdUser = {
        id: String(users.length + 1),
        name: req.body?.name ?? "New User",
        email: req.body?.email ?? "new.user@example.com"
      };

      res.status(201).json(createdUser);
    })
  );

  app.get(
    "/api/orders",
    withLatency((_req, res) => {
      res.json(orders);
    })
  );

  app.get(
    "/api/orders/:id",
    withLatency(async (req, res) => {
      const order = orders.find((entry) => entry.id === req.params.id);

      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      const host = req.get("host");

      if (host) {
        const protocol = req.protocol || "http";

        try {
          await fetch(`${protocol}://${host}/api/users/${order.userId}`, {
            headers: {
              "x-correlation-id": req.correlationId ?? "",
              "x-chain-depth": getNextChainDepthHeader(req.get("x-chain-depth"))
            }
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown internal lookup failure";
          console.error(`[INTERNAL_LOOKUP_FAILED] ${message}`);
        }
      }

      res.json(order);
    })
  );

  app.get(
    "/api/health",
    withLatency((_req, res) => {
      res.json({ status: "ok" });
    })
  );

  return app;
}

export function startServer(
  currentConfig = config,
  port = currentConfig.PORT,
  host = "127.0.0.1",
  emitter = new EventEmitter(
    currentConfig.EVENT_SINK_URL,
    currentConfig.EVENT_SINK_TIMEOUT_MS,
    currentConfig.EVENT_SINK_RETRY_COUNT,
    currentConfig.LOG_EVENTS_LOCALLY,
    currentConfig.BATCH_EVENTS,
    currentConfig.LOCAL_FALLBACK_LOG
  )
): Server {
  const app = express();

  app.use(express.json());
  app.use(requestTracker(emitter.emit.bind(emitter)));

  app.get(
    "/api/users",
    withLatency((_req, res) => {
      res.json(users);
    })
  );

  app.get(
    "/api/users/:id",
    withLatency((req, res) => {
      const user = users.find((entry) => entry.id === req.params.id);

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json(user);
    })
  );

  app.post(
    "/api/users",
    withLatency((req, res) => {
      const createdUser = {
        id: String(users.length + 1),
        name: req.body?.name ?? "New User",
        email: req.body?.email ?? "new.user@example.com"
      };

      res.status(201).json(createdUser);
    })
  );

  app.get(
    "/api/orders",
    withLatency((_req, res) => {
      res.json(orders);
    })
  );

  app.get(
    "/api/orders/:id",
    withLatency((req, res) => {
      const order = orders.find((entry) => entry.id === req.params.id);

      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      res.json(order);
    })
  );

  app.get(
    "/api/health",
    withLatency((_req, res) => {
      res.json({ status: "ok" });
    })
  );

  return app.listen(port, host, () => {
    console.log(
      `API server listening on port ${port} with event sink ${currentConfig.EVENT_SINK_URL}`
    );
  });
}

export function registerGracefulShutdown(
  server: Server,
  emitter?: EventEmitter
): void {
  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}, shutting down`);
    server.close(async () => {
      try {
        await emitter?.shutdown();
      } finally {
        process.exit(0);
      }
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
  const emitter = new EventEmitter(
    config.EVENT_SINK_URL,
    config.EVENT_SINK_TIMEOUT_MS,
    config.EVENT_SINK_RETRY_COUNT,
    config.LOG_EVENTS_LOCALLY,
    config.BATCH_EVENTS,
    config.LOCAL_FALLBACK_LOG
  );
  const server = startServer(config, config.PORT, "127.0.0.1", emitter);
  registerGracefulShutdown(server, emitter);
}

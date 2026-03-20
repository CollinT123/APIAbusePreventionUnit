import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, describe, expect, it } from "vitest";

import { startAnalysisSink } from "../mock-sink/index";
import { startServer } from "../src/index";
import { ApiEvent } from "../src/types/apiEvent";

const serversToClose: Server[] = [];

function waitForListening(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server.listening) {
      resolve();
      return;
    }

    server.once("listening", resolve);
    server.once("error", reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

afterEach(async () => {
  await Promise.all(serversToClose.splice(0).map((server) => closeServer(server)));
});

describe("integration pipeline", () => {
  it("emits an event to the mock sink end-to-end", async () => {
    const sink = startAnalysisSink(0);
    serversToClose.push(sink.server);
    await waitForListening(sink.server);
    const sinkPort = (sink.server.address() as AddressInfo).port;

    const server = startServer(
      {
        SERVICE_NAME: "demo-api",
        ENVIRONMENT: "test",
        SCHEMA_VERSION: "1.0",
        EVENT_SINK_URL: `http://127.0.0.1:${sinkPort}/events`,
        EVENT_SINK_TIMEOUT_MS: 1000,
        EVENT_SINK_RETRY_COUNT: 0,
        BATCH_EVENTS: false,
        LOCAL_FALLBACK_LOG: false,
        PORT: 0,
        LOG_EVENTS_LOCALLY: false
      },
      0
    );
    serversToClose.push(server);
    await waitForListening(server);
    const appPort = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${appPort}/api/users`);

    expect(response.status).toBe(200);

    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    const sinkResponse = await fetch(`http://127.0.0.1:${sinkPort}/events`);
    const events = (await sinkResponse.json()) as ApiEvent[];

    expect(events).toHaveLength(1);
    expect(events[0].method).toBe("GET");
    expect(events[0].route).toContain("users");
    expect(events[0].statusCode).toBe(200);
    expect(events[0].latencyMs).toBeGreaterThanOrEqual(0);
  });
});

import {
  API_BASE_URL,
  SINK_BASE_URL,
  SummaryResponse,
  fetchJson,
  sendApiRequest,
  sessionId,
  sleep
} from "./demoHelpers";

async function main(): Promise<void> {
  console.log("=== TRACKING DEMO ===");
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Sink: ${SINK_BASE_URL}`);
  console.log(`Session: ${sessionId}`);

  console.log("\n1. Generating normal API traffic...");
  await sendApiRequest("/api/users", { method: "GET" });
  await sendApiRequest("/api/users/1", { method: "GET" });
  await sendApiRequest("/api/orders", { method: "GET" });
  await sendApiRequest("/api/orders/101", { method: "GET" });
  await sendApiRequest("/api/health", { method: "GET" });

  await sleep(1000);

  console.log("\n2. Reading sink summary...");
  const summary = await fetchJson<SummaryResponse>(SINK_BASE_URL, "/events/summary");
  console.log(JSON.stringify(summary, null, 2));

  console.log("\n3. What to show on the frontend:");
  console.log("- totalEventCount should be greater than 0");
  console.log("- averageLatencyPerRoute should include /api/users and /api/orders");
  console.log("- /api/orders/101 should also trigger an internal /api/users/:id call");
  console.log("- If your dashboard shows raw events, correlationId and chainDepth should be present");
}

void main();

import {
  API_BASE_URL,
  SINK_BASE_URL,
  resetDemoState,
  sessionId
} from "./demoHelpers";

async function main(): Promise<void> {
  console.log("=== RESET DEMO STATE ===");
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Sink: ${SINK_BASE_URL}`);
  console.log(`Session: ${sessionId}`);

  console.log("\n1. Removing active fixes from the API server...");
  console.log("2. Clearing analyzed events from the sink...");
  await resetDemoState();

  console.log("\nReset complete.");
  console.log("- No active fixes remain");
  console.log("- Sink event history is cleared");
  console.log("- You can now run demo:tracking or demo:attack from a clean state");
}

void main();

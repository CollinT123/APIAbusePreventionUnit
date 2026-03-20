import {
  API_BASE_URL,
  FlaggedResponse,
  SINK_BASE_URL,
  fetchJson,
  sendApiRequest,
  sessionId,
  sleep
} from "./demoHelpers";

async function main(): Promise<void> {
  console.log("=== ATTACK DEMO ===");
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Sink: ${SINK_BASE_URL}`);
  console.log(`Session: ${sessionId}`);

  console.log("\n1. Triggering duplicate request behavior...");
  const duplicateRequests = Array.from({ length: 5 }, async (_, index) => {
    await sleep(index * 100);
    await sendApiRequest("/api/users/1", { method: "GET" });
  });
  await Promise.all(duplicateRequests);

  await sleep(1000);

  console.log("\n2. Reading flagged issues from the sink...");
  const flagged = await fetchJson<FlaggedResponse>(SINK_BASE_URL, "/flagged");
  console.log(JSON.stringify(flagged, null, 2));

  const duplicateCount = flagged?.issues.duplicateRequests?.length ?? 0;
  console.log("\n3. What to highlight:");
  console.log(`- duplicateRequests flagged count: ${duplicateCount}`);
  console.log("- This is the 'fix needed' state");
  console.log("- The recommended strategy for the current MVP is response_cache on /api/users/:id");
}

void main();

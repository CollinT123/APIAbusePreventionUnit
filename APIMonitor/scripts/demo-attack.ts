import {
  API_BASE_URL,
  FixListResponse,
  FlaggedResponse,
  SINK_BASE_URL,
  fetchJson,
  sendApiRequest,
  sessionId,
  sleep
} from "./demoHelpers";

async function hasActiveUsersFix(): Promise<boolean> {
  const fixes = await fetchJson<FixListResponse>(API_BASE_URL, "/fixes");

  return (
    fixes?.some(
      (fix) =>
        fix.route === "/api/users/:id" &&
        fix.strategy === "response_cache" &&
        fix.status === "active"
    ) ?? false
  );
}

async function main(): Promise<void> {
  console.log("=== ATTACK DEMO ===");
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Sink: ${SINK_BASE_URL}`);
  console.log(`Session: ${sessionId}`);

  const hasFix = await hasActiveUsersFix();

  if (hasFix) {
    await sendApiRequest("/api/users/1", { method: "GET" });
    await sleep(500);
  } else {
    console.log("\n1. No active fix detected. Triggering duplicate request behavior...");
  }

  const duplicateRequests = Array.from({ length: 5 }, async (_, index) => {
    await sleep(index * (hasFix ? 350 : 100));
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
  if (hasFix) {
    console.log("- Active fix is in place, so repeated requests should be cache hits");
    console.log("- Cache-hit requests are no longer emitted to analysis");
  } else {
    console.log("- This is the 'fix needed' state");
    console.log("- The recommended strategy for the current MVP is response_cache on /api/users/:id");
  }
}

void main();

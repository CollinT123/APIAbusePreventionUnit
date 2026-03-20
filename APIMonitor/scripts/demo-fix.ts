import {
  API_BASE_URL,
  FixResponse,
  FixStatusResponse,
  FlaggedResponse,
  SINK_BASE_URL,
  fetchJson,
  sendApiRequest,
  sessionId,
  sleep
} from "./demoHelpers";

async function sendBurst(count: number): Promise<void> {
  const requests = Array.from({ length: count }, async (_, index) => {
    await sleep(index * 100);
    await sendApiRequest("/api/users/1", { method: "GET" });
  });

  await Promise.all(requests);
}

async function main(): Promise<void> {
  console.log("=== FIX DEMO ===");
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Sink: ${SINK_BASE_URL}`);
  console.log(`Session: ${sessionId}`);

  console.log("\n1. Creating the problem first...");
  await sendBurst(5);
  await sleep(1000);

  const flaggedBefore = await fetchJson<FlaggedResponse>(SINK_BASE_URL, "/flagged");
  const duplicateIssuesBefore = flaggedBefore?.issues.duplicateRequests?.length ?? 0;

  console.log("\n2. Applying response cache fix...");
  const fix = await fetchJson<FixResponse>(API_BASE_URL, "/fixes", {
    method: "POST",
    body: JSON.stringify({
      ruleName: "duplicateRequests",
      route: "/api/users/:id",
      strategy: "response_cache",
      params: { ttlMs: 5000 }
    })
  });

  if (!fix) {
    console.log("Fix could not be applied.");
    return;
  }

  console.log(JSON.stringify(fix, null, 2));
  await sleep(500);

  console.log("\n3. Replaying the same traffic after the fix...");
  const firstResponse = await sendApiRequest("/api/users/1", { method: "GET" });
  const secondResponse = await sendApiRequest("/api/users/1", { method: "GET" });

  console.log(`First response x-cache-hit: ${firstResponse?.headers.get("x-cache-hit")}`);
  console.log(`Second response x-cache-hit: ${secondResponse?.headers.get("x-cache-hit")}`);

  await sendBurst(3);
  await sleep(500);

  console.log("\n4. Reading fix status...");
  const fixStatus = await fetchJson<FixStatusResponse>(
    API_BASE_URL,
    `/fixes/${fix.id}/status`
  );
  console.log(JSON.stringify(fixStatus, null, 2));

  console.log("\n5. Demo summary:");
  console.log(`- duplicateRequests flagged before fix: ${duplicateIssuesBefore}`);
  console.log(`- issuesSinceFix: ${fixStatus?.issuesSinceFix ?? "unknown"}`);
  console.log(`- effective: ${fixStatus?.effective ? "yes" : "no"}`);
  console.log("- The main visual proof is that repeated GETs now return x-cache-hit: true");
}

void main();

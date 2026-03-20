import { v4 as uuidv4 } from "uuid";

const BASE_URL = "http://localhost:3000";
const sessionId = uuidv4();
const scenarioCounts: Record<string, number> = {};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function sendRequest(
  path: string,
  init: RequestInit = {},
  scenario: string
): Promise<Response | null> {
  scenarioCounts[scenario] = (scenarioCounts[scenario] ?? 0) + 1;

  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-client-id": "simulator",
      "x-session-id": sessionId,
      "x-correlation-id": uuidv4(),
      ...(init.headers ?? {})
    }
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Request failed for ${path}: ${message}`);
    return null;
  });
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });

    return (await response.json()) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Request failed for ${path}: ${message}`);
    return null;
  }
}

async function runScenario(
  label: string,
  runner: () => Promise<void>
): Promise<void> {
  console.log(`\n=== Scenario: ${label} ===`);
  await runner();
  await sleep(2000);
}

async function normalBrowsing(): Promise<void> {
  const scenario = "Normal browsing";

  await sendRequest("/api/users", { method: "GET" }, scenario);
  await sendRequest("/api/users/1", { method: "GET" }, scenario);
  await sendRequest("/api/orders", { method: "GET" }, scenario);
}

async function duplicateCalls(): Promise<void> {
  const scenario = "Duplicate calls";
  const requests = Array.from({ length: 5 }, async (_, index) => {
    await sleep(index * 100);
    await sendRequest("/api/users/1", { method: "GET" }, scenario);
  });

  await Promise.all(requests);
}

async function retryStorm(): Promise<void> {
  const scenario = "Retry storm";
  const requests = Array.from({ length: 8 }, (_unused, index) =>
    sendRequest(
      "/api/users",
      {
        method: "POST",
        body: JSON.stringify({
          name: `Retry User ${index + 1}`,
          email: `retry${index + 1}@example.com`
        })
      },
      scenario
    )
  );

  await Promise.all(requests);
}

async function polling(): Promise<void> {
  const scenario = "Polling";

  for (let index = 0; index < 10; index += 1) {
    await sendRequest("/api/orders", { method: "GET" }, scenario);
    await sleep(1000);
  }
}

async function hammer404(): Promise<void> {
  const scenario = "404 hammering";
  const requests = Array.from({ length: 4 }, () =>
    sendRequest("/api/users/999", { method: "GET" }, scenario)
  );

  await Promise.all(requests);
}

async function mixedBurst(): Promise<void> {
  const scenario = "Mixed burst";
  const routePool: Array<{ path: string; init?: RequestInit }> = [
    { path: "/api/users", init: { method: "GET" } },
    { path: "/api/users/1", init: { method: "GET" } },
    { path: "/api/users/2", init: { method: "GET" } },
    { path: "/api/users/999", init: { method: "GET" } },
    {
      path: "/api/users",
      init: {
        method: "POST",
        body: JSON.stringify({
          name: "Burst User",
          email: "burst@example.com"
        })
      }
    },
    { path: "/api/orders", init: { method: "GET" } },
    { path: "/api/orders/101", init: { method: "GET" } },
    { path: "/api/orders/999", init: { method: "GET" } },
    { path: "/api/health", init: { method: "GET" } }
  ];

  const requests = Array.from({ length: 20 }, async (_, index) => {
    const route = routePool[Math.floor(Math.random() * routePool.length)];
    const delayMs = Math.floor((3000 / 20) * index + Math.random() * 120);

    await sleep(delayMs);
    await sendRequest(route.path, route.init, scenario);
  });

  await Promise.all(requests);
}

type FlaggedResponse = {
  issues: Record<string, Array<{ event: unknown; analysis: unknown }>>;
};

type FixResponse = {
  id: string;
  ruleName: string;
  route: string;
  strategy: string;
  params: Record<string, unknown>;
  appliedAt: string;
  status: string;
};

type FixStatusResponse = {
  eventsBeforeFix: number;
  eventsSinceFix: number;
  issuesSinceFix: number;
  effective: boolean;
};

async function fixDemoDuplicateRequests(): Promise<void> {
  const scenario = "Fix Demo";

  console.log("\n=== FIX DEMO: Duplicate Request Resolution ===");

  const firstBurst = Array.from({ length: 5 }, async (_, index) => {
    await sleep(index * 100);
    await sendRequest("/api/users/1", { method: "GET" }, scenario);
  });
  await Promise.all(firstBurst);

  await sleep(1000);

  const flaggedBefore = await fetchJson<FlaggedResponse>("/flagged");
  console.log("Flagged issues before fix:");
  console.log(JSON.stringify(flaggedBefore, null, 2));

  console.log('Applying fix: response_cache on /api/users/:id');
  const fix = await fetchJson<FixResponse>("/fixes", {
    method: "POST",
    body: JSON.stringify({
      ruleName: "duplicateRequests",
      route: "/api/users/:id",
      strategy: "response_cache",
      params: { ttlMs: 5000 }
    })
  });

  if (!fix) {
    console.log("Fix creation failed; skipping fix demo follow-up.");
    return;
  }

  await sleep(500);

  const secondBurst = Array.from({ length: 5 }, async (_, index) => {
    await sleep(index * 100);
    await sendRequest("/api/users/1", { method: "GET" }, scenario);
  });
  await Promise.all(secondBurst);

  await sleep(500);

  const fixStatus = await fetchJson<FixStatusResponse>(`/fixes/${fix.id}/status`);
  console.log("Fix status:");
  console.log(JSON.stringify(fixStatus, null, 2));

  const duplicateIssuesBefore =
    flaggedBefore?.issues.duplicateRequests?.length ?? 0;
  const duplicateIssuesAfter = fixStatus?.issuesSinceFix ?? 0;
  const effective = fixStatus?.effective ? "yes" : "no";

  console.log(
    `Before fix: ${duplicateIssuesBefore} flagged events. After fix: ${duplicateIssuesAfter} flagged events. Fix effective: ${effective}`
  );
}

async function main(): Promise<void> {
  await runScenario("Normal browsing", normalBrowsing);
  await runScenario("Duplicate calls", duplicateCalls);
  await runScenario("Retry storm", retryStorm);
  await runScenario("Polling", polling);
  await runScenario("404 hammering", hammer404);
  await runScenario("Mixed burst", mixedBurst);
  await fixDemoDuplicateRequests();

  const totalRequestsSent = Object.values(scenarioCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  console.log("\n=== Simulation Summary ===");
  console.log(`Session ID: ${sessionId}`);
  console.log(`Total requests sent: ${totalRequestsSent}`);

  for (const [scenario, count] of Object.entries(scenarioCounts)) {
    console.log(`${scenario}: ${count}`);
  }
}

void main();

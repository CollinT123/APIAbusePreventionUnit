import { v4 as uuidv4 } from "uuid";

export const API_BASE_URL = "http://localhost:3000";
export const SINK_BASE_URL = "http://localhost:4000";

export const sessionId = uuidv4();

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function sendApiRequest(
  path: string,
  init: RequestInit = {}
): Promise<Response | null> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-client-id": "simulator",
        "x-session-id": sessionId,
        "x-correlation-id": uuidv4(),
        ...(init.headers ?? {})
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`API request failed for ${path}: ${message}`);
    return null;
  }
}

export async function fetchJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<T | null> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
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

export async function resetDemoState(): Promise<void> {
  const fixes = await fetchJson<FixListResponse>(API_BASE_URL, "/fixes");

  if (fixes) {
    for (const fix of fixes) {
      await fetchJson<{ removed: boolean }>(API_BASE_URL, `/fixes/${fix.id}`, {
        method: "DELETE"
      });
    }
  }

  await fetchJson<{ cleared: boolean }>(SINK_BASE_URL, "/events", {
    method: "DELETE"
  });
}

export type FlaggedResponse = {
  issues: Record<string, Array<{ event: unknown; analysis: unknown }>>;
};

export type FixResponse = {
  id: string;
  ruleName: string;
  route: string;
  strategy: string;
  params: Record<string, unknown>;
  appliedAt: string;
  status: string;
};

export type FixListResponse = FixResponse[];

export type FixStatusResponse = {
  fix: {
    id: string;
    ruleName: string;
    route: string;
    strategy: string;
    params: Record<string, unknown>;
    appliedAt: string;
    status: string;
  };
  eventsBeforeFix: number;
  eventsSinceFix: number;
  issuesSinceFix: number;
  effective: boolean;
};

export type SummaryResponse = {
  totalEventCount: number;
  flaggedEventCount: number;
  flaggedByRule: Record<string, number>;
  averageLatencyPerRoute: Record<string, number>;
};

import type {
  EventsSummary,
  FixConfig,
  FixStatus,
  FlaggedResponse,
  RawApiEvent,
  RoutesResponse,
} from "./types";

const SINK_URL = process.env.NEXT_PUBLIC_SINK_URL || "http://localhost:4000";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly url?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchJson<T>(
  baseUrl: string,
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!response.ok) {
      throw new ApiError(
        `Request failed: ${response.status} ${response.statusText}`,
        response.status,
        url
      );
    }
    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : "Network request failed",
      undefined,
      url
    );
  }
}

export async function fetchEvents(): Promise<RawApiEvent[]> {
  try {
    return await fetchJson<RawApiEvent[]>(SINK_URL, "/events");
  } catch {
    return [];
  }
}

export async function fetchFlagged(): Promise<FlaggedResponse> {
  try {
    return await fetchJson<FlaggedResponse>(SINK_URL, "/flagged");
  } catch {
    return { issues: {} };
  }
}

export async function fetchSummary(): Promise<EventsSummary> {
  try {
    return await fetchJson<EventsSummary>(SINK_URL, "/events/summary");
  } catch {
    return {
      totalEventCount: 0,
      flaggedEventCount: 0,
      flaggedByRule: {},
      averageLatencyPerRoute: {},
    };
  }
}

export async function fetchFixes(): Promise<FixConfig[]> {
  try {
    return await fetchJson<FixConfig[]>(API_URL, "/fixes");
  } catch {
    return [];
  }
}

export async function applyFix(
  ruleName: string,
  route: string,
  strategy: string,
  params: Record<string, unknown>
): Promise<FixConfig> {
  return fetchJson<FixConfig>(API_URL, "/fixes", {
    method: "POST",
    body: JSON.stringify({ ruleName, route, strategy, params }),
  });
}

export async function removeFix(fixId: string): Promise<void> {
  await fetchJson<{ removed: true }>(API_URL, `/fixes/${fixId}`, {
    method: "DELETE",
  });
}

export async function fetchFixStatus(fixId: string): Promise<FixStatus> {
  return fetchJson<FixStatus>(API_URL, `/fixes/${fixId}/status`);
}

export async function clearEvents(): Promise<void> {
  await fetchJson<{ cleared: boolean }>(SINK_URL, "/events", {
    method: "DELETE",
  });
}

export async function fetchRoutes(): Promise<RoutesResponse> {
  try {
    return await fetchJson<RoutesResponse>(SINK_URL, "/routes");
  } catch {
    return { routes: [] };
  }
}

export async function fetchRouteDetail(route: string): Promise<unknown> {
  return fetchJson(SINK_URL, `/routes/${encodeURIComponent(route)}`);
}

export async function checkSinkConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${SINK_URL.replace(/\/$/, "")}/events/summary`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkApiConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL.replace(/\/$/, "")}/fixes`);
    return res.ok;
  } catch {
    return false;
  }
}

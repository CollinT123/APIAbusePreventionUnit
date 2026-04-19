"use client";

import useSWR, { useSWRConfig, type KeyedMutator } from "swr";
import { useEffect, useState } from "react";
import {
  fetchFlagged,
  fetchSummary,
  fetchFixes,
  fetchFixStatus,
  fetchEvents,
  fetchRoutes,
  fetchRouteDetail,
  checkSinkConnection,
  checkApiConnection,
} from "./api";

export function useFlagged(): {
  data: Awaited<ReturnType<typeof fetchFlagged>>;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<Awaited<ReturnType<typeof fetchFlagged>>>;
} {
  const { data, error, isLoading, mutate } = useSWR(
    "flagged",
    fetchFlagged,
    { refreshInterval: 3000 }
  );
  return {
    data: data ?? { issues: {} },
    error,
    isLoading,
    mutate,
  };
}

export function useSummary(): {
  data: Awaited<ReturnType<typeof fetchSummary>>;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<Awaited<ReturnType<typeof fetchSummary>>>;
} {
  const { data, error, isLoading, mutate } = useSWR(
    "summary",
    fetchSummary,
    { refreshInterval: 3000 }
  );
  return {
    data:
      data ?? {
        totalEventCount: 0,
        flaggedEventCount: 0,
        flaggedByRule: {},
        averageLatencyPerRoute: {},
      },
    error,
    isLoading,
    mutate,
  };
}

export function useFixes(): {
  data: Awaited<ReturnType<typeof fetchFixes>>;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<Awaited<ReturnType<typeof fetchFixes>>>;
} {
  const { data, error, isLoading, mutate } = useSWR(
    "fixes",
    fetchFixes,
    { refreshInterval: 5000 }
  );
  return {
    data: data ?? [],
    error,
    isLoading,
    mutate,
  };
}

export function useEvents(): {
  data: Awaited<ReturnType<typeof fetchEvents>>;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<Awaited<ReturnType<typeof fetchEvents>>>;
} {
  const { data, error, isLoading, mutate } = useSWR(
    "events",
    fetchEvents,
    { refreshInterval: 3000 }
  );
  return {
    data: data ?? [],
    error,
    isLoading,
    mutate,
  };
}

export function useRoutes(): {
  data: Awaited<ReturnType<typeof fetchRoutes>>;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<Awaited<ReturnType<typeof fetchRoutes>>>;
} {
  const { data, error, isLoading, mutate } = useSWR(
    "routes",
    fetchRoutes,
    { refreshInterval: 5000 }
  );
  return {
    data: data ?? { routes: [] },
    error,
    isLoading,
    mutate,
  };
}

export function useRouteDetail(route: string): {
  data: Awaited<ReturnType<typeof fetchRouteDetail>> | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<Awaited<ReturnType<typeof fetchRouteDetail>>>;
} {
  const { data, error, isLoading, mutate } = useSWR(
    route ? ["route-detail", route] : null,
    () => fetchRouteDetail(route),
    { refreshInterval: 5000 }
  );
  return { data, error, isLoading, mutate };
}

export function useFixStatus(fixId: string): {
  data: Awaited<ReturnType<typeof fetchFixStatus>> | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<Awaited<ReturnType<typeof fetchFixStatus>>>;
} {
  const { data, error, isLoading, mutate } = useSWR(
    fixId ? ["fix-status", fixId] : null,
    () => fetchFixStatus(fixId),
    { refreshInterval: 5000 }
  );
  return {
    data,
    error,
    isLoading,
    mutate,
  };
}

const SINK_POLL_MS = 5000;

export function useBackendStatus(): {
  sinkOk: boolean | null;
  apiOk: boolean | null;
  anyDown: boolean;
} {
  const [sinkOk, setSinkOk] = useState<boolean | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      const [sink, api] = await Promise.all([
        checkSinkConnection(),
        checkApiConnection(),
      ]);
      setSinkOk(sink);
      setApiOk(api);
    };
    check();
    const id = setInterval(check, SINK_POLL_MS);
    return () => clearInterval(id);
  }, []);

  const anyDown =
    sinkOk === false || apiOk === false;

  return { sinkOk, apiOk, anyDown };
}

export function useRefreshAll(): () => Promise<void> {
  const { mutate } = useSWRConfig();
  return async () => {
    await Promise.all([
      mutate("flagged"),
      mutate("summary"),
      mutate("fixes"),
      mutate("events"),
      mutate("routes"),
    ]);
  };
}

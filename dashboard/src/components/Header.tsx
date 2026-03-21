"use client";

import Link from "next/link";
import { Activity, RefreshCw } from "lucide-react";
import { ConnectionStatus } from "./ConnectionStatus";
import { useBackendStatus } from "@/lib/hooks";
import { useRefreshAll } from "@/lib/hooks";
import { useState } from "react";

export function Header() {
  const { anyDown } = useBackendStatus();
  const refreshAll = useRefreshAll();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      {anyDown && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] bg-amber-600 px-4 py-2 text-center text-sm font-medium text-white"
          role="alert"
        >
          Backend unavailable — some data may be stale
        </div>
      )}
      <header
        className={`fixed left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6 transition-[top] duration-200 ${
          anyDown ? "top-9" : "top-0"
        }`}
      >
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-zinc-100 transition-colors hover:scale-[1.02] hover:text-white active:scale-[0.98]"
        >
          <Activity className="h-4 w-4 text-sky-500" aria-hidden />
          API Monitor
        </Link>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            title="Refresh all data"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          <ConnectionStatus />
        </div>
      </header>
    </>
  );
}

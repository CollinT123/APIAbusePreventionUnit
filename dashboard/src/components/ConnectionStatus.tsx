"use client";

import { useEffect, useState } from "react";
import { checkSinkConnection } from "@/lib/api";

const POLL_INTERVAL_MS = 5000;

export function ConnectionStatus() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      const ok = await checkSinkConnection();
      setConnected(ok);
    };

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (connected === null) {
    return (
      <span className="flex items-center gap-2 text-sm text-zinc-500">
        <span
          className="h-2 w-2 rounded-full bg-zinc-500 animate-pulse"
          aria-hidden
        />
        Checking…
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-2 text-sm text-zinc-400"
      role="status"
      aria-live="polite"
    >
      <span
        className={`h-2 w-2 rounded-full ${
          connected
            ? "bg-emerald-500 animate-[connection-pulse_2s_ease-in-out_infinite]"
            : "bg-red-500"
        }`}
        aria-hidden
      />
      {connected ? "Connected" : "Disconnected"}
    </span>
  );
}

"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { FixCard } from "@/components/FixCard";
import { Toast } from "@/components/Toast";
import { useFixes, useFlagged } from "@/lib/hooks";
import { removeFix } from "@/lib/api";

export default function FixesPage() {
  const { data: fixes, isLoading, mutate: mutateFixes } = useFixes();
  const { mutate: mutateFlagged } = useFlagged();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRemove = useCallback(
    async (fixId: string): Promise<void> => {
      try {
        await removeFix(fixId);
        mutateFixes((prev) => (prev ?? []).filter((f) => f.id !== fixId), {
          revalidate: true,
        });
        mutateFlagged();
      } catch {
        setErrorMessage("Failed to remove fix. Is the API server running?");
        mutateFixes();
        throw new Error("Remove failed");
      }
    },
    [mutateFixes, mutateFlagged]
  );

  const count = fixes?.length ?? 0;

  return (
    <div className="space-y-6">
      <Toast
        message={errorMessage ?? ""}
        visible={errorMessage !== null}
        onDismiss={() => setErrorMessage(null)}
        duration={5000}
      />
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-zinc-100">Active Fixes</h1>
        <span
          className="rounded-full bg-zinc-800 px-2.5 py-0.5 font-mono text-sm tabular-nums text-zinc-300"
          aria-label={`${count} active ${count === 1 ? "fix" : "fixes"}`}
        >
          {count}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900" />
          <div className="h-32 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900" />
        </div>
      ) : count === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 py-16 text-center animate-[page-in_0.2s_ease-out_both]">
          <p className="font-medium text-zinc-400">
            No active fixes.
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Go to Issues to detect and fix API problems.
          </p>
          <Link
            href="/issues"
            className="mt-4 inline-flex items-center rounded bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-all hover:scale-[1.02] hover:bg-sky-600 active:scale-[0.98]"
          >
            Go to Issues
          </Link>
        </div>
      ) : (
        <div className="space-y-4 animate-[page-in_0.2s_ease-out_both]">
          {fixes!.map((fix) => (
            <FixCard key={fix.id} fix={fix} onRemove={handleRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

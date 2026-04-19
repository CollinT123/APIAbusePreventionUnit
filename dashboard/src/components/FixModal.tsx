"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { applyFix } from "@/lib/api";
import { SeverityBadge } from "./SeverityBadge";
import type { Severity } from "@/lib/types";

const STRATEGIES = [
  { id: "response_cache", label: "Response Cache" },
] as const;

interface FixModalProps {
  isOpen: boolean;
  onClose: () => void;
  ruleName: string;
  route: string;
  eventCount: number;
  severity: Severity;
  onApplySuccess: (message: string) => void;
}

const EXPLANATION =
  "Identical requests to this route will receive cached responses for the specified duration, preventing duplicate calls from reaching the server.";

function formatRuleName(ruleName: string): string {
  return ruleName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

export function FixModal({
  isOpen,
  onClose,
  ruleName,
  route,
  eventCount,
  severity,
  onApplySuccess,
}: FixModalProps) {
  const [strategy, setStrategy] = useState<string>("response_cache");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setStrategy("response_cache");
    setError(null);
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        await applyFix(ruleName, route, strategy, { ttlMs: 5000 });
        onApplySuccess(`Fix applied: Response cache on ${route}`);
        onClose();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to apply fix"
        );
      } finally {
        setLoading(false);
      }
    },
    [ruleName, route, strategy, onApplySuccess, onClose]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fade-in_0.15s_ease-out]"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fix-modal-title"
    >
      <div
        className="mx-4 w-full max-w-md animate-[fix-modal-in_0.15s_ease-out] rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="border-b border-zinc-800 px-6 py-4">
            <h2
              id="fix-modal-title"
              className="text-lg font-semibold text-zinc-100"
            >
              Apply Fix
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {formatRuleName(ruleName)} → {route}
            </p>
          </div>

          <div className="space-y-4 px-6 py-4">
            <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
              <p className="text-sm text-zinc-300">
                {eventCount} {eventCount === 1 ? "event" : "events"} flagged
              </p>
              <div className="mt-1">
                <SeverityBadge severity={severity} />
              </div>
            </div>

            <div>
              <label
                htmlFor="strategy"
                className="block text-sm font-medium text-zinc-400"
              >
                Strategy
              </label>
              <select
                id="strategy"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-sm text-zinc-500 leading-relaxed">
              {EXPLANATION}
            </p>

            {error && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-all hover:scale-[1.02] hover:bg-zinc-600 active:scale-[0.98] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-all hover:scale-[1.02] hover:bg-sky-600 active:scale-[0.98] disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Applying…
                </>
              ) : (
                "Apply Fix"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

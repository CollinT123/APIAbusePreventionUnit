"use client";

import { useCallback, useState, useRef, useMemo } from "react";
import { Check, Trash2 } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { IssueGroup } from "@/components/IssueGroup";
import { FixModal } from "@/components/FixModal";
import { Toast } from "@/components/Toast";
import {
  useFlagged,
  useSummary,
  useFixes,
  useSinkConnection,
} from "@/lib/hooks";
import { clearEvents } from "@/lib/api";

type Severity = "NONE" | "YELLOW" | "ORANGE" | "RED";

interface ModalData {
  ruleName: string;
  route: string;
  eventCount: number;
  severity: Severity;
}

export default function IssuesPage() {
  const { data: flagged, isLoading: flaggedLoading, mutate: mutateFlagged } =
    useFlagged();
  const { data: summary, isLoading: summaryLoading, mutate: mutateSummary } =
    useSummary();
  const { data: fixes, mutate: mutateFixes } = useFixes();
  const connected = useSinkConnection();

  const [clearing, setClearing] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const prevRequestIds = useRef<Set<string>>(new Set());

  const isLoading = flaggedLoading || summaryLoading;

  const newRequestIds = useMemo(() => {
    const allIds = new Set<string>();
    for (const entries of Object.values(flagged.issues)) {
      for (const { event } of entries) {
        allIds.add(event.requestId);
      }
    }
    const newIds = new Set<string>();
    if (prevRequestIds.current.size > 0) {
      for (const id of allIds) {
        if (!prevRequestIds.current.has(id)) {
          newIds.add(id);
        }
      }
    }
    prevRequestIds.current = allIds;
    return newIds;
  }, [flagged.issues]);

  const handleClearAll = useCallback(async () => {
    setClearing(true);
    try {
      await clearEvents();
      await Promise.all([mutateFlagged(), mutateSummary(), mutateFixes()]);
    } catch {
      setToastMessage("Failed to clear events. Is the sink running?");
    } finally {
      setClearing(false);
    }
  }, [mutateFlagged, mutateSummary, mutateFixes]);

  const handleFixClick = useCallback((data: ModalData) => {
    setModalData(data);
  }, []);

  const handleApplySuccess = useCallback(
    (message: string) => {
      setModalData(null);
      mutateFixes();
      mutateFlagged();
      setToastMessage(message);
    },
    [mutateFixes, mutateFlagged]
  );

  const totalEvents = summary.totalEventCount;
  const flaggedCount = summary.flaggedEventCount;
  const activeFixesCount = fixes?.length ?? 0;
  const detectionRate =
    totalEvents > 0 ? ((flaggedCount / totalEvents) * 100).toFixed(1) : "0";
  const hasFlagged = flaggedCount > 0;
  const issueEntries = Object.entries(flagged.issues);

  return (
    <div className="space-y-6">
      <Toast
        message={toastMessage ?? ""}
        visible={toastMessage !== null}
        onDismiss={() => setToastMessage(null)}
        duration={3000}
      />

      {modalData && (
        <FixModal
          isOpen={true}
          onClose={() => setModalData(null)}
          ruleName={modalData.ruleName}
          route={modalData.route}
          eventCount={modalData.eventCount}
          severity={modalData.severity}
          onApplySuccess={handleApplySuccess}
        />
      )}

      {connected === false && (
        <div
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400"
          role="alert"
        >
          Cannot connect to Analysis Sink on port 4000. Is it running?
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <MetricCard
            label="Total Events"
            value={totalEvents}
            loading={isLoading}
          />
          <MetricCard
            label="Flagged Issues"
            value={flaggedCount}
            variant={hasFlagged ? "highlight" : "default"}
            loading={isLoading}
          />
          <MetricCard
            label="Active Fixes"
            value={activeFixesCount}
            loading={isLoading}
          />
          <MetricCard
            label="Detection Rate"
            value={`${detectionRate}%`}
            loading={isLoading}
          />
        </div>
        <button
          type="button"
          onClick={handleClearAll}
          disabled={clearing || totalEvents === 0}
          className="flex items-center gap-2 rounded bg-zinc-700 px-3 py-2 text-sm text-zinc-200 transition-all hover:scale-[1.02] hover:bg-zinc-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear All
        </button>
      </div>

      {isLoading && issueEntries.length === 0 ? (
        <div className="space-y-4">
          <div className="h-12 w-48 animate-pulse rounded-lg bg-zinc-800" />
          <div className="h-32 animate-pulse rounded-lg bg-zinc-800" />
          <div className="h-32 animate-pulse rounded-lg bg-zinc-800" />
        </div>
      ) : issueEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center animate-[page-in_0.2s_ease-out_both]">
          <div className="rounded-full bg-emerald-500/20 p-3 mb-4">
            <Check className="h-8 w-8 text-emerald-500" />
          </div>
          <p className="font-medium text-zinc-300">
            No issues detected.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Run the traffic simulator to generate test data.
          </p>
        </div>
      ) : (
        <div className="space-y-4 animate-[page-in_0.2s_ease-out_both]">
          {issueEntries.map(([ruleName, entries]) => {
            const severity =
              (entries[0]?.analysis.severity as Severity) ?? "NONE";
            return (
              <IssueGroup
                key={ruleName}
                ruleName={ruleName}
                severity={severity}
                entries={entries}
                activeFixes={fixes ?? []}
                newRequestIds={newRequestIds}
                onFixClick={handleFixClick}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

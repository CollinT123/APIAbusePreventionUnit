"use client";

interface MetricCardProps {
  label: string;
  value: string | number;
  variant?: "default" | "highlight";
  loading?: boolean;
}

export function MetricCard({
  label,
  value,
  variant = "default",
  loading = false,
}: MetricCardProps) {
  return (
    <div
      className={`rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 transition-colors duration-200 hover:border-zinc-700 ${
        variant === "highlight"
          ? "ring-1 ring-rose-500/30 animate-pulse"
          : ""
      }`}
    >
      {loading ? (
        <div className="h-8 w-16 animate-pulse rounded bg-zinc-800" />
      ) : (
        <p
          className="text-3xl font-mono font-semibold tabular-nums text-zinc-100 transition-opacity duration-200"
          aria-live="polite"
        >
          {value}
        </p>
      )}
      <p className="mt-1 text-sm text-zinc-400">{label}</p>
    </div>
  );
}

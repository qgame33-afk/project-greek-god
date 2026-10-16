"use client";

import { ChevronDown, CloudOff, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/dates";
import { useClockSec } from "./rest";

/** Elapsed session time — the only part of the top bar that re-renders every second. */
export function Elapsed({ startedAt, className }: { startedAt: string; className?: string }) {
  const now = useClockSec();
  const start = Math.floor(Date.parse(startedAt) / 1000);
  return (
    <span className={cn("num tabular-nums", className)} role="timer" aria-label="Elapsed time">
      {formatDuration(Math.max(0, now - start))}
    </span>
  );
}

export interface Segment {
  key: string;
  state: "done" | "skipped" | "pending";
  current: boolean;
}

export function WorkoutTopBar({
  name,
  startedAt,
  dateLabel,
  segments,
  finishLabel,
  onMinimize,
  onFinish,
  minimizeLabel = "Minimise workout",
  minimizeIcon = "down",
  sync,
}: {
  name: string;
  startedAt: string;
  /** Shown instead of the running clock for a session from another day. */
  dateLabel: string | null;
  segments: Segment[];
  finishLabel: string;
  onMinimize: () => void;
  onFinish: () => void;
  minimizeLabel?: string;
  minimizeIcon?: "down" | "close";
  sync: { pending: number; offline: boolean; error: string | null };
}) {
  return (
    <header className="chrome sticky top-0 z-20 border-b border-line-hair" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="mx-auto flex h-[52px] max-w-[1120px] items-center gap-2 px-2 lg:px-6">
        <button type="button" onClick={onMinimize} aria-label={minimizeLabel} className="grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-2 hover:text-fg">
          {minimizeIcon === "down" ? <ChevronDown className="size-6" /> : <X className="size-5" />}
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="t-h2 truncate text-[17px] leading-tight text-fg">{name}</h1>
          <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold leading-tight">
            {dateLabel ? <span className="text-fg-2">{dateLabel}</span> : <Elapsed startedAt={startedAt} className="text-[15px] font-semibold text-gold-300" />}
            {sync.offline && sync.pending > 0 && (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-fg-3">
                <CloudOff className="size-3" aria-hidden /> {sync.pending} on device
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onFinish}
          className="press h-11 shrink-0 rounded-[12px] border border-line-gold px-3.5 font-num text-[15px] font-bold uppercase tracking-[0.08em] text-gold-300 hover:bg-gold-tint"
        >
          {finishLabel}
        </button>
      </div>
      {segments.length > 0 && (
        <div className="mx-auto flex h-[3px] max-w-[1120px] gap-[3px] px-3 lg:px-6" role="img" aria-label={`${segments.filter((s) => s.state === "done").length} of ${segments.length} exercises done`}>
          {segments.map((s) => (
            <span
              key={s.key}
              className={cn(
                "h-full flex-1 rounded-full transition-colors duration-300",
                s.state === "done" ? "bg-gold-400" : s.current ? "bg-white/30" : s.state === "skipped" ? "bg-white/[.04]" : "bg-white/[.1]",
              )}
            />
          ))}
        </div>
      )}
    </header>
  );
}

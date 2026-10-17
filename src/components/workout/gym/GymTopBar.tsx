"use client";

import { forwardRef, ViewTransition, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/dates";
import { clockTime, type FriezeSegment } from "@/lib/workout/gym";
import { useClockSec } from "../rest";

/** The shared element name the session title morphs through on Begin (Lights Out, §1.8.2). */
export const SESSION_TITLE_VT = "session-title";

/** Elapsed session time — the only part of the bar that re-renders every second. */
function Elapsed({ startedAt }: { startedAt: string }) {
  const now = useClockSec();
  const sec = Math.max(0, now - Math.floor(Date.parse(startedAt) / 1000));
  return (
    <span className="t-num-s text-ivory" role="timer" aria-label={`Elapsed ${Math.floor(sec / 60)} minutes`}>
      {formatDuration(sec)}
    </span>
  );
}

/**
 * Gym Mode's top bar (§3.2.1): ⌄ minimise · the session name over the elapsed clock and the
 * "screen stays on" dot · Finish. Opaque obsidian, never blurred. Beneath it, the set frieze:
 * one segment per working set grouped by lift, a tappable 44 px row that opens All lifts.
 */
export const GymTopBar = forwardRef<
  HTMLElement,
  {
    name: string;
    startedAt: string;
    /** Shown instead of the running clock (an edit, or a session from another day). */
    dateLabel: string | null;
    awake: boolean;
    finishLabel: string;
    minimizeLabel: string;
    minimizeIcon: "down" | "close";
    onMinimize: () => void;
    onFinish: () => void;
    frieze: ReactNode;
  }
>(function GymTopBar({
  name,
  startedAt,
  dateLabel,
  awake,
  finishLabel,
  minimizeLabel,
  minimizeIcon,
  onMinimize,
  onFinish,
  frieze,
}, ref) {
  return (
    <header ref={ref} className="sticky top-0 z-(--z-sticky) bg-obsidian" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="mx-auto flex h-(--topbar-h) max-w-col items-center gap-2 px-3">
        <button
          type="button"
          onClick={onMinimize}
          aria-label={minimizeLabel}
          className="press grid size-11 shrink-0 place-items-center rounded-full bg-m1 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory"
        >
          {minimizeIcon === "down" ? <ChevronDown className="size-[22px]" strokeWidth={1.8} /> : <X className="size-5" strokeWidth={1.8} />}
        </button>
        <div className="min-w-0 flex-1 text-center">
          <ViewTransition name={SESSION_TITLE_VT} default="none" share="auto">
            <h1 className="t-eyebrow truncate !text-ivory [letter-spacing:.2em]">{name}</h1>
          </ViewTransition>
          <p className="mt-1 flex items-center justify-center gap-1.5 leading-none">
            {dateLabel ? <span className="t-meta text-stone">{dateLabel}</span> : <Elapsed startedAt={startedAt} />}
            {awake && (
              <span className="inline-flex items-center" title="Screen stays on">
                <span aria-hidden className="size-1.5 rounded-full bg-stone" />
                <span className="sr-only">Screen stays on</span>
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onFinish}
          className="press h-11 shrink-0 rounded-full px-4 text-[length:max(15px,0.9375rem)] font-semibold text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)] hover:bg-m2"
        >
          {finishLabel}
        </button>
      </div>
      {frieze}
    </header>
  );
});

/** The set frieze: logged = leaf, this set = ivory outline, later = --ui-line (3:1). */
export function Frieze({
  segments,
  done,
  total,
  endsAt,
  typicalMin,
  templateName,
  onOpen,
}: {
  segments: FriezeSegment[];
  done: number;
  total: number;
  endsAt: number | null;
  typicalMin: number | null;
  templateName: string;
  onOpen: () => void;
}) {
  const groups: FriezeSegment[][] = [];
  for (const s of segments) {
    const last = groups.at(-1);
    if (last && last[0].group === s.group) last.push(s);
    else groups.push([s]);
  }
  return (
    <div className="mx-auto max-w-col px-3">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${done} of ${total} sets logged. Show all lifts`}
        className="press-soft hit-44 flex w-full flex-col justify-center gap-1.5 rounded-field px-1 pb-1.5 pt-1 text-left"
      >
        <span aria-hidden className="flex w-full items-center gap-[6px]">
          {groups.map((g, gi) => (
            <span key={gi} className="flex min-w-0 flex-1 gap-[2px]" style={{ flexGrow: g.length }}>
              {g.map((s) => (
                <span
                  key={s.id}
                  className={cn(
                    "h-1 min-w-0 flex-1 rounded-full transition-colors duration-(--dur-base)",
                    s.state === "logged" && "bg-leaf-300",
                    s.state === "current" && "bg-transparent shadow-[inset_0_0_0_1px_var(--ivory)] h-1.5",
                    s.state === "later" && "bg-ui-line/70",
                    s.state === "skipped" && "bg-vein-2",
                  )}
                />
              ))}
            </span>
          ))}
        </span>
        <span className="flex w-full items-center justify-between gap-2">
          <span className="t-meta tnum text-stone">
            <span className="font-semibold text-ivory">{done}</span> / {total} sets
          </span>
          {endsAt != null && (
            <span className="t-meta tnum inline-flex items-center gap-1.5 text-stone">
              ends ~{clockTime(endsAt)}
              <Tag kind="CALC" className="pointer-events-none" />
              <span className="sr-only">
                , your usual {typicalMin} minutes for {templateName}
              </span>
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

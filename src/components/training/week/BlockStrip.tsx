"use client";

import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/dates";
import { DELOAD_WINDOW, HARD_WEEK_SESSIONS, type Block } from "@/lib/training/block";

/**
 * The block strip (§3.4.1 item 2): one segment per week since the last deload (or the programme
 * start), hard weeks filled ivory, this week outlined, and a marker where the deload RULE falls
 * (hard week 5). It never draws a future week: while the window is ahead it says so in words.
 */
export function BlockStrip({ block, today, className }: { block: Block; today: string; className?: string }) {
  const { weeks, hardWeeks, windowIndex, weeksToWindow, deloading, since, hidden } = block;
  const n = weeks.length;
  const sinceWord = since.kind === "deload" ? "since your last deload" : since.kind === "start" ? "since you started" : "in the loaded history";
  const head = deloading ? "Deload week" : hardWeeks === 0 ? "Block" : `${hardWeeks} hard ${hardWeeks === 1 ? "week" : "weeks"}`;
  const right = deloading ? "Back to standard next week" : weeksToWindow === 0 ? "Deload window" : `Deload window in ${weeksToWindow} hard ${weeksToWindow === 1 ? "week" : "weeks"}`;
  const aria =
    `Training block ${sinceWord}, ${shortDate(since.week, today)}: ${n} ${n === 1 ? "week" : "weeks"}, ${hardWeeks} hard in a row. ` +
    (deloading ? "This is a deload week." : weeksToWindow === 0 ? "The deload window is reached." : `The deload window comes after ${DELOAD_WINDOW} hard weeks; ${weeksToWindow} to go.`);

  return (
    <section aria-label={aria} className={cn("min-w-0", className)}>
      <div className="flex min-h-6 items-center justify-between gap-3" aria-hidden>
        <p className="t-eyebrow truncate">
          {head}
          {hidden > 0 && <span className="text-ash"> · last {n}</span>}
        </p>
        <p className="t-meta flex shrink-0 items-center gap-1.5 text-stone">
          {right}
          <Tag
            kind="RULE"
            explain={
              <>
                A lighter week is suggested after {DELOAD_WINDOW} hard weeks in a row. A week is hard with {HARD_WEEK_SESSIONS} or more sessions. The strip shows only weeks that
                happened, {sinceWord}.
              </>
            }
          />
        </p>
      </div>
      <div className="relative mt-2 flex h-4 items-center gap-1 pr-2" aria-hidden>
        {weeks.map((w) => {
          const fill = w.state === "open" ? Math.min(1, w.sessions / HARD_WEEK_SESSIONS) : 0;
          return (
            <span
              key={w.start}
              className={cn(
                "relative h-2 min-w-0 flex-1 overflow-hidden rounded-full",
                w.state === "hard" && "bg-ivory",
                w.state === "light" && "shadow-[inset_0_0_0_1px_var(--ui-line)]",
                w.state === "open" && "shadow-[inset_0_0_0_1.5px_var(--ivory)]",
                w.state === "deload" && "hatch shadow-[inset_0_0_0_1.5px_var(--ivory)]",
                w.current && w.state === "hard" && "outline outline-1 outline-offset-2 outline-ivory",
              )}
            >
              {fill > 0 && <span className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-ivory/45" style={{ transform: `scaleX(${fill})` }} />}
            </span>
          );
        })}
        {windowIndex != null && (
          // in the gap after hard week DELOAD_WINDOW: (i + 1) segment widths plus i gaps of 4 px, plus half a gap (8 px kept free at the end for it)
          <span className="pointer-events-none absolute -bottom-1 -top-1 flex w-0 justify-center" style={{ left: `calc(${(windowIndex + 1) / n} * (100% - ${4 * (n - 1) + 8}px) + ${4 * windowIndex + 2}px)` }}>
            <span className="h-full w-px bg-stone" />
            <span className="absolute -top-0.5 size-1.5 rotate-45 bg-stone" />
          </span>
        )}
      </div>
    </section>
  );
}

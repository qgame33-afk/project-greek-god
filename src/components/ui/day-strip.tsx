"use client";

import { useRef, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import { dayName, monthName, parseISODate, type ISODate } from "@/lib/dates";

/**
 * The day strip (docs/DESIGN-V3-SIMPLE.md §1.4.6): seven columns for the current Monday–Sunday
 * week, one meaning everywhere (Today, Train, Food, Check-ins). Each column is a button at least
 * 44 wide × 56 tall: the weekday letter, a 38 px date circle, and under it either a 5 px mark row
 * or a `t-cap` label (Train: the workout's `abbr`).
 *
 *   selected        white fill, black number
 *   today           a 4 px white dot above the circle (when not selected)
 *   logged          1.5 px --ui-line ring
 *   missed          1.5 px dashed --ui-line ring (a planned workout not done, past)
 *   win             1.5 px gold ring at 75% alpha, plus a 5 px gold dot under the circle (or,
 *                   with a label, the label in --text): the win never depends on colour alone
 *   future          --text-3 number, no ring; inert (`aria-disabled`) when `futureInert`
 *
 * Swipe, or the "Previous week" / "Next week" buttons (VoiceOver), move by a week when
 * `onPrevWeek` / `onNextWeek` are given. The strip is one `data-budget-group` (§5.1).
 * AX layout: no weekday letters (VoiceOver keeps them), 44 px circles, labels hidden.
 */
export type DayState = "none" | "logged" | "missed" | "win";

export interface StripDay {
  date: ISODate;
  state?: DayState;
  /** Train: the workout's `abbr` ("Arms", "Rest"). */
  label?: string;
  /** How the label reads: "on" (--text), "off" (--text-2, default), "faint" (--text-3, rest days). */
  labelTone?: "on" | "off" | "faint";
  /** The rest of the VoiceOver sentence after the date ("protein goal hit", "Chest and Back B, planned"). */
  spoken?: string;
}

export interface DayStripProps {
  days: StripDay[];
  /** The selected date (white fill). */
  selected?: ISODate | null;
  /** Today's date (the white dot when not selected; "today" for VoiceOver). */
  today: ISODate;
  onSelect?: (date: ISODate) => void;
  /** Future days are inert (Today, Check-ins) instead of selectable (Train, Food). */
  futureInert?: boolean;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  ariaLabel?: string;
  className?: string;
}

const LETTER = ["S", "M", "T", "W", "T", "F", "S"];

export function DayStrip({ days, selected, today, onSelect, futureInert, onPrevWeek, onNextWeek, ariaLabel = "This week", className }: DayStripProps) {
  const swipe = useSwipe(onPrevWeek, onNextWeek);
  return (
    <div className={cn("@container", className)} data-budget-group="">
      <div role="group" aria-label={ariaLabel} className="-mx-1 grid touch-pan-y grid-cols-7" {...swipe}>
        {days.map((d) => {
          const x = parseISODate(d.date);
          const isToday = d.date === today;
          const future = d.date > today;
          const sel = selected === d.date;
          const inert = future && futureInert;
          const state = d.state ?? "none";
          const spoken = [`${dayName(d.date)} ${x.getDate()} ${monthName(d.date)}`, isToday ? "today" : null, d.spoken ?? spokenState(state, !!d.label)].filter(Boolean).join(", ");
          return (
            <button
              key={d.date}
              type="button"
              onClick={inert ? undefined : () => onSelect?.(d.date)}
              aria-disabled={inert || undefined}
              aria-pressed={onSelect ? sel : undefined}
              aria-current={isToday ? "date" : undefined}
              aria-label={spoken}
              className={cn("press-none flex min-h-[56px] min-w-[44px] flex-col items-center gap-1.5 pb-0.5", inert ? "cursor-default" : "press")}
            >
              <span aria-hidden className="t-cap font-semibold ax:hidden">
                {LETTER[x.getDay()]}
              </span>
              <span
                aria-hidden
                className={cn(
                  "t-label relative grid size-[38px] place-items-center rounded-full font-bold tabular-nums ax:size-[44px]",
                  sel ? "bg-fg text-bg" : future ? "text-fg-3" : "text-fg",
                  !sel && state === "logged" && "border-[1.5px] border-ui-line",
                  !sel && state === "missed" && "border-[1.5px] border-dashed border-ui-line",
                  !sel && state === "win" && "border-[1.5px] border-(--gold-ring)",
                )}
              >
                {x.getDate()}
                {isToday && !sel && <span className="absolute -top-[7px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-fg" />}
              </span>
              {d.label != null ? (
                <span aria-hidden className={cn("t-cap font-semibold leading-none ax:hidden", d.labelTone === "on" || sel ? "text-fg" : d.labelTone === "faint" ? "text-fg-3" : "text-fg-2")}>
                  {d.label}
                </span>
              ) : (
                <span aria-hidden className="grid h-1.5 place-items-center">
                  {state === "win" && <i className="block size-[5px] rounded-full bg-gold" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {(onPrevWeek || onNextWeek) && (
        <div className="sr-only">
          {onPrevWeek && (
            <button type="button" onClick={onPrevWeek}>
              Previous week
            </button>
          )}
          {onNextWeek && (
            <button type="button" onClick={onNextWeek}>
              Next week
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function spokenState(state: DayState, labelled: boolean) {
  if (state === "win") return labelled ? "done" : "protein goal hit";
  if (state === "missed") return "not done";
  if (state === "logged") return "logged";
  return null;
}

/** A horizontal swipe of 48 px or more moves a week (vertical scrolling is untouched). */
function useSwipe(prev?: () => void, next?: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  if (!prev && !next) return {};
  return {
    onPointerDown: (e: PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx > 0) prev?.();
      else next?.();
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}

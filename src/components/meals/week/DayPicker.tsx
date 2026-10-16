"use client";

import { cn } from "@/lib/cn";
import { dayName, parseISODate, type ISODate } from "@/lib/dates";
import type { Macros } from "@/lib/meals/types";
import { kcalText } from "../shared/format";
import type { DayFit } from "./model";

export interface DayInfo {
  date: ISODate;
  meals: number;
  planned: Macros | undefined;
  fit: DayFit;
}

const FIT_LABEL: Record<DayFit, string> = { empty: "nothing planned", fits: "plan fits your goals", off: "plan is off your goals" };

/** The day's marker: a filled marble dot when the plan fits the goals, an outline when it's off, nothing when empty. */
function FitDot({ fit, className }: { fit: DayFit; className?: string }) {
  return (
    <span
      className={cn("size-1.5 rounded-full transition-colors duration-(--dur-fast)", fit === "fits" ? "bg-marble" : fit === "off" ? "ring-1 ring-inset ring-fg-3/70" : "bg-transparent", className)}
      aria-hidden
    />
  );
}

/**
 * Mon–Sun picker for phones and tablets: seven 44px+ cells with one selection pill that glides
 * between them (transform only, no measuring). Arrow keys move the selection.
 */
export function DayStrip({ days, today, selected, onSelect, className }: { days: DayInfo[]; today: ISODate; selected: ISODate; onSelect: (d: ISODate) => void; className?: string }) {
  const index = Math.max(0, days.findIndex((d) => d.date === selected));
  return (
    <div
      role="tablist"
      aria-label="Day of the week"
      className={cn("relative grid grid-cols-7 rounded-[16px] bg-s2 p-1 ring-1 ring-inset ring-line-hair", className)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const next = days[Math.min(days.length - 1, Math.max(0, index + (e.key === "ArrowRight" ? 1 : -1)))];
        if (next) onSelect(next.date);
      }}
    >
      {/* the glide: one pill, moved by its own width per day */}
      <span aria-hidden className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-8px)/7)] transition-transform duration-(--dur-slow) ease-spring motion-reduce:transition-none" style={{ transform: `translateX(${index * 100}%)` }}>
        <span className="block size-full rounded-[12px] bg-s4 shadow-[inset_0_1px_0_rgb(255_255_255/.06),0_1px_2px_rgb(0_0_0/.4)] ring-1 ring-inset ring-line-gold" />
      </span>
      {days.map((d) => {
        const on = d.date === selected;
        const isToday = d.date === today;
        return (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            aria-label={`${dayName(d.date)} ${parseISODate(d.date).getDate()}${isToday ? ", today" : ""}: ${d.meals ? `${d.meals} meals, ${kcalText(d.planned?.kcal ?? 0)} kcal planned, ${FIT_LABEL[d.fit]}` : FIT_LABEL.empty}`}
            onClick={() => onSelect(d.date)}
            className="press-none relative z-10 flex h-[62px] flex-col items-center justify-center gap-[3px] rounded-[12px] active:opacity-70"
          >
            <span className={cn("text-[10.5px] font-bold uppercase tracking-[0.12em] transition-colors duration-(--dur-fast)", on ? "text-fg-2" : isToday ? "text-gold-300" : "text-fg-3")}>
              {dayName(d.date, true).slice(0, 3)}
            </span>
            <span className={cn("num text-[20px] font-semibold leading-none transition-colors duration-(--dur-fast)", on ? "text-fg" : isToday ? "text-gold-300" : d.meals ? "text-fg-2" : "text-fg-3")}>
              {parseISODate(d.date).getDate()}
            </span>
            <FitDot fit={d.fit} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Desktop: the week as a list, each day with its planned kcal and protein, so the whole week
 * reads at a glance. The selected row carries a gold edge.
 */
export function DayList({ days, today, selected, onSelect, proteinGoal }: { days: DayInfo[]; today: ISODate; selected: ISODate; onSelect: (d: ISODate) => void; proteinGoal: number }) {
  return (
    <div role="tablist" aria-label="Day of the week" aria-orientation="vertical" className="flex flex-col gap-1">
      {days.map((d) => {
        const on = d.date === selected;
        const isToday = d.date === today;
        return (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(d.date)}
            className={cn(
              "press-soft group relative flex h-14 items-center gap-3 rounded-[14px] px-3.5 text-left transition-colors duration-(--dur-fast)",
              on ? "bg-s3 shadow-[inset_0_1px_0_rgb(255_255_255/.04)]" : "hover:bg-white/[.03]",
            )}
          >
            <span aria-hidden className={cn("absolute inset-y-3 left-0 w-[2px] rounded-full bg-gold-400 transition-opacity duration-(--dur-fast)", on ? "opacity-100" : "opacity-0")} />
            <span className="w-11 shrink-0">
              <span className={cn("block text-[10.5px] font-bold uppercase tracking-[0.12em]", isToday ? "text-gold-300" : "text-fg-3")}>{isToday ? "Today" : dayName(d.date, true)}</span>
              <span className={cn("num block text-[20px] font-semibold leading-tight", on ? "text-fg" : "text-fg-2")}>{parseISODate(d.date).getDate()}</span>
            </span>
            <span className="min-w-0 flex-1">
              {d.meals ? (
                <span className="flex items-baseline gap-2 whitespace-nowrap text-[12.5px] font-semibold text-fg-2">
                  <span>
                    <span className="num text-[16px] text-fg">{kcalText(d.planned?.kcal ?? 0)}</span> kcal
                  </span>
                  <span className="text-fg-3">·</span>
                  <span>
                    <span className="num text-[15px] text-fg">{Math.round(d.planned?.protein ?? 0)}</span>
                    {proteinGoal > 0 ? <span className="text-fg-3"> / {proteinGoal}</span> : null} g
                  </span>
                </span>
              ) : (
                <span className="text-[12.5px] font-medium text-fg-3">Nothing planned</span>
              )}
            </span>
            <FitDot fit={d.fit} className="shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

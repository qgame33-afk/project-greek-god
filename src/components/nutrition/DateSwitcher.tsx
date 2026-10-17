"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useDailyNutrition } from "@/lib/data/nutrition";
import { cn } from "@/lib/cn";
import { addDays, addMonths, dayName, longDate, monthEnd, monthLabel, monthName, monthStart, parseISODate, type ISODate } from "@/lib/dates";
import { caloriesHit } from "@/lib/nutrition";
import { monthGrid } from "@/lib/nutrition-ui/format";
import { formatInt } from "@/lib/units";
import { keepOpenOnToast, useFocusIntoSheet } from "./hooks";

/** "Today" / "Yesterday" / "Wednesday" — the day's name in the voice. */
export function dayTitle(date: ISODate, today: ISODate): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return dayName(date);
}

/** "Saturday 17 October" (the year only when it isn't this year's). */
export function dayLong(date: ISODate, today: ISODate): string {
  const d = parseISODate(date);
  const year = date.slice(0, 4) !== today.slice(0, 4) ? ` ${date.slice(0, 4)}` : "";
  return `${dayName(date)} ${d.getDate()} ${monthName(date)}${year}`;
}

const ARROW = "press grid size-11 place-items-center rounded-full text-stone shadow-[inset_0_0_0_1px_var(--vein-3)] hover:text-ivory disabled:text-disabled disabled:shadow-[inset_0_0_0_1px_var(--vein)]";

/**
 * The day at the top of Fuel → Today: its name as the page's h1 (Cormorant), the full date under
 * it, and ‹ › to step through past days (never into the future). Tapping the name opens a month
 * picker with the days that have food logged. `extra` sits after the arrows (the day's ⋯ menu).
 */
export function DayTitle({ date, today, onChange, calorieGoal, extra }: { date: ISODate; today: ISODate; onChange: (d: ISODate) => void; calorieGoal: number; extra?: ReactNode }) {
  const [picker, setPicker] = useState<{ open: boolean; nonce: number }>({ open: false, nonce: 0 });
  const atToday = date >= today;
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="t-title-1 text-ivory">
          <button
            type="button"
            onClick={() => setPicker((p) => ({ open: true, nonce: p.nonce + 1 }))}
            aria-label={`${dayTitle(date, today)}, ${longDate(date)}. Choose a day`}
            className="press-soft -mx-1 rounded-field px-1 text-left"
          >
            {dayTitle(date, today)}
          </button>
        </h1>
        <p className="t-meta mt-1 truncate text-stone">
          {dayLong(date, today)}
          {date < today && " · past day"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2" role="group" aria-label="Day">
        <button type="button" onClick={() => onChange(addDays(date, -1))} aria-label="Previous day" className={ARROW}>
          <ChevronLeft className="size-5" strokeWidth={1.6} />
        </button>
        <button type="button" onClick={() => onChange(addDays(date, 1))} disabled={atToday} aria-label="Next day" className={ARROW}>
          <ChevronRight className="size-5" strokeWidth={1.6} />
        </button>
        {extra}
      </div>
      <Sheet open={picker.open} onOpenChange={keepOpenOnToast((o) => setPicker((p) => ({ ...p, open: o })))} title="Choose a day" description="Days with food logged are marked.">
        <DayPicker
          key={picker.nonce}
          date={date}
          today={today}
          calorieGoal={calorieGoal}
          onPick={(d) => {
            onChange(d);
            setPicker((p) => ({ ...p, open: false }));
          }}
        />
      </Sheet>
    </div>
  );
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function DayPicker({ date, today, calorieGoal, onPick }: { date: ISODate; today: ISODate; calorieGoal: number; onPick: (d: ISODate) => void }) {
  const [month, setMonth] = useState(monthStart(date));
  const root = useRef<HTMLDivElement>(null);
  useFocusIntoSheet(root);
  const days = useDailyNutrition(month, monthEnd(month));
  const byDate = new Map((days.data ?? []).map((r) => [r.local_date ?? "", r]));
  const canNext = addMonths(month, 1) <= today;
  const grid = monthGrid(month);

  return (
    <div className="pb-2 pt-1" ref={root}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month" className={ARROW}>
          <ChevronLeft className="size-5" strokeWidth={1.6} />
        </button>
        <p className="t-title-2 text-ivory" aria-live="polite">
          {monthLabel(month)}
        </p>
        <button type="button" onClick={() => setMonth(addMonths(month, 1))} disabled={!canNext} aria-label="Next month" className={ARROW}>
          <ChevronRight className="size-5" strokeWidth={1.6} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label={monthLabel(month)}>
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="t-eyebrow pb-1" aria-hidden>
            {w}
          </span>
        ))}
        {grid.flat().map((d, i) => {
          if (!d) return <span key={`pad-${i}`} />;
          const future = d > today;
          const r = byDate.get(d);
          const logged = !!r && Number(r.entries ?? 0) > 0;
          const hit = logged && caloriesHit(Number(r!.calories ?? 0), calorieGoal);
          const selected = d === date;
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              disabled={future}
              onClick={() => onPick(d)}
              aria-label={`${longDate(d)}${logged ? `, ${formatInt(Number(r!.calories ?? 0))} kcal logged${hit ? ", on target" : ""}` : ""}`}
              aria-current={selected ? "date" : undefined}
              className={cn(
                "press relative flex h-12 flex-col items-center justify-center rounded-field transition-colors",
                selected ? "bg-m4 text-ivory shadow-[inset_0_0_0_1px_var(--ivory)]" : "hover:bg-m3",
                future ? "text-disabled" : !selected && (isToday ? "text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]" : "text-stone"),
              )}
            >
              <span className="t-num-s leading-none">{Number(d.slice(8))}</span>
              <span className={cn("mt-1 size-1.5 rounded-full", hit ? "bg-leaf-300" : logged ? "bg-ui-line" : "bg-transparent")} aria-hidden />
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="t-meta flex items-center gap-4 text-stone">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-ui-line" aria-hidden /> Logged
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-leaf-300" aria-hidden /> On target
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onPick(today)} disabled={date === today}>
          Today
        </Button>
      </div>
    </div>
  );
}

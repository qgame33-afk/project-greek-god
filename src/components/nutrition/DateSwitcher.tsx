"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useDailyNutrition } from "@/lib/data/nutrition";
import { cn } from "@/lib/cn";
import { addDays, addMonths, monthEnd, monthLabel, monthStart, longDate, type ISODate } from "@/lib/dates";
import { caloriesHit } from "@/lib/nutrition";
import { dayLabel, monthGrid } from "@/lib/nutrition-ui/format";
import { formatInt } from "@/lib/units";
import { keepOpenOnToast, useFocusIntoSheet } from "./hooks";

/** ‹ Today › — browse past days; never into the future. The label opens a month picker. */
export function DateSwitcher({ date, today, onChange, calorieGoal }: { date: ISODate; today: ISODate; onChange: (d: ISODate) => void; calorieGoal: number }) {
  const [picker, setPicker] = useState<{ open: boolean; nonce: number }>({ open: false, nonce: 0 });
  const atToday = date >= today;
  return (
    <>
      <div className="flex items-center rounded-[14px] border border-line bg-s1 p-0.5" role="group" aria-label="Day">
        <button
          type="button"
          onClick={() => onChange(addDays(date, -1))}
          aria-label="Previous day"
          className="press grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setPicker((p) => ({ open: true, nonce: p.nonce + 1 }))}
          aria-label={`${longDate(date)}. Choose a day`}
          className="press h-11 min-w-[88px] rounded-[12px] px-1.5 text-center text-[14px] font-bold text-fg hover:bg-s3"
        >
          {dayLabel(date, today)}
        </button>
        <button
          type="button"
          onClick={() => onChange(addDays(date, 1))}
          disabled={atToday}
          aria-label="Next day"
          className="press grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg disabled:text-fg-dis disabled:opacity-60"
        >
          <ChevronRight className="size-5" />
        </button>
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
    </>
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
        <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month" className="press grid size-11 place-items-center rounded-[12px] text-fg-2 hover:bg-s3 hover:text-fg">
          <ChevronLeft className="size-5" />
        </button>
        <p className="t-h2" aria-live="polite">
          {monthLabel(month)}
        </p>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          disabled={!canNext}
          aria-label="Next month"
          className="press grid size-11 place-items-center rounded-[12px] text-fg-2 hover:bg-s3 hover:text-fg disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label={monthLabel(month)}>
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="pb-1 text-[11px] font-bold tracking-[0.12em] text-fg-3" aria-hidden>
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
              aria-label={`${longDate(d)}${logged ? `, ${formatInt(Number(r!.calories ?? 0))} kcal logged` : ""}`}
              aria-current={selected ? "date" : undefined}
              className={cn(
                "press relative flex h-12 flex-col items-center justify-center rounded-[12px] border text-[16px] transition-colors",
                selected ? "border-line-gold bg-gold-tint text-gold-300" : "border-transparent hover:bg-s3",
                future ? "text-fg-dis" : !selected && (isToday ? "text-fg" : "text-fg-2"),
                isToday && !selected && "border-line-strong",
              )}
            >
              <span className="num font-semibold leading-none">{Number(d.slice(8))}</span>
              <span
                className={cn("mt-1 size-1.5 rounded-full", hit ? "bg-gold-400" : logged ? "bg-marble/70" : "bg-transparent")}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-[12px] font-medium text-fg-3">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-marble/70" aria-hidden /> Logged
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-gold-400" aria-hidden /> On target
          </span>
        </div>
        <Button variant="secondary" size="md" onClick={() => onPick(today)} disabled={date === today}>
          Today
        </Button>
      </div>
    </div>
  );
}

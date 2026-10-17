"use client";

import {
  addDays,
  dayName,
  daysBetween,
  monthName,
  parseISODate,
  relativeDay,
  shortDate,
  weekDates,
  weekStart,
  type ISODate,
} from "@/lib/dates";
import { useRecovery } from "@/lib/data/recovery";
import { hasSignal, type CheckinLite } from "@/lib/recovery/guidance";
import { cn } from "@/lib/cn";
import { Switcher } from "./parts";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const EARLIEST_WEEKS_BACK = 104;

/** "Today", "Yesterday", "Wednesday, Oct 14" */
function dayTitle(d: ISODate, today: ISODate) {
  const diff = daysBetween(d, today);
  if (diff <= 1) return relativeDay(d, today);
  return `${dayName(d)}, ${shortDate(d, today)}`;
}

/** Week strip for choosing the ledger day: today by default, past days editable, never the future. A dot marks a logged check-in. */
export function DateStrip({
  value,
  onChange,
  today,
  startDate,
  className,
}: {
  value: ISODate;
  onChange: (d: ISODate) => void;
  today: ISODate;
  /** Days before the user's start date can't be picked. */
  startDate?: ISODate | null;
  className?: string;
}) {
  const days = weekDates(value);
  const ws = days[0];
  const rec = useRecovery(ws, days[6]);
  const logged = new Set(
    (rec.data ?? [])
      .filter((r) => hasSignal(r as CheckinLite) || r.volleyball)
      .map((r) => r.local_date),
  );
  const thisWeek = weekStart(today);
  const floor = addDays(thisWeek, -7 * EARLIEST_WEEKS_BACK);
  const earliest =
    startDate && weekStart(startDate) > floor ? weekStart(startDate) : floor;

  const label = (() => {
    const a = parseISODate(days[0]);
    const b = parseISODate(days[6]);
    const span =
      a.getMonth() === b.getMonth()
        ? `${monthName(days[0], true)} ${a.getDate()} – ${b.getDate()}`
        : `${monthName(days[0], true)} ${a.getDate()} – ${monthName(days[6], true)} ${b.getDate()}`;
    return span;
  })();

  const go = (weeks: number) => {
    const target = addDays(value, weeks * 7);
    onChange(
      target > today
        ? today
        : startDate && target < startDate
          ? startDate
          : target,
    );
  };

  return (
    <nav aria-label="Check-in day" className={cn("mb-5", className)}>
      <div className="mb-1 flex items-center gap-2">
        <Switcher
          className="flex-1"
          label={
            <span className="block">
              <span className="t-title-3 block text-ivory">
                {dayTitle(value, today)}
              </span>
              <span className="t-meta tnum block text-stone">
                {label}
              </span>
            </span>
          }
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          prevDisabled={ws <= earliest}
          nextDisabled={ws >= thisWeek}
          prevLabel="Previous week"
          nextLabel="Next week"
        />
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const future = d > today;
          const early = !!startDate && d < startDate;
          const selected = d === value;
          const isToday = d === today;
          const has = logged.has(d);
          return (
            <li key={d}>
              <button
                type="button"
                disabled={future || early}
                onClick={() => onChange(d)}
                aria-pressed={selected}
                aria-label={`${relativeDay(d, today)}${has ? ", check-in logged" : ""}${future ? ", upcoming" : early ? ", before your start date" : ""}`}
                className={cn(
                  "press relative flex h-16 w-full flex-col items-center justify-center gap-1 rounded-field transition-colors",
                  selected
                    ? "bg-m3 shadow-[inset_0_0_0_1.5px_var(--ivory)]"
                    : "hover:bg-m1",
                  (future || early) && "pointer-events-none",
                )}
              >
                <span
                  className={cn(
                    "t-eyebrow",
                    future || early
                      ? "text-disabled"
                      : selected
                        ? "text-ivory"
                        : "text-ash",
                  )}
                >
                  {LETTERS[i]}
                </span>
                <span
                  className={cn(
                    "t-num-s leading-none",
                    future || early
                      ? "text-disabled"
                      : selected || isToday
                        ? "text-ivory"
                        : "text-stone",
                  )}
                >
                  {parseISODate(d).getDate()}
                </span>
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    has ? "bg-stone" : "bg-transparent",
                  )}
                  aria-hidden
                />
                {isToday && !selected && (
                  <span
                    className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-ivory/60"
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

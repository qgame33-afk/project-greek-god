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

/** Week strip for choosing the check-in day: today by default, past days editable, never the future. */
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
              <span className="block text-[15px] font-bold text-fg">
                {dayTitle(value, today)}
              </span>
              <span className="num-xs block text-[13px] text-fg-3">
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
                  "press relative flex h-[62px] w-full flex-col items-center justify-center gap-1 rounded-[14px] border transition-colors",
                  selected
                    ? "border-line-strong bg-s3"
                    : "border-transparent hover:bg-s2",
                  (future || early) && "pointer-events-none",
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-bold tracking-[0.08em]",
                    future || early
                      ? "text-fg-dis"
                      : selected
                        ? "text-fg-2"
                        : "text-fg-3",
                  )}
                >
                  {LETTERS[i]}
                </span>
                <span
                  className={cn(
                    "num text-[19px] font-semibold leading-none",
                    future || early
                      ? "text-fg-dis"
                      : isToday
                        ? "text-gold-300"
                        : selected
                          ? "text-fg"
                          : "text-fg-2",
                  )}
                >
                  {parseISODate(d).getDate()}
                </span>
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    has ? "bg-marble" : "bg-transparent",
                  )}
                  aria-hidden
                />
                {isToday && !selected && (
                  <span
                    className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-gold-400/70"
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

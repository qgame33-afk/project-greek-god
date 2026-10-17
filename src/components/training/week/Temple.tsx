"use client";

import { SealTick, Volleyball } from "@/components/art/icons";
import { Colonnade, colonnadeSlot } from "@/components/signature/Colonnade";
import { cn } from "@/lib/cn";
import { dayName, type ISODate } from "@/lib/dates";
import type { ColonnadeDay } from "@/lib/training/schedule";

const SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const wd = (d: ISODate) => new Date(`${d}T12:00:00`).getDay();

/**
 * The week's temple (§3.4.1 item 4): the Foundation Colonnade with a label under each column —
 * MON / Push A — and the volleyball glyph on volleyball days. Columns are buttons that open the
 * day sheet. In a narrow container (accessibility text sizes) it becomes a 7-row list.
 *
 * The Colonnade draws its own one-letter day initials and a tiny ball; both are hidden here
 * because the labels below say the same thing at a readable size.
 */
export function Temple({ days, onDay, className }: { days: ColonnadeDay[]; onDay: (d: ISODate) => void; className?: string }) {
  return (
    <div className={cn("@container", className)}>
      <div className="@max-[19rem]:hidden">
        <div className="relative [&_g_g[fill=none]]:hidden [&_svg_text]:hidden">
          <Colonnade days={days} height={132} interactive onDayClick={onDay} />
          {/* a rest day with volleyball: the ball stands where a column would */}
          {days.map((d, i) =>
            d.kind === "rest" && d.volleyball ? (
              <span key={d.date} aria-hidden className="pointer-events-none absolute top-[38%] grid place-items-center text-stone" style={{ left: `${colonnadeSlot(i).left}%`, width: `${colonnadeSlot(i).width}%` }}>
                <Volleyball className="size-5" />
              </span>
            ) : null,
          )}
        </div>
        <div aria-hidden className="relative mx-auto -mt-3 h-14 w-full" style={{ maxWidth: (132 * 320) / 96 }}>
          {days.map((d, i) => {
            const slot = colonnadeSlot(i);
            const label = d.kind === "rest" ? (d.volleyball ? "Volley" : "Rest") : d.label;
            return (
              <span key={d.date} className="absolute top-0 flex flex-col items-center text-center" style={{ left: `${slot.left}%`, width: `${slot.width}%` }}>
                <span className={cn("t-eyebrow", d.today ? "text-leaf-300" : "text-ash")}>{SHORT[wd(d.date)]}</span>
                <span className={cn("t-meta mt-1 max-w-full truncate tracking-tight", d.today ? "text-leaf-300" : d.done ? "text-ivory" : d.kind === "rest" || d.missed ? "text-ash" : "text-stone")}>{label}</span>
                {d.kind === "train" && d.volleyball && <Volleyball className="mt-1 size-3.5 text-stone" />}
              </span>
            );
          })}
        </div>
      </div>

      {/* accessibility sizes: one row per day */}
      <ol className="hidden divide-y divide-vein border-y border-vein @max-[19rem]:block" aria-label="This week">
        {days.map((d) => (
          <li key={d.date}>
            <button type="button" onClick={() => onDay(d.date)} className="press-soft flex min-h-14 w-full items-center gap-3 py-2 text-left">
              <span className={cn("t-title-3 w-[3.2em] shrink-0", d.today ? "text-leaf-300" : "text-ivory")}>{dayName(d.date, true)}</span>
              <span className="min-w-0 flex-1">
                <span className={cn("t-callout block", d.kind === "rest" ? "text-stone" : "text-ivory")}>{d.kind === "rest" ? "Rest" : d.label}</span>
                <span className="t-meta block text-stone">{stateWord(d)}</span>
              </span>
              {d.volleyball && <Volleyball className="size-5 text-stone" />}
              {d.done && <SealTick className="size-5 text-leaf-300" />}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function stateWord(d: ColonnadeDay) {
  const parts: string[] = [];
  if (d.done) parts.push("sealed");
  else if (d.missed) parts.push("not logged");
  else if (d.today && d.kind === "train") parts.push("today");
  else if (d.kind === "train") parts.push("planned");
  if (d.volleyball) parts.push("volleyball");
  return parts.length ? parts.join(" · ") : d.today ? "today" : " ";
}

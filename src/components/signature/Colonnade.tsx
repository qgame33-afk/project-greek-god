"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { dayName, shortDate } from "@/lib/dates";

/**
 * The colonnade, retired (docs/DESIGN-V3-SIMPLE.md §0 law 6, §1.7.4): no temple, columns or
 * pediment. Kept so old screens compile. With `interactive` it still renders one plain 44 px mark
 * per day (white check when done, white ring today, a 3:1 ring otherwise) so the days stay
 * tappable until the owning stream replaces it with the DayStrip; otherwise it renders nothing.
 * Deleted at integration (§6.7).
 */
export interface ColonnadeProps {
  days: { date: string; kind: "train" | "rest"; label: string; done: boolean; today: boolean; volleyball?: boolean; missed?: boolean }[];
  height?: number;
  interactive?: boolean;
  onDayClick?: (date: string) => void;
  className?: string;
}

const VB_W = 320;
const SLOT = 44;
const X0 = 6;

/** Horizontal position of day slot `i` as percentages of the row's width (for labels laid under it). */
export function colonnadeSlot(i: number): { left: number; width: number } {
  return { left: ((X0 + SLOT * i) / VB_W) * 100, width: (SLOT / VB_W) * 100 };
}

export function Colonnade({ days, interactive = false, onDayClick, className }: ColonnadeProps) {
  if (!interactive) return null;
  return (
    <div className={cn("relative h-14 w-full", className)}>
      {days.map((d, i) => (
        <button
          key={d.date}
          type="button"
          onClick={() => onDayClick?.(d.date)}
          aria-current={d.today ? "date" : undefined}
          aria-label={dayAria(d)}
          className="press absolute top-0 grid h-full place-items-center"
          style={{ left: `${colonnadeSlot(i).left}%`, width: `${colonnadeSlot(i).width}%`, minWidth: 44 }}
        >
          <span
            aria-hidden
            className={cn(
              "grid size-9 place-items-center rounded-full",
              d.done ? "bg-fg text-bg" : d.today ? "border-[1.5px] border-fg" : d.missed ? "border-[1.5px] border-dashed border-ui-line" : d.kind === "rest" ? "" : "border-[1.5px] border-ui-line",
            )}
          >
            {d.done && <Check className="size-4" strokeWidth={2.4} />}
          </span>
        </button>
      ))}
    </div>
  );
}

function dayAria(d: ColonnadeProps["days"][number]) {
  const when = `${dayName(d.date)}, ${shortDate(d.date)}`;
  const parts = [when, d.kind === "rest" ? "Rest day" : d.label];
  if (d.done) parts.push("done");
  else if (d.missed) parts.push("not done");
  else if (d.today && d.kind === "train") parts.push("today");
  return parts.join(", ");
}

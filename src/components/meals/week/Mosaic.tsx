"use client";

import Link from "next/link";
import { Popover } from "radix-ui";
import { useRef, useState, type ReactNode } from "react";
import { Volleyball } from "@/components/art/icons";
import { Coin } from "@/components/ui/coin";
import { cn } from "@/lib/cn";
import { dayName, parseISODate, type ISODate } from "@/lib/dates";
import type { CoinStatus, MosaicRow } from "@/lib/fuel/mosaic";
import { formatClock, type Min } from "@/lib/prefs";
import { formatInt } from "@/lib/units";
import { MealIcon } from "../shared/RecipeGlyph";
import { recipeHref } from "../shared/RecipeCard";
import type { Recipe } from "@/lib/meals/types";

export interface MosaicCell {
  id: string;
  recipeKey: string;
  recipe: Recipe | undefined;
  name: string;
  kcal: number;
  protein: number;
  at: Min;
  status: CoinStatus;
  role?: string | null;
}

export interface MosaicDay {
  date: ISODate;
  /** Session name ("Push A"), or null on a rest day. */
  session: string | null;
  volleyball: boolean;
  /** Planned kcal as a share of the target (whole percent), or null. */
  percent: number | null;
  cells: Record<string, MosaicCell | undefined>; // by MosaicRow.key
}

const STATE_WORD: Record<CoinStatus, string> = { eaten: "eaten", changed: "eaten, portion changed", planned: "planned", missed: "not logged", next: "next" };
const LONG_PRESS_MS = 450;

/**
 * The week's table (docs/DESIGN-V2.md §3.5.2): 7 day columns × the plan's meal places, a 36 px coin
 * per meal with its own glyph. Eaten coins wear a beaded leaf rim (never a full gold face, so a
 * perfect week reads as rims); planned coins are ivory in relief; missed ones a dashed ui-line
 * rim with a "–"; the next one a leaf-line ring. Today's column is outlined. Tap a coin for the
 * recipe (long-press for a preview); tap a day's label to list that day below. Under 19rem of
 * container (AX text sizes) it becomes a list.
 */
export function Mosaic({
  rows,
  days,
  today,
  selected,
  onSelect,
  label,
  empty,
}: {
  rows: MosaicRow[];
  days: MosaicDay[];
  today: ISODate;
  selected: ISODate;
  onSelect: (d: ISODate) => void;
  label: string;
  empty?: boolean;
}) {
  const todayIdx = days.findIndex((d) => d.date === today);
  const selIdx = days.findIndex((d) => d.date === selected);
  return (
    <div className="@container">
      <div role="group" aria-label={label} className="-mx-2 @max-[19rem]:hidden">
        <div className="relative grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))]" style={{ gridTemplateRows: `auto repeat(${rows.length}, 2.875rem) auto` }}>
          {/* today's column, outlined; the selected day (when not today) a quiet well */}
          {selIdx >= 0 && selIdx !== todayIdx && (
            <span aria-hidden className="pointer-events-none mx-0.5 rounded-full bg-m2" style={{ gridColumn: selIdx + 2, gridRow: "1 / -1" }} />
          )}
          {todayIdx >= 0 && (
            <span
              aria-hidden
              className={cn("pointer-events-none mx-0.5 rounded-full shadow-[inset_0_0_0_1px_var(--leaf-line)]", selIdx === todayIdx && "bg-m2")}
              style={{ gridColumn: todayIdx + 2, gridRow: "1 / -1" }}
            />
          )}

          {/* day labels */}
          <span style={{ gridColumn: 1, gridRow: 1 }} />
          {days.map((d, i) => {
            const isToday = d.date === today;
            const on = d.date === selected;
            const eaten = rows.filter((r) => {
              const s = d.cells[r.key]?.status;
              return s === "eaten" || s === "changed";
            }).length;
            const planned = rows.filter((r) => d.cells[r.key]).length;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => onSelect(d.date)}
                aria-pressed={on}
                aria-label={`${dayName(d.date)} ${parseISODate(d.date).getDate()}${isToday ? ", today" : ""}${d.session ? `, ${d.session}` : ""}${d.volleyball ? ", volleyball" : ""}, ${planned ? `${eaten} of ${planned} eaten` : "nothing planned"}. Show the day`}
                className="press relative flex min-h-[4.25rem] flex-col items-center justify-start gap-0.5 pb-1.5 pt-2"
                style={{ gridColumn: i + 2, gridRow: 1 }}
              >
                <span className={cn("t-eyebrow", isToday ? "text-leaf-300" : on ? "text-ivory" : "text-ash")}>{dayName(d.date, true).slice(0, 1)}</span>
                <span className={cn("t-num-s leading-none", isToday ? "text-leaf-300" : on ? "text-ivory" : "text-stone")}>{parseISODate(d.date).getDate()}</span>
                <span className="t-tag mt-0.5 flex h-4 max-w-full items-center truncate text-ash normal-case tracking-normal">
                  {d.volleyball ? <Volleyball className="size-3.5" /> : d.session ? <span className="truncate">{d.session}</span> : null}
                </span>
              </button>
            );
          })}

          {/* the coins */}
          {rows.map((r, ri) => (
            <RowCells key={r.key} row={r} rowIndex={ri + 2} days={days} today={today} empty={empty} />
          ))}

          {/* planned kcal vs target */}
          <span className="t-tag self-center pl-1.5 text-ash" style={{ gridColumn: 1, gridRow: rows.length + 2 }}>
            Kcal
          </span>
          {days.map((d, i) => (
            <span key={d.date} className="flex flex-col items-center gap-1 px-1.5 pb-2.5 pt-2" style={{ gridColumn: i + 2, gridRow: rows.length + 2 }} aria-hidden>
              <span className="relative h-1 w-full overflow-hidden rounded-full bg-vein-2">
                {d.percent != null && <span className="absolute inset-y-0 left-0 rounded-full bg-ivory" style={{ width: `${Math.min(100, d.percent)}%` }} />}
              </span>
              <span className={cn("t-tag tnum normal-case tracking-normal", d.date === today ? "text-ivory" : "text-stone")}>{d.percent != null ? `${d.percent}%` : "—"}</span>
            </span>
          ))}
        </div>
      </div>
      <MosaicList rows={rows} days={days} today={today} label={label} />
    </div>
  );
}

function RowCells({ row, rowIndex, days, today, empty }: { row: MosaicRow; rowIndex: number; days: MosaicDay[]; today: ISODate; empty?: boolean }) {
  return (
    <>
      <span className="t-tag self-center whitespace-nowrap pl-1.5 text-ash" style={{ gridColumn: 1, gridRow: rowIndex }} aria-hidden>
        {row.short}
      </span>
      {days.map((d, i) => {
        const c = d.cells[row.key];
        return (
          <span key={d.date} className="grid place-items-center" style={{ gridColumn: i + 2, gridRow: rowIndex }}>
            {c ? (
              <CoinLink cell={c} day={d.date} row={row} past={d.date < today} />
            ) : empty ? (
              <span aria-hidden className="size-9 rounded-full border border-dashed border-vein-3" />
            ) : (
              <span aria-hidden className="size-1 rounded-full bg-vein-3" />
            )}
          </span>
        );
      })}
    </>
  );
}

/** A coin: tap for the recipe; hold for a preview (the day list below shows the same). */
function CoinLink({ cell, day, row, past }: { cell: MosaicCell; day: ISODate; row: MosaicRow; past: boolean }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const label = `${dayName(day)} ${row.spoken}, ${cell.name.replace(/&/g, "and")}, ${STATE_WORD[cell.status]}`;
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <Link
          href={recipeHref(cell.recipeKey, cell.id)}
          aria-label={label}
          className="press grid size-11 select-none place-items-center rounded-full [-webkit-touch-callout:none]"
          onPointerDown={() => {
            held.current = false;
            clear();
            timer.current = window.setTimeout(() => {
              held.current = true;
              setOpen(true);
            }, LONG_PRESS_MS);
          }}
          onPointerUp={clear}
          onPointerLeave={clear}
          onPointerCancel={clear}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => {
            if (held.current) {
              e.preventDefault();
              held.current = false;
            }
          }}
        >
          <Coin state={cell.status} glyph={<MealIcon recipe={cell.recipe} name={cell.name} />} size={36} past={past && (cell.status === "eaten" || cell.status === "changed")} />
        </Link>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          // the press that opened it ends on the coin: that is not a tap outside
          onFocusOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          collisionPadding={12}
          className="anim-pop z-(--z-confirm) w-[min(16rem,calc(100vw-32px))] rounded-field border border-vein-3 bg-m3 px-3.5 py-3 shadow-(--e3) outline-none"
        >
          <p className="t-eyebrow text-stone">
            {dayName(day, true)} · {formatClock(cell.at)} · {STATE_WORD[cell.status]}
          </p>
          <p className="t-title-3 mt-1 text-ivory">{cell.name}</p>
          <p className="t-meta tnum mt-0.5 text-stone">
            {formatInt(cell.kcal)} kcal · {Math.round(cell.protein)} g protein
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** AX fallback: day sections, each with its meal rows (glyph, name, state word). */
function MosaicList({ rows, days, today, label }: { rows: MosaicRow[]; days: MosaicDay[]; today: ISODate; label: string }) {
  return (
    <div className="hidden @max-[19rem]:block" role="group" aria-label={label}>
      {days.map((d) => {
        const cells = rows.map((r) => ({ r, c: d.cells[r.key] })).filter((x): x is { r: MosaicRow; c: MosaicCell } => !!x.c);
        return (
          <section key={d.date} className="border-t border-vein py-3 first:border-t-0">
            <h3 className={cn("t-eyebrow mb-1", d.date === today && "text-leaf-300")}>
              {dayName(d.date)} {parseISODate(d.date).getDate()}
              {d.session ? ` · ${d.session}` : ""}
              {d.percent != null ? ` · ${d.percent}%` : ""}
            </h3>
            {cells.length ? (
              <ul>
                {cells.map(({ r, c }) => (
                  <li key={r.key}>
                    <Link href={recipeHref(c.recipeKey, c.id)} className="press-soft flex min-h-12 items-center gap-3">
                      <Coin state={c.status} glyph={<MealIcon recipe={c.recipe} name={c.name} />} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="t-callout block text-ivory">{c.name}</span>
                        <span className="t-meta block text-stone">
                          {r.spoken} · {STATE_WORD[c.status]}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-meta text-stone">Nothing planned</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function MosaicLegend({ className }: { className?: string }): ReactNode {
  return (
    <p className={cn("t-meta flex flex-wrap items-center gap-x-4 gap-y-2 text-stone", className)} aria-hidden>
      <span className="inline-flex items-center gap-1.5">
        <Coin state="eaten" size={16} /> eaten
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Coin state="planned" size={16} /> planned
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Coin state="missed" size={16} /> not logged
      </span>
    </p>
  );
}

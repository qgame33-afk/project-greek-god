"use client";

import { BookmarkCheck, ChevronDown, ImageIcon, MessagesSquare, ScanLine } from "lucide-react";
import { useState, type ReactNode } from "react";
import { TrainColumn } from "@/components/art/icons";
import { EatenButton, eatenSpoken, useEatenChanged, type EatenMeal } from "@/components/meals/shared/EatenButton";
import { MealIcon } from "@/components/meals/shared/RecipeGlyph";
import { DatabaseBadge, SourceBadge } from "@/components/ui/badge";
import { Coin, type CoinState } from "@/components/ui/coin";
import { Collapse, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useSignedUrls } from "@/lib/data/body";
import type { FoodEntry } from "@/lib/data/nutrition";
import { dayName, shortDate, type ISODate } from "@/lib/dates";
import { ifYouAdd } from "@/lib/fuel/consequence";
import type { MacroTotals, TimelineRow } from "@/lib/fuel/timeline";
import { fractionText } from "@/lib/meals/recipe";
import type { MealRole } from "@/lib/now/meal-times";
import { formatAmount } from "@/lib/nutrition-ui/format";
import { groupLabel, provenanceOf } from "@/lib/nutrition-ui/provenance";
import { formatClock } from "@/lib/prefs";
import { formatInt } from "@/lib/units";
import { PlannedMenu } from "./PlannedMenu";
import type { FuelPlanned } from "./useFuelDay";

type Row = TimelineRow<FoodEntry, FuelPlanned>;

const ROLE_WORD: Partial<Record<MealRole, string>> = { pre: "pre-workout", post: "post-workout" };

/**
 * Fuel → Today's timeline (docs/DESIGN-V2.md §3.5.1): what he ate (coins with a leaf rim) and
 * what is planned (hollow coins) in one time-ordered list on a hairline spine, the NOW line
 * between them, the session as a block. The due planned meal is a slab whose Eaten is the
 * screen's one gold key, with the consequence line under it. Tap an eaten row to edit it; tap a
 * planned meal's name for its menu (Eaten but changed, swap, recipe, cook, remove).
 *
 * Layout: a 56 px time column, the coin, the row. Under 19rem of container (a phone's column at
 * AX text sizes) the time moves above each row as an eyebrow.
 */
export function Timeline({
  rows,
  eaten,
  date,
  today,
  isToday,
  onEdit,
  onRemoveGroup,
}: {
  rows: Row[];
  eaten: MacroTotals;
  date: ISODate;
  today: ISODate;
  isToday: boolean;
  onEdit: (e: FoodEntry) => void;
  onRemoveGroup: (entries: FoodEntry[]) => void;
}) {
  const [menu, setMenu] = useState<{ id: string | null; open: boolean }>({ id: null, open: false });
  const menuRow = rows.find((r): r is Extract<Row, { kind: "planned" }> => r.kind === "planned" && r.planned.id === menu.id) ?? null;
  const menuMeal = menuRow ? toEaten(menuRow.planned, menuRow.at) : null;
  const changed = useEatenChanged(menuMeal ?? EMPTY_MEAL);

  const clocks = timeMarks(rows);
  return (
    <div className="@container">
      <ol
        className={cn(
          "relative [--spine:calc(3.5rem+0.75rem+20px)] @max-[19rem]:[--spine:20px]",
          // the spine: one hairline through every coin, first to last
          "before:absolute before:bottom-8 before:left-(--spine) before:top-8 before:w-px before:-translate-x-1/2 before:bg-vein-2 before:content-['']",
        )}
        aria-label={isToday ? "Today's meals, in time order" : `Meals on ${dayName(date)} ${shortDate(date, today)}`}
      >
        {rows.map((r, i) => {
          if (r.kind === "now") return <NowLine key={r.key} at={r.at} />;
          const { hm, ap, showTime, showAp } = clocks[i];
          const due = r.kind === "planned" && r.due;
          return (
            <li key={r.key} className={cn("relative grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 @max-[19rem]:grid-cols-1", due ? "my-2" : "")}>
              <span aria-hidden className={cn("text-right @max-[19rem]:hidden", due ? "pt-5" : "pt-3")}>
                {showTime && (
                  <>
                    <span className="t-num-s block text-stone">{hm}</span>
                    {showAp && <span className="t-tag mt-1 block text-ash">{ap}</span>}
                  </>
                )}
              </span>
              <div className="min-w-0">
                {showTime && <span className="t-eyebrow mt-3 hidden @max-[19rem]:block">{formatClock(r.at)}</span>}
                <span className="sr-only">{formatClock(r.at)}, </span>
                {r.kind === "eaten" && <EatenRow row={r} onEdit={onEdit} />}
                {r.kind === "group" && <GroupRow row={r} onEdit={onEdit} onRemove={onRemoveGroup} />}
                {r.kind === "elsewhere" && <ElsewhereRow row={r} today={today} />}
                {r.kind === "session" && <SessionRow row={r} />}
                {r.kind === "planned" && (
                  <PlannedRow
                    row={r}
                    eaten={eaten}
                    onMenu={() => setMenu({ id: r.planned.id, open: true })}
                    onChanged={() => {
                      setMenu({ id: r.planned.id, open: false });
                      changed.setOpen(true);
                    }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <PlannedMenu
        meal={menuRow?.planned ?? null}
        at={menuRow?.at ?? null}
        open={menu.open}
        onOpenChange={(o) => setMenu((m) => ({ ...m, open: o }))}
        canSwap={isToday}
        onChanged={() => changed.setOpen(true)}
      />
      {changed.sheet}
    </div>
  );
}

/** Each row's clock: the time only when it differs from the row above, AM/PM only when it changes. */
function timeMarks(rows: Row[]) {
  let lastAp: string | null = null;
  let lastAt: number | null = null;
  return rows.map((r) => {
    const [hm, ap] = formatClock(r.at).split(" ");
    if (r.kind === "now") return { hm, ap, showTime: false, showAp: false };
    const mark = { hm, ap, showTime: r.at !== lastAt, showAp: ap !== lastAp };
    lastAp = ap;
    lastAt = r.at;
    return mark;
  });
}

const EMPTY_MEAL: EatenMeal = { id: "", slot: "lunch", local_date: "", servings: 1, recipe: null, name: "", kcal: 0, protein: 0 };

function toEaten(p: FuelPlanned, at: number): EatenMeal {
  return { id: p.id, slot: p.slot, local_date: p.local_date, servings: p.servings, recipe: p.recipe, name: p.name, kcal: p.kcal, protein: p.protein, at };
}

/** The coin on the spine (a night disc behind it hides the hairline). */
function CoinCell({ state, glyph, past, on = "night" }: { state: CoinState; glyph: ReactNode; past?: boolean; on?: "night" | "m2" }) {
  return (
    <span className={cn("relative grid size-10 shrink-0 place-items-center rounded-full", on === "m2" ? "bg-m2" : "bg-night")}>
      <Coin state={state} glyph={glyph} size={40} past={past} />
    </span>
  );
}

/** Coin + text, top-aligned with the time. */
function RowFrame({ coin, children, className }: { coin: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-16 items-start gap-3 py-2", className)}>
      {coin}
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </div>
  );
}

function provenance(e: FoodEntry): ReactNode {
  if (e.source === "meal_plan" || e.planned_meal_id) return null;
  const p = provenanceOf(e);
  if (!p) return <Tag kind="LOG" />;
  if (p.kind === "estimate") return <Tag kind="AI" detail="estimate" />;
  if (p.kind === "calc") return <Tag kind="CALC" />;
  if (p.kind === "source") return <SourceBadge name={p.name} url={p.url} />;
  return <DatabaseBadge name={p.short} />;
}

function EatenRow({ row, onEdit }: { row: Extract<Row, { kind: "eaten" }>; onEdit: (e: FoodEntry) => void }) {
  const e = row.entry;
  const fromPlan = !!row.planned || e.source === "meal_plan" || !!e.planned_meal_id;
  const word = fromPlan ? (row.changed ? "portion changed" : "as planned") : "added";
  const amount = e.unit === "serving" ? (Number(e.amount) === 1 ? null : `×${fractionText(Number(e.amount))}`) : formatAmount(Number(e.amount), e.unit);
  return (
    <button
      type="button"
      onClick={() => onEdit(e)}
      className="press-soft block w-full text-left"
      aria-label={`${e.name}, ${formatInt(Number(e.calories))} calories, ${Math.round(Number(e.protein_g))} grams protein, ${word}. Edit`}
    >
      <RowFrame coin={<CoinCell state={row.changed ? "changed" : "eaten"} glyph={<MealIcon recipe={row.planned?.recipe ?? null} name={e.name} />} />}>
        <span className="t-title-3 block text-ivory [overflow-wrap:anywhere]">
          {e.name}
          {amount && <span className="t-callout ml-1.5 whitespace-nowrap text-stone">{amount}</span>}
        </span>
        <span className="t-meta mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-stone">
          <span className="tnum">
            {formatInt(Number(e.calories))} kcal · {Math.round(Number(e.protein_g))} g · {word}
          </span>
          {provenance(e)}
        </span>
      </RowFrame>
    </button>
  );
}

const GROUP_ICON: Record<string, ReactNode> = {
  photo_ai: <ScanLine />,
  chat_ai: <MessagesSquare />,
  assistant_handoff: <MessagesSquare />,
  saved_meal: <BookmarkCheck />,
};

function GroupRow({ row, onEdit, onRemove }: { row: Extract<Row, { kind: "group" }>; onEdit: (e: FoodEntry) => void; onRemove: (entries: FoodEntry[]) => void }) {
  const [open, setOpen] = useState(false);
  const src = row.entries[0].source;
  const label = groupLabel(src);
  const photo = row.entries.find((e) => e.photo_path)?.photo_path ?? null;
  const ai = src === "photo_ai" || src === "chat_ai";
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="press-soft block w-full text-left">
        <RowFrame coin={<CoinCell state="eaten" glyph={GROUP_ICON[src] ?? <MealIcon name={row.entries[0].name} />} />}>
          <span className="flex items-start gap-2">
            <span className="t-title-3 min-w-0 flex-1 text-ivory">
              {label} <span className="t-callout whitespace-nowrap text-stone">· {row.entries.length} items</span>
            </span>
            <ChevronDown className={cn("mt-1 size-4 shrink-0 text-ash transition-transform duration-(--dur-fast)", open && "rotate-180")} strokeWidth={1.6} aria-hidden />
          </span>
          <span className="t-meta mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-stone">
            <span className="tnum">
              {formatInt(row.totals.kcal)} kcal · {Math.round(row.totals.protein)} g · added
            </span>
            {ai ? <Tag kind="AI" detail="estimate" /> : <Tag kind="LOG" />}
          </span>
        </RowFrame>
      </button>
      <Collapse open={open}>
        <ul className="mb-2 ml-[3.25rem] border-l border-vein pl-3">
          {row.entries.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onEdit(e)} className="press-soft flex min-h-12 w-full items-center gap-3 text-left" aria-label={`${e.name}, ${formatInt(Number(e.calories))} calories. Edit`}>
                <span className="t-callout min-w-0 flex-1 truncate text-ivory">{e.name}</span>
                <span className="t-meta tnum shrink-0 text-stone">
                  {formatInt(Number(e.calories))} kcal · {Math.round(Number(e.protein_g))} g
                </span>
              </button>
            </li>
          ))}
          <li className="flex items-center gap-2 pt-1">
            {photo && <GroupPhoto path={photo} label={label.toLowerCase()} />}
            <button
              type="button"
              onClick={() => onRemove(row.entries)}
              className="press t-callout inline-flex h-11 items-center px-1 font-semibold text-stone hover:text-ivory"
              aria-label={`Remove all ${row.entries.length} items from this ${label.toLowerCase()}`}
            >
              Remove all
            </button>
          </li>
        </ul>
      </Collapse>
    </div>
  );
}

/** The private photo a scanned meal was saved with: tap to see it full size. */
function GroupPhoto({ path, label }: { path: string; label: string }) {
  const urls = useSignedUrls("meal-photos", [path]);
  const url = urls.data?.[path];
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="press t-callout inline-flex h-11 items-center gap-2 px-1 font-semibold text-stone hover:text-ivory">
        <span className="grid size-8 place-items-center overflow-hidden rounded-field bg-m3 shadow-[inset_0_0_0_1px_var(--vein-2)]">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private photo
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-4 text-ash" strokeWidth={1.6} aria-hidden />
          )}
        </span>
        Photo
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Meal photo" description="Saved privately. Only you can see it.">
        <div className="pb-4 pt-2">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private photo
            <img src={url} alt={`Photo of this ${label}`} className="max-h-[70dvh] w-full rounded-card object-contain shadow-[inset_0_0_0_1px_var(--vein-2)]" />
          ) : urls.isError ? (
            <p className="t-callout py-8 text-center text-stone">The photo couldn&apos;t be loaded.</p>
          ) : (
            <Skeleton className="aspect-[4/3] w-full rounded-card" />
          )}
        </div>
      </Sheet>
    </>
  );
}

function ElsewhereRow({ row, today }: { row: Extract<Row, { kind: "elsewhere" }>; today: ISODate }) {
  const p = row.planned;
  return (
    <RowFrame coin={<CoinCell state="eaten" past glyph={<MealIcon recipe={p.recipe} name={p.name} />} />}>
      <span className="t-title-3 block text-ivory">{p.name}</span>
      <span className="t-meta mt-0.5 block text-stone">
        Logged {row.loggedOn === today ? "today" : `${dayName(row.loggedOn)} ${shortDate(row.loggedOn, today)}`} · counted there
      </span>
    </RowFrame>
  );
}

function SessionRow({ row }: { row: Extract<Row, { kind: "session" }> }) {
  return (
    <div className="flex min-h-16 items-center gap-3 py-2">
      <span className="relative grid size-10 shrink-0 place-items-center rounded-field bg-m3 text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]">
        <TrainColumn className="size-5" />
      </span>
      <span
        className="min-w-0 flex-1 rounded-btn bg-m1 px-4 py-2.5 shadow-[inset_0_0_0_1px_var(--vein-2)]"
        style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--vein) 0 1.5px, transparent 1.5px 7px)" }}
      >
        <span className="t-title-3 block text-ivory">{row.name}</span>
        <span className="t-meta block text-stone">
          {row.done ? `Sealed${row.durationMin ? ` · ${row.durationMin} min` : ""}` : row.durationMin ? `~${row.durationMin} min` : "Today's session"}
        </span>
      </span>
    </div>
  );
}

/**
 * A planned meal: the name (full width) opens its menu; under it the macros + PLAN and, on the
 * right, Eaten (72×44). The due one is a slab with the gold Eaten and the consequence line.
 */
function PlannedRow({ row, eaten, onMenu, onChanged }: { row: Extract<Row, { kind: "planned" }>; eaten: MacroTotals; onMenu: () => void; onChanged: () => void }) {
  const p = row.planned;
  const missed = row.state === "missed";
  const role = ROLE_WORD[row.role];
  const meal = toEaten(p, row.at);
  const coin: CoinState = missed ? "missed" : row.due ? "next" : "planned";
  const consequence = row.due ? ifYouAdd({ kcal: eaten.kcal, protein: eaten.protein }, { kcal: p.kcal, protein: p.protein }) : null;
  const eyebrow = [row.due ? "Next" : null, role].filter(Boolean).join(" · ");
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className={cn(row.due && "relative -ml-2 rounded-card bg-m2 pb-3 pl-2 pr-3 shadow-[inset_0_0_0_1px_var(--leaf-line),var(--e2)]")}>
      <RowFrame coin={<CoinCell state={coin} on={row.due ? "m2" : "night"} glyph={<MealIcon recipe={p.recipe} name={p.name} />} />} className={row.due ? "pt-3" : undefined}>
        <div className="relative">
          <button
            type="button"
            onClick={onMenu}
            aria-haspopup="dialog"
            aria-label={`${formatClock(row.at)}, ${eatenSpoken(meal)}, ${missed ? "not logged" : "planned"}${role ? `, ${role}` : ""}. Options`}
            className="press-soft block w-full text-left"
          >
            {eyebrow && <span className={cn("t-eyebrow mb-1 block", row.due && "text-leaf-300")}>{eyebrow}</span>}
            <span className={cn("t-title-3 block [overflow-wrap:anywhere]", missed ? "text-stone" : "text-ivory")}>
              {p.name}
              {p.servings !== 1 && <span className="t-callout ml-1.5 whitespace-nowrap text-stone">×{fractionText(p.servings)}</span>}
            </span>
            <span className="t-meta flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 pr-[5.5rem] text-stone @max-[19rem]:min-h-0 @max-[19rem]:pr-0 @max-[19rem]:pt-1">
              <span className="tnum whitespace-nowrap">
                {formatInt(p.kcal)} kcal · {Math.round(p.protein)} g
              </span>
              <span className="inline-flex items-center gap-2">
                <Tag kind="PLAN" />
                {missed && <span className="whitespace-nowrap">not logged</span>}
              </span>
            </span>
          </button>
          <EatenButton meal={meal} gold={row.due} onChanged={onChanged} onNote={setNote} className="absolute bottom-0 right-0 @max-[19rem]:static @max-[19rem]:mt-1.5 @max-[19rem]:items-start" />
        </div>
        {note && (
          <p role="status" className="t-meta mt-1.5 text-right text-stone @max-[19rem]:text-left">
            {note}
          </p>
        )}
        {consequence && (
          <p className="t-meta mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-stone">
            <span aria-label={consequence.spoken}>{consequence.text}</span>
            <Tag kind="CALC" explain={consequence.explain} />
          </p>
        )}
      </RowFrame>
    </div>
  );
}

function NowLine({ at }: { at: number }) {
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 py-2 @max-[19rem]:grid-cols-1" aria-label={`Now, ${formatClock(at)}`}>
      <span aria-hidden className="@max-[19rem]:hidden" />
      <span className="flex items-center gap-3" aria-hidden>
        <span className="grid w-10 shrink-0 place-items-center">
          <span className="size-2.5 rotate-45 bg-leaf-300 shadow-[0_0_0_4px_var(--night)]" />
        </span>
        <span className="t-eyebrow shrink-0 text-leaf-300">Now · {formatClock(at)}</span>
        <span className="h-px flex-1 bg-leaf-line" />
      </span>
    </li>
  );
}

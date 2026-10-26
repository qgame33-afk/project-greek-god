"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bed, Check, ChevronRight, Dumbbell, Footprints, Moon, Scale, Utensils } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { RecipeGlyph } from "@/components/meals/shared/RecipeGlyph";
import { useEatenChanged, useEatPlanned } from "@/components/meals/shared/EatenButton";
import { openOffering } from "@/components/offering/store";
import { OptionsToday, useTodayOptions } from "@/components/training/OptionsToday";
import { RestIdeas } from "@/components/training/RestIdeas";
import { useLiveSession } from "@/components/workout/data";
import { useClockSec } from "@/components/workout/rest";
import { useRest } from "@/components/workout/stores";
import { UpNextCard } from "@/components/ui/up-next";
import { addDays, dayName, type ISODate } from "@/lib/dates";
import { DAY_START, SEAL_FROM, type DayState } from "@/lib/now/day-engine";
import { formatClock as clock } from "@/lib/prefs";
import { templateLabels } from "@/lib/training/programs";
import { formatClock, remainingSec } from "@/lib/workout/rest";
import { keys, writeLocal } from "./local";
import type { NowMeal, NowModel } from "./useNowData";

/* ---------------------------------------------------------------- layout */

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
/**
 * The AX layout (§1.2.2): the page column is narrower than 18rem at the current text size. The
 * Up next button then moves under its text.
 */
export function useAxLayout(): boolean {
  return useSyncExternalStore(
    subscribeResize,
    () => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      return (Math.min(window.innerWidth, 560) - 40) / root < 18;
    },
    () => false,
  );
}

const lifts = (n: number) => `${n} ${n === 1 ? "lift" : "lifts"}`;

/** "Chest & Back B", or "Rest day", for a date's plan. */
function planShort(m: NowModel, d: ISODate): string {
  const t = m.resolve(d).template;
  return t ? templateLabels(t).short : "Rest day";
}

/**
 * Up next (docs/DESIGN-V3-SIMPLE.md §4.1.2): the Day Engine's next action as one card, never blank.
 * Copy and actions per `next.kind`; a rest day with nothing else due shows "Rest and recovery" with
 * the rest-day ideas; a workout day with Options for today adds "· 1 change suggested" and the
 * card body opens that sheet (Start always starts as planned).
 */
export function UpNext({ m, state, now, sealDate, onCheckin, onWeigh }: { m: NowModel; state: DayState; now: number; sealDate: ISODate; onCheckin: () => void; onWeigh: () => void }) {
  const ax = useAxLayout();
  const router = useRouter();
  const opts = useTodayOptions();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [ideas, setIdeas] = useState(false);
  const next = state.next;
  const night = now < DAY_START;
  const closing = dayName(sealDate);

  const seal = () => writeLocal(keys.sealed(sealDate), new Date().toISOString());

  let card: React.ReactNode = null;
  switch (next.kind) {
    case "checkin":
      card = <UpNextCard icon={Bed} title="Check-in" subtitle="3 quick questions" action={{ label: "Start", onClick: onCheckin, ariaLabel: "Start the check-in" }} stack={ax} />;
      break;
    case "weighin":
      // no weight is printed here: the last one lives in the sheet
      card = <UpNextCard icon={Scale} title="Weigh in" subtitle="Before breakfast" action={{ label: "Log", onClick: onWeigh, ariaLabel: "Log your weight" }} stack={ax} />;
      break;
    case "begin": {
      const t = m.template;
      if (!t) break;
      const n = t.exercises.filter((e) => !e.optional).length;
      const lighter = m.mode === "intro" || m.mode === "deload" ? " · lighter" : "";
      const minutes = m.durationMin ? ` · about ${m.durationMin} min` : "";
      const changes = opts.summary ? ` · ${opts.summary}` : "";
      card = (
        <UpNextCard
          icon={Dumbbell}
          title={t.name}
          dataName
          subtitle={`${lifts(n)}${minutes}${lighter}${changes}`}
          onBody={opts.summary ? () => setOptionsOpen(true) : undefined}
          bodyLabel={opts.summary ? `${t.name}, ${lifts(n)}${minutes}. ${opts.summary}. Opens options for today` : undefined}
          action={{ label: "Start", href: `/workout/start?t=${encodeURIComponent(t.key)}`, ariaLabel: `Start ${t.name}` }}
          stack={ax}
        />
      );
      break;
    }
    case "return":
      if (m.active) card = <ReturnCard m={m} stack={ax} />;
      break;
    case "eat": {
      const meal = m.meals.find((x) => x.id === next.mealId);
      if (meal) card = <EatCard key={meal.id} meal={meal} blocked={m.foodFailed} stack={ax} onBody={meal.recipe ? () => router.push(`/nutrition/meals/recipe/${encodeURIComponent(meal.recipe!.key)}?meal=${meal.id}&servings=${meal.servings}`) : undefined} />;
      break;
    }
    case "log_food":
      card = <UpNextCard icon={Utensils} title="Log food" subtitle="Nothing planned right now" action={{ label: "Add", onClick: () => openOffering({ mode: "log" }), ariaLabel: "Add food" }} stack={ax} />;
      break;
    case "seal":
      card = night ? (
        <UpNextCard icon={Moon} title={`${closing} is done`} subtitle={`Sleep well. Today: ${planShort(m, m.today)}`} action={{ label: `Close ${closing}`, variant: "secondary", onClick: seal }} stack />
      ) : (
        <UpNextCard icon={Moon} title="Day done" subtitle={`Tomorrow: ${planShort(m, addDays(m.today, 1))}`} action={{ label: "Done for today", variant: "secondary", onClick: seal }} stack />
      );
      break;
    case "none": {
      const tomorrow = m.resolve(addDays(m.today, 1)).template;
      const at = tomorrow && m.trainAt != null ? ` · ${clock(m.trainAt)}` : "";
      card = night ? (
        <UpNextCard icon={Moon} title={`${closing} is done`} subtitle="Sleep well." />
      ) : (
        <UpNextCard icon={Moon} title="Day done" subtitle={`Tomorrow: ${planShort(m, addDays(m.today, 1))}${at}`} />
      );
      break;
    }
  }

  // a rest day with nothing else due before the evening: rest and the ideas
  const restDay = !m.template && !m.active && !m.doneToday;
  if (restDay && now >= DAY_START && now < SEAL_FROM && (next.kind === "log_food" || next.kind === "none"))
    card = <UpNextCard icon={Footprints} title="Rest and recovery" subtitle="Nothing to lift today" action={{ label: "Ideas", variant: "secondary", onClick: () => setIdeas(true), ariaLabel: "Rest day ideas" }} stack={ax} />;

  return (
    <>
      {card ?? <UpNextCard icon={Utensils} title="Log food" subtitle="Nothing planned right now" action={{ label: "Add", onClick: () => openOffering({ mode: "log" }) }} stack={ax} />}
      <OptionsToday open={optionsOpen} onOpenChange={setOptionsOpen} options={opts} />
      <RestIdeas open={ideas} onOpenChange={setIdeas} />
    </>
  );
}

/** A live workout: "Rest 1:12 · set 5 of 19" (ticking) and the gold Return. The workout bar steps aside. */
function ReturnCard({ m, stack }: { m: NowModel; stack: boolean }) {
  const s = m.active!;
  const live = useLiveSession(s.id);
  const rest = useRest(s.id);
  const nowSec = useClockSec();
  const sets = (live.data?.sets ?? []).filter((x) => x.kind !== "warmup");
  const done = sets.filter((x) => x.completed).length;
  const rem = rest ? remainingSec(rest, nowSec) : null;
  const parts = [rem != null && rem > 0 ? `Rest ${formatClock(rem)}` : null, sets.length ? (done >= sets.length ? "all sets logged" : `set ${done + 1} of ${sets.length}`) : null].filter(Boolean) as string[];
  const sub = parts.length ? parts.join(" · ") : "Every set is saved";
  return (
    <UpNextCard
      icon={Dumbbell}
      title={s.name}
      dataName
      subtitle={sub.charAt(0).toUpperCase() + sub.slice(1)}
      action={{ label: "Return", href: `/workout/${s.id}`, ariaLabel: `Return to ${s.name}` }}
      resume
      stack={stack}
    />
  );
}

/** The next planned meal: its glyph, name and "3:00 PM · 30 g protein", and the gold Eaten (idempotent, Undo). */
function EatCard({ meal, blocked, stack, onBody }: { meal: NowMeal; blocked: boolean; stack: boolean; onBody?: () => void }) {
  const changed = useEatenChanged(meal);
  const [note, setNote] = useState<string | null>(null);
  const eat = useEatPlanned(meal, () => changed.setOpen(true), setNote);
  return (
    <>
      <UpNextCard
        icon={<RecipeGlyph recipe={meal.recipe} size="lg" className="bg-transparent" />}
        title={<span data-food="">{meal.name}</span>}
        dataName
        subtitle={note ?? `${clock(meal.at)} · ${Math.round(meal.protein)} g protein`}
        onBody={onBody}
        bodyLabel={`${meal.name}, ${clock(meal.at)}, ${Math.round(meal.protein)} grams protein. Opens the recipe`}
        action={{
          label: "Eaten",
          onClick: eat.eat,
          disabled: eat.disabled || blocked,
          loading: eat.pending,
          ariaLabel: `Mark ${meal.name.replace(/&/g, "and")} as eaten, ${Math.round(meal.kcal)} calories, ${Math.round(meal.protein)} grams protein`,
        }}
        stack={stack}
      />
      {changed.sheet}
    </>
  );
}

/** After a finished workout, until midnight: "Workout done · 58 min · 19 sets · 1 new best" → the summary. */
export function WorkoutDoneCard({ m }: { m: NowModel }) {
  const s = m.doneToday;
  if (!s) return null;
  const mins = s.started_at && s.ended_at ? Math.max(1, Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60000)) : null;
  const bests = m.sessionRecords;
  const parts = [mins ? `${mins} min` : null, `${s.sets_completed ?? 0} sets`].filter(Boolean).join(" · ");
  const best = bests ? `${bests} new ${bests === 1 ? "best" : "bests"}` : null;
  return (
    <Link
      href={`/workout/${s.id}`}
      aria-label={`Workout done, ${s.name}: ${parts}${best ? `, ${best}` : ""}. Opens the summary`}
      className="press-soft flex min-h-[76px] items-center gap-3.5 rounded-card bg-surface p-4"
    >
      <span aria-hidden className="grid size-[52px] shrink-0 place-items-center rounded-tile bg-control text-fg">
        <Check className="size-6" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-row block">Workout done</span>
        <span className="t-label mt-[3px] block truncate">
          {parts}
          {best && (
            <>
              {" · "}
              <span className="font-semibold text-gold">{best}</span>
            </>
          )}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
    </Link>
  );
}

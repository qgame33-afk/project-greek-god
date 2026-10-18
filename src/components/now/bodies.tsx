"use client";

import Link from "next/link";
import { ViewTransition, useMemo, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { FuelAmphora, LaurelSprig, SealTick, Volleyball } from "@/components/art/icons";
import { openOffering } from "@/components/offering/store";
import { useLiveSession } from "@/components/workout/data";
import { useClockSec } from "@/components/workout/rest";
import { useRest } from "@/components/workout/stores";
import { Button } from "@/components/ui/button";
import { Coin } from "@/components/ui/coin";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/dates";
import { formatClock as clock } from "@/lib/prefs";
import type { Guidance } from "@/lib/recovery/guidance";
import { keyLift, readinessChip, restDayWords, sleepShort } from "@/lib/today/now";
import { restDayRecommendations } from "@/lib/today/recovery-recs";
import { formatClock, remainingSec } from "@/lib/workout/rest";
import { formatInt, formatLoad, round, toDisplayWeight } from "@/lib/units";
import { MealAction, mealSpoken } from "./MealAction";
import type { NowMeal, NowModel } from "./useNowData";

/* ------------------------------------------------------------------ parts */

export function CardHead({
  eyebrow,
  right,
  title,
  titleId,
  sub,
  small,
}: {
  eyebrow: ReactNode;
  right?: ReactNode;
  title: ReactNode;
  titleId: string;
  sub?: ReactNode;
  /** A short phone: a long meal name as a section title, so the gold control stays in view. */
  small?: boolean;
}) {
  return (
    <div>
      <div className="flex min-h-5 items-center justify-between gap-3">
        <p className="t-eyebrow truncate">{eyebrow}</p>
        {right}
      </div>
      <h2 id={titleId} className={cn(small ? "t-title-2" : "t-title-1", "mt-1.5 text-ivory [overflow-wrap:anywhere]")}>
        {title}
      </h2>
      {sub && <div className="t-callout mt-1.5 text-stone">{sub}</div>}
    </div>
  );
}

/** "If you eat it: 2,520 kcal · 151 g" (CALC): today's logged food plus this meal. */
export function Consequence({ m, meal, verb = "eat" }: { m: NowModel; meal: Pick<NowMeal, "kcal" | "protein">; verb?: string }) {
  if (m.foodFailed) return null;
  const kcal = Math.round(m.food.calories + meal.kcal);
  const g = Math.round(m.food.protein + meal.protein);
  return (
    <p className="t-meta tnum flex flex-wrap items-center gap-x-1.5 gap-y-1 text-stone">
      <span>
        If you {verb} it: <span className="text-ivory">{formatInt(kcal)} kcal</span> · <span className="text-ivory">{g} g</span>
      </span>
      <Tag kind="CALC" explain={`${formatInt(Math.round(m.food.calories))} kcal and ${Math.round(m.food.protein)} g logged today + ${formatInt(meal.kcal)} kcal and ${Math.round(meal.protein)} g planned.`} />
    </p>
  );
}

/** A planned meal as one row: coin, name, its time and planned macros, and Eaten. */
export function MealRow({ meal, now, className }: { meal: NowMeal; now: number; className?: string }) {
  const past = !meal.eaten && meal.at + 120 < now;
  return (
    <div className={cn("flex min-h-16 items-center gap-3", className)}>
      <Coin state={meal.eaten ? "eaten" : past ? "missed" : "planned"} glyph={<FuelAmphora />} size={40} />
      <div className="min-w-0 flex-1">
        <p className="t-title-3 line-clamp-2 text-ivory">{meal.name}</p>
        <p className="t-meta tnum mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ash">
          <span>
            <span className="text-stone">{clock(meal.at).toLowerCase()}</span>
            {past ? " · not logged" : ""} · {formatInt(meal.kcal)}&nbsp;kcal · {Math.round(meal.protein)}&nbsp;g
          </span>
          {!meal.eaten && <Tag kind="PLAN" />}
        </p>
      </div>
      <MealAction meal={meal} compact />
    </div>
  );
}

function ReadyChip({ g, templateKey, at }: { g: Guidance | null; templateKey: string | null; at: string | null }) {
  const label = readinessChip(g, templateKey);
  if (!label)
    return (
      <Link href="/?dawn=1" className="t-meta -my-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 text-stone underline decoration-ui-line underline-offset-4">
        Readiness · check in
      </Link>
    );
  const ok = g?.level === "go";
  return (
    <span className="t-meta inline-flex shrink-0 items-center gap-1.5 font-semibold text-ivory" aria-label={`${label}${at ? `, check-in ${at}` : ""}`}>
      <span aria-hidden className={cn("size-1.5 rounded-full", ok ? "bg-ivory" : "bg-stone")} />
      {label}
    </span>
  );
}

const lifts = (n: number) => `${n} ${n === 1 ? "lift" : "lifts"}`;

/* ------------------------------------------------------------------ train */

export function TrainBody({
  m,
  guidance,
  now,
  starting,
  onBegin,
  titleId,
  pre,
}: {
  m: NowModel;
  guidance: Guidance | null;
  now: number;
  starting: boolean;
  onBegin: () => void;
  titleId: string;
  pre: NowMeal | null;
}) {
  const t = m.template!;
  const show = (lb: number) => formatLoad(lb, m.unit, false);
  const key = useMemo(() => keyLift(t, m.history, m.mode, show), [t, m.history, m.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = m.trainAt;
  const eyebrow = at == null ? "Today's session" : now < at ? `Next · ${clock(at)}` : `Planned · ${clock(at)}`;
  const checkinAt = m.todayRec?.updated_at ? new Date(m.todayRec.updated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <>
      <CardHead
        eyebrow={eyebrow}
        right={<ReadyChip g={guidance} templateKey={t.key} at={checkinAt} />}
        titleId={titleId}
        title={
          <span className="flex items-end justify-between gap-3">
            <ViewTransition name="session-title">
              <span className="min-w-0">{t.name}</span>
            </ViewTransition>
            <span className="t-meta tnum mb-1 shrink-0 text-right font-sans not-italic text-stone">
              {m.durationMin ? <span className="block">~{m.durationMin} min</span> : null}
              <span className="block">
                {lifts(t.exercises.length)} · {m.setCount} sets
              </span>
            </span>
          </span>
        }
        sub={
          m.volleyballToday ? (
            <span className="text-ivory">
              <Volleyball className="inline size-4 align-[-3px]" /> Volleyball today · fuel both
            </span>
          ) : undefined
        }
      />
      {key && (
        <div className="mt-3 flex items-center gap-3 rounded-field bg-m1 px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--vein)]">
          <div className="min-w-0 flex-1">
            <p className="t-title-3 truncate text-ivory">{key.name}</p>
            <p className="t-meta tnum mt-0.5 flex items-center gap-1.5 text-ash">
              <span className="truncate">{key.from ? `from ${key.from}` : "First time · find a working load"}</span>
              {key.target && <Tag kind="RULE" explain={key.reason} />}
            </p>
          </div>
          {key.target && <span className="t-num-m tnum shrink-0 text-ivory">{key.target}</span>}
        </div>
      )}
      <Button variant="primary" size="lg" block className="mt-4" loading={starting} onClick={onBegin}>
        Begin {t.name}
      </Button>
      {pre && <MealRow meal={pre} now={now} className="mt-3 border-t border-vein pt-3" />}
    </>
  );
}

/* ------------------------------------------------------------------- fuel */

export function FuelBody({ m, meal, now, titleId, restLine, compact }: { m: NowModel; meal: NowMeal | null; now: number; titleId: string; restLine: ReactNode; compact?: boolean }) {
  if (!meal) return <NoMealBody m={m} titleId={titleId} lead={restLine} />;
  const role = meal.role === "pre" ? "Pre-workout · " : meal.role === "post" ? "After training · " : "";
  const due = meal.at < now;
  return (
    <>
      {restLine}
      <CardHead eyebrow={`${role}${due ? "Due" : "Next"} · ${clock(meal.at)}`} titleId={titleId} title={meal.name} small={compact && meal.name.length > 18} />
      <div className="mt-2.5 flex items-center gap-3">
        <Coin state="next" glyph={<FuelAmphora />} size={36} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="t-callout tnum flex items-center gap-1.5 text-ivory">
            {formatInt(meal.kcal)} kcal · {Math.round(meal.protein)} g protein <Tag kind="PLAN" />
          </p>
          <Consequence m={m} meal={meal} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <MealAction key={meal.id} meal={meal} gold className="flex-1" />
      </div>
      <Link
        href={`/nutrition/meals?day=${meal.local_date}`}
        className="t-meta -mb-2 mt-1 inline-flex min-h-11 items-center gap-1 text-stone hover:text-ivory"
        aria-label={`Swap ${meal.name}: open the day's meals`}
      >
        Swap <ChevronRight className="size-3.5" strokeWidth={1.6} aria-hidden />
      </Link>
    </>
  );
}

function NoMealBody({ m, titleId, lead }: { m: NowModel; titleId: string; lead?: ReactNode }) {
  const left = Math.max(0, Math.round(m.profile.protein_goal - m.food.protein));
  const allEaten = m.hasPlan && m.meals.length > 0;
  return (
    <>
      {lead}
      <CardHead
        eyebrow="Fuel"
        titleId={titleId}
        title={allEaten ? "Every planned meal logged" : m.hasPlan ? "Nothing planned today" : "No meals planned"}
        sub={
          m.foodFailed ? (
            "Today's food log didn't load."
          ) : (
            <span className="tnum">
              {left > 0 ? `${left} g protein to go today` : "Protein goal reached today"}
              {!m.hasPlan && (
                <>
                  {" · "}
                  <Link href="/nutrition/meals?generate=1" className="text-ivory underline decoration-ui-line underline-offset-4">
                    Plan this week
                  </Link>
                </>
              )}
            </span>
          )
        }
      />
      <Button variant="primary" size="lg" block className="mt-4" onClick={() => openOffering({ mode: "log" })}>
        Log food
      </Button>
    </>
  );
}

/** The rest or volleyball line that replaces Train on a day without lifting. */
export function RestLine({ m }: { m: NowModel }) {
  if (m.template) return null;
  if (m.volleyballToday)
    return (
      <p className="t-callout mb-3 flex items-center gap-2 text-ivory">
        <Volleyball className="size-[18px] text-stone" /> Volleyball day · fuel both
      </p>
    );
  const recs = restDayRecommendations(
    m.todayRec ? { sleepHours: m.todayRec.sleep_hours == null ? null : Number(m.todayRec.sleep_hours), energy: m.todayRec.energy, soreness: m.todayRec.soreness, fatigue: m.todayRec.fatigue, pain: !!m.todayRec.pain_notes?.trim() } : null,
    Number(m.profile.sleep_goal_h),
    null,
  );
  const goal = sleepShort(Number(m.profile.sleep_goal_h));
  const words = restDayWords(recs);
  return (
    <p className="t-callout mb-3 text-ivory">
      Rest day · {words.length ? `${words.join(", ")}, sleep ${goal}` : `walk, stretch, sleep ${goal}`}
    </p>
  );
}

/* ------------------------------------------------------------------- live */

export function LiveBody({ m, titleId }: { m: NowModel; titleId: string }) {
  const s = m.active!;
  return (
    <>
      <CardHead
        eyebrow={s.local_date === m.today ? "Live · every set is saved" : "Still open from another day"}
        titleId={titleId}
        title={
          <ViewTransition name="session-title">
            <span>{s.name}</span>
          </ViewTransition>
        }
        sub={<LiveMirror sessionId={s.id} startedAt={s.started_at} unit={m.unit} />}
      />
      <Button variant="primary" size="lg" block className="mt-4" data-today-resume asChild>
        <Link href={`/workout/${s.id}`}>Return to {s.name}</Link>
      </Button>
    </>
  );
}

/** "Bench press · Set 3 · 190 × 5 · rest 1:12" from the live session and its rest timer. */
function LiveMirror({ sessionId, startedAt, unit }: { sessionId: string; startedAt: string; unit: NowModel["unit"] }) {
  const live = useLiveSession(sessionId);
  const rest = useRest(sessionId);
  const now = useClockSec();
  const sets = (live.data?.sets ?? []).filter((x) => x.kind !== "warmup");
  const done = sets.filter((x) => x.completed).length;
  const next = [...sets].sort((a, b) => a.exercise_order - b.exercise_order || a.set_index - b.set_index).find((x) => !x.completed) ?? null;
  const rem = rest ? remainingSec(rest, now) : null;
  const load = next ? (next.weight_lb ?? next.suggested_weight_lb) : null;
  const reps = next ? (next.reps ?? next.target_rep_low) : null;
  if (!live.data) return <span className="tnum">{formatDuration(Math.max(0, now - Math.floor(Date.parse(startedAt) / 1000)))} in</span>;
  return (
    <span className="tnum">
      {next ? (
        <>
          <span className="text-ivory">{next.exercise_name}</span> · Set {next.set_index + 1}
          {load != null && reps != null ? ` · ${formatLoad(Number(load), unit, false)} × ${reps}` : ""}
        </>
      ) : (
        `All ${sets.length} sets logged`
      )}
      {rem != null && rem > 0 ? (
        <>
          {" · rest "}
          <span className={cn("t-num-s", rem <= 10 ? "text-leaf-200" : "text-ivory")}>{formatClock(rem)}</span>
        </>
      ) : (
        ` · ${done}/${sets.length} sets`
      )}
    </span>
  );
}

/* ----------------------------------------------------------------- refuel */

export function RefuelBody({ m, meal, titleId, compact }: { m: NowModel; meal: NowMeal | null; titleId: string; compact?: boolean }) {
  const s = m.doneToday!;
  const gap = Math.max(0, Math.round(m.profile.protein_goal - m.food.protein));
  return (
    <>
      <Link
        href={`/workout/${s.id}`}
        className="press-soft -mx-1 mb-2 flex min-h-11 items-center gap-2.5 rounded-field px-1 text-left"
        aria-label={`${s.name} sealed${m.sessionRecords ? `, ${m.sessionRecords} ${m.sessionRecords === 1 ? "record" : "records"}` : ""}. Open the session`}
      >
        <span className="grid size-8 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--leaf-line)] text-leaf-300">
          {m.sessionRecords ? <LaurelSprig className="size-4" /> : <SealTick className="size-4" />}
        </span>
        <span className="t-callout min-w-0 flex-1 truncate text-ivory">
          {s.name} sealed
          <span className="text-stone">
            {m.sessionRecords ? ` · ${m.sessionRecords} ${m.sessionRecords === 1 ? "record" : "records"}` : ` · ${s.sets_completed} sets`}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
      </Link>
      {meal ? (
        <>
          <CardHead eyebrow={`Refuel · ${clock(meal.at)}`} titleId={titleId} title={meal.name} small={compact && meal.name.length > 18} />
          <p className="t-meta tnum mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-stone">
            {m.foodFailed ? (
              <span>
                {formatInt(meal.kcal)} kcal · {Math.round(meal.protein)} g protein
              </span>
            ) : gap > 0 ? (
              <span>
                Closes <span className="text-ivory">{Math.min(gap, Math.round(meal.protein))}</span> of the <span className="text-ivory">{gap} g</span> protein left
              </span>
            ) : (
              <span>
                {Math.round(meal.protein)} g protein · today&apos;s goal is already met
              </span>
            )}
            {!m.foodFailed && <Tag kind="CALC" explain={`${Math.round(meal.protein)} g in the meal; ${gap} g left of ${m.profile.protein_goal} g today.`} />}
          </p>
          <MealAction key={meal.id} meal={meal} gold className="mt-3 w-full" />
        </>
      ) : (
        <>
          <CardHead eyebrow="Refuel" titleId={titleId} title={gap > 0 ? `${gap} g protein to go` : "Protein closed today"} sub="Nothing else planned today" />
          <Button variant="primary" size="lg" block className="mt-4" onClick={() => openOffering({ mode: "log" })}>
            Log food
          </Button>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------- dusk */

export function DuskBody({ m, meal, now, titleId, ritesLeft }: { m: NowModel; meal: NowMeal | null; now: number; titleId: string; ritesLeft: number }) {
  const gap = Math.max(0, Math.round(m.profile.protein_goal - m.food.protein));
  const open = m.meals.filter((x) => !x.eaten && x.at >= now - 60);
  const plannedP = Math.round(open.reduce((a, x) => a + x.protein, 0));
  const closes = plannedP >= gap;
  const left = closes ? null : gap - plannedP;
  return (
    <>
      <CardHead
        eyebrow="Dusk · close the day"
        titleId={titleId}
        title={gap > 0 ? `${gap} g protein to go` : "Protein closed"}
        sub={
          gap > 0 && !m.foodFailed ? (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="tnum">
                {open.length === 0 ? "nothing else planned today" : `${open.length} planned ${open.length === 1 ? "meal" : "meals"} ${closes ? "close it" : `leave ${left} g`}`}
              </span>
              <Tag kind="CALC" explain={`${m.profile.protein_goal} g goal − ${Math.round(m.food.protein)} g logged = ${gap} g; ${plannedP} g still planned.`} />
            </span>
          ) : null
        }
      />
      {meal ? (
        <div className="mt-3">
          <MealRowLead meal={meal} />
          <MealAction key={meal.id} meal={meal} gold className="mt-3 w-full" />
        </div>
      ) : (
        <Button variant="primary" size="lg" block className="mt-4" onClick={() => openOffering({ mode: "log" })}>
          Log food
        </Button>
      )}
      <TomorrowLine m={m} extra={ritesLeft > 0 ? `${ritesLeft} ${ritesLeft === 1 ? "rite" : "rites"} left` : null} />
    </>
  );
}

function MealRowLead({ meal }: { meal: NowMeal }) {
  return (
    <div className="flex items-center gap-3">
      <Coin state="next" glyph={<FuelAmphora />} size={36} />
      <div className="min-w-0 flex-1">
        <p className="t-title-3 truncate text-ivory">{meal.name}</p>
        <p className="t-meta tnum mt-0.5 flex items-center gap-1.5 text-ash">
          {clock(meal.at)} · {formatInt(meal.kcal)}&nbsp;kcal · {Math.round(meal.protein)}&nbsp;g <Tag kind="PLAN" />
        </p>
      </div>
    </div>
  );
}

function TomorrowLine({ m, extra }: { m: NowModel; extra?: string | null }) {
  const n = m.next;
  if (!n && !extra) return null;
  return (
    <p className="t-meta mt-3 flex flex-wrap gap-x-2 border-t border-vein pt-3 text-stone">
      {extra && <span>{extra}</span>}
      {extra && n && <span aria-hidden>·</span>}
      {n && (
        <span>
          {n.when} · <span className="text-ivory">{n.name}</span> · ~{n.minutes} min
        </span>
      )}
    </p>
  );
}

/* ------------------------------------------------------------------- seal */

export function SealBody({
  m,
  titleId,
  sealed,
  onSeal,
  rites,
  compact,
}: {
  m: NowModel;
  titleId: string;
  sealed: boolean;
  onSeal: () => void;
  rites: { done: number; total: number };
  compact?: boolean;
}) {
  const kcal = Math.round(m.food.calories);
  const protein = Math.round(m.food.protein);
  const skippedSession = m.template && !m.doneToday && !m.active;
  const stat = (label: string, value: ReactNode, earned: boolean, spoken: string) => (
    <div className="min-w-0" aria-label={spoken} role="group">
      <p className="t-eyebrow">{label}</p>
      <p className={cn(compact ? "t-num-s" : "t-num-m", "tnum mt-1 truncate", earned ? "text-leaf-300" : "text-ivory")} aria-hidden>
        {value}
      </p>
    </div>
  );
  return (
    <>
      <CardHead
        eyebrow={
          <span className="inline-flex items-center gap-2">
            {sealed && <span aria-hidden className="seal-in inline-block size-2 rotate-45 bg-leaf-300" />}
            {sealed ? "Sealed" : "Seal · the day in summary"}
          </span>
        }
        titleId={titleId}
        title={sealed ? "The day, sealed." : "Close the day"}
      />
      <div className={cn("mt-3 grid gap-x-4 gap-y-3 @max-[19rem]:grid-cols-1", compact ? "grid-cols-4 gap-x-2" : "grid-cols-2")}>
        {stat("Protein", m.foodFailed ? "—" : <>{protein}<span className="t-meta text-ash"> / {m.profile.protein_goal} g</span></>, protein >= m.profile.protein_goal, `Protein ${protein} of ${m.profile.protein_goal} grams`)}
        {stat("Calories", m.foodFailed ? "—" : <>{formatInt(kcal)}<span className="t-meta text-ash"> / {formatInt(m.profile.calorie_goal)}</span></>, false, `Calories ${kcal} of ${m.profile.calorie_goal}`)}
        {stat("Sessions", m.sealed.planned ? <>{m.sealed.done}<span className="t-meta text-ash"> of {m.sealed.planned}</span></> : "—", m.sealed.planned > 0 && m.sealed.done >= m.sealed.planned, `${m.sealed.done} of ${m.sealed.planned} sessions this week`)}
        {stat("Rites", rites.total ? <>{rites.done}<span className="t-meta text-ash"> of {rites.total}</span></> : "—", rites.total > 0 && rites.done === rites.total, `${rites.done} of ${rites.total} rites`)}
      </div>
      {skippedSession && (
        <Link href="/training" className="t-meta mt-2 inline-flex min-h-11 items-center gap-1 text-stone hover:text-ivory">
          {m.template!.name} wasn&apos;t logged · <span className="text-ivory underline decoration-ui-line underline-offset-4">move it</span>
        </Link>
      )}
      {!sealed && (
        <Button variant="primary" size="lg" block className="mt-3" onClick={onSeal}>
          Seal the day
        </Button>
      )}
      <TomorrowLine m={m} />
    </>
  );
}

/** Round a display weight to one decimal for copy. */
export const dispW = (lb: number, unit: NowModel["unit"]) => round(toDisplayWeight(lb, unit), 1).toFixed(1);
export { mealSpoken };

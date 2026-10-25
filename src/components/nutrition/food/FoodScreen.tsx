"use client";

import { useSearchParams } from "next/navigation";
import { CalendarDays, ChevronRight, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { weekOffset, weekSpan } from "@/components/meals/week/actions";
import { openOffering } from "@/components/offering/store";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/controls";
import { DayStrip, type StripDay } from "@/components/ui/day-strip";
import { DetailsSheet } from "@/components/ui/details-sheet";
import { ListGroup, Row, SectionHead } from "@/components/ui/list";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useToday, useUser } from "@/lib/data/core";
import { useMealPrefs } from "@/lib/data/meals";
import type { FoodEntry } from "@/lib/data/nutrition";
import { addDays, dayName, parseISODate, toISODate, weekStart, type ISODate } from "@/lib/dates";
import { plannedTotals, type MacroTotals } from "@/lib/fuel/timeline";
import { plannedTime } from "@/lib/now/meal-times";
import { asMeal, mealSections } from "@/lib/nutrition-ui/group";
import { formatInt } from "@/lib/units";
import { FuelProvider, type Goals } from "../context";
import { EditFoodSheet, type EditState } from "../EditFoodSheet";
import { keepOpenOnToast, useDelayedFlag, useQueryHealth } from "../hooks";
import { LOG_TABS, LogSheet, type LogRequestState, type LogTab } from "../LogSheet";
import { SaveMealSheet, type SaveMealState } from "../SaveMealSheet";
import { DayMenu } from "./DayMenu";
import { DayList } from "./DayList";
import { GroupSheet } from "./GroupSheet";
import { aheadMeals, CookAheadRow, DayExtras } from "./PlanExtras";
import { PlanWeekSheet, type PlanRequest } from "./PlanWeekSheet";
import { useFoodDay, useFoodWeek, type FoodWeekDay } from "./useFoodDay";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string | null): d is ISODate => !!d && ISO.test(d) && toISODate(parseISODate(d)) === d;

/**
 * Food (`/nutrition`, docs/DESIGN-V3-SIMPLE.md §4.4.1–2): the day strip, the selected day's plan
 * and diary merged by time with one gold check on the next meal, what the day adds up to, the
 * whole week as seven rows, and the planner's week actions. Food never repeats Today's to-go
 * numbers; water lives on Today and +.
 *
 * URLs (§3.7): `?date=` (or the old `?day=`) selects a day, `?week=next` selects next week,
 * `?tab=week` scrolls to "This week", `?generate=1` opens the plan-week confirm, `?add=1`
 * (`&meal=`, `&tab=search|recent|saved|manual`) opens Add. `/nutrition/meals` renders this too.
 */
export function FoodScreen() {
  const params = useSearchParams();
  const today = useToday();
  const lastDay = addDays(weekStart(today), 13); // the end of next week: the planner's horizon
  const asked = params.get("date") ?? params.get("day");
  const date: ISODate = (() => {
    const d = validDate(asked) ? asked : params.get("week") === "next" ? addDays(today, 7) : today;
    return d > lastDay ? lastDay : d;
  })();
  const ws = weekStart(date);
  const offset = weekOffset(ws, today);
  const isToday = date === today;
  const isFuture = date > today;
  const inPlannerRange = offset === 0 || offset === 1;

  const day = useFoodDay(date, today);
  const week = useFoodWeek(ws);
  const { userId } = useUser();
  const mealPrefs = useMealPrefs();
  const { food, goals, timeline } = day;

  const setDate = useCallback(
    (d: ISODate) => {
      const next = d > lastDay ? lastDay : d;
      const sp = new URLSearchParams(window.location.search);
      ["date", "day", "week", "tab", "generate"].forEach((k) => sp.delete(k));
      if (next !== today) sp.set("date", next);
      const qs = sp.toString();
      // in place (null state so Next.js syncs the params): no server round trip, works offline
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    },
    [today, lastDay],
  );

  /* sheets */
  const [logState, setLogState] = useState<LogRequestState>({ open: false, nonce: 0 });
  const [edit, setEdit] = useState<EditState>({ open: false, nonce: 0, entry: null });
  const [saveMeal, setSaveMeal] = useState<SaveMealState>({ open: false, nonce: 0, section: null });
  const [group, setGroup] = useState<{ open: boolean; entries: FoodEntry[] }>({ open: false, entries: [] });
  const [plan, setPlan] = useState<{ open: boolean; request: PlanRequest | null }>({ open: false, request: null });
  const [details, setDetails] = useState(false);
  const openLog = useCallback((r?: { meal?: ReturnType<typeof asMeal>; tab?: LogTab }) => setLogState((s) => ({ open: true, nonce: s.nonce + 1, meal: r?.meal, tab: r?.tab })), []);
  const openEdit = useCallback((entry: FoodEntry) => setEdit((s) => ({ open: true, nonce: s.nonce + 1, entry })), []);
  const askPlan = (request: PlanRequest) => setPlan({ open: true, request });

  const legacyGoals: Goals | null = useMemo(
    () => (goals ? { calories: goals.kcal, protein: goals.protein, carbs: goals.carbs, fat: goals.fat, waterMl: goals.waterMl } : null),
    [goals],
  );

  // ?add=1[&meal=][&tab=]: open Add once (the manifest shortcut, the food reminder), then drop the params
  const wantsAdd = params.get("add") === "1";
  useEffect(() => {
    if (!wantsAdd) return;
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tab") as LogTab | null;
    const m = sp.get("meal");
    const panel = t && LOG_TABS.includes(t) ? t : undefined;
    const forDay = date === today ? undefined : date;
    openOffering(panel || m ? { mode: "log", panel: panel ?? "search", slot: m ? asMeal(m) : undefined, date: forDay } : { mode: "log", date: forDay });
    ["add", "meal"].forEach((k) => sp.delete(k));
    if (LOG_TABS.includes(sp.get("tab") as LogTab)) sp.delete("tab");
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [wantsAdd, date, today]);

  // ?generate=1: the plan-week confirm for the selected week, once its plan has loaded
  const wantsGenerate = params.get("generate") === "1";
  useEffect(() => {
    if (!wantsGenerate || !week.planLoaded) return;
    const request: PlanRequest | null = inPlannerRange ? { offset: offset as 0 | 1, kind: week.hasPlan ? "again" : "first" } : null;
    const t = window.setTimeout(() => {
      const sp = new URLSearchParams(window.location.search);
      sp.delete("generate");
      const qs = sp.toString();
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
      if (request) setPlan({ open: true, request });
    }, 0);
    return () => window.clearTimeout(t);
  }, [wantsGenerate, week.planLoaded, week.hasPlan, inPlannerRange, offset]);

  // ?tab=week: scroll to "This week" once it is on screen
  const weekRef = useRef<HTMLElement>(null);
  const wantsWeek = params.get("tab") === "week";
  const scrolled = useRef(false);
  useEffect(() => {
    if (!wantsWeek || scrolled.current || week.loading || !weekRef.current) return;
    scrolled.current = true;
    weekRef.current.scrollIntoView({ block: "start" });
  }, [wantsWeek, week.loading]);

  /* the day */
  const loading = day.profileLoading || food.loading || day.planLoading;
  const showSkeleton = useDelayedFlag(loading, 150);
  const foodHealth = useQueryHealth(["food", date, userId]);
  const foodUnknown = !!food.error && !foodHealth.hasData && food.entries.length === 0;
  const thisDay = week.days.find((d) => d.date === date);
  const rows = timeline.rows.filter((r) => r.kind !== "now" && r.kind !== "session");
  const hasRows = rows.length > 0;
  const weekUnplanned = !day.planLoading && !day.hasPlanWeek;
  const sections = useMemo(() => mealSections(food.entries), [food.entries]);
  const plannedToday = day.planned.length;
  const eatenToday = timeline.rows.filter((r) => (r.kind === "eaten" && !!r.planned) || r.kind === "elsewhere").length;

  const head = isToday ? "Today" : offset === 0 ? dayName(date) : `${dayName(date)} ${parseISODate(date).getDate()}`;
  const label = thisDay?.label ? (thisDay.label === "Rest" ? "Rest day" : `${thisDay.label} day`) : null;
  const count = !isFuture && plannedToday > 0 ? `${eatenToday} of ${plannedToday} eaten` : null;

  /* what the day adds up to */
  const total: { caption: string; totals: MacroTotals; how: string; rows: { label: string; value: string }[] } | null = (() => {
    const eaten = timeline.eaten;
    const ahead = timeline.remaining;
    const foods = food.entries.length;
    const kcalP = (t: MacroTotals) => `${formatInt(t.kcal)} kcal · ${Math.round(t.protein)} g protein`;
    if (isFuture) {
      if (!plannedToday) return null;
      const t = plannedTotals(day.planned);
      return {
        caption: "Day total",
        totals: t,
        rows: [{ label: "Planned", value: kcalP(t) }],
        how: `Adds up the ${plannedToday} planned meals for this day. Each meal's numbers are worked out from its recipe's ingredients (USDA FoodData Central values) for the planned servings.`,
      };
    }
    if (isToday) {
      if (!foods && !timeline.remainingCount) return null;
      const t = { kcal: eaten.kcal + ahead.kcal, protein: eaten.protein + ahead.protein, carbs: eaten.carbs + ahead.carbs, fat: eaten.fat + ahead.fat };
      return {
        caption: timeline.remainingCount ? "If you eat it all today" : "Eaten today",
        totals: t,
        rows: [
          { label: "Eaten so far", value: kcalP(eaten) },
          ...(timeline.remainingCount ? [{ label: "Still planned", value: kcalP(ahead) }] : []),
        ],
        how: `Eaten adds up the ${foods} ${foods === 1 ? "food" : "foods"} you logged today.${timeline.remainingCount ? ` Planned adds the ${timeline.remainingCount} ${timeline.remainingCount === 1 ? "meal" : "meals"} still ahead in today's plan, worked out from each recipe's ingredients.` : ""} Goals are not shown here: Today has them.`,
      };
    }
    if (!foods) return null;
    return { caption: "Eaten that day", totals: eaten, rows: [{ label: "Eaten", value: kcalP(eaten) }], how: `Adds up the ${foods} ${foods === 1 ? "food" : "foods"} you logged that day.` };
  })();

  /* the strip */
  const stripDays: StripDay[] = week.days.map((d) => ({ date: d.date, state: d.date > today ? "none" : d.proteinHit ? "win" : d.loggedEntries > 0 ? "logged" : "none" }));

  /* the week's actions */
  const nextWs = addDays(weekStart(today), 7);
  const nextWeek = useFoodWeek(nextWs);
  const schedule = day.appPrefs.day;
  const ahead = useMemo(
    () =>
      inPlannerRange
        ? aheadMeals(day.plan.meals, day.lookup, day.links, today, (m) => plannedTime({ slot: m.slot, position: m.position }, { schedule, snacksPerDay: mealPrefs.prefs.snacksPerDay, train: null }).at)
        : [],
    [inPlannerRange, day, today, schedule, mealPrefs.prefs.snacksPerDay],
  );
  const earlierUnplanned = offset === 0 && date < today && day.hasPlanWeek && plannedToday === 0;

  return (
    <FuelProvider date={date} today={today} goals={legacyGoals} entries={food.entries} openLog={openLog} openEdit={openEdit} setDate={setDate}>
      <div className="mx-auto max-w-col">
        <PageHeader
          title="Food"
          accessory={
            <Pill icon={ShoppingCart} href="/nutrition/meals/grocery">
              Grocery list
            </Pill>
          }
        />
        <DayStrip
          className="mt-2"
          days={stripDays}
          selected={date}
          today={today}
          onSelect={setDate}
          onPrevWeek={() => setDate(addDays(date, -7))}
          onNextWeek={addDays(ws, 7) <= lastDay ? () => setDate(addDays(date, 7)) : undefined}
          ariaLabel={offset === 0 ? "This week" : weekSpan(ws)}
        />

        <section aria-labelledby="food-day" className="mt-7">
          <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
            <h2 id="food-day" className="t-section min-w-0">
              {head}
              {label && <span className="t-label font-medium"> · {label}</span>}
            </h2>
            <span className="flex shrink-0 items-center gap-1">
              {count && <span className="t-label">{count}</span>}
              {food.entries.length > 0 && <DayMenu sections={sections} onSaveMeal={(s) => setSaveMeal((st) => ({ open: true, nonce: st.nonce + 1, section: s }))} />}
            </span>
          </div>

          {foodUnknown && (
            <ErrorNote className="mb-3" onRetry={() => void food.refetch()}>
              Couldn&apos;t load this day&apos;s food. Your entries are safe.
            </ErrorNote>
          )}
          {day.profileError && !day.profile ? (
            <ErrorNote onRetry={() => void day.refetchProfile()} />
          ) : loading ? (
            showSkeleton ? <DaySkeleton /> : <div className="h-64" aria-hidden />
          ) : (
            <>
              {hasRows && !foodUnknown && <DayList rows={rows} date={date} today={today} onEdit={openEdit} onGroup={(entries) => setGroup({ open: true, entries })} />}
              {weekUnplanned && inPlannerRange ? (
                <UnplannedCard className={hasRows ? "mt-3" : undefined} offset={offset as 0 | 1} onPlan={() => askPlan({ offset: offset as 0 | 1, kind: "first" })} />
              ) : earlierUnplanned ? (
                <Empty className={hasRows ? "mt-3" : undefined} title={`Nothing was planned for ${dayName(date)}`} action={
                  <Button variant="secondary" size="md" onClick={() => askPlan({ offset: 0, kind: "fill" })}>
                    Plan the earlier days too
                  </Button>
                }>
                  The week was planned from a later day.
                </Empty>
              ) : !hasRows && !foodUnknown ? (
                <Empty title={isToday ? "Nothing yet today" : isFuture ? "Nothing planned" : "Nothing logged"}>{isToday ? "Tap + to add food." : isFuture ? "Plan the week to see meals here." : "Nothing was logged that day."}</Empty>
              ) : null}
              {inPlannerRange && day.hasPlanWeek && date >= today && <DayExtras offset={offset} date={date} today={today} snacksPerDay={mealPrefs.prefs.snacksPerDay} />}
              {total && (
                <button type="button" onClick={() => setDetails(true)} className="press-soft mt-3 flex w-full items-center gap-3 rounded-tile-lg bg-surface px-5 py-4 text-left" aria-describedby="food-total-hint">
                  <span className="min-w-0 flex-1">
                    <span className="t-cap block">{total.caption}</span>
                    <span className="t-row mt-1 block tabular-nums" data-derived="">
                      {formatInt(total.totals.kcal)} kcal · {Math.round(total.totals.protein)} g protein
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-3" strokeWidth={2.2} aria-hidden />
                  <span id="food-total-hint" className="sr-only">
                    Shows how it is worked out.
                  </span>
                </button>
              )}
            </>
          )}
        </section>

        <section ref={weekRef} aria-labelledby="food-week" className="scroll-mt-16">
          <SectionHead id="food-week">{offset === 0 ? "This week" : offset === 1 ? "Next week" : weekSpan(ws)}</SectionHead>
          {week.error ? (
            <ErrorNote />
          ) : (
            <ListGroup ariaLabel={`${weekSpan(ws)}, day by day`}>
              {week.days.map((d) => (
                <WeekRow key={d.date} day={d} today={today} selected={d.date === date} weekPlanned={week.hasPlan} onSelect={() => setDate(d.date)} />
              ))}
            </ListGroup>
          )}

          <ListGroup className="mt-3">
            {inPlannerRange && day.hasPlanWeek && (
              <Row
                icon={CalendarDays}
                title={offset === 0 ? "Plan this week again" : "Plan next week again"}
                subtitle="Keeps the meals you locked"
                onClick={() => askPlan({ offset: offset as 0 | 1, kind: "again" })}
              />
            )}
            {offset === 0 ? (
              nextWeek.hasPlan ? (
                <Row icon={CalendarDays} title="Next week" subtitle={`Planned · ${weekSpan(nextWs)}`} onClick={() => setDate(nextWs)} />
              ) : (
                <Row icon={CalendarDays} title="Plan next week" onClick={() => askPlan({ offset: 1, kind: "first" })} />
              )
            ) : (
              <Row icon={CalendarDays} title="Back to this week" onClick={() => setDate(today)} />
            )}
            <CookAheadRow meals={ahead} today={today} />
            <Row icon={SlidersHorizontal} title="Meal preferences" href="/nutrition/meals/preferences" />
          </ListGroup>
        </section>
      </div>

      {total && <DetailsSheet open={details} onOpenChange={setDetails} title={total.caption} rows={total.rows} how={total.how} />}
      <GroupSheet entries={group.entries} open={group.open} onOpenChange={(o) => setGroup((g) => ({ ...g, open: o }))} onEdit={openEdit} />
      {plan.request && <PlanWeekSheet request={plan.request} open={plan.open} onOpenChange={(o) => setPlan((p) => ({ ...p, open: o }))} onDone={() => setDate(plan.request!.offset === 1 && offset !== 1 ? nextWs : date)} />}
      {/* Tapping a toast's Undo never dismisses the sheet underneath (he keeps his place). */}
      <LogSheet state={logState} onOpenChange={keepOpenOnToast((o) => setLogState((s) => ({ ...s, open: o })))} />
      <EditFoodSheet state={edit} onOpenChange={keepOpenOnToast((o) => setEdit((s) => ({ ...s, open: o })))} />
      <SaveMealSheet state={saveMeal} onOpenChange={keepOpenOnToast((o) => setSaveMeal((s) => ({ ...s, open: o })))} />
    </FuelProvider>
  );
}

/** One day of "This week": "Mon 19 · Arms · 5 of 5 eaten" (past), "Fri 23 · Chest · 5 meals · 3,399 kcal" (future). */
function WeekRow({ day, today, selected, weekPlanned, onSelect }: { day: FoodWeekDay; today: ISODate; selected: boolean; weekPlanned: boolean; onSelect: () => void }) {
  const past = day.date < today;
  const isToday = day.date === today;
  const value = day.planned
    ? day.date > today
      ? `${day.planned} meals · ${formatInt(day.plannedKcal)} kcal`
      : `${day.eaten} of ${day.planned} ${isToday ? "so far" : "eaten"}`
    : day.loggedEntries > 0 && (past || isToday)
      ? `${formatInt(day.loggedKcal ?? 0)} kcal eaten`
      : weekPlanned
        ? "Not planned"
        : "";
  const d = parseISODate(day.date);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${dayName(day.date)} ${d.getDate()}${isToday ? ", today" : ""}${day.label ? `, ${day.label === "Rest" ? "rest day" : `${day.label} day`}` : ""}${value ? `, ${value}` : ", not planned"}`}
      className={cn("press-soft flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left", selected && "bg-card-3")}
    >
      <span className="t-row w-[4.5rem] shrink-0 tabular-nums">
        {dayName(day.date, true)} {d.getDate()}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="t-label">{day.label ?? ""}</span>
        {value && <span className="t-label text-right tabular-nums">{value}</span>}
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
    </button>
  );
}

/** No plan for this week (or next): the planner in one gold tap. */
function UnplannedCard({ offset, onPlan, className }: { offset: 0 | 1; onPlan: () => void; className?: string }) {
  return (
    <div className={cn("rounded-card bg-surface p-5", className)}>
      <p className="t-row">{offset === 0 ? "This week isn't planned yet" : "Next week isn't planned yet"}</p>
      <Button variant="primary" size="lg" block className="mt-4" onClick={onPlan}>
        {offset === 0 ? "Plan my week" : "Plan next week"}
      </Button>
    </div>
  );
}

function DaySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading this day">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[76px] w-full rounded-tile-lg" />
      ))}
    </div>
  );
}

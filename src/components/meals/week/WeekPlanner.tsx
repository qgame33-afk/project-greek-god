"use client";

import Link from "next/link";
import { BackLink } from "@/components/shell/BackLink";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, Info, Plus, RefreshCw, ShoppingBasket, SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/ui/controls";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Confirm } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/data/core";
import {
  useAddFeedback,
  useDeleteFeedback,
  useDeletePlannedMeal,
  useGroceryItems,
  usePlan,
  useSaveMealPrefs,
  useSavePlan,
  useToggleFavourite,
  useUpdatePlannedMeal,
  type NewFeedback,
  type PlanMeal,
} from "@/lib/data/meals";
import { addDays, dayName, shortDate, type ISODate } from "@/lib/dates";
import { dayTotals, feedbackFor, generateWeek, lockMeal, moveMeal, regenerateMeal, regenerateReasonFeedback, repeatMeal, type EngineMeal } from "@/lib/meals/engine";
import { ingredientName } from "@/lib/meals/ingredients";
import { recipeFeatures } from "@/lib/meals/recipe";
import type { FeedbackReason, MealPrefs, Slot } from "@/lib/meals/types";
import { useSwapIn } from "@/lib/motion";
import { SLOT_LABEL } from "../shared/format";
import { DayList, DayStrip, type DayInfo } from "./DayPicker";
import { DayTotals } from "./DayTotals";
import { DislikeSheet } from "./DislikeSheet";
import { useAddPlannedMeals, usePlannerData, useRemovePlannedMeals } from "./hooks";
import { MealMenuSheet } from "./MealMenuSheet";
import { conflictsInWeek, currentThumb, dayFit, MAIN_SLOTS, missingMainSlots, notedText, reasonWantsRepick, thumbRows, weekNotes, weekRangeLabel, type Thumb } from "./model";
import { ConflictBanner, EmptyWeek, NeedsGoals, prefsSummary } from "./Panels";
import { EmptySlotCard, PlannedMealCard } from "./PlannedMealCard";
import { RegenStrip, type StripPhase } from "./RegenStrip";

/** The shimmer shows at least this long, so a swap reads as "found you another" rather than a flicker. */
const MIN_REGEN_MS = 340;
/** A recorded reason folds the strip away after this long (the meal is kept). */
const NOTED_MS = 3600;

type MealPlace = Pick<PlanMeal, "recipe_key" | "servings" | "reason" | "history">;

interface StripState {
  mealId: string;
  /** The pick that was swapped out: what a reason is about, and what Undo puts back. */
  from: MealPlace;
  /** The "regenerated" learning row recorded for it (replaced when a reason is chosen). */
  feedbackId: string;
  /** Recipes already shown in this regenerate session (never offered again). */
  shown: string[];
  phase: StripPhase;
  chosen: FeedbackReason | null;
  noted: string | null;
}

const placeOf = (m: MealPlace): MealPlace => ({ recipe_key: m.recipe_key, servings: m.servings, reason: m.reason, history: m.history });

/**
 * /nutrition/meals — MEALS · YOUR WEEK, FUELLED (docs/MEALS.md §6). This week / next week, a
 * Mon–Sun picker, the day's planned meals with Regenerate meal on every card, planned totals
 * against the goals (never counted as eaten), and the week's tools. URL: ?week=next, ?day=,
 * ?generate=1 (plan this week straight away, from the Fuel entry card).
 */
export function WeekPlanner() {
  const params = useSearchParams();
  const [offset, setOffset] = useState<0 | 1>(params.get("week") === "next" ? 1 : 0);
  const [picked, setPicked] = useState<ISODate | null>(params.get("day"));
  const data = usePlannerData(offset);
  const { week, goals, hasGoals, prefs, lookup, meals, plan, feedback, favourites, makeContext, ready } = data;
  const ws = week.weekStart;
  const today = week.today;
  const nextWs = addDays(ws, 7);
  const nextPlan = usePlan(offset === 0 ? nextWs : null);
  const grocery = useGroceryItems(plan?.id);

  const selected: ISODate = picked && week.days.includes(picked) ? picked : offset === 0 ? today : week.days[0];

  const savePlan = useSavePlan();
  const update = useUpdatePlannedMeal();
  const del = useDeletePlannedMeal();
  const addPlanned = useAddPlannedMeals();
  const removePlanned = useRemovePlannedMeals();
  const addFeedback = useAddFeedback();
  const deleteFeedback = useDeleteFeedback();
  const toggleFav = useToggleFavourite();
  const savePrefs = useSaveMealPrefs();

  const [busy, setBusy] = useState<Record<string, true>>({});
  const [strip, setStrip] = useState<StripState | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dislikeOpen, setDislikeOpen] = useState(false);
  const [confirmWeek, setConfirmWeek] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [appear, setAppear] = useState(0);
  const [note, setNote] = useState<{ week: ISODate; text: string } | null>(null);
  const [autoGen, setAutoGen] = useState<0 | 1 | null>(params.get("generate") === "1" ? 0 : null);

  /* ----------------------------------------------------------- derived */

  const totals = useMemo(() => dayTotals(meals, lookup), [meals, lookup]);
  const days: DayInfo[] = useMemo(
    () =>
      week.days.map((date) => {
        const n = meals.filter((m) => m.local_date === date).length;
        return { date, meals: n, planned: totals[date], fit: dayFit(totals[date], goals, n) };
      }),
    [week.days, meals, totals, goals],
  );
  const dayMeals = useMemo(() => meals.filter((m) => m.local_date === selected), [meals, selected]);
  const snacks = dayMeals.filter((m) => m.slot === "snack");
  const loggedSet = useMemo(() => new Set(data.loggedIds), [data.loggedIds]);
  // the part of each day's plan not in the food log yet ("still planned")
  const aheadTotals = useMemo(() => dayTotals(meals.filter((m) => !loggedSet.has(m.id)), lookup), [meals, loggedSet, lookup]);
  // a rule added after planning (an allergy, a dislike) flags what it breaks on every card not
  // logged yet; the banner offers to replace the ones from today on
  const conflictsAny = useMemo(() => conflictsInWeek(meals.filter((m) => !loggedSet.has(m.id)), lookup, prefs), [meals, loggedSet, lookup, prefs]);
  const conflicts = useMemo(() => conflictsAny.filter((c) => c.meal.local_date >= today), [conflictsAny, today]);
  const conflictById = useMemo(() => new Map(conflictsAny.map((c) => [c.meal.id, c.text])), [conflictsAny]);
  const replaceable = conflicts.filter((c) => !c.meal.locked);
  const lockedCount = meals.filter((m) => m.locked).length;
  const loggedCount = meals.filter((m) => loggedSet.has(m.id)).length;
  const hasWeek = meals.length > 0;
  const menuMeal = menuId ? (meals.find((m) => m.id === menuId) ?? null) : null;
  const stripMeal = strip ? meals.find((m) => m.id === strip.mealId) : undefined;

  const dayRef = useSwapIn<HTMLDivElement, ISODate>(selected);

  /* ------------------------------------------------------------- url */

  const writeUrl = (o: 0 | 1, day: ISODate | null) => {
    const sp = new URLSearchParams(window.location.search);
    sp.delete("generate");
    if (o === 1) sp.set("week", "next");
    else sp.delete("week");
    if (day && day !== (o === 0 ? today : null)) sp.set("day", day);
    else sp.delete("day");
    const qs = sp.toString();
    window.history.replaceState(window.history.state, "", qs ? `/nutrition/meals?${qs}` : "/nutrition/meals");
  };

  const selectDay = (d: ISODate) => {
    if (d === selected) return;
    closeStrip("kept");
    setPicked(d);
    writeUrl(offset, d);
  };

  const switchWeek = (o: 0 | 1) => {
    if (o === offset) return;
    closeStrip("kept");
    // same weekday in the other week keeps your place
    const d = addDays(selected, (o - offset) * 7);
    setOffset(o);
    setPicked(d);
    writeUrl(o, d);
  };

  /* -------------------------------------------------------- feedback */

  // an add still in flight is awaited before its row is removed again (reason, Undo)
  const pendingAdds = useRef(new Map<string, Promise<unknown>>());
  const record = (f: NewFeedback): string => {
    const id = f.id ?? newId();
    const p = addFeedback.mutateAsync({ ...f, id }).catch(() => {});
    pendingAdds.current.set(id, p);
    p.finally(() => pendingAdds.current.delete(id));
    return id;
  };
  const unrecord = (id: string) => {
    const p = pendingAdds.current.get(id);
    if (p) p.finally(() => deleteFeedback.mutate(id));
    else deleteFeedback.mutate(id);
  };

  /* ------------------------------------------------------- the strip */

  function closeStrip(mode: "kept" | "undo" | "silent") {
    const s = strip;
    if (!s) return;
    setStrip(null);
    const current = meals.find((m) => m.id === s.mealId);
    if (!current) return;
    if (mode === "undo") {
      update.mutate({ id: s.mealId, patch: placeOf(s.from), weekStart: ws });
      unrecord(s.feedbackId);
    } else if (mode === "kept") {
      record(feedbackFor(lookup(current.recipe_key), current.recipe_key, "kept"));
    }
  }

  // latest values for timers and unmount (written after render, read only in callbacks)
  const dropGenerateParam = () => writeUrl(offset, picked);
  const latest = useRef({ closeStrip, strip, meals, lookup, record, dropGenerateParam });
  useEffect(() => {
    latest.current = { closeStrip, strip, meals, lookup, record, dropGenerateParam };
  });
  useEffect(() => {
    if (strip?.phase !== "noted") return;
    const t = window.setTimeout(() => latest.current.closeStrip("kept"), NOTED_MS);
    return () => window.clearTimeout(t);
  }, [strip?.phase, strip?.mealId, strip?.chosen]);
  // leaving the screen with a fresh swap on it keeps that swap: that is a "kept" signal
  useEffect(
    () => () => {
      const { strip: s, meals: ms, lookup: lk, record: rec } = latest.current;
      const cur = s ? ms.find((m) => m.id === s.mealId) : undefined;
      if (cur) rec(feedbackFor(lk(cur.recipe_key), cur.recipe_key, "kept"));
    },
    [],
  );

  /* ------------------------------------------------------ regenerate */

  function regenerate(meal: PlanMeal) {
    if (busy[meal.id] || meal.locked || loggedSet.has(meal.id)) return;
    const same = strip?.mealId === meal.id ? strip : null;
    if (strip && !same) closeStrip("kept");
    if (same) setStrip(null);
    setBusy((b) => ({ ...b, [meal.id]: true }));
    // let the press and the shimmer paint before the engine runs
    window.setTimeout(() => {
      const t0 = performance.now();
      const ctx = makeContext();
      const res = ctx ? regenerateMeal(ctx, meal, same?.shown ?? []) : null;
      window.setTimeout(
        () => {
          setBusy(({ [meal.id]: _done, ...rest }) => rest);
          if (!res) return void toast.error("The planner is still loading. Try again in a moment.");
          if (!res.ok) return void toast(res.message, { description: "Loosening a preference gives the planner more to pick from." });
          // another card's swap finished while this one ran: that one was kept, and its strip
          // makes way for this one (latest: this callback's own render is stale by now)
          const open = latest.current.strip;
          if (open && open.mealId !== meal.id) latest.current.closeStrip("kept");
          update.mutate({ id: meal.id, patch: res.patch, weekStart: ws });
          const feedbackId = record(res.feedback);
          setStrip({ mealId: meal.id, from: placeOf(meal), feedbackId, shown: res.shown, phase: "ask", chosen: null, noted: null });
        },
        Math.max(0, MIN_REGEN_MS - (performance.now() - t0)),
      );
    }, 0);
  }

  /** A reason for the swap: replaces the plain "regenerated" row, and re-picks when the new meal doesn't answer it. */
  function applyReason(reason: FeedbackReason, ingredient: string | null = null, prefsNow?: MealPrefs) {
    const s = strip;
    const current = s ? meals.find((m) => m.id === s.mealId) : undefined;
    if (!s || !current) return;
    const fromRecipe = lookup(s.from.recipe_key);
    unrecord(s.feedbackId);
    const feedbackId = record(regenerateReasonFeedback(fromRecipe, s.from.recipe_key, reason, ingredient));
    let repicked: string | null = null;
    let shown = s.shown;
    if (reasonWantsRepick(reason, fromRecipe, lookup(current.recipe_key), ingredient)) {
      // pick again from where the swap started, so Undo still goes straight back to the original
      const before: EngineMeal = { ...current, ...placeOf(s.from) };
      const ctx = makeContext({ prefs: prefsNow });
      const res = ctx ? regenerateMeal(ctx, before, s.shown, { reason, ingredient }) : null;
      if (res?.ok) {
        update.mutate({ id: current.id, patch: res.patch, weekStart: ws });
        repicked = res.recipe.name;
        shown = res.shown;
      }
    }
    setStrip({ ...s, feedbackId, shown, phase: "noted", chosen: reason, noted: notedText(reason, repicked) });
  }

  function chooseReason(reason: FeedbackReason) {
    if (reason === "dislike_ingredient") setDislikeOpen(true);
    else applyReason(reason);
  }

  function confirmDislike(key: string) {
    setDislikeOpen(false);
    if (prefs.dislikedIngredients.includes(key)) return applyReason("dislike_ingredient", key);
    const before = prefs.dislikedIngredients;
    const next = { ...prefs, dislikedIngredients: [...before, key] };
    savePrefs.mutate({ dislikedIngredients: next.dislikedIngredients });
    applyReason("dislike_ingredient", key, next);
    toast(`${ingredientName(key)} won't be planned again`, {
      description: "Change it any time in Preferences.",
      duration: 6000,
      action: { label: "Undo", onClick: () => savePrefs.mutate({ dislikedIngredients: before }) },
    });
  }

  /* ------------------------------------------------------- the week */

  async function generate(kind: "first" | "again") {
    const ctx = makeContext({ seed: `${ws}:${Date.now()}` });
    if (!ctx || generating) return;
    closeStrip("silent");
    setGenerating(true);
    await new Promise((r) => window.setTimeout(r, 0)); // paint the loading button first
    let res: ReturnType<typeof generateWeek>;
    try {
      res = generateWeek(ctx);
    } catch (e) {
      setGenerating(false);
      toast.error("Couldn't plan the week", { description: e instanceof Error ? e.message : String(e) });
      return;
    }
    try {
      await savePlan.mutateAsync({ weekStart: ws, meals: res.meals, settings: prefs, undoLabel: kind === "again" ? "Week regenerated" : false });
      if (kind === "first") {
        toast("Week planned", {
          description: `${res.meals.length} meals. Nothing is logged until you add it.`,
          duration: 6000,
          action: { label: "Undo", onClick: () => savePlan.mutate({ weekStart: ws, meals: [], keepLocked: false, undoLabel: false }) },
        });
      }
      const text = weekNotes(res, MAIN_SLOTS.length + prefs.snacksPerDay);
      setNote(text ? { week: ws, text } : null);
      setAppear((n) => n + 1);
    } catch {
      /* the hook rolled back and said why */
    } finally {
      setGenerating(false);
    }
  }

  // "Generate my week" from the Fuel card, or "Generate next week": plan as soon as everything is loaded
  const generateRef = useRef(generate);
  useEffect(() => {
    generateRef.current = generate;
  });
  const canAutoGen = autoGen === offset && ready && hasGoals && data.planLoaded && !generating;
  useEffect(() => {
    if (!canAutoGen) return;
    const t = window.setTimeout(() => {
      setAutoGen(null);
      latest.current.dropGenerateParam();
      if (!latest.current.meals.length) void generateRef.current("first");
    }, 0);
    return () => window.clearTimeout(t);
  }, [canAutoGen]);

  function generateNextWeek() {
    switchWeek(1);
    if (!nextPlan.meals.length) setAutoGen(1);
  }

  function fillSlot(slot: Slot) {
    const planId = plan?.id;
    if (!planId) return;
    const position = slot === "snack" ? snacks.reduce((mx, m) => Math.max(mx, m.position + 1), 0) : 0;
    const place: EngineMeal = { local_date: selected, slot, position, recipe_key: "", servings: 1, locked: false, reason: null, history: [] };
    const ctx = makeContext();
    const res = ctx ? regenerateMeal(ctx, place, []) : null;
    if (!res?.ok) return void toast(res?.message ?? "The planner is still loading.");
    const id = newId();
    addPlanned.mutate({ planId, weekStart: ws, meals: [{ id, local_date: selected, slot, position, recipe_key: res.recipe.key, servings: res.patch.servings ?? 1, locked: false, reason: res.reasons, history: [] }] });
    toast(`${SLOT_LABEL[slot]} planned: ${res.recipe.name}`, { duration: 6000, action: { label: "Undo", onClick: () => removePlanned.mutate({ ids: [id], weekStart: ws }) } });
  }

  function replaceConflicts() {
    let working: PlanMeal[] = [...meals];
    const done: { id: string; prev: MealPlace }[] = [];
    for (const c of replaceable) {
      const ctx = makeContext({ meals: working });
      const res = ctx ? regenerateMeal(ctx, c.meal, []) : null;
      if (!res?.ok) continue;
      update.mutate({ id: c.meal.id, patch: res.patch, weekStart: ws });
      done.push({ id: c.meal.id, prev: placeOf(c.meal) });
      working = working.map((m) => (m.id === c.meal.id ? { ...m, ...res.patch } : m));
    }
    if (!done.length) return void toast("Nothing else fits those meals with your current settings.");
    toast(done.length === 1 ? "Replaced 1 meal" : `Replaced ${done.length} meals`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => done.forEach((d) => update.mutate({ id: d.id, patch: d.prev, weekStart: ws })) },
    });
  }

  /* -------------------------------------------------------- the menu */

  const openMenu = (m: PlanMeal) => {
    setMenuId(m.id);
    setMenuOpen(true);
  };

  function setThumb(recipeKey: string, next: Thumb) {
    const recipe = lookup(recipeKey);
    const prev = thumbRows(feedback, recipeKey);
    prev.forEach((f) => unrecord(f.id));
    const id = next ? record(feedbackFor(recipe, recipeKey, next === "up" ? "thumbs_up" : "thumbs_down")) : null;
    const text = next === "up" ? "Noted. More like this." : next === "down" ? "Noted. It won't be planned for 90 days." : "Rating removed";
    toast(text, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          if (id) unrecord(id);
          prev.forEach((f) => record({ recipe_key: f.recipe_key, event: f.event, reason: f.reason, ingredient: f.ingredient, features: f.features }));
        },
      },
    });
  }

  function toggleLock(m: PlanMeal) {
    if (!m.locked && strip?.mealId === m.id) closeStrip("kept");
    update.mutate({ id: m.id, patch: lockMeal(!m.locked), weekStart: ws });
  }

  function moveTo(m: PlanMeal, to: { local_date: ISODate; slot: Slot }) {
    const res = moveMeal(meals, m.id, to, lookup);
    if (!res.ok) return void toast(res.message);
    if (strip?.mealId === m.id) closeStrip("kept");
    const before = res.patches.map((p) => {
      const cur = meals.find((x) => x.id === p.id)!;
      return { id: p.id, patch: { local_date: cur.local_date, slot: cur.slot, position: cur.position } };
    });
    res.patches.forEach((p) => update.mutate({ id: p.id, patch: p.patch, weekStart: ws }));
    setMenuOpen(false);
    toast(`Moved to ${dayName(to.local_date)}${res.patches.length > 1 ? ", swapped with the meal there" : ""}`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => before.forEach((p) => update.mutate({ ...p, weekStart: ws })) },
    });
  }

  function repeatTo(m: PlanMeal, to: { local_date: ISODate; slot: Slot }) {
    const res = repeatMeal(meals, m.id, to, lookup);
    if (!res.ok) return void toast(res.message);
    const planId = plan?.id;
    if (!planId) return;
    const fbId = record(res.feedback);
    setMenuOpen(false);
    const label = `Repeated on ${dayName(to.local_date)}`;
    if (res.kind === "add") {
      const id = newId();
      addPlanned.mutate({ planId, weekStart: ws, meals: [{ ...res.meal, id }] });
      toast(label, { duration: 6000, action: { label: "Undo", onClick: () => (removePlanned.mutate({ ids: [id], weekStart: ws }), unrecord(fbId)) } });
    } else {
      const occ = meals.find((x) => x.id === res.id)!;
      const prev = placeOf(occ);
      update.mutate({ id: res.id, patch: res.patch, weekStart: ws });
      toast(label, { duration: 6000, action: { label: "Undo", onClick: () => (update.mutate({ id: res.id, patch: prev, weekStart: ws }), unrecord(fbId)) } });
    }
  }

  function remove(m: PlanMeal) {
    if (strip?.mealId === m.id) closeStrip("silent");
    setMenuOpen(false);
    del.mutate({ meal: m, label: `${lookup(m.recipe_key)?.name ?? "Meal"} removed` });
  }

  /* ---------------------------------------------------------- render */

  const range = weekRangeLabel(ws);
  const loadingWeek = !data.planLoaded || data.profileLoading;
  const thumb = menuMeal ? currentThumb(feedback, menuMeal.recipe_key).thumb : null;
  const groceryLive = grocery.items.filter((i) => !i.removed);
  const toBuy = groceryLive.filter((i) => !i.checked && !i.have).length;

  return (
    <div className="mx-auto max-w-[1120px] pb-4">
      <BackLink href="/nutrition" className="-ml-2 inline-flex h-11 items-center gap-1 rounded-[12px] pr-3 text-[14px] font-semibold text-fg-2 hover:text-fg">
        <ChevronLeft className="size-5" aria-hidden />
        Fuel
      </BackLink>
      <header className="mt-1 mb-5 flex items-end justify-between gap-3 lg:mb-7">
        <div className="min-w-0">
          <p className="eyebrow mb-2">Meals</p>
          <h1 className="t-title">Your week, fuelled</h1>
        </div>
        <div className="-mr-2 flex shrink-0 items-center lg:hidden">
          <IconLink href="/nutrition/meals/grocery" icon={ShoppingBasket} label="Grocery list" />
          <IconLink href="/nutrition/meals/preferences" icon={SlidersHorizontal} label="Meal preferences" />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-7">
        {/* week + days */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:col-span-4 lg:gap-4">
          <div className="flex items-center gap-3">
            <Segmented<"this" | "next">
              value={offset === 0 ? "this" : "next"}
              onChange={(v) => switchWeek(v === "this" ? 0 : 1)}
              options={[
                { value: "this", label: "This week" },
                { value: "next", label: "Next week" },
              ]}
              ariaLabel="Week"
              className="w-[220px] shrink-0 lg:w-auto lg:flex-1"
            />
            <p className="ml-auto whitespace-nowrap text-right text-[13px] font-semibold text-fg-2 lg:hidden">{range}</p>
          </div>
          <p className="hidden text-[13px] font-semibold text-fg-2 lg:block">{range}</p>
          {hasWeek && (
            <>
              <DayStrip days={days} today={today} selected={selected} onSelect={selectDay} className="lg:hidden" />
              <div className="card-instrument hidden p-1.5 lg:block">
                <DayList days={days} today={today} selected={selected} onSelect={selectDay} proteinGoal={goals?.protein ?? 0} />
              </div>
            </>
          )}
          <WeekTools
            className="hidden lg:block"
            hasWeek={hasWeek}
            offset={offset}
            lockedCount={lockedCount}
            loggedCount={loggedCount}
            nextRange={weekRangeLabel(nextWs)}
            nextPlanned={nextPlan.meals.length > 0}
            groceryDetail={!hasWeek ? "Plan a week first" : groceryLive.length ? `${toBuy} to buy` : "Built from this week's meals"}
            prefsDetail={prefsSummary(prefs)}
            disabled={!ready || generating}
            onRegenerateWeek={() => setConfirmWeek(true)}
            onNextWeek={generateNextWeek}
          />
        </aside>

        {/* the day */}
        <section className="mt-4 min-w-0 lg:col-span-8 lg:mt-0" aria-label={hasWeek ? `${dayName(selected)} ${shortDate(selected, today)}` : "Plan"}>
          {data.error ? (
            <ErrorNote onRetry={() => void data.refetchPlan()}>Couldn&apos;t load your plan. Check your connection.</ErrorNote>
          ) : loadingWeek ? (
            <WeekSkeleton />
          ) : !hasGoals ? (
            <NeedsGoals />
          ) : !hasWeek ? (
            goals && <EmptyWeek range={range} goals={goals} prefs={prefs} prefsSaved={data.prefsSaved} ready={ready} busy={generating} onGenerate={() => void generate("first")} />
          ) : (
            <div className="flex flex-col gap-3">
              {note && note.week === ws && (
                <div className="flex items-start gap-3 rounded-[14px] border border-lapis-line bg-lapis-tint py-2.5 pr-1 pl-3.5" role="status">
                  <Info className="mt-1 size-4 shrink-0 text-lapis-text" aria-hidden />
                  <p className="min-w-0 flex-1 py-1 text-[13px] font-medium leading-snug text-fg-2">{note.text}</p>
                  <button type="button" onClick={() => setNote(null)} aria-label="Dismiss" className="press grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-3 hover:text-fg">
                    <X className="size-4" />
                  </button>
                </div>
              )}
              {conflicts.length > 0 && (
                <ConflictBanner count={conflicts.length} examples={conflicts.map((c) => `${lookup(c.meal.recipe_key)?.name ?? "A meal"}: ${c.text}`)} replaceable={replaceable.length} busy={false} onReplace={replaceConflicts} />
              )}

              <div ref={dayRef} className="flex flex-col gap-3">
                <DayHeading date={selected} today={today} />
                <DayTotals planned={totals[selected]} ahead={aheadTotals[selected]} goals={goals} meals={dayMeals.length} logged={dayMeals.filter((m) => loggedSet.has(m.id)).length} />
                <div className="flex flex-col gap-3">
                  {orderedPlaces(dayMeals, missingMainSlots(dayMeals)).map((p, i) =>
                    p.kind === "empty" ? (
                      <EmptySlotCard key={`empty-${p.slot}`} slot={p.slot} busy={!plan?.id || addPlanned.isPending} onFill={() => fillSlot(p.slot)} />
                    ) : (
                      <PlannedMealCard
                        key={`${appear}:${p.meal.id}`}
                        meal={p.meal}
                        recipe={lookup(p.meal.recipe_key)}
                        snacksThatDay={snacks.length}
                        logged={loggedSet.has(p.meal.id)}
                        busy={!!busy[p.meal.id]}
                        conflict={conflictById.get(p.meal.id)}
                        appear={appear > 0 ? i : null}
                        onRegenerate={() => regenerate(p.meal)}
                        onToggleLock={() => toggleLock(p.meal)}
                        onMenu={() => openMenu(p.meal)}
                        onOpen={() => closeStrip("kept")}
                        strip={
                          strip && strip.mealId === p.meal.id ? (
                            <RegenStrip
                              fromName={lookup(strip.from.recipe_key)?.name ?? "the last pick"}
                              phase={strip.phase}
                              noted={strip.noted}
                              chosen={strip.chosen}
                              onUndo={() => closeStrip("undo")}
                              onReason={chooseReason}
                              onClose={() => closeStrip("kept")}
                            />
                          ) : null
                        }
                      />
                    ),
                  )}
                  {snacks.length < prefs.snacksPerDay && dayMeals.length > 0 && (
                    <button
                      type="button"
                      onClick={() => fillSlot("snack")}
                      disabled={!plan?.id || addPlanned.isPending}
                      className="press-soft flex min-h-14 items-center justify-center gap-2 rounded-[16px] border border-dashed border-line-strong text-[14px] font-bold text-fg-2 hover:text-fg disabled:opacity-50"
                    >
                      <Plus className="size-4 text-gold-300" aria-hidden />
                      Add a snack
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <WeekTools
            className="mt-6 lg:hidden"
            hasWeek={hasWeek}
            offset={offset}
            lockedCount={lockedCount}
            loggedCount={loggedCount}
            nextRange={weekRangeLabel(nextWs)}
            nextPlanned={nextPlan.meals.length > 0}
            groceryDetail={!hasWeek ? "Plan a week first" : groceryLive.length ? `${toBuy} to buy` : "Built from this week's meals"}
            prefsDetail={prefsSummary(prefs)}
            disabled={!ready || generating}
            onRegenerateWeek={() => setConfirmWeek(true)}
            onNextWeek={generateNextWeek}
          />
          {hasWeek && (
            <p className="mt-4 px-1 text-center text-[12px] font-medium leading-relaxed text-fg-3 lg:text-left">
              Planned meals are not eaten food. Add a meal to your food log from its recipe. Nutrition is an estimate from the ingredient database.
            </p>
          )}
        </section>
      </div>

      <MealMenuSheet
        target={menuMeal ? { meal: menuMeal, recipe: lookup(menuMeal.recipe_key) } : null}
        open={menuOpen && !!menuMeal}
        onOpenChange={setMenuOpen}
        days={week.days}
        today={today}
        weekMeals={meals}
        lookup={lookup}
        thumb={thumb}
        favourite={menuMeal ? favourites.isFavourite(menuMeal.recipe_key) : false}
        onThumb={(t) => menuMeal && setThumb(menuMeal.recipe_key, thumb === t ? null : t)}
        onFavourite={() => {
          if (!menuMeal) return;
          const r = lookup(menuMeal.recipe_key);
          const on = !favourites.isFavourite(menuMeal.recipe_key);
          toggleFav.mutate({ recipeKey: menuMeal.recipe_key, on, features: r ? recipeFeatures(r) : undefined });
          if (on) toast("Saved to favourites", { description: "Favourites come back more often." });
        }}
        onToggleLock={() => menuMeal && toggleLock(menuMeal)}
        onMove={(to) => menuMeal && moveTo(menuMeal, to)}
        onRepeat={(to) => menuMeal && repeatTo(menuMeal, to)}
        onRemove={() => menuMeal && remove(menuMeal)}
        onOpenRecipe={() => setMenuOpen(false)}
      />
      <DislikeSheet
        recipe={strip ? lookup(strip.from.recipe_key) : undefined}
        open={dislikeOpen && !!strip && !!stripMeal}
        onOpenChange={setDislikeOpen}
        alreadyDisliked={prefs.dislikedIngredients}
        onConfirm={confirmDislike}
      />
      <Confirm
        open={confirmWeek}
        onOpenChange={setConfirmWeek}
        title={`Regenerate ${offset === 0 ? "this" : "next"} week?`}
        body={
          <>
            Every meal gets a new pick
            {lockedCount || loggedCount ? <> except {[lockedCount ? `${lockedCount} locked` : "", loggedCount ? `${loggedCount} already logged` : ""].filter(Boolean).join(" and ")}</> : null}. You can undo it.
          </>
        }
        confirmLabel="Regenerate"
        destructive={false}
        onConfirm={() => void generate("again")}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

type Place = { kind: "meal"; meal: PlanMeal } | { kind: "empty"; slot: Slot };

const SLOT_RANK: Record<Slot, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };

/** The day's meals in eating order, with an empty card where a main meal is missing. */
function orderedPlaces(dayMeals: readonly PlanMeal[], missing: readonly Slot[]): Place[] {
  const out: (Place & { rank: number; pos: number })[] = [
    ...dayMeals.map((meal) => ({ kind: "meal" as const, meal, rank: SLOT_RANK[meal.slot], pos: meal.position })),
    ...missing.map((slot) => ({ kind: "empty" as const, slot, rank: SLOT_RANK[slot], pos: -1 })),
  ];
  return out.sort((a, b) => a.rank - b.rank || a.pos - b.pos);
}

function DayHeading({ date, today }: { date: ISODate; today: ISODate }) {
  const rel = date === today ? "Today" : date === addDays(today, 1) ? "Tomorrow" : date === addDays(today, -1) ? "Yesterday" : null;
  return (
    <div className="flex items-baseline gap-2.5 px-0.5 pt-1">
      <h2 className="t-h2">{dayName(date)}</h2>
      <span className="text-[13px] font-semibold text-fg-2">
        {shortDate(date, today)}
        {rel && <span className={cn("ml-2", rel === "Today" ? "text-gold-300" : "text-fg-3")}>{rel}</span>}
      </span>
      {date < today && <span className="ml-auto text-[12px] font-medium text-fg-3">Past day</span>}
    </div>
  );
}

function IconLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} aria-label={label} title={label} className="press grid size-11 place-items-center rounded-[12px] text-fg-2 hover:bg-white/[.04] hover:text-fg">
      <Icon className="size-5" aria-hidden />
    </Link>
  );
}

function ToolRow({ icon: Icon, label, detail, onClick, href, disabled }: { icon: LucideIcon; label: string; detail?: ReactNode; onClick?: () => void; href?: string; disabled?: boolean }) {
  const inner = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-s3 text-gold-300">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-fg">{label}</span>
        {detail && <span className="block truncate text-[12.5px] font-medium text-fg-3">{detail}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
    </>
  );
  const cls = "press-soft flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[.02] disabled:opacity-50";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/** The week's tools as one grouped list: regenerate, next week, grocery list, preferences. */
function WeekTools({
  className,
  hasWeek,
  offset,
  lockedCount,
  loggedCount,
  nextRange,
  nextPlanned,
  groceryDetail,
  prefsDetail,
  disabled,
  onRegenerateWeek,
  onNextWeek,
}: {
  className?: string;
  hasWeek: boolean;
  offset: 0 | 1;
  lockedCount: number;
  loggedCount: number;
  nextRange: string;
  nextPlanned: boolean;
  groceryDetail: string;
  prefsDetail: string;
  disabled: boolean;
  onRegenerateWeek: () => void;
  onNextWeek: () => void;
}) {
  const keeps = [lockedCount ? `${lockedCount} locked` : "", loggedCount ? `${loggedCount} logged` : ""].filter(Boolean).join(" and ");
  return (
    <nav aria-label="Week tools" className={cn("card-instrument divide-y divide-line-hair overflow-hidden p-0", className)}>
      {hasWeek && <ToolRow icon={RefreshCw} label="Regenerate week" detail={keeps ? `Keeps ${keeps}` : "Lock a meal to keep it"} onClick={onRegenerateWeek} disabled={disabled} />}
      {hasWeek && offset === 0 && (
        <ToolRow icon={CalendarPlus} label={nextPlanned ? "Next week" : "Generate next week"} detail={nextPlanned ? `${nextRange} · planned` : nextRange} onClick={onNextWeek} disabled={disabled && !nextPlanned} />
      )}
      <ToolRow icon={ShoppingBasket} label="Grocery list" detail={groceryDetail} href="/nutrition/meals/grocery" />
      <ToolRow icon={SlidersHorizontal} label="Preferences" detail={prefsDetail} href="/nutrition/meals/preferences" />
    </nav>
  );
}

function WeekSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading your plan">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-[132px] rounded-[16px]" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[148px] rounded-[16px]" />
      ))}
    </div>
  );
}


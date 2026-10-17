"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, ChefHat, ChevronRight, Moon, Plus, RefreshCw, ShoppingBasket, SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useTypicalDurations } from "@/components/training/hooks";
import { Segmented } from "@/components/ui/controls";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Confirm, Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/data/core";
import {
  useAddFeedback,
  useDeleteFeedback,
  useDeletePlannedMeal,
  useGroceryItems,
  usePlan,
  usePlannedPortions,
  useSaveMealPrefs,
  useSavePlan,
  useToggleFavourite,
  useUpdatePlannedMeal,
  type NewFeedback,
  type PlanMeal,
} from "@/lib/data/meals";
import { useProfile } from "@/lib/data/profile";
import { planFor, useDayPlans, useTemplates, useVolleyball } from "@/lib/data/training";
import { addDays, dayName, parseISODate, shortDate, type ISODate } from "@/lib/dates";
import { planFollowed, planFollowedLabel } from "@/lib/adherence";
import { coinStatus, mosaicRows, nextMealId, placeKey, planAverage, planPercent, type CoinStatus } from "@/lib/fuel/mosaic";
import { dayTotals, feedbackFor, generateWeek, lockMeal, moveMeal, regenerateMeal, regenerateReasonFeedback, repeatMeal, type EngineMeal } from "@/lib/meals/engine";
import { ingredientName } from "@/lib/meals/ingredients";
import { makeAheadOf, recipeFeatures, recipeMacros } from "@/lib/meals/recipe";
import type { FeedbackReason, MealPrefs, Slot } from "@/lib/meals/types";
import { useSwapIn } from "@/lib/motion";
import { plannedTime, type MealRole } from "@/lib/now/meal-times";
import { effectiveTrainAt, formatClock, parseAppPrefs, toMinutes } from "@/lib/prefs";
import { estimateDurationMin } from "@/lib/training/program";
import { formatInt } from "@/lib/units";
import { useMinuteNow } from "@/components/nutrition/today/useFuelDay";
import { useEatenChanged } from "../shared/EatenButton";
import { SLOT_LABEL, slotTitle } from "../shared/format";
import { recipeHref } from "../shared/RecipeCard";
import { DislikeSheet } from "./DislikeSheet";
import { useAddPlannedMeals, usePlannerData, useRemovePlannedMeals } from "./hooks";
import { MealMenuSheet } from "./MealMenuSheet";
import { EmptySlotRow, MealRow } from "./MealRow";
import { Mosaic, type MosaicDay } from "./Mosaic";
import { conflictsInWeek, currentThumb, MAIN_SLOTS, midWeekNote, missingMainSlots, notedText, reasonWantsRepick, thumbRows, weekNotes, weekRangeLabel, type Thumb } from "./model";
import { ConflictBanner, EmptyWeek, NeedsGoals, prefsSummary } from "./Panels";
import { RegenStrip, type StripPhase } from "./RegenStrip";

/** The shimmer shows at least this long, so a swap reads as "found you another" rather than a flicker. */
const MIN_REGEN_MS = 340;
/** A recorded reason folds the strip away after this long (the meal is kept). */
const NOTED_MS = 3600;

const ROLE_SPOKEN: Partial<Record<MealRole, string>> = { pre: "pre-workout", post: "post-workout", snack: "snack", breakfast: "breakfast", lunch: "lunch", dinner: "dinner" };
const ROLE_EYEBROW: Partial<Record<MealRole, string>> = { pre: "pre-workout", post: "post-workout" };

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
 * Fuel → Week: THE WEEK'S TABLE (docs/DESIGN-V2.md §3.5.2). A coin mosaic of the plan (eaten coins
 * wear leaf rims, planned ones are ivory, missed ones dashed), the plan's daily average (PLAN) and
 * "Plan followed X of Y" (CALC), then the selected day's meals with Eaten / Cook / ⋯ (swap with a
 * one-tap why, lock, move, repeat, like, favourite, remove), the Market and Cook-ahead tiles and
 * the week's tools. The planner engine is unchanged. URL: ?week=next, ?day=, ?generate=1.
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
  const [note, setNote] = useState<{ week: ISODate; text: string; wholeWeekOffer?: boolean } | null>(null);
  const [autoGen, setAutoGen] = useState<0 | 1 | null>(params.get("generate") === "1" ? 0 : null);

  /* ----------------------------------------------------------- derived */

  const totals = useMemo(() => dayTotals(meals, lookup), [meals, lookup]);
  const loggedSet = useMemo(() => new Set(data.loggedIds), [data.loggedIds]);

  // his times: each meal placed with plannedTime() on its day (the training day moves the pre-workout snack)
  const { profile } = useProfile();
  const { byKey } = useTemplates();
  const dayPlans = useDayPlans(ws, addDays(ws, 6));
  const vb = useVolleyball(ws, addDays(ws, 6));
  const typical = useTypicalDurations();
  const portions = usePlannedPortions(ws);
  const now = useMinuteNow();
  const schedule = useMemo(() => parseAppPrefs(profile?.prefs).day, [profile?.prefs]);
  const dayInfo = useMemo(() => {
    const appPrefs = parseAppPrefs(profile?.prefs);
    const trainAt = profile ? effectiveTrainAt(appPrefs, profile.reminders) : null;
    const trainMin = trainAt ? toMinutes(trainAt) : Number.NaN;
    const vbDates = new Set((vb.data ?? []).map((v) => v.local_date));
    return week.days.map((date) => {
      const p = profile ? planFor(date, profile, dayPlans.data ?? [], byKey) : null;
      const template = p?.template ?? null;
      const train = template ? { at: Number.isNaN(trainMin) ? null : trainMin, durationMin: typical[template.key] ?? estimateDurationMin(template) } : null;
      return { date, session: template?.name ?? null, train, volleyball: vbDates.has(date) };
    });
  }, [profile, dayPlans.data, byKey, vb.data, typical, week.days]);
  const placed = useMemo(
    () =>
      meals.map((m) => {
        const di = dayInfo.find((x) => x.date === m.local_date);
        const t = plannedTime({ slot: m.slot, position: m.position }, { schedule, snacksPerDay: prefs.snacksPerDay, train: di?.train ?? null });
        return { meal: m, at: t.at, role: t.role };
      }),
    [meals, dayInfo, schedule, prefs.snacksPerDay],
  );
  const status = useMemo(() => {
    const out = new Map<string, CoinStatus>();
    for (const p of placed) {
      const logged = portions.portions[p.meal.id] ?? (loggedSet.has(p.meal.id) ? [{ amount: p.meal.servings, unit: "serving" }] : []);
      out.set(p.meal.id, coinStatus({ id: p.meal.id, local_date: p.meal.local_date, at: p.at, servings: p.meal.servings, logged }, today, now));
    }
    const todays = placed.filter((p) => p.meal.local_date === today).map((p) => ({ id: p.meal.id, at: p.at, eaten: loggedSet.has(p.meal.id) }));
    const next = nextMealId(todays, now);
    if (next && out.get(next) === "planned") out.set(next, "next");
    return out;
  }, [placed, portions.portions, loggedSet, today, now]);
  const rows = useMemo(() => mosaicRows(meals, schedule, prefs.snacksPerDay), [meals, schedule, prefs.snacksPerDay]);
  const mosaicDays: MosaicDay[] = useMemo(
    () =>
      dayInfo.map((di) => {
        const cells: MosaicDay["cells"] = {};
        for (const p of placed) {
          if (p.meal.local_date !== di.date) continue;
          const key = placeKey(p.meal.slot, p.meal.position);
          if (cells[key]) continue;
          const recipe = lookup(p.meal.recipe_key);
          const macros = recipe ? recipeMacros(recipe, p.meal.servings) : null;
          cells[key] = { id: p.meal.id, recipeKey: p.meal.recipe_key, recipe, name: recipe?.name ?? "Planned meal", kcal: macros?.kcal ?? 0, protein: macros?.protein ?? 0, at: p.at, status: status.get(p.meal.id) ?? "planned", role: p.role };
        }
        return { date: di.date, session: di.session, volleyball: di.volleyball, percent: planPercent(totals[di.date]?.kcal, goals?.kcal ?? 0), cells };
      }),
    [dayInfo, placed, lookup, status, totals, goals],
  );
  const followed = useMemo(() => planFollowed(placed.map((p) => ({ id: p.meal.id, local_date: p.meal.local_date, at: p.at })), loggedSet, today, now), [placed, loggedSet, today, now]);
  const average = useMemo(() => planAverage(totals), [totals]);
  const mosaicLabel = useMemo(() => {
    const eaten = [...status.values()].filter((s) => s === "eaten" || s === "changed").length;
    const nextP = placed.find((p) => status.get(p.meal.id) === "next");
    const nextText = nextP ? `; ${dayName(nextP.meal.local_date)} ${ROLE_SPOKEN[nextP.role] ?? nextP.meal.slot} is next` : "";
    return meals.length ? `${eaten} of ${meals.length} planned meals eaten this week${nextText}` : "No meals planned this week";
  }, [status, placed, meals.length]);
  const dayMeals = useMemo(() => meals.filter((m) => m.local_date === selected), [meals, selected]);
  const snacks = dayMeals.filter((m) => m.slot === "snack");
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
    const path = window.location.pathname;
    window.history.replaceState(window.history.state, "", qs ? `${path}?${qs}` : path);
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

  /** `fill`: plan the whole week but keep every meal already planned (the days before today get filled in). */
  async function generate(kind: "first" | "again" | "fill", wholeWeek = false) {
    const ctx = makeContext({ seed: `${ws}:${Date.now()}`, wholeWeek, keepIds: kind === "fill" ? meals.map((m) => m.id) : undefined });
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
      // `save`: the new picks plus the meals kept as they were (past days mid-week, locked, logged)
      await savePlan.mutateAsync({ weekStart: ws, meals: res.save, settings: prefs, undoLabel: kind === "again" ? "Week regenerated" : kind === "fill" ? "Earlier days planned" : false });
      if (kind === "first") {
        toast("Week planned", {
          description: `${res.meals.length} meals. Nothing is logged until you add it.`,
          duration: 6000,
          action: { label: "Undo", onClick: () => savePlan.mutate({ weekStart: ws, meals: [], keepLocked: false, undoLabel: false }) },
        });
      }
      const mid = midWeekNote(ws, res.from, res.kept.some((m) => m.local_date < res.from));
      const text = [mid?.text, weekNotes(res, MAIN_SLOTS.length + prefs.snacksPerDay)].filter(Boolean).join(" ");
      setNote(text ? { week: ws, text, wholeWeekOffer: !!mid } : null);
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
  // the current week mid-week: generating plans from today on (the days before stay as they are)
  const midWeek = offset === 0 ? midWeekNote(ws, today) : null;
  const loadingWeek = !data.planLoaded || data.profileLoading;
  const thumb = menuMeal ? currentThumb(feedback, menuMeal.recipe_key).thumb : null;
  const groceryLive = grocery.items.filter((i) => !i.removed);
  const toBuy = groceryLive.filter((i) => !i.checked && !i.have).length;
  const menuPlaced = menuMeal ? placed.find((p) => p.meal.id === menuMeal.id) : undefined;
  const menuRecipe = menuMeal ? lookup(menuMeal.recipe_key) : undefined;
  const menuMacros = menuRecipe && menuMeal ? recipeMacros(menuRecipe, menuMeal.servings) : null;
  const changed = useEatenChanged(
    menuMeal
      ? { id: menuMeal.id, slot: menuMeal.slot, local_date: menuMeal.local_date, servings: menuMeal.servings, recipe: menuRecipe, name: menuRecipe?.name ?? "Planned meal", kcal: menuMacros?.kcal ?? 0, protein: menuMacros?.protein ?? 0, at: menuPlaced?.at }
      : { id: "", slot: "lunch", local_date: today, servings: 1, recipe: null, name: "", kcal: 0, protein: 0 },
  );

  // the selected day in time order, with a row for a missing main meal at its time
  const dayPlaced = placed.filter((p) => p.meal.local_date === selected).sort((a, b) => a.at - b.at || a.meal.position - b.meal.position);
  const missing = missingMainSlots(dayMeals).map((slot) => ({ slot, at: plannedTime({ slot, position: 0 }, { schedule, snacksPerDay: prefs.snacksPerDay, train: null }).at }));
  const dayItems: ({ kind: "meal"; p: (typeof placed)[number] } | { kind: "empty"; slot: Slot; at: number })[] = [
    ...dayPlaced.map((p) => ({ kind: "meal" as const, p })),
    ...missing.map((m) => ({ kind: "empty" as const, slot: m.slot, at: m.at })),
  ].sort((a, b) => (a.kind === "meal" ? a.p.at : a.at) - (b.kind === "meal" ? b.p.at : b.at));
  const dayEaten = dayPlaced.filter((p) => loggedSet.has(p.meal.id)).length;
  const aheadMeals = placed.filter((p) => p.meal.local_date >= today && !loggedSet.has(p.meal.id) && makeAheadOf(lookup(p.meal.recipe_key) ?? { steps: [] }));

  return (
    <div className="@container pb-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-title-1 text-ivory">The week&apos;s table</h1>
          <p className="t-meta mt-1 text-stone">
            {range}
            {hasWeek ? ` · ${meals.length} meals` : ""}
          </p>
        </div>
        <Link
          href="/nutrition/meals/preferences"
          aria-label="Meal preferences"
          className="press -mr-1 grid size-11 shrink-0 place-items-center rounded-full text-stone shadow-[inset_0_0_0_1px_var(--vein-3)] hover:text-ivory"
        >
          <SlidersHorizontal className="size-5" strokeWidth={1.6} aria-hidden />
        </Link>
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Segmented<"this" | "next">
          size="sm"
          value={offset === 0 ? "this" : "next"}
          onChange={(v) => switchWeek(v === "this" ? 0 : 1)}
          options={[
            { value: "this", label: "This week" },
            { value: "next", label: "Next week" },
          ]}
          ariaLabel="Week"
          className="w-[13.5rem]"
        />
      </div>

      {hasWeek && (average || followed.due > 0) && (
        <div className="t-callout mt-4 flex flex-col gap-2 text-stone">
          {average && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Tag kind="PLAN" />
              <span>
                avg <span className="tnum font-semibold text-ivory">{formatInt(average.kcal)}</span> kcal · <span className="tnum font-semibold text-ivory">{average.protein} g</span> protein a day
              </span>
            </p>
          )}
          {offset === 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Tag kind="CALC" explain={`Planned meals with a food-log entry linked to them, out of those that were due (past days, and today's from 2 h after their time): ${followed.done} of ${followed.due}.`} />
              <span>{planFollowedLabel(followed)}</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-5">
        {data.error ? (
          <ErrorNote onRetry={() => void data.refetchPlan()}>Couldn&apos;t load your plan. Check your connection.</ErrorNote>
        ) : loadingWeek ? (
          <WeekSkeleton />
        ) : !hasGoals ? (
          <NeedsGoals />
        ) : (
          <Mosaic rows={rows} days={mosaicDays} today={today} selected={selected} onSelect={selectDay} label={mosaicLabel} empty={!hasWeek} />
        )}
      </div>

      {!data.error && !loadingWeek && hasGoals && !hasWeek && goals && (
        <EmptyWeek
          range={range}
          goals={goals}
          prefs={prefs}
          prefsSaved={data.prefsSaved}
          ready={ready}
          busy={generating}
          fromToday={!!midWeek}
          onGenerate={() => void generate("first")}
          onGenerateWhole={midWeek ? () => void generate("first", true) : undefined}
        />
      )}

      {!data.error && !loadingWeek && hasGoals && hasWeek && (
        <>
          {note && note.week === ws && (
            <div className="mt-5 flex items-start gap-2 rounded-field bg-m2 py-1 pl-3.5 pr-1 shadow-[inset_0_0_0_1px_var(--vein-2)]" role="status">
              <div className="min-w-0 flex-1 py-2.5">
                <p className="t-meta text-stone">{note.text}</p>
                {note.wholeWeekOffer && midWeek && (
                  <button
                    type="button"
                    onClick={() => void generate("fill", true)}
                    disabled={generating}
                    className="press t-callout -ml-1 mt-1 inline-flex min-h-11 items-center gap-1 rounded-field px-1 font-semibold text-ivory disabled:opacity-50"
                  >
                    Plan {midWeek.earlier} too
                    <ChevronRight className="size-4" strokeWidth={1.6} aria-hidden />
                  </button>
                )}
              </div>
              <button type="button" onClick={() => setNote(null)} aria-label="Dismiss" className="press grid size-11 shrink-0 place-items-center rounded-full text-stone hover:text-ivory">
                <X className="size-4" strokeWidth={1.6} />
              </button>
            </div>
          )}
          {conflicts.length > 0 && (
            <div className="mt-5">
              <ConflictBanner count={conflicts.length} examples={conflicts.map((c) => `${lookup(c.meal.recipe_key)?.name ?? "A meal"}: ${c.text}`)} replaceable={replaceable.length} busy={false} onReplace={replaceConflicts} />
            </div>
          )}

          <section ref={dayRef} className="mt-7" aria-labelledby="week-day-title">
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 border-b border-vein pb-2">
              <h2 id="week-day-title" className="t-title-2 text-ivory">
                {dayName(selected)}
                <span className="text-stone"> · {selected === today ? "today" : selected === addDays(today, 1) ? "tomorrow" : shortDate(selected, today)}</span>
              </h2>
              <p className="t-meta tnum shrink-0 pb-0.5 text-stone">
                {dayPlaced.length ? `${dayEaten} of ${dayPlaced.length} eaten` : "nothing planned"}
                {totals[selected] ? ` · ${formatInt(totals[selected]!.kcal)} kcal` : ""}
              </p>
            </div>
            <ul className="divide-y divide-vein">
              {dayItems.map((it, i) =>
                it.kind === "empty" ? (
                  <EmptySlotRow key={`empty-${it.slot}`} slot={it.slot} busy={!plan?.id || addPlanned.isPending} onFill={() => fillSlot(it.slot)} />
                ) : (
                  <MealRow
                    key={`${appear}:${it.p.meal.id}`}
                    meal={it.p.meal}
                    recipe={lookup(it.p.meal.recipe_key)}
                    title={slotTitle(it.p.meal.slot, it.p.meal.position, snacks.length)}
                    at={it.p.at}
                    role={ROLE_EYEBROW[it.p.role] ?? null}
                    status={status.get(it.p.meal.id) ?? "planned"}
                    isPast={selected < today}
                    isFuture={selected > today}
                    busy={!!busy[it.p.meal.id]}
                    conflict={conflictById.get(it.p.meal.id)}
                    appear={appear > 0 ? i : null}
                    onMenu={() => openMenu(it.p.meal)}
                    onEatenChanged={() => {
                      setMenuId(it.p.meal.id);
                      changed.setOpen(true);
                    }}
                    onOpen={() => closeStrip("kept")}
                    strip={
                      strip && strip.mealId === it.p.meal.id ? (
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
            </ul>
            {snacks.length < prefs.snacksPerDay && dayMeals.length > 0 && (
              <button
                type="button"
                onClick={() => fillSlot("snack")}
                disabled={!plan?.id || addPlanned.isPending}
                className="press-soft t-callout mt-1 flex min-h-14 w-full items-center justify-center gap-2 rounded-btn font-semibold text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory disabled:opacity-50"
              >
                <Plus className="size-4" strokeWidth={1.6} aria-hidden />
                Add a snack
              </button>
            )}
          </section>

          <div className="mt-7 grid grid-cols-2 gap-3 @max-[19rem]:grid-cols-1">
            <Tile
              href="/nutrition?tab=market"
              icon={ShoppingBasket}
              title="Market"
              detail={groceryLive.length ? `${toBuy} to buy · ${groceryLive.length} items` : "Built from this week"}
            />
            <CookAheadTile meals={aheadMeals.map((p) => ({ id: p.meal.id, date: p.meal.local_date, at: p.at, recipeKey: p.meal.recipe_key, name: lookup(p.meal.recipe_key)?.name ?? "Planned meal", label: makeAheadOf(lookup(p.meal.recipe_key) ?? { steps: [] })?.label ?? "" }))} today={today} />
          </div>
        </>
      )}

      <WeekTools
        className="mt-7"
        hasWeek={hasWeek}
        offset={offset}
        lockedCount={lockedCount}
        loggedCount={loggedCount}
        nextRange={weekRangeLabel(nextWs)}
        nextPlanned={nextPlan.meals.length > 0}
        prefsDetail={prefsSummary(prefs)}
        disabled={!ready || generating}
        onRegenerateWeek={() => setConfirmWeek(true)}
        onNextWeek={generateNextWeek}
      />
      {hasWeek && <p className="t-meta mt-4 px-1 text-center text-stone">Planned meals are not eaten food: Eaten adds one to your log. Meal macros are worked out from the ingredient database (CALC).</p>}

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
        onRegenerate={
          menuMeal && !menuMeal.locked && !loggedSet.has(menuMeal.id)
            ? () => {
                setMenuOpen(false);
                regenerate(menuMeal);
              }
            : null
        }
        onEatenChanged={
          menuMeal && !loggedSet.has(menuMeal.id) && menuMeal.local_date <= today && menuRecipe
            ? () => {
                setMenuOpen(false);
                changed.setOpen(true);
              }
            : null
        }
      />
      {changed.sheet}
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
            {midWeek ? `Every meal from today on gets a new pick` : "Every meal gets a new pick"}
            {lockedCount || loggedCount ? <> except {[lockedCount ? `${lockedCount} locked` : "", loggedCount ? `${loggedCount} already logged` : ""].filter(Boolean).join(" and ")}</> : null}.
            {midWeek ? ` ${midWeek.earlier} ${midWeek.earlier.includes(" to ") ? "stay" : "stays"} as planned.` : ""} You can undo it.
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

function Tile({ href, onClick, icon: Icon, title, detail }: { href?: string; onClick?: () => void; icon: LucideIcon; title: string; detail: ReactNode }) {
  const inner = (
    <>
      <span className="grid size-10 place-items-center rounded-full text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]">
        <Icon className="size-5" strokeWidth={1.6} aria-hidden />
      </span>
      <span className="mt-3 block t-title-3 text-ivory">{title}</span>
      <span className="t-meta mt-0.5 block text-stone">{detail}</span>
    </>
  );
  const cls = "press-soft block min-h-[8.5rem] rounded-card bg-m2 p-4 text-left shadow-(--e1)";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** Meals this week that need doing ahead (overnight oats, eggs boiled ahead): the planner's make-ahead flag. */
function CookAheadTile({ meals, today }: { meals: { id: string; date: ISODate; at: number; recipeKey: string; name: string; label: string }[]; today: ISODate }) {
  const [open, setOpen] = useState(false);
  const first = meals[0];
  return (
    <>
      <Tile
        icon={Moon}
        title="Cook ahead"
        detail={first ? `${meals.length} ${meals.length === 1 ? "meal" : "meals"} · next ${first.date === today ? "today" : dayName(first.date, true)}` : "Nothing to do ahead this week"}
        onClick={() => setOpen(true)}
      />
      <Sheet open={open} onOpenChange={setOpen} title="Cook ahead" description="Meals this week that need something done before the day.">
        {meals.length ? (
          <ul className="divide-y divide-vein pb-3">
            {meals.map((m) => (
              <li key={m.id}>
                <Link href={recipeHref(m.recipeKey, m.id)} onClick={() => setOpen(false)} className="press-soft flex min-h-14 items-center gap-3 py-2">
                  <ChefHat className="size-5 shrink-0 text-stone" strokeWidth={1.6} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="t-title-3 block text-ivory">{m.name}</span>
                    <span className="t-meta block text-stone">
                      {dayName(m.date)} {parseISODate(m.date).getDate()} · {formatClock(m.at)} · {m.label}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-callout pb-6 pt-2 text-stone">Nothing in this week&apos;s plan needs doing the day before.</p>
        )}
      </Sheet>
    </>
  );
}

function ToolRow({ icon: Icon, label, detail, onClick, href, disabled }: { icon: LucideIcon; label: string; detail?: ReactNode; onClick?: () => void; href?: string; disabled?: boolean }) {
  const inner = (
    <>
      <Icon className="size-5 shrink-0 text-stone" strokeWidth={1.6} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="t-title-3 block text-ivory">{label}</span>
        {detail && <span className="t-meta block truncate text-stone">{detail}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
    </>
  );
  const cls = "press-soft flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left disabled:opacity-50";
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

/** The week's tools as one placard: regenerate, next week, preferences. */
function WeekTools({
  className,
  hasWeek,
  offset,
  lockedCount,
  loggedCount,
  nextRange,
  nextPlanned,
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
  prefsDetail: string;
  disabled: boolean;
  onRegenerateWeek: () => void;
  onNextWeek: () => void;
}) {
  const keeps = [lockedCount ? `${lockedCount} locked` : "", loggedCount ? `${loggedCount} logged` : ""].filter(Boolean).join(" and ");
  return (
    <nav aria-label="Week tools" className={cn("divide-y divide-vein border-y border-vein", className)}>
      {hasWeek && <ToolRow icon={RefreshCw} label="Regenerate week" detail={keeps ? `Keeps ${keeps}` : "Lock a meal to keep it"} onClick={onRegenerateWeek} disabled={disabled} />}
      {hasWeek && offset === 0 && (
        <ToolRow icon={CalendarPlus} label={nextPlanned ? "Next week" : "Plan next week"} detail={nextPlanned ? `${nextRange} · planned` : nextRange} onClick={onNextWeek} disabled={disabled && !nextPlanned} />
      )}
      <ToolRow icon={SlidersHorizontal} label="Meal preferences" detail={prefsDetail} href="/nutrition/meals/preferences" />
    </nav>
  );
}

function WeekSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading your plan">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex justify-between gap-1 pl-10">
          {[0, 1, 2, 3, 4, 5, 6].map((j) => (
            <Skeleton key={j} className="size-9 rounded-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

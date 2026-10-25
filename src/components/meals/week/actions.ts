"use client";

// The meal planner's actions, shared by Food (plan a week, plan it again, plan next week, fill a
// place) and the recipe's ⋯ when it is opened from a planned meal (swap with a "why", lock, move,
// repeat, remove, like, not this again). The planner ENGINE (src/lib/meals/engine) is unchanged:
// these are the same calls the old week view made, moved out of it so the view could go.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { isOffline, newId } from "@/lib/data/core";
import {
  useAddFeedback,
  useDeleteFeedback,
  useDeletePlannedMeal,
  useSaveMealPrefs,
  useSavePlan,
  useToggleFavourite,
  useUpdatePlannedMeal,
  type NewFeedback,
  type PlanMeal,
} from "@/lib/data/meals";
import { addDays, dayName, parseISODate, weekStart, type ISODate } from "@/lib/dates";
import { feedbackFor, generateWeek, lockMeal, moveMeal, regenerateMeal, regenerateReasonFeedback, repeatMeal, type EngineMeal } from "@/lib/meals/engine";
import { ingredientName } from "@/lib/meals/ingredients";
import { recipeFeatures } from "@/lib/meals/recipe";
import type { FeedbackReason, MealPrefs, Slot } from "@/lib/meals/types";
import { SLOT_LABEL } from "../shared/format";
import { useAddPlannedMeals, usePlannerData, useRemovePlannedMeals } from "./hooks";
import { MAIN_SLOTS, currentThumb, midWeekNote, notedText, reasonWantsRepick, thumbRows, weekNotes, type Thumb } from "./model";

/** Whole weeks from this week's Monday to `ws`'s (0 = this week, 1 = next, −1 = last). */
export function weekOffset(ws: ISODate, today: ISODate): number {
  const a = parseISODate(weekStart(today)).getTime();
  const b = parseISODate(weekStart(ws)).getTime();
  return Math.round((b - a) / (7 * 86_400_000));
}

/** "Mon 19 – Sun 25" */
export function weekSpan(ws: ISODate): string {
  const a = parseISODate(ws);
  const b = parseISODate(addDays(ws, 6));
  return `${dayName(ws, true)} ${a.getDate()} – ${dayName(addDays(ws, 6), true)} ${b.getDate()}`;
}

/* ------------------------------------------------------------ plan a week */

export type GenerateKind = "first" | "again" | "fill";

/**
 * Plan one week (offset 0 = this week, 1 = next) with the engine and save it. `first` plans an
 * empty week, `again` replaces every meal except locked and logged ones, `fill` plans the days
 * before today too and keeps every meal already planned. Resolves true when it saved.
 */
export function usePlanWeek(offset: number) {
  const data = usePlannerData(offset);
  const savePlan = useSavePlan();
  const [generating, setGenerating] = useState(false);
  const busy = useRef(false);
  const ws = data.week.weekStart;
  const today = data.week.today;
  const midWeek = offset === 0 ? midWeekNote(ws, today) : null;

  async function generate(kind: GenerateKind, wholeWeek = false): Promise<boolean> {
    if (busy.current) return false;
    if (isOffline()) {
      toast("Planning a week needs a connection.", { description: "Your plan and food log still work offline." });
      return false;
    }
    const ctx = data.makeContext({ seed: `${ws}:${Date.now()}`, wholeWeek, keepIds: kind === "fill" ? data.meals.map((m) => m.id) : undefined });
    if (!ctx) {
      toast("The planner is still loading. Try again in a moment.");
      return false;
    }
    busy.current = true;
    setGenerating(true);
    await new Promise((r) => window.setTimeout(r, 0)); // paint the busy button first
    try {
      let res: ReturnType<typeof generateWeek>;
      try {
        res = generateWeek(ctx);
      } catch (e) {
        toast.error("Couldn't plan the week", { description: e instanceof Error ? e.message : String(e) });
        return false;
      }
      await savePlan.mutateAsync({
        weekStart: ws,
        meals: res.save,
        settings: data.prefs,
        undoLabel: kind === "again" ? "Week planned again" : kind === "fill" ? "Earlier days planned" : false,
      });
      const mid = midWeekNote(ws, res.from, res.kept.some((m) => m.local_date < res.from));
      const notes = [mid?.text, weekNotes(res, MAIN_SLOTS.length + data.prefs.snacksPerDay)].filter(Boolean).join(" ");
      if (kind === "first") {
        toast("Week planned", {
          description: notes || `${res.meals.length} meals. Nothing goes in your food log until you eat it.`,
          duration: 8000,
          action: { label: "Undo", onClick: () => savePlan.mutate({ weekStart: ws, meals: [], keepLocked: false, undoLabel: false }) },
        });
      } else if (notes) toast(notes, { duration: 8000 });
      return true;
    } catch {
      return false; // the hook rolled back and said why
    } finally {
      busy.current = false;
      setGenerating(false);
    }
  }

  return { data, generate, generating, midWeek, ws, today };
}

/* ------------------------------------------------- the swap strip (store) */

type MealPlace = Pick<PlanMeal, "recipe_key" | "servings" | "reason" | "history">;
const placeOf = (m: MealPlace): MealPlace => ({ recipe_key: m.recipe_key, servings: m.servings, reason: m.reason, history: m.history });

export type StripPhase = "ask" | "noted";

export interface SwapStrip {
  mealId: string;
  weekStart: ISODate;
  /** The pick that was swapped out: what a reason is about, and what Undo puts back. */
  from: MealPlace;
  /** The recipe in the plan now. */
  to: string;
  /** The "regenerated" learning row recorded for it (replaced when a reason is chosen). */
  feedbackId: string;
  /** Recipes already shown in this swap session (never offered again). */
  shown: string[];
  phase: StripPhase;
  chosen: FeedbackReason | null;
  noted: string | null;
}

// One strip at a time, across navigations (a swap moves the recipe screen to the new recipe).
let strip: SwapStrip | null = null;
const listeners = new Set<() => void>();
function setStrip(s: SwapStrip | null) {
  strip = s;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function useSwapStrip(): SwapStrip | null {
  return useSyncExternalStore(
    subscribe,
    () => strip,
    () => null,
  );
}

// a learning row still being added is awaited before it is removed again (a reason, Undo)
const pendingAdds = new Map<string, Promise<unknown>>();

/* ------------------------------------------------- one planned meal's actions */

/**
 * Everything you can do with one planned meal of a week (offset from this week): swap it for
 * another pick (with Undo and an optional "why" that teaches the planner), lock, move, repeat,
 * remove, like / not this again, save as a favourite, and fill an empty place.
 */
export function useMealActions(offset: number, showingId: string | null = null) {
  const data = usePlannerData(offset);
  const { meals, lookup, prefs, feedback, favourites, makeContext, plan } = data;
  const ws = data.week.weekStart;
  const update = useUpdatePlannedMeal();
  const del = useDeletePlannedMeal();
  const addPlanned = useAddPlannedMeals();
  const removePlanned = useRemovePlannedMeals();
  const addFeedback = useAddFeedback();
  const deleteFeedback = useDeleteFeedback();
  const toggleFav = useToggleFavourite();
  const savePrefs = useSaveMealPrefs();
  const loggedSet = new Set(data.loggedIds);

  const record = (f: NewFeedback): string => {
    const id = f.id ?? newId();
    const p = addFeedback.mutateAsync({ ...f, id }).catch(() => {});
    pendingAdds.set(id, p);
    void p.finally(() => pendingAdds.delete(id));
    return id;
  };
  const unrecord = (id: string) => {
    const p = pendingAdds.get(id);
    if (p) void p.finally(() => deleteFeedback.mutate(id));
    else deleteFeedback.mutate(id);
  };

  /** Close the strip: `kept` teaches the planner the new pick was fine; `undo` puts the old one back. */
  function closeStrip(mode: "kept" | "undo" | "silent") {
    const s = strip;
    if (!s) return null;
    setStrip(null);
    if (mode === "undo") {
      update.mutate({ id: s.mealId, patch: placeOf(s.from), weekStart: s.weekStart });
      unrecord(s.feedbackId);
      return s.from.recipe_key;
    }
    if (mode === "kept") record(feedbackFor(lookup(s.to), s.to, "kept"));
    return null;
  }

  const canSwap = (m: PlanMeal) => !m.locked && !loggedSet.has(m.id) && m.local_date >= data.week.today;

  /** Swap a meal for another pick. Resolves to the new recipe key (null when nothing changed). */
  function swap(meal: PlanMeal): string | null {
    if (!canSwap(meal)) return null;
    const same = strip?.mealId === meal.id ? strip : null;
    if (strip && !same) closeStrip("kept");
    const ctx = makeContext();
    if (!ctx) {
      toast("The planner is still loading. Try again in a moment.");
      return null;
    }
    const res = regenerateMeal(ctx, meal, same?.shown ?? []);
    if (!res.ok) {
      toast(res.message, { description: "Loosening a meal preference gives the planner more to pick from." });
      return null;
    }
    update.mutate({ id: meal.id, patch: res.patch, weekStart: ws });
    const feedbackId = record(res.feedback);
    setStrip({ mealId: meal.id, weekStart: ws, from: placeOf(meal), to: res.recipe.key, feedbackId, shown: res.shown, phase: "ask", chosen: null, noted: null });
    return res.recipe.key;
  }

  /** A reason for the swap: replaces the plain "regenerated" row, and picks again when the new meal doesn't answer it. Resolves to a re-picked key. */
  function applyReason(reason: FeedbackReason, ingredient: string | null = null, prefsNow?: MealPrefs): string | null {
    const s = strip;
    const current = s ? meals.find((m) => m.id === s.mealId) : undefined;
    if (!s || !current) return null;
    const fromRecipe = lookup(s.from.recipe_key);
    unrecord(s.feedbackId);
    const feedbackId = record(regenerateReasonFeedback(fromRecipe, s.from.recipe_key, reason, ingredient));
    let repicked: { key: string; name: string } | null = null;
    let shown = s.shown;
    if (reasonWantsRepick(reason, fromRecipe, lookup(s.to), ingredient)) {
      // pick again from where the swap started, so Undo still goes straight back to the original
      const before: EngineMeal = { ...current, ...placeOf(s.from) };
      const ctx = makeContext({ prefs: prefsNow });
      const res = ctx ? regenerateMeal(ctx, before, s.shown, { reason, ingredient }) : null;
      if (res?.ok) {
        update.mutate({ id: current.id, patch: res.patch, weekStart: s.weekStart });
        repicked = { key: res.recipe.key, name: res.recipe.name };
        shown = res.shown;
      }
    }
    setStrip({ ...s, to: repicked?.key ?? s.to, feedbackId, shown, phase: "noted", chosen: reason, noted: notedText(reason, repicked?.name) });
    return repicked?.key ?? null;
  }

  /** "Don't like an ingredient": add it to the dislikes (Undo), then record the reason. */
  function dislikeIngredient(key: string): string | null {
    if (prefs.dislikedIngredients.includes(key)) return applyReason("dislike_ingredient", key);
    const before = prefs.dislikedIngredients;
    const next = { ...prefs, dislikedIngredients: [...before, key] };
    savePrefs.mutate({ dislikedIngredients: next.dislikedIngredients });
    toast(`${ingredientName(key)} won't be planned again`, {
      description: "Change it any time in Meal preferences.",
      duration: 6000,
      action: { label: "Undo", onClick: () => savePrefs.mutate({ dislikedIngredients: before }) },
    });
    return applyReason("dislike_ingredient", key, next);
  }

  function toggleLock(m: PlanMeal) {
    if (!m.locked && strip?.mealId === m.id) closeStrip("kept");
    update.mutate({ id: m.id, patch: lockMeal(!m.locked), weekStart: ws });
    toast(m.locked ? "Unlocked" : "Locked", { description: m.locked ? "Planning the week again can change it." : "Planning the week again keeps it." });
  }

  function moveTo(m: PlanMeal, to: { local_date: ISODate; slot: Slot }): boolean {
    const res = moveMeal(meals, m.id, to, lookup);
    if (!res.ok) {
      toast(res.message);
      return false;
    }
    if (strip?.mealId === m.id) closeStrip("kept");
    const before = res.patches.map((p) => {
      const cur = meals.find((x) => x.id === p.id)!;
      return { id: p.id, patch: { local_date: cur.local_date, slot: cur.slot, position: cur.position } };
    });
    res.patches.forEach((p) => update.mutate({ id: p.id, patch: p.patch, weekStart: ws }));
    toast(`Moved to ${dayName(to.local_date)}${res.patches.length > 1 ? ", swapped with the meal there" : ""}`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => before.forEach((p) => update.mutate({ ...p, weekStart: ws })) },
    });
    return true;
  }

  function repeatTo(m: PlanMeal, to: { local_date: ISODate; slot: Slot }): boolean {
    const res = repeatMeal(meals, m.id, to, lookup);
    if (!res.ok) {
      toast(res.message);
      return false;
    }
    const planId = plan?.id;
    if (!planId) return false;
    const fbId = record(res.feedback);
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
    return true;
  }

  function remove(m: PlanMeal) {
    if (strip?.mealId === m.id) closeStrip("silent");
    del.mutate({ meal: m, label: `${lookup(m.recipe_key)?.name ?? "Meal"} removed from the plan` });
  }

  /** Like / "Not this again" (thumbs down: not planned for 90 days). Tapping the same one again clears it. */
  function setThumb(recipeKey: string, want: "up" | "down") {
    const recipe = lookup(recipeKey);
    const cur = currentThumb(feedback, recipeKey).thumb;
    const next: Thumb = cur === want ? null : want;
    const prev = thumbRows(feedback, recipeKey);
    prev.forEach((f) => unrecord(f.id));
    const id = next ? record(feedbackFor(recipe, recipeKey, next === "up" ? "thumbs_up" : "thumbs_down")) : null;
    const text = next === "up" ? "Liked. More like this." : next === "down" ? "It won't be planned for 90 days." : "Rating removed";
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

  function toggleFavourite(recipeKey: string) {
    const r = lookup(recipeKey);
    const on = !favourites.isFavourite(recipeKey);
    toggleFav.mutate({ recipeKey, on, features: r ? recipeFeatures(r) : undefined });
    toast(on ? "Saved" : "Removed from saved", { description: on ? "Saved meals come back more often." : undefined });
  }

  /** Plan one meal in an empty place of a day (a missing lunch, another snack). */
  function fill(date: ISODate, slot: Slot) {
    const planId = plan?.id;
    if (!planId) return;
    const dayMeals = meals.filter((m) => m.local_date === date);
    const position = slot === "snack" ? dayMeals.filter((m) => m.slot === "snack").reduce((mx, m) => Math.max(mx, m.position + 1), 0) : 0;
    const place: EngineMeal = { local_date: date, slot, position, recipe_key: "", servings: 1, locked: false, reason: null, history: [] };
    const ctx = makeContext();
    const res = ctx ? regenerateMeal(ctx, place, []) : null;
    if (!res?.ok) return void toast(res?.message ?? "The planner is still loading. Try again in a moment.");
    const id = newId();
    addPlanned.mutate({ planId, weekStart: ws, meals: [{ id, local_date: date, slot, position, recipe_key: res.recipe.key, servings: res.patch.servings ?? 1, locked: false, reason: res.reasons, history: [] }] });
    toast(`${SLOT_LABEL[slot]} planned: ${res.recipe.name}`, { duration: 6000, action: { label: "Undo", onClick: () => removePlanned.mutate({ ids: [id], weekStart: ws }) } });
  }

  /** Replace planned meals that break a preference added after planning (locked ones stay). */
  function replaceConflicts(list: readonly PlanMeal[]) {
    let working: PlanMeal[] = [...meals];
    const done: { id: string; prev: MealPlace }[] = [];
    for (const m of list) {
      if (m.locked) continue;
      const ctx = makeContext({ meals: working });
      const res = ctx ? regenerateMeal(ctx, m, []) : null;
      if (!res?.ok) continue;
      update.mutate({ id: m.id, patch: res.patch, weekStart: ws });
      done.push({ id: m.id, prev: placeOf(m) });
      working = working.map((x) => (x.id === m.id ? { ...x, ...res.patch } : x));
    }
    if (!done.length) return void toast("Nothing else fits those meals with your current preferences.");
    toast(done.length === 1 ? "Replaced 1 meal" : `Replaced ${done.length} meals`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => done.forEach((d) => update.mutate({ id: d.id, patch: d.prev, weekStart: ws })) },
    });
  }

  // A strip left open on a meal this screen isn't showing (he went back): the swap was kept.
  const latestClose = useRef(closeStrip);
  useEffect(() => {
    latestClose.current = closeStrip;
  });
  useEffect(() => {
    if (!data.ready || !strip || strip.mealId === showingId) return;
    const t = window.setTimeout(() => {
      if (strip && strip.mealId !== showingId) latestClose.current("kept");
    }, 0);
    return () => window.clearTimeout(t);
  }, [data.ready, showingId]);

  return {
    data,
    ready: data.ready,
    loggedSet,
    canSwap,
    swap,
    applyReason,
    dislikeIngredient,
    closeStrip,
    toggleLock,
    moveTo,
    repeatTo,
    remove,
    setThumb,
    thumbOf: (recipeKey: string) => currentThumb(feedback, recipeKey).thumb,
    isFavourite: (recipeKey: string) => favourites.isFavourite(recipeKey),
    toggleFavourite,
    fill,
    replaceConflicts,
  };
}

export type MealActions = ReturnType<typeof useMealActions>;

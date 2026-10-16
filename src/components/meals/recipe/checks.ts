"use client";

// Ticked ingredients and finished steps, kept on this device per meal (a planned meal's id, or
// the recipe key when opened from the library), so the checklist survives switching between
// the recipe screen and cooking mode, and a reload. Nothing here is account data.

import { useCallback, useSyncExternalStore } from "react";

const PREFIX = "pgg.meals.checks.";
const MAX_ENTRIES = 40; // oldest lists are pruned

export interface CheckState {
  /** Ingredient keys ticked off. */
  ingredients: string[];
  /** Step indexes marked done. */
  steps: number[];
  /** The step cooking mode is on (0-based), so leaving and coming back resumes there. */
  current: number;
  at: number;
}

const EMPTY: CheckState = { ingredients: [], steps: [], current: 0, at: 0 };

/** The storage scope: one checklist per planned meal, or per recipe outside a plan. */
export function checkScope(recipeKey: string, plannedMealId?: string | null) {
  return plannedMealId ? `meal:${plannedMealId}:${recipeKey}` : `recipe:${recipeKey}`;
}

export function parseChecks(raw: string | null): CheckState {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as Partial<CheckState>;
    const ingredients = Array.isArray(v.ingredients) ? v.ingredients.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
    const steps = Array.isArray(v.steps) ? v.steps.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < 100) : [];
    const current = Number.isInteger(v.current) && (v.current as number) >= 0 && (v.current as number) < 100 ? (v.current as number) : 0;
    return { ingredients: [...new Set(ingredients)], steps: [...new Set(steps)].sort((a, b) => a - b), current, at: typeof v.at === "number" ? v.at : 0 };
  } catch {
    return EMPTY;
  }
}

export function toggleIn<T>(list: readonly T[], item: T, on?: boolean): T[] {
  const has = list.includes(item);
  const want = on ?? !has;
  if (want === has) return [...list];
  return want ? [...list, item] : list.filter((x) => x !== item);
}

const cache = new Map<string, { raw: string | null; value: CheckState }>();
const subs = new Set<() => void>();

function read(scope: string): CheckState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFIX + scope);
  } catch {
    /* private mode */
  }
  const hit = cache.get(scope);
  if (hit && hit.raw === raw) return hit.value;
  const value = parseChecks(raw);
  cache.set(scope, { raw, value });
  return value;
}

function write(scope: string, next: CheckState) {
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(PREFIX + scope, raw);
    prune();
  } catch {
    /* private mode: kept in memory for this page */
  }
  cache.set(scope, { raw, value: next });
  subs.forEach((f) => f());
}

function prune() {
  const keys: { k: string; at: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) keys.push({ k, at: parseChecks(localStorage.getItem(k)).at });
  }
  if (keys.length <= MAX_ENTRIES) return;
  keys.sort((a, b) => a.at - b.at);
  for (const { k } of keys.slice(0, keys.length - MAX_ENTRIES)) localStorage.removeItem(k);
}

function subscribe(cb: () => void) {
  subs.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(PREFIX)) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    subs.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The checklist for one meal, with setters that persist on this device. */
export function useChecks(scope: string) {
  const state = useSyncExternalStore(
    subscribe,
    () => read(scope),
    () => EMPTY,
  );
  const toggleIngredient = useCallback((key: string, on?: boolean) => {
    const cur = read(scope);
    write(scope, { ...cur, ingredients: toggleIn(cur.ingredients, key, on), at: Date.now() });
  }, [scope]);
  const toggleStep = useCallback((i: number, on?: boolean) => {
    const cur = read(scope);
    write(scope, { ...cur, steps: toggleIn(cur.steps, i, on).sort((a, b) => a - b), at: Date.now() });
  }, [scope]);
  const clearIngredients = useCallback(() => {
    const cur = read(scope);
    write(scope, { ...cur, ingredients: [], at: Date.now() });
  }, [scope]);
  const clearSteps = useCallback(() => {
    const cur = read(scope);
    write(scope, { ...cur, steps: [], current: 0, at: Date.now() });
  }, [scope]);
  const setCurrent = useCallback((i: number) => {
    const cur = read(scope);
    if (cur.current !== i) write(scope, { ...cur, current: Math.max(0, Math.min(99, Math.round(i))), at: Date.now() });
  }, [scope]);
  return { ...state, toggleIngredient, toggleStep, clearIngredients, clearSteps, setCurrent };
}

"use client";

import { hashKey, keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { toast } from "sonner";
import { must, sb, useUser } from "@/lib/data/core";
import type { FoodEntry, WaterLog } from "@/lib/data/nutrition";
import type { ISODate } from "@/lib/dates";
import { distinctRecent } from "@/lib/nutrition-ui/group";
import { parseSearchResponse, searchErrorFor, SearchUnavailableError, type SearchResponse } from "@/lib/nutrition-ui/search";

/**
 * Remove rows without the "Removed · Undo" toast — used when the user taps Undo on an add,
 * where offering to undo the undo would be noise.
 */
export function useQuietRemoveFood() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    mutationFn: async ({ ids }: { ids: string[]; date: ISODate }) => {
      must(await sb().from("food_entries").delete().in("id", ids));
    },
    onMutate: async ({ ids, date }) => {
      const key = ["food", date, userId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<FoodEntry[]>(key);
      if (prev) qc.setQueryData<FoodEntry[]>(key, prev.filter((r) => !ids.includes(r.id)));
      return { key, prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't undo", { description: e.message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["food"] });
      qc.invalidateQueries({ queryKey: ["food-days"] });
      qc.invalidateQueries({ queryKey: ["food-recent"] });
    },
  });
}

/** `value`, but only after it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** True only once `flag` has been true for `ms` (skeletons never flash for fast loads). */
export function useDelayedFlag(flag: boolean, ms = 150): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const id = window.setTimeout(() => setShown(true), ms);
    return () => {
      window.clearTimeout(id);
      setShown(false);
    };
  }, [flag, ms]);
  return flag && shown;
}

/** Food database search (USDA + Open Food Facts) through the app's server route. */
export function useFoodSearch(q: string) {
  const term = q.trim();
  return useQuery<SearchResponse, Error>({
    queryKey: ["food-search", term.toLowerCase()],
    enabled: term.length >= 2,
    // a lookup where a database was down is worth retrying soon; full answers keep for 10 min
    staleTime: (query) => (query.state.data && query.state.data.status.overall !== "ok" && query.state.data.status.overall !== "demo_key" ? 0 : 10 * 60_000),
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    retry: (n, err) => !(err instanceof SearchUnavailableError && (err.kind === "unavailable" || err.kind === "auth")) && n < 1,
    queryFn: async ({ signal }) => {
      // Never leave skeletons up forever if an upstream database hangs.
      const timeout = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(15_000) : null;
      const combined = timeout && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : signal;
      let res: Response;
      try {
        res = await fetch(`/api/food/search?q=${encodeURIComponent(term)}`, { signal: combined, headers: { accept: "application/json" } });
      } catch (e) {
        if (timeout?.aborted && !signal.aborted) throw searchErrorFor(504);
        if ((e as Error).name === "AbortError") throw e;
        throw searchErrorFor(typeof navigator !== "undefined" && navigator.onLine === false ? "network" : 503);
      }
      if (!res.ok) throw searchErrorFor(res.status);
      const json = await res.json().catch(() => null);
      if (!json) throw searchErrorFor(500);
      return parseSearchResponse(json);
    },
  });
}

/** Persisted per-viewer convenience (last tab etc.). Never required for correctness. */
export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writePref(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* private mode */
  }
}

/**
 * Distinct recent foods for the Fuel screen (rail shows the first 12, the Recent tab all 40).
 * Its own key under "food-recent", so another screen asking for fewer rows can't cap this
 * list, and every food write still refreshes it.
 */
export function useFuelRecent() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["food-recent", userId, "fuel", 40],
    enabled: !!userId,
    queryFn: async () => {
      const rows = must(await sb().from("food_entries").select("*").order("eaten_at", { ascending: false }).limit(300));
      return distinctRecent(rows, 40);
    },
  });
}

/**
 * Whether a cached query holds data and whether its last fetch failed. Lets the screen
 * tell "nothing logged" apart from "couldn't load" without forking the shared hooks.
 */
export function useQueryHealth(queryKey: QueryKey): { hasData: boolean; failed: boolean } {
  const qc = useQueryClient();
  const hash = hashKey(queryKey);
  // The cache notifies while other components render (a useQuery building its entry), so
  // re-render on a microtask instead of synchronously, and only for this one query.
  const subscribe = useCallback(
    (cb: () => void) =>
      qc.getQueryCache().subscribe((e) => {
        if (e.query.queryHash === hash) queueMicrotask(cb);
      }),
    [qc, hash],
  );
  const snap = useSyncExternalStore(
    subscribe,
    () => {
      const st = qc.getQueryState(queryKey);
      return `${st?.data !== undefined ? 1 : 0}${st?.status === "error" ? 1 : 0}`;
    },
    () => "00",
  );
  return { hasData: snap[0] === "1", failed: snap[1] === "1" };
}

/**
 * Water for a past day: the tap is stamped on that day (at the current clock time), so the
 * day's list and anything ordered by logged_at stay on the right date. Today's taps use the
 * shared useWaterMutations.
 */
export function useAddPastWater(date: ISODate) {
  const qc = useQueryClient();
  const { userId } = useUser();
  const key = ["water", date, userId];
  return useMutation({
    mutationFn: async ({ id, ml, loggedAt }: { id: string; ml: number; loggedAt: string }) =>
      must(await sb().from("water_logs").insert({ id, local_date: date, amount_ml: ml, logged_at: loggedAt }).select("*").single()),
    onMutate: async ({ id, ml, loggedAt }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WaterLog[]>(key) ?? [];
      qc.setQueryData<WaterLog[]>(key, [...prev, { id, user_id: userId!, local_date: date, amount_ml: ml, logged_at: loggedAt }]);
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.prev);
      toast.error("Couldn't log water", { description: e.message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["water"] });
      qc.invalidateQueries({ queryKey: ["water-days"] });
    },
  });
}

/* ------------------------------------------------ sheets vs toast Undo */

let toastTouchAt = 0;
if (typeof document !== "undefined") {
  const mark = (e: Event) => {
    const t = e.target as Element | null;
    if (t && typeof t.closest === "function" && t.closest("[data-sonner-toaster]")) toastTouchAt = Date.now();
  };
  document.addEventListener("pointerdown", mark, true);
  document.addEventListener("focusin", mark, true);
}

/**
 * Wrap a sheet's onOpenChange so tapping a toast (its Undo) doesn't count as an outside
 * tap that closes the sheet: the user keeps their place, the Undo still runs.
 */
export function keepOpenOnToast(onOpenChange: (open: boolean) => void): (open: boolean) => void {
  return (open) => {
    if (!open && Date.now() - toastTouchAt < 700) return;
    onOpenChange(open);
  };
}

/**
 * Phones: vaul leaves focus on the button that opened the sheet. Move it into the dialog
 * (not into a field, so no keyboard pops up) so Tab stays inside the sheet.
 */
export function useFocusIntoSheet(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      const dialog = ref.current?.closest<HTMLElement>("[role=dialog]");
      if (dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(id);
  }, [ref]);
}

/**
 * Resolves once no pending mutation matches (e.g. the insert an Undo is about to delete),
 * so a fast Undo can't run its delete before the row exists and leave it behind.
 */
export function afterPendingMutations(qc: QueryClient, match: (variables: unknown) => boolean, timeoutMs = 15_000): Promise<void> {
  const cache = qc.getMutationCache();
  const busy = () => cache.getAll().some((m) => m.state.status === "pending" && match(m.state.variables));
  if (!busy()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      unsub();
      window.clearTimeout(t);
      resolve();
    };
    const unsub = cache.subscribe(() => {
      if (!busy()) done();
    });
    const t = window.setTimeout(done, timeoutMs);
  });
}

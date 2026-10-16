"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { must, sb, useUser } from "@/lib/data/core";
import type { FoodEntry } from "@/lib/data/nutrition";
import type { ISODate } from "@/lib/dates";
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
    staleTime: 10 * 60_000,
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

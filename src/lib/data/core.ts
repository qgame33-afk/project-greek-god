"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { today, type ISODate } from "@/lib/dates";

export type Tables = Database["public"]["Tables"];
export type Views = Database["public"]["Views"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];
export type Insert<T extends keyof Tables> = Tables[T]["Insert"];
export type Update<T extends keyof Tables> = Tables[T]["Update"];
export type ViewRow<T extends keyof Views> = Views[T]["Row"];

export const sb = () => supabaseBrowser();

/** Current signed-in user (cached for the session). */
export function useUser() {
  const q = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data, error } = await sb().auth.getUser();
      if (error) {
        // Offline: fall back to the locally stored session instead of "signed out".
        const local = (await sb().auth.getSession()).data.session?.user ?? null;
        if (local) return local;
        if (/fetch|network/i.test(error.message)) throw error; // let React Query retry
        return null;
      }
      return data.user;
    },
    staleTime: Infinity,
    retry: 3,
  });
  return { user: q.data ?? null, userId: q.data?.id ?? null, loading: q.isLoading };
}

/**
 * Today's local date that rolls over at midnight and when the app returns from the
 * background (an installed PWA can stay open for days).
 */
export function useToday(): ISODate {
  const [d, setD] = useState<ISODate>(() => today());
  useEffect(() => {
    const tick = () => setD((prev) => (prev === today() ? prev : today()));
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return d;
}

/**
 * Page through a PostgREST query so results are never silently capped at the API's
 * default max rows. `build` must return a fresh query each call.
 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
    if (out.length > 200_000) break; // runaway guard
  }
  return out;
}

/** Throw a readable error from a Supabase response. */
export function must<T>(res: { data: T; error: null } | { data: null; error: { message: string } }): T {
  if (res.error) throw new Error(friendlyError(res.error.message));
  return res.data as T;
}

export function friendlyError(msg: string) {
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) return "You're offline or the connection dropped. Nothing was lost — try again.";
  if (/JWT|not signed in|session/i.test(msg)) return "Your session expired. Sign in again.";
  if (/duplicate key|unique/i.test(msg)) return "That entry already exists.";
  if (/violates check constraint/i.test(msg)) return "One of those values is out of range.";
  return msg;
}

export function newId() {
  return crypto.randomUUID();
}

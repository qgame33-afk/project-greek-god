"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ISODate } from "@/lib/dates";
import { fetchAll, must, sb, useUser, type Insert, type Row, type Update } from "./core";

export type WeightEntry = Row<"weight_entries">;
export type Measurement = Row<"body_measurements">;
export type ProgressPhoto = Row<"progress_photos">;

/* ----------------------------------------------------------------- weight */

export function useWeights() {
  const { userId } = useUser();
  const q = useQuery({
    queryKey: ["weights", userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("weight_entries").select("*").order("local_date").range(a, b)),
  });
  return { weights: (q.data ?? []).map((w) => ({ ...w, weight_lb: Number(w.weight_lb) })), loading: q.isLoading, error: q.error };
}

export function useWeightMutations() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const key = ["weights", userId];
  const done = () => qc.invalidateQueries({ queryKey: ["weights"] });
  const save = useMutation({
    networkMode: "always",
    /** One weigh-in per day: saving again on the same date replaces it. */
    mutationFn: async (v: { local_date: ISODate; weight_lb: number; notes?: string | null }) =>
      must(await sb().from("weight_entries").upsert({ ...v, measured_at: new Date().toISOString() }, { onConflict: "user_id,local_date" }).select("*").single()),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WeightEntry[]>(key);
      if (prev) {
        const rest = prev.filter((w) => w.local_date !== v.local_date);
        const row = { id: "optimistic", user_id: userId!, created_at: "", measured_at: new Date().toISOString(), notes: v.notes ?? null, ...v } as WeightEntry;
        qc.setQueryData(key, [...rest, row].sort((a, b) => a.local_date.localeCompare(b.local_date)));
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error("Couldn't save the weigh-in", { description: e.message });
    },
    onSettled: done,
  });
  const remove = useMutation({
    networkMode: "always",
    mutationFn: async (row: WeightEntry) => {
      must(await sb().from("weight_entries").delete().eq("id", row.id));
      return row;
    },
    onSuccess: (row) => {
      toast("Weigh-in deleted", {
        duration: 6000,
        action: { label: "Undo", onClick: () => save.mutate({ local_date: row.local_date, weight_lb: Number(row.weight_lb), notes: row.notes }) },
      });
    },
    onError: (e: Error) => toast.error("Couldn't delete", { description: e.message }),
    onSettled: done,
  });
  return { save, remove };
}

/* ----------------------------------------------------------- measurements */

export function useMeasurements() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["measurements", userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("body_measurements").select("*").order("local_date").range(a, b)),
  });
}

export function useMeasurementMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["measurements"] });
  const onError = (e: Error) => toast.error("Couldn't save", { description: e.message });
  const save = useMutation({
    networkMode: "always",
    mutationFn: async (v: Omit<Insert<"body_measurements">, "user_id">) =>
      must(await sb().from("body_measurements").upsert(v, { onConflict: "user_id,local_date" }).select("*").single()),
    onSuccess: done,
    onError,
  });
  const update = useMutation({
    networkMode: "always",
    mutationFn: async ({ id, values }: { id: string; values: Update<"body_measurements"> }) => must(await sb().from("body_measurements").update(values).eq("id", id).select("id").single()),
    onSuccess: done,
    onError,
  });
  const remove = useMutation({
    networkMode: "always",
    mutationFn: async (id: string) => must(await sb().from("body_measurements").delete().eq("id", id)),
    onSuccess: done,
    onError,
  });
  return { save, update, remove };
}

/* ----------------------------------------------------------------- photos */

export function usePhotos() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["photos", userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("progress_photos").select("*").order("local_date", { ascending: false }).order("created_at", { ascending: false }).range(a, b)),
  });
}

/** Short-lived signed URLs for private photos (batched, cached ~50 min). */
export function useSignedUrls(bucket: "progress-photos" | "meal-photos", paths: string[]) {
  const key = paths.slice().sort().join("|");
  return useQuery({
    queryKey: ["signed", bucket, key],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb().storage.from(bucket).createSignedUrls(paths, 3600);
      if (error) throw new Error(error.message);
      const out: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
      return out;
    },
  });
}


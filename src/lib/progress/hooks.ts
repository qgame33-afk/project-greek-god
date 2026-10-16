"use client";

// Progress-specific data hooks. They sit on top of the shared hooks in src/lib/data and
// add what this feature needs: optimistic writes with rollback, Undo toasts, the private
// photo pipeline (upload → row, storage-first delete) and a one-query strength history.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAll, friendlyError, must, newId, sb, useUser, type Insert, type Update } from "@/lib/data/core";
import { useAthleticMutations, useMeasurementMutations, type AthleticTest, type Measurement, type ProgressPhoto } from "@/lib/data/body";
import type { ISODate } from "@/lib/dates";
import { photoPath, thumbPath, type Pose } from "./photos";
import type { StrengthSet } from "./strength";

/* --------------------------------------------------------------- strength */

const STRENGTH_COLS = "id,exercise_slug,exercise_name,local_date,session_id,set_index,weight_lb,reps,duration_sec,completed_at";

/**
 * Every completed working set, oldest first, in one query. The key shares the
 * "exercise-sets" prefix so anything that invalidates exercise history refreshes it too.
 */
export function useStrengthSets() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["exercise-sets", "__progress_all__", userId],
    enabled: !!userId,
    queryFn: async () => {
      const rows = await fetchAll((a, b) =>
        sb().from("set_history").select(STRENGTH_COLS).order("local_date").order("completed_at").order("set_index").range(a, b),
      );
      return rows
        .filter((r) => r.id && r.exercise_slug && r.local_date && r.session_id)
        .map(
          (r): StrengthSet => ({
            id: r.id!,
            exercise_slug: r.exercise_slug!,
            exercise_name: r.exercise_name ?? r.exercise_slug!,
            local_date: r.local_date!,
            session_id: r.session_id!,
            set_index: r.set_index ?? 0,
            weight_lb: r.weight_lb == null ? null : Number(r.weight_lb),
            reps: r.reps == null ? null : Number(r.reps),
            duration_sec: r.duration_sec,
            completed_at: r.completed_at,
          }),
        );
    },
  });
}

/** The shared mutations' result type is loose; read the inserted row's id defensively. */
const idOf = (row: unknown): string | null => (row && typeof row === "object" && "id" in row && typeof row.id === "string" ? row.id : null);

/* ----------------------------------------------------------- measurements */

export type MeasurementValues = Omit<Insert<"body_measurements">, "user_id" | "id" | "created_at">;

const MEASURE_KEYS = ["biceps_flexed_in", "forearm_in", "chest_in", "shoulders_in", "waist_in", "hips_in", "thigh_in", "calf_in", "body_fat_pct", "notes"] as const;

function valuesOf(row: Measurement): MeasurementValues {
  const out: Record<string, unknown> = { local_date: row.local_date };
  for (const k of MEASURE_KEYS) out[k] = row[k] == null ? null : k === "notes" ? row[k] : Number(row[k]);
  return out as MeasurementValues;
}

/**
 * Measurement writes with optimistic cache updates, rollback and Undo. A new entry on a
 * date upserts that day; editing an existing entry updates it by id (so its date can move).
 */
export function useMeasurementWrite() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const key = ["measurements", userId];
  const { save, update, remove } = useMeasurementMutations();

  const snapshot = () => qc.getQueryData<Measurement[]>(key);
  const optimistic = (fn: (rows: Measurement[]) => Measurement[]) => {
    void qc.cancelQueries({ queryKey: key });
    const prev = snapshot();
    if (prev) qc.setQueryData(key, fn(prev).sort((a, b) => a.local_date.localeCompare(b.local_date)));
    return prev;
  };
  const rollback = (prev: Measurement[] | undefined) => prev && qc.setQueryData(key, prev);
  const asRow = (v: MeasurementValues, id: string): Measurement => ({ id, user_id: userId ?? "", created_at: new Date().toISOString(), ...valuesOf({ ...(v as Measurement), id }) }) as Measurement;

  const write = (v: MeasurementValues, existing: Measurement | null, done?: () => void) => {
    if (existing) {
      const prev = optimistic((rows) => rows.map((r) => (r.id === existing.id ? asRow(v, r.id) : r)));
      update.mutate(
        { id: existing.id, values: v as Update<"body_measurements"> },
        {
          onSuccess: () => {
            done?.();
            toast("Measurements updated", {
              duration: 6000,
              action: { label: "Undo", onClick: () => update.mutate({ id: existing.id, values: valuesOf(existing) as Update<"body_measurements"> }) },
            });
          },
          onError: () => rollback(prev),
        },
      );
      return;
    }
    const prev = optimistic((rows) => [...rows.filter((r) => r.local_date !== v.local_date), asRow(v, "optimistic")]);
    save.mutate(v, {
      onSuccess: (row) => {
        done?.();
        toast("Measurements saved", {
          duration: 6000,
          action: { label: "Undo", onClick: () => idOf(row) && remove.mutate(idOf(row)!) },
        });
      },
      onError: () => rollback(prev),
    });
  };

  const del = (row: Measurement, done?: () => void) => {
    const prev = optimistic((rows) => rows.filter((r) => r.id !== row.id));
    remove.mutate(row.id, {
      onSuccess: () => {
        done?.();
        toast("Entry deleted", { duration: 6000, action: { label: "Undo", onClick: () => save.mutate(valuesOf(row)) } });
      },
      onError: () => rollback(prev),
    });
  };

  return { write, del, pending: save.isPending || update.isPending || remove.isPending };
}

/* --------------------------------------------------------------- athletic */

export type AthleticValues = Omit<Insert<"athletic_tests">, "user_id" | "id" | "created_at">;

export function useAthleticWrite() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const key = ["athletic", userId];
  const { add, remove } = useAthleticMutations();

  const log = (v: AthleticValues, done?: () => void) => {
    void qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<AthleticTest[]>(key);
    if (prev) {
      const temp = { id: `optimistic-${newId()}`, user_id: userId ?? "", created_at: new Date().toISOString(), conditions: null, notes: null, sprint_distance_m: null, ...v } as AthleticTest;
      qc.setQueryData(key, [...prev, temp].sort((a, b) => a.local_date.localeCompare(b.local_date)));
    }
    add.mutate(v, {
      onSuccess: (row) => {
        done?.();
        toast("Result saved", { duration: 6000, action: { label: "Undo", onClick: () => idOf(row) && remove.mutate(idOf(row)!) } });
      },
      onError: () => prev && qc.setQueryData(key, prev),
    });
  };

  const del = (row: AthleticTest) => {
    void qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<AthleticTest[]>(key);
    if (prev) qc.setQueryData(key, prev.filter((r) => r.id !== row.id));
    remove.mutate(row.id, {
      onSuccess: () =>
        toast("Result deleted", {
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () =>
              add.mutate({
                local_date: row.local_date,
                test_type: row.test_type,
                value: Number(row.value),
                sprint_distance_m: row.sprint_distance_m == null ? null : Number(row.sprint_distance_m),
                conditions: row.conditions,
                notes: row.notes,
              }),
          },
        }),
      onError: () => prev && qc.setQueryData(key, prev),
    });
  };

  return { log, del, pending: add.isPending };
}

/* ----------------------------------------------------------------- photos */

const BUCKET = "progress-photos";

export interface PhotoUpload {
  main: Blob;
  thumb: Blob | null;
  width: number;
  height: number;
  date: ISODate;
  pose: Pose;
}

/**
 * Upload to the private bucket under <user_id>/, then insert the row. If the row can't be
 * written the uploaded objects are removed again, so storage never holds orphans.
 */
export function usePhotoUpload() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const del = usePhotoDelete({ quiet: true });
  return useMutation({
    mutationFn: async (u: PhotoUpload): Promise<ProgressPhoto> => {
      if (!userId) throw new Error("Your session expired. Sign in again.");
      const bucket = sb().storage.from(BUCKET);
      const path = photoPath(userId, u.date, u.pose, newId());
      const up = await bucket.upload(path, u.main, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
      if (up.error) throw new Error(friendlyError(up.error.message));
      if (u.thumb) await bucket.upload(thumbPath(path), u.thumb, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
      const ins = await sb().from("progress_photos").insert({ local_date: u.date, pose: u.pose, storage_path: path, width: u.width, height: u.height }).select("*").single();
      if (ins.error) {
        await bucket.remove([path, thumbPath(path)]);
        throw new Error(friendlyError(ins.error.message));
      }
      return ins.data;
    },
    onSuccess: (row) => {
      qc.setQueryData<ProgressPhoto[]>(["photos", userId], (prev) => (prev ? [row, ...prev] : prev));
      void qc.invalidateQueries({ queryKey: ["photos"] });
      toast("Photo saved", { duration: 6000, action: { label: "Undo", onClick: () => del.mutate(row) } });
    },
    onError: (e: Error) => toast.error("Couldn't upload the photo", { description: e.message }),
  });
}

/**
 * Permanent delete: remove the storage objects first and confirm they're gone; only then
 * delete the row. If storage refuses, the row stays so the photo is never half-deleted.
 */
export function usePhotoDelete({ quiet = false }: { quiet?: boolean } = {}) {
  const qc = useQueryClient();
  const { userId } = useUser();
  const key = ["photos", userId];
  return useMutation({
    mutationFn: async (row: ProgressPhoto) => {
      const bucket = sb().storage.from(BUCKET);
      const res = await bucket.remove([row.storage_path, thumbPath(row.storage_path)]);
      if (res.error) throw new Error(friendlyError(res.error.message));
      const gone = (res.data ?? []).some((o) => o.name === row.storage_path);
      if (!gone) {
        const ex = await bucket.exists(row.storage_path);
        if (ex.data) throw new Error("The photo file couldn't be removed. Nothing was deleted.");
      }
      must(await sb().from("progress_photos").delete().eq("id", row.id));
      return row;
    },
    onMutate: async (row) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ProgressPhoto[]>(key);
      if (prev) qc.setQueryData(key, prev.filter((p) => p.id !== row.id));
      return { prev };
    },
    onError: (e: Error, _row, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error("Couldn't delete the photo", { description: e.message });
    },
    onSuccess: () => {
      if (!quiet) toast("Photo deleted permanently");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["photos"] }),
  });
}

/* ------------------------------------------------------------ goal audit */

/**
 * Make sure an applied calorie suggestion leaves a goal_changes row (the calorie check's
 * 14-day cooldown depends on it). If the shared save already wrote one, nothing is added.
 */
export async function ensureCalorieChangeLogged(v: { since: string; oldValue: number; newValue: number; reason: string }) {
  const recent = await sb().from("goal_changes").select("id").eq("field", "calorie_goal").eq("new_value", v.newValue).gte("changed_at", v.since).limit(1);
  if (recent.error) throw new Error(friendlyError(recent.error.message));
  if (recent.data?.length) return false;
  must(await sb().from("goal_changes").insert({ field: "calorie_goal", old_value: v.oldValue, new_value: v.newValue, reason: v.reason, source: "suggestion" }).select("id").single());
  return true;
}

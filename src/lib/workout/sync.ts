// Reconciling the live session on this device with the server. The device's copy is the
// truth while training (every tap is applied to it first), so after a dropped write, a
// reload while offline or a flaky connection, the server is brought back in line with it.

import type { WSet } from "./types";

/** Columns that carry what the user did; timestamps of the row itself are the server's. */
export const SET_FIELDS = [
  "session_id",
  "user_id",
  "local_date",
  "exercise_slug",
  "exercise_name",
  "exercise_order",
  "set_index",
  "kind",
  "weight_lb",
  "reps",
  "duration_sec",
  "rir",
  "completed",
  "completed_at",
  "notes",
  "target_rep_low",
  "target_rep_high",
  "target_unit",
  "target_rir",
  "rest_sec",
  "suggested_weight_lb",
] as const satisfies readonly (keyof WSet)[];

type Field = (typeof SET_FIELDS)[number];

const NUMERIC = new Set<Field>(["weight_lb", "rir", "suggested_weight_lb", "reps", "duration_sec", "exercise_order", "set_index", "target_rep_low", "target_rep_high", "rest_sec"]);

function sameValue(field: Field, a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (NUMERIC.has(field)) return Number(a) === Number(b);
  if (field === "completed_at") return Date.parse(String(a)) === Date.parse(String(b));
  if (field === "notes") return String(a).trim() === String(b).trim();
  return a === b;
}

/** True when two rows of the same set record the same thing. */
export function sameSet(a: WSet, b: WSet): boolean {
  return SET_FIELDS.every((f) => sameValue(f, a[f], b[f]));
}

/** The row as an upsert payload (the server owns created_at / updated_at). */
export function setPayload(s: WSet): Record<string, unknown> {
  const out: Record<string, unknown> = { id: s.id };
  for (const f of SET_FIELDS) out[f] = s[f];
  return out;
}

export interface SetDiff {
  /** Local rows the server is missing or has different values for. */
  upserts: WSet[];
  /** Server rows that no longer exist on this device. */
  deletes: string[];
}

/** What the server needs so that it matches `local` exactly. */
export function diffSets(local: WSet[], server: WSet[]): SetDiff {
  const byId = new Map(server.map((s) => [s.id, s]));
  const keep = new Set(local.map((s) => s.id));
  const upserts = local.filter((s) => {
    const remote = byId.get(s.id);
    return !remote || !sameSet(s, remote);
  });
  const deletes = server.filter((s) => !keep.has(s.id)).map((s) => s.id);
  return { upserts, deletes };
}

export const isEmptyDiff = (d: SetDiff) => d.upserts.length === 0 && d.deletes.length === 0;

/** A failed request that means "no connection" rather than "the server said no". */
export function isNetworkError(message: string | null | undefined): boolean {
  return !!message && /fetch|network|offline|timed? ?out|load failed|connection|ERR_/i.test(message);
}

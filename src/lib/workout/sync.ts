// Reconciling the live session on this device with the server. Every tap is applied to the
// device first and recorded in a journal of what THIS device changed (which fields of which
// sets, and the value each held before). After a dropped write, a reload while offline or a
// flaky connection, only those changes are re-sent — field by field, and only where the
// server still holds the value this device started from. Sets logged on another device are
// never overwritten or deleted: rows this device didn't touch always take the server's copy.

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

export type Field = (typeof SET_FIELDS)[number];
const FIELD_SET = new Set<string>(SET_FIELDS);

const NUMERIC = new Set<Field>(["weight_lb", "rir", "suggested_weight_lb", "reps", "duration_sec", "exercise_order", "set_index", "target_rep_low", "target_rep_high", "rest_sec"]);

export function sameValue(field: Field, a: unknown, b: unknown): boolean {
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

/* --------------------------------------------------------------- journal */

/** One set this device changed and the server hasn't been seen to hold yet. */
export interface JournalEntry {
  /** Fields changed here → the value each had before this device's first unconfirmed change. */
  base: Partial<Record<Field, unknown>>;
  /** Created on this device (the server may not have it yet). */
  inserted?: boolean;
  /** Removed on this device; whether it was logged when it was removed. */
  deleted?: { completed: boolean };
}

export interface Journal {
  sets: Record<string, JournalEntry>;
  /** The session note before this device changed it (absent = unchanged here). */
  notesBase?: string | null;
}

export const emptyJournal = (): Journal => ({ sets: {} });
export const journalEmpty = (j: Journal | null | undefined) => !j || (Object.keys(j.sets).length === 0 && j.notesBase === undefined);

/** Record an update of `before` (the row as this device showed it) with `values`. */
export function recordUpdate(j: Journal, before: WSet | undefined, values: Partial<WSet>): Journal {
  if (!before) return j;
  const prev = j.sets[before.id];
  if (prev?.deleted) return j;
  const base = { ...prev?.base };
  for (const k of Object.keys(values)) if (FIELD_SET.has(k) && !(k in base)) base[k as Field] = before[k as Field];
  return { ...j, sets: { ...j.sets, [before.id]: { ...prev, base } } };
}

export function recordInsert(j: Journal, row: WSet): Journal {
  return { ...j, sets: { ...j.sets, [row.id]: { base: {}, inserted: true } } };
}

export function recordDelete(j: Journal, row: WSet): Journal {
  return { ...j, sets: { ...j.sets, [row.id]: { base: {}, deleted: { completed: row.completed } } } };
}

export function recordNotes(j: Journal, before: string | null): Journal {
  return j.notesBase !== undefined ? j : { ...j, notesBase: before };
}

/** A write that brings the server in line with one of this device's changes. */
export type Push = { kind: "update"; id: string; values: Record<string, unknown> } | { kind: "insert"; row: WSet } | { kind: "delete"; id: string };

export interface Reconciled {
  /** What the device should show: the server's sets with this device's unconfirmed changes on top. */
  sets: WSet[];
  push: Push[];
  journal: Journal;
  /** This device's changes dropped because the server holds a newer change from elsewhere. */
  conflicts: number;
}

/**
 * Merge this device's sets with the server's. Per field this device changed:
 * - server == device → confirmed, forgotten;
 * - server == the value it started from → the write never landed, re-send just that field;
 * - anything else → changed elsewhere since: the server's newer value wins.
 * Rows this device never touched always take the server's copy (sets logged on another
 * device appear and are never reverted); rows it never saw are kept; a row removed
 * elsewhere stays removed unless this device logged it.
 */
export function reconcile(local: WSet[], server: WSet[], j: Journal): Reconciled {
  const mine = new Map(local.map((s) => [s.id, s]));
  const onServer = new Set(server.map((s) => s.id));
  const sets: WSet[] = [];
  const push: Push[] = [];
  const next: Journal["sets"] = {};
  let conflicts = 0;

  for (const s of server) {
    const e = j.sets[s.id];
    const l = mine.get(s.id);
    if (!e || !l) {
      if (e?.deleted && !(s.completed && !e.deleted.completed)) {
        // Removed here and not logged elsewhere since: remove it there too.
        push.push({ kind: "delete", id: s.id });
        next[s.id] = e;
        continue;
      }
      if (e?.deleted) conflicts++; // logged on another device after it was removed here
      sets.push(s);
      continue;
    }
    const values: Record<string, unknown> = {};
    const base: JournalEntry["base"] = {};
    for (const f of Object.keys(e.base) as Field[]) {
      if (sameValue(f, s[f], l[f])) continue;
      if (sameValue(f, s[f], e.base[f])) {
        values[f] = l[f];
        base[f] = e.base[f];
      } else conflicts++;
    }
    sets.push({ ...s, ...values } as WSet);
    if (Object.keys(values).length) {
      push.push({ kind: "update", id: s.id, values });
      next[s.id] = { base };
    }
  }

  for (const l of local) {
    if (onServer.has(l.id)) continue;
    const e = j.sets[l.id];
    if (!e || e.deleted) continue; // removed elsewhere
    if (e.inserted || (l.completed && "completed" in e.base)) {
      // Created here, or logged here after another device removed it: a logged set is kept.
      push.push({ kind: "insert", row: l });
      sets.push(l);
      next[l.id] = { ...e, inserted: true };
    } else conflicts++;
  }
  return { sets, push, journal: { ...j, sets: next }, conflicts };
}

/** The same three-way rule for the session note. */
export function reconcileNotes(local: string | null, server: string | null, base: string | null | undefined): { notes: string | null; push: boolean; base: string | null | undefined } {
  const same = (a: string | null, b: string | null) => (a ?? "").trim() === (b ?? "").trim();
  if (base === undefined || same(server, local)) return { notes: base === undefined ? server : local, push: false, base: undefined };
  if (same(server, base)) return { notes: local, push: true, base };
  return { notes: server, push: false, base: undefined };
}

/**
 * A journal for a device copy saved before the journal existed: every difference from the
 * server counts as this device's (the old copy's rule), so nothing it holds is lost.
 */
export function journalFromDiff(local: WSet[], server: WSet[], localNotes: string | null, serverNotes: string | null): Journal {
  const byId = new Map(server.map((s) => [s.id, s]));
  let j = emptyJournal();
  for (const l of local) {
    const s = byId.get(l.id);
    if (!s) j = recordInsert(j, l);
    else if (!sameSet(l, s)) j = recordUpdate(j, s, Object.fromEntries(SET_FIELDS.filter((f) => !sameValue(f, l[f], s[f])).map((f) => [f, l[f]])));
  }
  const keep = new Set(local.map((s) => s.id));
  for (const s of server) if (!keep.has(s.id)) j = { ...j, sets: { ...j.sets, [s.id]: { base: {}, deleted: { completed: s.completed } } } };
  if ((localNotes ?? null) !== (serverNotes ?? null)) j = recordNotes(j, serverNotes);
  return j;
}

/** True when two lists hold the same sets with the same values (order aside). */
export function sameSets(a: WSet[], b: WSet[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((s) => [s.id, s]));
  return a.every((s) => {
    const o = byId.get(s.id);
    return !!o && sameSet(s, o);
  });
}

/** A failed request that means "no connection" rather than "the server said no". */
export function isNetworkError(message: string | null | undefined): boolean {
  return !!message && /fetch|network|offline|timed? ?out|load failed|connection|ERR_/i.test(message);
}

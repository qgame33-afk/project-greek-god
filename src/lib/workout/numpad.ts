// The NumberPad dock's input rules: the first key replaces the value, weight takes one
// decimal place, reps/seconds are whole numbers, RIR is a single digit.

import type { CellField } from "./types";

export interface PadBuffer {
  text: string;
  /** True until the first key press — that press replaces the value instead of appending. */
  fresh: boolean;
}

export type PadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "back";

const MAX_INT_DIGITS: Record<CellField, number> = { weight: 4, work: 3, rir: 1 };

export function padPress(b: PadBuffer, key: PadKey, field: CellField): PadBuffer {
  if (key === "back") {
    if (b.fresh) return { text: "", fresh: false };
    return { text: b.text.slice(0, -1), fresh: false };
  }
  if (field === "rir") {
    if (key === ".") return b;
    return { text: key, fresh: false };
  }
  if (key === ".") {
    if (field !== "weight") return b;
    if (b.fresh || b.text === "") return { text: "0.", fresh: false };
    if (b.text.includes(".")) return { ...b, fresh: false };
    return { text: b.text + ".", fresh: false };
  }
  const base = b.fresh ? "" : b.text;
  const [int, dec] = base.split(".");
  if (dec !== undefined) {
    if (dec.length >= 1) return { text: base, fresh: false }; // one decimal place
    return { text: base + key, fresh: false };
  }
  const nextInt = int === "0" ? key : int + key;
  if (nextInt.length > MAX_INT_DIGITS[field]) return { text: base, fresh: false };
  return { text: nextInt, fresh: false };
}

/** RIR is one digit, so it advances on its own after a key press. */
export function autoAdvances(field: CellField, key: PadKey) {
  return field === "rir" && key !== "back" && key !== ".";
}

/** −/+ chips. Never goes below zero; weight keeps one decimal, everything else whole. */
export function padNudge(text: string, delta: number, field: CellField): string {
  const cur = Number(text.replace(",", "."));
  const base = Number.isFinite(cur) ? cur : 0;
  const next = Math.max(0, base + delta);
  if (field !== "weight") return String(Math.round(next));
  const r = Math.round(next * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Nudge step in display units: the exercise's load increment, reps 1, seconds 5, RIR 1. */
export function nudgeStep(field: CellField, opts: { incrementLb: number; unit: "lb" | "kg"; timed: boolean }): number {
  if (field === "rir") return 1;
  if (field === "work") return opts.timed ? 5 : 1;
  if (opts.unit === "kg") return opts.incrementLb <= 2.5 ? 1 : 2.5;
  return opts.incrementLb > 0 ? opts.incrementLb : 5;
}

/** Where Next goes: the next field on this row, else the first field of the next row. */
export function nextCell<T extends string>(
  rows: T[],
  current: { setId: T; field: CellField },
  fields: (setId: T) => CellField[],
): { setId: T; field: CellField } | null {
  const fs = fields(current.setId);
  const i = fs.indexOf(current.field);
  if (i >= 0 && i < fs.length - 1) return { setId: current.setId, field: fs[i + 1] };
  const r = rows.indexOf(current.setId);
  const nextRow = r >= 0 ? rows[r + 1] : undefined;
  if (nextRow == null) return null;
  const nf = fields(nextRow);
  return nf.length ? { setId: nextRow, field: nf[0] } : null;
}

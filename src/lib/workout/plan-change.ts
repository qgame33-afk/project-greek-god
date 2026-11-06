// "Every time": a swap or an added lift from the live workout written into the day's template
// (docs/DESIGN-V3-SIMPLE.md §4.2.6). Pure: the screen saves what these return, after he confirms.

import { templateDef } from "@/lib/training/programs";
import type { DayTemplate, LibraryExercise, TemplateKey } from "@/lib/training/types";
import { newTemplateExercise } from "@/lib/training/volume";
import { swapTemplateExercise } from "./session";

/** The other rotation of a day: arms_a ↔ arms_b, push_a ↔ push_b. Null when there is none. */
export function siblingKey(key: string | null | undefined): TemplateKey | null {
  if (!key) return null;
  const m = /^(.*)_(a|b)$/.exec(key);
  if (!m) return null;
  const other = `${m[1]}_${m[2] === "a" ? "b" : "a"}`;
  return templateDef(other) ? (other as TemplateKey) : null;
}

/** The template with `oldSlug` swapped for `lib` (the first row that has it). Null when the template doesn't have the lift. */
export function planSwap<T extends Pick<DayTemplate, "exercises">>(t: T, oldSlug: string, lib: LibraryExercise): T | null {
  const i = t.exercises.findIndex((e) => e.slug === oldSlug);
  if (i < 0 || oldSlug === lib.slug) return null;
  return { ...t, exercises: t.exercises.map((e, j) => (j === i ? swapTemplateExercise(e, lib) : e)) };
}

/** The template with `lib` added at the end (the library's defaults: two sets). Null when it already has the lift. */
export function planAdd<T extends Pick<DayTemplate, "exercises">>(t: T, lib: LibraryExercise): T | null {
  if (t.exercises.some((e) => e.slug === lib.slug)) return null;
  return { ...t, exercises: [...t.exercises, newTemplateExercise(lib)] };
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Monday's Arms & Shoulders" from the weekdays it is on (the A and B rows share a name), else its name. */
export function dayTemplateLabel(name: string, weekdays: number[]): string {
  if (!weekdays.length) return name;
  return `${weekdays.map((d) => DAY[d]).join(" and ")}'s ${name}`;
}

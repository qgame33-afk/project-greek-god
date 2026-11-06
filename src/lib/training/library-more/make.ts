import type { LibraryExercise } from "../types";

/** A library entry with the common defaults filled in: no secondary muscles, load × reps, a 5 lb increment. */
export type Def = Omit<LibraryExercise, "tracking" | "increment" | "secondary"> & Partial<Pick<LibraryExercise, "tracking" | "increment" | "secondary">>;

export const make = (d: Def): LibraryExercise => ({ secondary: [], tracking: "weight_reps", increment: 5, ...d });

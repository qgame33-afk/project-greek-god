import type { Database } from "@/lib/supabase/database.types";

/** One row of public.exercise_sets. */
export type WSet = Database["public"]["Tables"]["exercise_sets"]["Row"];
/** One row of public.workout_sessions. */
export type WSession = Database["public"]["Tables"]["workout_sessions"]["Row"];

/** What a set records. Mirrors the library's `tracking`. */
export type Tracking = "weight_reps" | "bodyweight_reps" | "reps" | "weight_time";

/** Editable cells in the set grid. `work` is reps, or seconds for timed sets. */
export type CellField = "weight" | "work" | "rir";

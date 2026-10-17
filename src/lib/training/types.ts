export type MuscleGroup =
  | "chest"
  | "upper_chest"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "lats"
  | "upper_back"
  | "traps"
  | "lower_back"
  | "biceps"
  | "brachialis"
  | "forearms"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "adductors"
  | "calves"
  | "abs"
  | "obliques"
  | "grip"
  | "full_body";

export type ExerciseCategory = "compound" | "isolation" | "explosive" | "carry" | "core";

/** How a set is recorded. */
export type Tracking =
  | "weight_reps" // load × reps (most lifts)
  | "bodyweight_reps" // reps, optional added load (pull-ups, hanging raises)
  | "reps" // reps only, no load (jumps)
  | "weight_time"; // load × seconds (carries)

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "smith"
  | "bodyweight"
  | "ez_bar"
  | "plate_loaded"
  | "box"
  | "other";

export interface LibraryExercise {
  slug: string;
  name: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  category: ExerciseCategory;
  equipment: Equipment;
  tracking: Tracking;
  /** Default rest between working sets, seconds. */
  rest: number;
  /** Smallest sensible load jump in lb (per dumbbell for dumbbell lifts). */
  increment: number;
  /** True when the logged weight is per hand / per dumbbell. */
  perHand?: boolean;
  /** True when reps are counted per side (split squats, single-arm work). */
  perSide?: boolean;
  /** Has a real bodyweight version (split squats, lunges): a 0 lb set is valid. */
  bodyweightOk?: boolean;
  /** 3–5 short imperative steps. */
  instructions: string[];
  /** 2–4 cues that keep the lift safe and effective. */
  formTips: string[];
  /** Slugs of reasonable swaps (same pattern / muscles). */
  substitutes: string[];
}

export type RepUnit = "reps" | "sec" | "each";

export interface TemplateExercise {
  slug: string;
  /** Display name — may differ from the library name for "or" options (e.g. "Weighted Pull-Ups or Lat Pulldown"). */
  name: string;
  sets: number;
  repLow: number;
  repHigh: number;
  unit: RepUnit;
  /** Target reps in reserve, shown as text: "1–2", "0–1", or "Fresh" for explosive work. */
  rir: string;
  rest: number;
  optional?: boolean;
  /** Short coaching note shown on the card. */
  note?: string;
}

export interface WarmupStep {
  label: string;
  detail: string;
}

export type TemplateKey = "push_a" | "pull_a" | "legs_a" | "push_b" | "pull_b" | "legs_b";

export interface DayTemplate {
  key: TemplateKey;
  name: string;
  /** e.g. "Upper Body Strength" */
  subtitle: string;
  focus: string;
  /** JS weekday the template defaults to: 1 = Monday … 6 = Saturday. */
  weekday: number;
  warmup: WarmupStep[];
  exercises: TemplateExercise[];
}

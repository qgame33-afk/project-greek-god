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
  | "reps" // reps only, no load (retired explosive work)
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
  /** No longer offered anywhere (jumps); kept so history resolves. */
  retired?: boolean;
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
  /** Target reps in reserve, shown as text: "0" (to failure), "0–1", "1–2", or "Fresh" (retired explosive work). */
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

/** "twoset" = Quinton's two-set split (the default, docs/PROGRAM-V3.md); "ppl" = Push/Pull/Legs, kept as the alternative. */
export type ProgramId = "twoset" | "ppl";
export type TwoSetKey = "arms_a" | "chest_a" | "lower_a" | "arms_b" | "chest_b" | "lower_b";
export type PplKey = "push_a" | "pull_a" | "legs_a" | "push_b" | "pull_b" | "legs_b";
export type TemplateKey = TwoSetKey | PplKey;
/** shoulders_arms = Arms & Shoulders, chest_back = Chest & Back, legs = Legs (both programs), push/pull = PPL. */
export type DayFamily = "shoulders_arms" | "chest_back" | "legs" | "push" | "pull";

export interface DayTemplate {
  key: TemplateKey;
  program: ProgramId;
  name: string;
  /** For tight places (top bar, cards): "Arms & Shoulders". */
  short: string;
  /** Under-date label in week strips, ≤ 5 characters: "Arms". */
  abbr: string;
  family: DayFamily;
  /** e.g. "Monday" (which rotation) */
  subtitle: string;
  focus: string;
  /** Built-in guidance for the day (not stored per user). */
  notes: string[];
  /** JS weekday the template defaults to: 1 = Monday … 6 = Saturday. */
  weekday: number;
  warmup: WarmupStep[];
  exercises: TemplateExercise[];
}

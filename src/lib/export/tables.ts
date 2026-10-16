// Which tables belong to a user, in what order to export and erase them, and how to name
// them for people. Shared by the client export/wipe and the server account deletion.

export type UserTable =
  | "profiles"
  | "goal_changes"
  | "program_templates"
  | "custom_exercises"
  | "day_plans"
  | "volleyball_sessions"
  | "workout_sessions"
  | "exercise_sets"
  | "food_entries"
  | "saved_foods"
  | "saved_meals"
  | "water_logs"
  | "ai_conversations"
  | "ai_messages"
  | "weight_entries"
  | "body_measurements"
  | "progress_photos"
  | "athletic_tests"
  | "recovery_logs"
  | "habit_definitions"
  | "habit_logs"
  | "monthly_reviews";

/** Every table in the export, in a reading-friendly order. */
export const EXPORT_TABLES: UserTable[] = [
  "profiles",
  "goal_changes",
  "program_templates",
  "custom_exercises",
  "day_plans",
  "workout_sessions",
  "exercise_sets",
  "volleyball_sessions",
  "food_entries",
  "saved_foods",
  "saved_meals",
  "water_logs",
  "ai_conversations",
  "ai_messages",
  "weight_entries",
  "body_measurements",
  "progress_photos",
  "athletic_tests",
  "recovery_logs",
  "habit_definitions",
  "habit_logs",
  "monthly_reviews",
];

/**
 * "Delete all logged data": children before parents so every count is exact (cascades would
 * hide rows). The account, profile and goals, program templates and habit list stay.
 */
export const WIPE_TABLES: UserTable[] = [
  "exercise_sets",
  "workout_sessions",
  "ai_messages",
  "ai_conversations",
  "food_entries",
  "water_logs",
  "saved_meals",
  "saved_foods",
  "weight_entries",
  "body_measurements",
  "progress_photos",
  "athletic_tests",
  "recovery_logs",
  "habit_logs",
  "volleyball_sessions",
  "day_plans",
  "monthly_reviews",
  "goal_changes",
  "custom_exercises",
];

export const KEPT_ON_WIPE = ["Your account and sign-in", "Profile, goals and targets", "Program templates", "Habit list", "Reminder settings"];

export const TABLE_LABEL: Record<UserTable, [singular: string, plural: string]> = {
  profiles: ["profile", "profile"],
  goal_changes: ["goal change", "goal changes"],
  program_templates: ["program template", "program templates"],
  custom_exercises: ["custom exercise", "custom exercises"],
  day_plans: ["schedule change", "schedule changes"],
  volleyball_sessions: ["volleyball session", "volleyball sessions"],
  workout_sessions: ["workout", "workouts"],
  exercise_sets: ["set", "sets"],
  food_entries: ["food entry", "food entries"],
  saved_foods: ["saved food", "saved foods"],
  saved_meals: ["saved meal", "saved meals"],
  water_logs: ["water log", "water logs"],
  ai_conversations: ["AI conversation", "AI conversations"],
  ai_messages: ["AI message", "AI messages"],
  weight_entries: ["weigh-in", "weigh-ins"],
  body_measurements: ["measurement", "measurements"],
  progress_photos: ["progress photo entry", "progress photo entries"],
  athletic_tests: ["athletic test", "athletic tests"],
  recovery_logs: ["recovery check-in", "recovery check-ins"],
  habit_definitions: ["habit", "habits"],
  habit_logs: ["habit check-off", "habit check-offs"],
  monthly_reviews: ["monthly review", "monthly reviews"],
};

export const PHOTO_BUCKETS = ["progress-photos", "meal-photos"] as const;
export type PhotoBucket = (typeof PHOTO_BUCKETS)[number];

/** "3 workouts" / "1 weigh-in". */
export function countLabel(table: UserTable, n: number) {
  const [one, many] = TABLE_LABEL[table];
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export interface WipeReport {
  rows: Partial<Record<UserTable, number>>;
  /** Photo files per bucket, not counting thumbnails. */
  files: Partial<Record<PhotoBucket, number>>;
  /** Thumbnail previews per bucket (stored next to progress photos). */
  thumbs?: Partial<Record<PhotoBucket, number>>;
  failed: { what: string; message: string }[];
}

const BUCKET_LABEL: Record<PhotoBucket, string> = { "progress-photos": "progress photo", "meal-photos": "meal photo" };

/** "2 progress photo files + 2 thumbnails" — one line per bucket that has anything. */
export function fileLines(files: Partial<Record<PhotoBucket, number>>, thumbs: Partial<Record<PhotoBucket, number>> = {}): string[] {
  const out: string[] = [];
  for (const b of PHOTO_BUCKETS) {
    const n = files[b] ?? 0;
    const t = thumbs[b] ?? 0;
    if (!n && !t) continue;
    const main = `${n.toLocaleString("en-US")} ${BUCKET_LABEL[b]} ${n === 1 ? "file" : "files"}`;
    out.push(t ? `${main} + ${t.toLocaleString("en-US")} ${t === 1 ? "thumbnail" : "thumbnails"}` : main);
  }
  return out;
}

/** Human summary lines for a wipe, largest first, zeros dropped. */
export function wipeSummary(r: WipeReport): string[] {
  const lines = (Object.entries(r.rows) as [UserTable, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => countLabel(t, n));
  return [...lines, ...fileLines(r.files, r.thumbs)];
}

/** Everything a wipe touches: rows, photo files and their thumbnails. */
export function wipeTotal(r: WipeReport) {
  const sum = (o: Partial<Record<string, number>> = {}) => Object.values(o).reduce<number>((a, b) => a + (b ?? 0), 0);
  return sum(r.rows) + sum(r.files) + sum(r.thumbs);
}

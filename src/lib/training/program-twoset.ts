import type { DayTemplate, RepUnit, TemplateExercise, TwoSetKey } from "./types";

/**
 * Quinton's two-set split (his request of 26 Oct, docs/PROGRAM-V3.md §1), exactly as he wrote
 * it: Arms & Shoulders (Mon, Thu), Chest & Back (Tue, Fri), Legs (Wed, Sat), Sunday rest. Every
 * exercise is two working sets in his order and rep ranges. Each day type has two template rows
 * (A on Mon–Wed, B on Thu–Sat) with the same content, so he can customise one rotation later.
 *
 * Effort ("rir", editable in the workout editor):
 * - isolation and stable machine/cable lifts: to technical failure, "0";
 * - back squat, Romanian deadlift and walking lunges: a safety margin of "1–2";
 * - the two dumbbell presses (seated shoulder press, incline press): "0–1" — PROGRAM's call,
 *   flagged for Quinton (they are neither isolation nor machine lifts).
 * Rest: heavy compounds 150–180 s, isolation 90 s (custom rest stays editable).
 */

const FAIL = "0";
const DB_PRESS = "0–1";
const SAFE = "1–2";

function ex(slug: string, name: string, repLow: number, repHigh: number, rir: string, rest: number, note: string, unit: RepUnit = "reps"): TemplateExercise {
  return { slug, name, sets: 2, repLow, repHigh, unit, rir, rest, note };
}

const ARMS: TemplateExercise[] = [
  ex("seated-db-shoulder-press", "Seated Dumbbell Shoulder Press", 6, 10, DB_PRESS, 150, "Stop at the last clean rep; elbows slightly forward."),
  ex("incline-db-curl", "Incline Dumbbell Curl", 8, 12, FAIL, 90, "Arms hang straight down; let the long head stretch."),
  ex("overhead-cable-triceps-extension", "Overhead Cable Triceps Extension", 10, 15, FAIL, 90, "Deep stretch behind the head, elbows narrow."),
  ex("db-lateral-raise", "Dumbbell Lateral Raise", 12, 20, FAIL, 90, "Lead with the elbows, no swing, pause at shoulder height."),
  ex("cable-curl", "Cable Biceps Curl", 10, 15, FAIL, 90, "Elbows still at your sides; no leaning back."),
  ex("cable-triceps-pushdown", "Cable Triceps Pushdown", 10, 15, FAIL, 90, "Elbows pinned, full lockout, slow return."),
];

const CHEST_BACK: TemplateExercise[] = [
  ex("incline-db-press", "Incline Dumbbell Press", 6, 10, DB_PRESS, 150, "Full stretch at the bottom, press up and slightly in."),
  ex("lat-pulldown", "Lat Pulldown", 8, 12, FAIL, 150, "Full stretch at the top, bar to the upper chest."),
  ex("machine-chest-press", "Machine Chest Press", 8, 12, FAIL, 150, "Slow lowering, full stretch, strong squeeze."),
  ex("seated-cable-row", "Seated Cable Row", 8, 12, FAIL, 150, "Chest up, pull the handle to your stomach, no rocking."),
  ex("cable-chest-fly", "Cable Chest Fly", 10, 15, FAIL, 90, "Elbow angle locked; squeeze where the hands meet."),
  ex("straight-arm-pulldown", "Straight-Arm Cable Pulldown", 12, 15, FAIL, 90, "Arms long, sweep the bar to your thighs with your lats."),
];

const LEGS: TemplateExercise[] = [
  ex("back-squat", "Barbell Back Squat", 6, 10, SAFE, 180, "Safeties set. Stop with 1–2 reps left; never a failed rep."),
  ex("romanian-deadlift", "Romanian Deadlift", 8, 12, SAFE, 180, "Flat back, bar on your legs. Stop at your hamstring stretch."),
  ex("walking-lunge", "Dumbbell Walking Lunges", 8, 12, SAFE, 150, "8–12 reps per leg; one set covers both legs.", "each"),
  ex("standing-calf-raise", "Standing Calf Raises", 10, 20, FAIL, 90, "Full stretch at the bottom with a pause, then all the way up."),
];

const WARMUP = {
  arms: [
    { label: "General warm-up", detail: "5 min easy bike, rower or incline walk until you're lightly warm." },
    { label: "Shoulders", detail: "Band pull-aparts ×15, band external rotations ×12 each arm, arm circles ×10 each way." },
    { label: "Ramp-up", detail: "Shoulder press: ×10 at about 50%, then ×5 at about 75% of today's working weight. One light set ×12 before the first curl and the first extension." },
  ],
  chestBack: [
    { label: "General warm-up", detail: "5 min easy rower or bike until you're lightly warm." },
    { label: "Shoulders and upper back", detail: "Band pull-aparts ×15, band dislocates ×10, scap push-ups ×10." },
    { label: "Ramp-up", detail: "Incline press: ×10 at about 50%, ×5 at 70%, ×2 at 85% of today's working weight. Pulldown: ×10 at about 50% before the first working set." },
  ],
  legs: [
    { label: "General warm-up", detail: "5–8 min easy bike or incline walk until you're lightly sweating." },
    { label: "Mobility", detail: "Leg swings ×10 each direction, hip 90/90 switches ×5 each side, ankle rocks ×10 each, deep squat hold 30 s." },
    { label: "Squat ramp-up", detail: "Empty bar ×10, then 40% ×5, 60% ×3, 75% ×2 and 85% ×1 of today's working weight. Rest 60–90 s between ramp sets." },
    { label: "RDL feeder set", detail: "One set ×8 at about 60% before the working sets." },
  ],
};

const NOTES = [
  "Two working sets per exercise. Warm-up sets don't count.",
  "Isolation and machine lifts: the last clean rep is the last rep.",
];

function day(key: TwoSetKey, family: "shoulders_arms" | "chest_back" | "legs", weekday: number, subtitle: string): DayTemplate {
  const base = {
    shoulders_arms: { name: "Arms & Shoulders", abbr: "Arms", focus: "Shoulders, biceps and triceps, two hard sets each.", warmup: WARMUP.arms, exercises: ARMS },
    chest_back: { name: "Chest & Back", abbr: "Chest", focus: "Upper chest, chest and back width, two hard sets each.", warmup: WARMUP.chestBack, exercises: CHEST_BACK },
    legs: { name: "Legs", abbr: "Legs", focus: "Quads, hamstrings, glutes and calves, two hard sets each.", warmup: WARMUP.legs, exercises: LEGS },
  }[family];
  const notes = family === "legs" ? [NOTES[0], "Squats, Romanian deadlifts and lunges: stop 1–2 reps short of failure for safety."] : NOTES;
  return { key, program: "twoset", name: base.name, short: base.name, abbr: base.abbr, family, subtitle, focus: base.focus, notes, weekday, warmup: base.warmup.map((w) => ({ ...w })), exercises: base.exercises.map((e) => ({ ...e })) };
}

/** In weekday order (Mon … Sat). Rotation A runs Mon–Wed, rotation B Thu–Sat; their content is the same. */
export const TWOSET_TEMPLATES: DayTemplate[] = [
  day("arms_a", "shoulders_arms", 1, "Monday"),
  day("chest_a", "chest_back", 2, "Tuesday"),
  day("lower_a", "legs", 3, "Wednesday"),
  day("arms_b", "shoulders_arms", 4, "Thursday"),
  day("chest_b", "chest_back", 5, "Friday"),
  day("lower_b", "legs", 6, "Saturday"),
];

/** JS weekday ("0" = Sunday … "6" = Saturday) → template. */
export const TWOSET_SCHEDULE: Record<string, TwoSetKey | "rest"> = {
  "1": "arms_a",
  "2": "chest_a",
  "3": "lower_a",
  "4": "arms_b",
  "5": "chest_b",
  "6": "lower_b",
  "0": "rest",
};

/** Shown in Program ("How the plan works") and sent to the coach. */
export const TWOSET_RULES: string[] = [
  "Two working sets per exercise. Warm-up sets don't count toward them.",
  "Isolation and stable machine or cable lifts: go to technical failure, the last rep you can do with good form.",
  "Back squat, Romanian deadlift and walking lunges: stop 1–2 reps short of failure for safety.",
  "Dumbbell presses: stop at 0–1 reps in reserve.",
  "Rest 2–3 min on heavy compound lifts and 90–120 s on isolation work.",
  "When both sets reach the top of the rep range with good technique, add the smallest load step next time. Otherwise keep the load and add reps. Loads never go up on their own.",
  "Six training days are not mandatory. When recovery is poor, take the rest day.",
  "Pain is a stop sign. Never train through joint pain: swap the exercise or skip it.",
];

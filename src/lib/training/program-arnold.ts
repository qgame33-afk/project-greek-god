import type { ArnoldKey, DayTemplate, RepUnit, TemplateExercise } from "./types";

/**
 * Arnold Split 2.0 — Quinton's six-day program, exactly as he wrote it
 * (docs/PROGRAM-ARNOLD.md §1.3). Names, exercise order, sets and rep ranges are his.
 * RIR and rest follow §1.2: heavy compounds 1–3 in reserve and 120–180 s, isolation 0–2 and
 * 60–120 s. `notes` are his training notes for the day, verbatim.
 */

const HEAVY = "1–3";
const ISO = "0–2";

function ex(slug: string, name: string, sets: number, repLow: number, repHigh: number, unit: RepUnit, rir: string, rest: number, note: string, optional?: true): TemplateExercise {
  return optional ? { slug, name, sets, repLow, repHigh, unit, rir, rest, optional, note } : { slug, name, sets, repLow, repHigh, unit, rir, rest, note };
}

export const ARNOLD_TEMPLATES: DayTemplate[] = [
  {
    key: "shoulders_arms_a",
    program: "arnold",
    name: "Shoulders, Biceps & Triceps A",
    short: "Shoulders & Arms A",
    abbr: "Arms",
    family: "shoulders_arms",
    subtitle: "Side-delt width and arms",
    focus: "Side-delt width, rounded shoulders and overall arm development.",
    notes: [
      "Prioritize strict lateral raise technique.",
      "Use controlled repetitions and a full comfortable range of motion.",
      "Do not unnecessarily exhaust triceps during shoulder presses.",
      "Keep enough recovery capacity for Tuesday's chest and back session.",
    ],
    weekday: 1,
    warmup: [
      { label: "General warm-up", detail: "5 min easy bike, rower or incline walk until you're lightly warm." },
      { label: "Shoulders", detail: "Band pull-aparts ×15, band external rotations ×12 each arm, arm circles ×10 each way." },
      { label: "Press ramp-up", detail: "Seated dumbbell press: ×10 at about 50%, then ×5 at about 75% of today's working weight." },
      { label: "Elbows", detail: "One light set of preacher curls ×15 and rope pushdowns ×15 before the arm work." },
    ],
    exercises: [
      ex("seated-db-shoulder-press", "Seated Dumbbell Shoulder Press", 2, 6, 10, "reps", HEAVY, 150, "Stop each set with 1–3 reps left so the triceps stay fresh for the arm work and Tuesday."),
      ex("cable-lateral-raise", "Cable Lateral Raises", 4, 12, 20, "each", ISO, 60, "Strict: lead with the elbow, no swing, pause at shoulder height. Reps per arm."),
      ex("reverse-pec-deck", "Reverse Pec Deck", 3, 12, 20, "reps", ISO, 60, "Arms long, sweep out and back. No shrugging."),
      ex("preacher-curl", "EZ-Bar Preacher Curls", 3, 8, 12, "reps", ISO, 90, "Control the bottom; stop just short of a hard lockout."),
      ex("overhead-cable-triceps-extension", "Overhead Cable Triceps Extensions", 3, 10, 15, "reps", ISO, 90, "Deep stretch behind the head, elbows narrow."),
      ex("incline-db-curl", "Incline Dumbbell Curls", 2, 10, 15, "reps", ISO, 75, "Arms hang straight down; let the long head stretch."),
      ex("rope-triceps-pushdown", "Rope Triceps Pushdowns", 2, 10, 15, "reps", ISO, 60, "Split the rope at the bottom, elbows pinned."),
    ],
  },
  {
    key: "chest_back_a",
    program: "arnold",
    name: "Chest & Back A",
    short: "Chest & Back A",
    abbr: "Chest",
    family: "chest_back",
    subtitle: "Upper chest and lat width",
    focus: "Thick upper chest, wide lats and a pronounced V-taper.",
    notes: [
      "Use an incline of approximately 15–30 degrees for incline pressing.",
      "Prioritize controlled stretches and strong contractions.",
      "Keep chest and back training balanced.",
      "Avoid excessive lower-back fatigue by prioritizing supported rows.",
    ],
    weekday: 2,
    warmup: [
      { label: "General warm-up", detail: "5 min easy rower or bike until you're lightly warm." },
      { label: "Shoulders and upper back", detail: "Band pull-aparts ×15, band dislocates ×10, scap push-ups ×10." },
      { label: "Incline press ramp-up", detail: "Light dumbbells ×10, then about 50% ×8, 70% ×5 and 85% ×2 of today's working weight." },
      { label: "Pulldown ramp-up", detail: "×10 at about 50%, then ×5 at about 75% before the first working set." },
    ],
    exercises: [
      ex("incline-db-press", "Incline Dumbbell Press", 3, 6, 10, "reps", HEAVY, 150, "Bench at 15–30°. Full stretch at the bottom, press up and slightly in."),
      ex("neutral-grip-lat-pulldown", "Neutral-Grip Lat Pulldown", 3, 8, 12, "reps", HEAVY, 150, "Full stretch at the top, drive the elbows to your hips."),
      ex("chest-supported-row", "Chest-Supported Row", 3, 8, 12, "reps", HEAVY, 120, "Chest stays on the pad, so the lower back rests."),
      ex("machine-chest-press", "Machine Chest Press", 2, 8, 12, "reps", HEAVY, 120, "Slow 2–3 s lowering, full stretch, strong squeeze."),
      ex("cable-chest-fly", "Low-to-High Cable Fly", 2, 12, 15, "reps", ISO, 75, "Pulleys at the bottom. Sweep up and in to upper-chest height; elbow angle locked."),
      ex("single-arm-lat-pulldown", "Single-Arm Cable Lat Pulldown", 2, 10, 15, "each", HEAVY, 120, "Reps per arm. Pull the elbow down to your hip."),
    ],
  },
  {
    key: "legs_abs_a",
    program: "arnold",
    name: "Legs & Abs A",
    short: "Legs & Abs A",
    abbr: "Legs",
    family: "legs_abs",
    subtitle: "Squat, hinge, calves and abs",
    focus: "Quadriceps, hamstrings, calf development and abdominal strength.",
    notes: [
      "Use proper warm-up sets before heavy squats.",
      "Prioritize a controlled range of motion.",
      "Avoid taking heavy compound exercises to absolute failure.",
      "Rest adequately before challenging sets.",
    ],
    weekday: 3,
    warmup: [
      { label: "General warm-up", detail: "5–8 min easy bike or incline walk until you're lightly sweating." },
      { label: "Mobility", detail: "Leg swings ×10 each direction, hip 90/90 switches ×5 each side, ankle rocks ×10 each, deep squat hold 30 s." },
      { label: "Activation", detail: "Glute bridges ×12, bodyweight squats ×10." },
      { label: "Squat ramp-up", detail: "Empty bar ×10 and ×8, then 40% ×5, 60% ×3, 75% ×2 and 85% ×1 of today's working weight. Rest 60–90 s between ramp sets." },
      { label: "RDL feeder set", detail: "One set ×8 at about 60% before the working sets." },
    ],
    exercises: [
      ex("back-squat", "Barbell Back Squat", 3, 5, 8, "reps", HEAVY, 180, "Safeties set. Never to failure: stop with 1–3 reps left."),
      ex("romanian-deadlift", "Romanian Deadlift", 3, 6, 10, "reps", HEAVY, 180, "Flat back, bar on your legs. Stop at your hamstring stretch."),
      ex("leg-press", "Leg Press", 2, 10, 15, "reps", HEAVY, 150, "Hips stay on the pad. Don't lock the knees out."),
      ex("seated-leg-curl", "Seated Leg Curl", 3, 10, 15, "reps", ISO, 90, "Lean forward slightly and control the return."),
      ex("standing-calf-raise", "Standing Calf Raises", 4, 8, 15, "reps", ISO, 75, "Full stretch at the bottom with a 1 s pause, then all the way up."),
      ex("hanging-leg-raise", "Hanging Leg Raises", 3, 10, 15, "reps", ISO, 75, "Curl the pelvis up, no swinging. Bend the knees if the lower back arches."),
    ],
  },
  {
    key: "shoulders_arms_b",
    program: "arnold",
    name: "Shoulders, Biceps & Triceps B",
    short: "Shoulders & Arms B",
    abbr: "Arms",
    family: "shoulders_arms",
    subtitle: "Delts, arms and forearms",
    focus: "Shoulder width, arm thickness, forearms and complete delt development.",
    notes: [
      "Emphasize side and rear delts.",
      "Use controlled reps on biceps and triceps movements.",
      "Shoulder pressing volume can be reduced if it interferes with Friday's chest session.",
      "Track arm and shoulder progression separately.",
    ],
    weekday: 4,
    warmup: [
      { label: "General warm-up", detail: "5 min easy bike, rower or incline walk until you're lightly warm." },
      { label: "Shoulders", detail: "Band pull-aparts ×15, band external rotations ×12 each arm, arm circles ×10 each way." },
      { label: "Press ramp-up", detail: "Machine press: ×10 at about 50%, then ×5 at about 75% of today's working weight." },
      { label: "Wrists and elbows", detail: "Wrist circles ×10 each way, then one light cable curl set ×15 before the arm work." },
    ],
    exercises: [
      ex("machine-shoulder-press", "Machine Shoulder Press", 2, 8, 12, "reps", HEAVY, 120, "Smooth reps, 1–3 left in the tank. This is the set to trim if Friday's pressing suffers."),
      ex("db-lateral-raise", "Dumbbell Lateral Raises", 4, 12, 20, "reps", ISO, 60, "Slight lean forward, lead with the elbows, no swing."),
      ex("cable-rear-delt-fly", "Cable Rear Delt Fly", 3, 12, 20, "reps", ISO, 60, "Cables crossed at shoulder height, arms long, sweep out and back."),
      ex("cable-curl", "Cable Biceps Curls", 3, 10, 15, "reps", ISO, 75, "Elbows still at your sides; no leaning back."),
      ex("single-arm-overhead-cable-triceps-extension", "Single-Arm Overhead Cable Triceps Extension", 3, 10, 15, "each", ISO, 60, "Reps per arm. Elbow points up and stays still; full stretch."),
      ex("cross-body-hammer-curl", "Cross-Body Hammer Curls", 2, 10, 15, "reps", ISO, 75, "Curl across toward the opposite shoulder, thumbs up. Count reps per arm."),
      ex("straight-bar-pushdown", "Straight-Bar Triceps Pushdowns", 2, 10, 15, "reps", ISO, 60, "Elbows pinned, full lockout, slow return."),
      ex("reverse-curl", "Reverse Curls", 2, 10, 15, "reps", ISO, 60, "Optional, for forearms when recovery is good. Or swap them in for the cross-body hammer curls instead of adding sets.", true),
    ],
  },
  {
    key: "chest_back_b",
    program: "arnold",
    name: "Chest & Back B",
    short: "Chest & Back B",
    abbr: "Chest",
    family: "chest_back",
    subtitle: "Chest thickness and upper back",
    focus: "Chest thickness, upper-back development and lat width.",
    notes: [
      "Prioritize full, controlled repetitions.",
      "Choose comfortable grip widths.",
      "Use chest-supported rowing to minimize unnecessary fatigue.",
      "Progress weight or repetitions when form remains excellent.",
    ],
    weekday: 5,
    warmup: [
      { label: "General warm-up", detail: "5 min easy rower or bike until you're lightly warm." },
      { label: "Shoulders and upper back", detail: "Band pull-aparts ×15, band dislocates ×10, push-ups ×10." },
      { label: "Incline Smith ramp-up", detail: "Empty bar ×10, then about 50% ×6, 70% ×4 and 85% ×2 of today's working weight." },
      { label: "Row feeder set", detail: "One light set ×10 before the first wide row." },
    ],
    exercises: [
      ex("incline-smith-press", "Incline Smith Machine Press", 3, 8, 12, "reps", HEAVY, 150, "Bench at 15–30°. Bar touches high on the chest."),
      ex("chest-supported-wide-row", "Chest-Supported Wide Row", 3, 8, 12, "reps", HEAVY, 150, "Elbows wide for upper back and rear delts. No shrugging."),
      ex("lat-pulldown", "Wide-Grip Lat Pulldown", 3, 8, 12, "reps", HEAVY, 120, "Hands a comfortable width outside the shoulders. Bar to the upper chest."),
      ex("db-bench-press", "Flat Dumbbell Bench Press", 2, 8, 12, "reps", HEAVY, 120, "Forearms vertical at the bottom; a deep but pain-free stretch."),
      ex("pec-deck", "Pec Deck", 2, 12, 15, "reps", ISO, 75, "Squeeze for a second; return slowly to the stretch."),
      ex("single-arm-cable-row", "Single-Arm Cable Row", 2, 10, 15, "each", HEAVY, 120, "Reps per arm. Reach into the stretch, pull the elbow to your hip."),
    ],
  },
  {
    key: "legs_abs_b",
    program: "arnold",
    name: "Legs & Abs B",
    short: "Legs & Abs B",
    abbr: "Legs",
    family: "legs_abs",
    subtitle: "Quads, glutes, hamstrings and calves",
    focus: "Complete lower-body muscle development, emphasizing quad fullness, glutes, hamstrings and calves.",
    notes: [
      "Maintain controlled technique.",
      "Prioritize full comfortable range of motion.",
      "Use appropriate recovery between hard sets.",
      "Do not train through joint pain.",
    ],
    weekday: 6,
    warmup: [
      { label: "General warm-up", detail: "5–8 min easy bike or incline walk until you're lightly sweating." },
      { label: "Mobility", detail: "Leg swings ×10 each direction, couch stretch 30 s each side, ankle rocks ×10 each." },
      { label: "Activation", detail: "Glute bridges ×12, lateral band walks ×10 each way, bodyweight squats ×10." },
      { label: "Hack squat ramp-up", detail: "Empty sled ×10, then 40% ×6, 60% ×4 and 80% ×2 of today's working weight." },
      { label: "Split squat prep", detail: "One bodyweight set ×6 each leg before the loaded sets." },
    ],
    exercises: [
      ex("hack-squat", "Hack Squat", 3, 8, 12, "reps", HEAVY, 180, "Deep, controlled reps. Stop with 1–3 left."),
      ex("bulgarian-split-squat", "Bulgarian Split Squat", 2, 8, 12, "each", HEAVY, 120, "8–12 reps per leg. Start with your weaker leg."),
      ex("lying-leg-curl", "Lying Leg Curl", 3, 10, 15, "reps", ISO, 90, "Hips pressed into the pad; slow lowering."),
      ex("leg-extension", "Leg Extension", 2, 12, 15, "reps", ISO, 75, "Pause for a second at the top of every rep."),
      ex("hip-thrust", "Hip Thrust", 2, 8, 12, "reps", HEAVY, 120, "Chin tucked, ribs down. Pause and squeeze at the top."),
      ex("seated-calf-raise", "Seated Calf Raises", 4, 10, 20, "reps", ISO, 60, "Pause in the stretch, then all the way up."),
      ex("cable-crunch", "Cable Crunches", 3, 10, 15, "reps", ISO, 60, "Ribs to pelvis; your hips stay still."),
    ],
  },
];

/** JS weekday ("0" = Sunday … "6" = Saturday) → template (Q§1). */
export const ARNOLD_SCHEDULE: Record<string, ArnoldKey | "rest"> = {
  "1": "shoulders_arms_a",
  "2": "chest_back_a",
  "3": "legs_abs_a",
  "4": "shoulders_arms_b",
  "5": "chest_back_b",
  "6": "legs_abs_b",
  "0": "rest",
};

/** Shown in Program ("How the plan works") and sent to the coach (§1.6). */
export const ARNOLD_RULES: string[] = [
  "Warm up every session: 5 min general, then the day's ramp-up sets before the first heavy lift.",
  "Heavy compound lifts: 1–3 reps in reserve and 2–3 min rest. Never grind them to failure.",
  "Isolation work: 0–2 reps in reserve and 60–120 s rest.",
  "Double progression: once every working set reaches the top of the rep range at the target effort, add the smallest load step next time. Otherwise keep the load and add reps. Loads never go up on their own.",
  "Strict form first: controlled reps through a full, comfortable range, especially on lateral raises.",
  "Monday and Thursday arm work should leave enough for Tuesday and Friday. If pressing or pulling drops the next day, trim a set or change the order.",
  "Six training days are not mandatory. When recovery is poor, take the rest day.",
  "Pain is a stop sign. Never train through joint pain: swap the exercise or skip it.",
];

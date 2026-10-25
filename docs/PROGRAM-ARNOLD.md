# PROGRAM — ARNOLD SPLIT 2.0 (training program, switch-over, volleyball removal)

Binding spec for the training **program, data and logic**. The parallel UI spec is
`docs/DESIGN-V3-SIMPLE.md`; where the two meet, this file owns *what* is planned, stored, computed
and suggested, and DESIGN-V3-SIMPLE owns *how it looks*. Read `CONVENTIONS.md` first (data rules
are unchanged: no fabricated data, all reads and writes through `src/lib/data/*`, optimistic
writes with rollback and Undo, `local_date` everywhere, lb stored).

Sources, all binding, in this order:

1. Quinton's request "PROJECT GREEK GOD — ARNOLD SPLIT 2.0", saved verbatim at
   `scratchpad/simple/arnold-2.0.md` (referred to below as **Q§n**, e.g. Q§10).
2. "make my workout split the arnold split and forget about the volleyball shit".
3. No volleyball anywhere (logging, sheets, lists, readiness/recovery inputs, check-in question,
   day engine, adherence, reviews, settings, onboarding, coach prompt/context/mock, copy, icons,
   the Athletic section of Progress). Tables and rows stay untouched and stay in the export.
4. "make it simpler the ui is still to complicated" (UI: DESIGN-V3-SIMPLE).

Conflicts resolved here (binding):

- **Day order.** `scratchpad/simple/verdict.json` (`must_fix[0]`) lists "Mon Chest & Back A, Tue
  Shoulders & Arms A, …". That was written before Quinton's Arnold 2.0 request and is
  **superseded** by Q§1: Monday Shoulders, Biceps & Triceps A · Tuesday Chest & Back A ·
  Wednesday Legs & Abs A · Thursday Shoulders, Biceps & Triceps B · Friday Chest & Back B ·
  Saturday Legs & Abs B · Sunday rest. Any mockup with the verdict's order is wrong.
- **Names.** Template `name` is Quinton's exact text ("Shoulders, Biceps & Triceps A"). Tight UI
  places use the `short` ("Shoulders & Arms A") or `abbr` ("Arms") forms defined in §1.3, read
  from data, never hardcoded in components.
- **Preview (Q§15.12).** Vercel preview deployments use the production database and skip
  migrations (`scripts/migrate.mjs`). So the switch-over is a migration that runs only on a
  production deploy (the publication), and no client code switches a saved program on its own
  (§3.1). Previews never change Quinton's saved program. Nobody runs the migrations against
  production by hand before he approves publication. The approved publication is **two
  production deploys in a row** (§3.1a): A ships the new app and the database functions, B ships
  only the one-time switch, so no old app code ever reads an Arnold schedule.

Contents: §1 the program · §2 keys, types and the active program · §3 the switch-over ·
§4 progression, lighter weeks, rest days, fatigue overlap · §5 muscle-group analytics ·
§6 volleyball removal in logic · §7 ownership, phases and the interface for screen streams ·
§8 acceptance tests · §9 traceability (every line of Quinton's request → where it is met).

---

## 1. The program

### 1.1 Weekly schedule (Q§1)

JS weekday keys as stored in `profiles.weekly_schedule` (`"0"` = Sunday).

| Weekday | Key | `name` (Quinton's) | `short` | `abbr` | `family` |
|---|---|---|---|---|---|
| `"1"` Monday | `shoulders_arms_a` | Shoulders, Biceps & Triceps A | Shoulders & Arms A | Arms | `shoulders_arms` |
| `"2"` Tuesday | `chest_back_a` | Chest & Back A | Chest & Back A | Chest | `chest_back` |
| `"3"` Wednesday | `legs_abs_a` | Legs & Abs A | Legs & Abs A | Legs | `legs_abs` |
| `"4"` Thursday | `shoulders_arms_b` | Shoulders, Biceps & Triceps B | Shoulders & Arms B | Arms | `shoulders_arms` |
| `"5"` Friday | `chest_back_b` | Chest & Back B | Chest & Back B | Chest | `chest_back` |
| `"6"` Saturday | `legs_abs_b` | Legs & Abs B | Legs & Abs B | Legs | `legs_abs` |
| `"0"` Sunday | `rest` | Rest and recovery | Rest | Rest | — |

`ARNOLD_SCHEDULE = {"1":"shoulders_arms_a","2":"chest_back_a","3":"legs_abs_a","4":"shoulders_arms_b","5":"chest_back_b","6":"legs_abs_b","0":"rest"}`.

"Allow me to rearrange the days whenever needed" (Q§1) is already supported and keeps working with
the new keys: the weekly schedule editor (Program) and per-day move/swap (`planMove`,
`rescheduleOptions`, `useDayPlanWrites`). Every rule below that depends on day order (the fatigue
overlap, §4.6) reads what was *actually* trained yesterday, not weekday names, so it stays right
after he rearranges.

**When a new weekly order applies (decided here; DESIGN-V3 §4.3.6 words it).** A saved order
applies **from today**. Days before today keep the plan they had: the editor writes
`scheduleFreeze()` rows for the last 14 days (existing behaviour). Today keeps its plan too when a
workout was started or finished today: `scheduleFreeze()` gains `trainedToday: boolean`, and when
it is true the loop runs through today (`d <= today`), so a finished workout is never shown on a
day that now says something else. The sheet's caption: "Starts today. Days before today keep the
plan they had." One-off changes for a single date stay in the Day sheet (move, swap, rest).

Lengths the UI must hold (for the designer): longest template name "Shoulders, Biceps & Triceps A"
(29 characters); longest exercise name "Single-Arm Overhead Cable Triceps Extension" (43).

### 1.2 Effort and rest defaults (Q§10)

Every exercise gets one of two effort classes. The class comes from the library `category`:
`compound` → heavy compound; `isolation` and `core` → isolation.

| Class | RIR text (`TemplateExercise.rir`) | Rest | Applies to |
|---|---|---|---|
| Heavy compound | `"1–3"` | 120–180 s (main lift of the day 150–180 s) | presses, rows, pulldowns (incl. single-arm), squats, RDL, leg press, split squat, hip thrust |
| Isolation | `"0–2"` | 60–120 s | raises, flies, curls, extensions, pushdowns, leg curl/extension, calves, abs |

- The RIR strings use the en dash `–` like the existing `"1–2"`. `RIR_OPTIONS` in `volume.ts`
  becomes `["0–1", "0–2", "1–2", "1–3", "2–3", "3–4", "Fresh"]`.
- New pure helper `effortDefaults(lib: LibraryExercise): { rir: string; rest: number }` in
  `src/lib/training/programs.ts`: compound → `{ rir: "1–3", rest: clamp(lib.rest, 120, 180) }`;
  isolation/core → `{ rir: "0–2", rest: clamp(lib.rest, 60, 120) }`; carry → `{ "1–2", 90 }`;
  explosive (retired, §1.9) → `{ "Fresh", lib.rest }`. Used by `newTemplateExercise()` (template
  editor "add exercise") and `defaultTargets()` / `retarget()` in `src/lib/workout/session.ts`
  (exercise added or swapped mid-session), so ad-hoc work follows Q§10 too. On a swap,
  `retarget()` keeps the previous `rest` when the old and new exercise are in the same effort
  class, else uses the new exercise's `effortDefaults().rest`.
- `rirRange(text: string): [number, number] | null` parses `"1–3"` → `[1, 3]`, `"0–2"` → `[0, 2]`,
  `"3"` → `[3, 3]`, `"Fresh"` → `null`. Progression uses it (§4.1).

### 1.3 The six templates (Q§2–§7), exactly

`DayTemplate` fields per template are listed first, then the warm-up, then every exercise in
order. Sets, rep ranges and exercise order are Quinton's. RIR and rest follow §1.2. Notes are
short form cues; the day's `notes` array is Quinton's "Training notes" verbatim and is shown with
the day (it is built-in guidance, not stored in `program_templates`). Intro sets follow §4.2.
`unit: "each"` means reps are per arm or per leg (Q§7 "8–12 per leg"; also the single-arm and
cable-lateral work, as the library marks them `perSide`). Quinton's rep ranges are unchanged;
"each" only says how they are counted. Cable Lateral Raises were already logged per arm under PPL
(`unit: "each"` in Push A and Push B), so his history compares like with like.

Cross-checked against `arnold-2.0.md` line by line (day order, names, every exercise, sets, rep
ranges, focus lines and training notes): identical. Sums: 19 · 15 · 18 · 19 · 15 · 19 = 105.

#### Monday — Shoulders, Biceps & Triceps A (`shoulders_arms_a`)

- **name** `Shoulders, Biceps & Triceps A` · **short** `Shoulders & Arms A` · **abbr** `Arms` · **family** `shoulders_arms` · **weekday** 1 · **sort** 0
- **subtitle** "Side-delt width and arms"
- **focus** "Side-delt width, rounded shoulders and overall arm development."
- **notes** (Quinton's training notes, verbatim): "Prioritize strict lateral raise technique." · "Use controlled repetitions and a full comfortable range of motion." · "Do not unnecessarily exhaust triceps during shoulder presses." · "Keep enough recovery capacity for Tuesday's chest and back session."
- **sets** 19 standard · 15 intro · 11 deload · **estimateDurationMin** 50 min

Warm-up (`warmup`, in order):

1. **General warm-up** — 5 min easy bike, rower or incline walk until you're lightly warm.
2. **Shoulders** — Band pull-aparts ×15, band external rotations ×12 each arm, arm circles ×10 each way.
3. **Press ramp-up** — Seated dumbbell press: ×10 at about 50%, then ×5 at about 75% of today's working weight.
4. **Elbows** — One light set of preacher curls ×15 and rope pushdowns ×15 before the arm work.

| # | Exercise (`name`) | `slug` | Sets | Reps (`repLow`–`repHigh`, `unit`) | RIR | Rest | Intro sets | `note` |
|---|---|---|---|---|---|---|---|---|
| 1 | Seated Dumbbell Shoulder Press | `seated-db-shoulder-press` | 2 | 6–10 (`reps`) | 1–3 | 150 s | 2 | Stop each set with 1–3 reps left so the triceps stay fresh for the arm work and Tuesday. |
| 2 | Cable Lateral Raises | `cable-lateral-raise` | 4 | 12–20 each (`each`) | 0–2 | 60 s | 3 | Strict: lead with the elbow, no swing, pause at shoulder height. Reps per arm. |
| 3 | Reverse Pec Deck | `reverse-pec-deck` | 3 | 12–20 (`reps`) | 0–2 | 60 s | 2 | Arms long, sweep out and back. No shrugging. |
| 4 | EZ-Bar Preacher Curls | `preacher-curl` | 3 | 8–12 (`reps`) | 0–2 | 90 s | 2 | Control the bottom; stop just short of a hard lockout. |
| 5 | Overhead Cable Triceps Extensions | `overhead-cable-triceps-extension` | 3 | 10–15 (`reps`) | 0–2 | 90 s | 2 | Deep stretch behind the head, elbows narrow. |
| 6 | Incline Dumbbell Curls | `incline-db-curl` | 2 | 10–15 (`reps`) | 0 (to failure, Quinton 25 Oct) | 75 s | 2 | Both sets to failure. Arms hang straight down; let the long head stretch. |
| 7 | Rope Triceps Pushdowns | `rope-triceps-pushdown` | 2 | 10–15 (`reps`) | 0–2 | 60 s | 2 | Split the rope at the bottom, elbows pinned. |

#### Tuesday — Chest & Back A (`chest_back_a`)

- **name** `Chest & Back A` · **short** `Chest & Back A` · **abbr** `Chest` · **family** `chest_back` · **weekday** 2 · **sort** 1
- **subtitle** "Upper chest and lat width"
- **focus** "Thick upper chest, wide lats and a pronounced V-taper."
- **notes** (Quinton's training notes, verbatim): "Use an incline of approximately 15–30 degrees for incline pressing." · "Prioritize controlled stretches and strong contractions." · "Keep chest and back training balanced." · "Avoid excessive lower-back fatigue by prioritizing supported rows."
- **sets** 15 standard · 12 intro · 9 deload · **estimateDurationMin** 45 min

Warm-up (`warmup`, in order):

1. **General warm-up** — 5 min easy rower or bike until you're lightly warm.
2. **Shoulders and upper back** — Band pull-aparts ×15, band dislocates ×10, scap push-ups ×10.
3. **Incline press ramp-up** — Light dumbbells ×10, then about 50% ×8, 70% ×5 and 85% ×2 of today's working weight.
4. **Pulldown ramp-up** — ×10 at about 50%, then ×5 at about 75% before the first working set.

| # | Exercise (`name`) | `slug` | Sets | Reps (`repLow`–`repHigh`, `unit`) | RIR | Rest | Intro sets | `note` |
|---|---|---|---|---|---|---|---|---|
| 1 | Incline Dumbbell Press | `incline-db-press` | 3 | 6–10 (`reps`) | 1–3 | 150 s | 2 | Bench at 15–30°. Full stretch at the bottom, press up and slightly in. |
| 2 | Neutral-Grip Lat Pulldown | `neutral-grip-lat-pulldown` | 3 | 8–12 (`reps`) | 1–3 | 150 s | 2 | Full stretch at the top, drive the elbows to your hips. |
| 3 | Chest-Supported Row | `chest-supported-row` | 3 | 8–12 (`reps`) | 1–3 | 120 s | 2 | Chest stays on the pad, so the lower back rests. |
| 4 | Machine Chest Press | `machine-chest-press` | 2 | 8–12 (`reps`) | 1–3 | 120 s | 2 | Slow 2–3 s lowering, full stretch, strong squeeze. |
| 5 | Low-to-High Cable Fly | `cable-chest-fly` | 2 | 12–15 (`reps`) | 0–2 | 75 s | 2 | Pulleys at the bottom. Sweep up and in to upper-chest height; elbow angle locked. |
| 6 | Single-Arm Cable Lat Pulldown | `single-arm-lat-pulldown` | 2 | 10–15 each (`each`) | 1–3 | 120 s | 2 | Reps per arm. Pull the elbow down to your hip. |

#### Wednesday — Legs & Abs A (`legs_abs_a`)

- **name** `Legs & Abs A` · **short** `Legs & Abs A` · **abbr** `Legs` · **family** `legs_abs` · **weekday** 3 · **sort** 2
- **subtitle** "Squat, hinge, calves and abs"
- **focus** "Quadriceps, hamstrings, calf development and abdominal strength."
- **notes** (Quinton's training notes, verbatim): "Use proper warm-up sets before heavy squats." · "Prioritize a controlled range of motion." · "Avoid taking heavy compound exercises to absolute failure." · "Rest adequately before challenging sets."
- **sets** 18 standard · 13 intro · 11 deload · **estimateDurationMin** 50 min

Warm-up (`warmup`, in order). The squat ramp-up is required by Q§4 ("Use proper warm-up sets before heavy squats"):

1. **General warm-up** — 5–8 min easy bike or incline walk until you're lightly sweating.
2. **Mobility** — Leg swings ×10 each direction, hip 90/90 switches ×5 each side, ankle rocks ×10 each, deep squat hold 30 s.
3. **Activation** — Glute bridges ×12, bodyweight squats ×10.
4. **Squat ramp-up** — Empty bar ×10 and ×8, then 40% ×5, 60% ×3, 75% ×2 and 85% ×1 of today's working weight. Rest 60–90 s between ramp sets.
5. **RDL feeder set** — One set ×8 at about 60% before the working sets.

| # | Exercise (`name`) | `slug` | Sets | Reps (`repLow`–`repHigh`, `unit`) | RIR | Rest | Intro sets | `note` |
|---|---|---|---|---|---|---|---|---|
| 1 | Barbell Back Squat | `back-squat` | 3 | 5–8 (`reps`) | 1–3 | 180 s | 2 | Safeties set. Never to failure: stop with 1–3 reps left. |
| 2 | Romanian Deadlift | `romanian-deadlift` | 3 | 6–10 (`reps`) | 1–3 | 180 s | 2 | Flat back, bar on your legs. Stop at your hamstring stretch. |
| 3 | Leg Press | `leg-press` | 2 | 10–15 (`reps`) | 1–3 | 150 s | 2 | Hips stay on the pad. Don't lock the knees out. |
| 4 | Seated Leg Curl | `seated-leg-curl` | 3 | 10–15 (`reps`) | 0–2 | 90 s | 2 | Lean forward slightly and control the return. |
| 5 | Standing Calf Raises | `standing-calf-raise` | 4 | 8–15 (`reps`) | 0–2 | 75 s | 3 | Full stretch at the bottom with a 1 s pause, then all the way up. |
| 6 | Hanging Leg Raises | `hanging-leg-raise` | 3 | 10–15 (`reps`) | 0–2 | 75 s | 2 | Curl the pelvis up, no swinging. Bend the knees if the lower back arches. |

#### Thursday — Shoulders, Biceps & Triceps B (`shoulders_arms_b`)

- **name** `Shoulders, Biceps & Triceps B` · **short** `Shoulders & Arms B` · **abbr** `Arms` · **family** `shoulders_arms` · **weekday** 4 · **sort** 3
- **subtitle** "Delts, arms and forearms"
- **focus** "Shoulder width, arm thickness, forearms and complete delt development."
- **notes** (Quinton's training notes, verbatim): "Emphasize side and rear delts." · "Use controlled reps on biceps and triceps movements." · "Shoulder pressing volume can be reduced if it interferes with Friday's chest session." · "Track arm and shoulder progression separately."
- **sets** 19 standard · 15 intro · 11 deload (optional exercise not counted) · **estimateDurationMin** 45 min (50 with the optional reverse curls)

Warm-up (`warmup`, in order):

1. **General warm-up** — 5 min easy bike, rower or incline walk until you're lightly warm.
2. **Shoulders** — Band pull-aparts ×15, band external rotations ×12 each arm, arm circles ×10 each way.
3. **Press ramp-up** — Machine press: ×10 at about 50%, then ×5 at about 75% of today's working weight.
4. **Wrists and elbows** — Wrist circles ×10 each way, then one light cable curl set ×15 before the arm work.

| # | Exercise (`name`) | `slug` | Sets | Reps (`repLow`–`repHigh`, `unit`) | RIR | Rest | Intro sets | `note` |
|---|---|---|---|---|---|---|---|---|
| 1 | Machine Shoulder Press | `machine-shoulder-press` | 2 | 8–12 (`reps`) | 1–3 | 120 s | 2 | Smooth reps, 1–3 left in the tank. This is the set to trim if Friday's pressing suffers. |
| 2 | Dumbbell Lateral Raises | `db-lateral-raise` | 4 | 12–20 (`reps`) | 0–2 | 60 s | 3 | Slight lean forward, lead with the elbows, no swing. |
| 3 | Cable Rear Delt Fly | `cable-rear-delt-fly` **(new)** | 3 | 12–20 (`reps`) | 0–2 | 60 s | 2 | Cables crossed at shoulder height, arms long, sweep out and back. |
| 4 | Cable Biceps Curls | `cable-curl` | 3 | 10–15 (`reps`) | 0–2 | 75 s | 2 | Elbows still at your sides; no leaning back. |
| 5 | Single-Arm Overhead Cable Triceps Extension | `single-arm-overhead-cable-triceps-extension` **(new)** | 3 | 10–15 each (`each`) | 0–2 | 60 s | 2 | Reps per arm. Elbow points up and stays still; full stretch. |
| 6 | Cross-Body Hammer Curls | `cross-body-hammer-curl` **(new)** | 2 | 10–15 (`reps`) | 0–2 | 75 s | 2 | Curl across toward the opposite shoulder, thumbs up. Count reps per arm. |
| 7 | Straight-Bar Triceps Pushdowns | `straight-bar-pushdown` | 2 | 10–15 (`reps`) | 0–2 | 60 s | 2 | Elbows pinned, full lockout, slow return. |
| 8 | Reverse Curls *(`optional: true`)* | `reverse-curl` | 2 | 10–15 (`reps`) | 0–2 | 60 s | — (left out) | Optional, for forearms when recovery is good. Or swap them in for the cross-body hammer curls instead of adding sets. |

#### Friday — Chest & Back B (`chest_back_b`)

- **name** `Chest & Back B` · **short** `Chest & Back B` · **abbr** `Chest` · **family** `chest_back` · **weekday** 5 · **sort** 4
- **subtitle** "Chest thickness and upper back"
- **focus** "Chest thickness, upper-back development and lat width."
- **notes** (Quinton's training notes, verbatim): "Prioritize full, controlled repetitions." · "Choose comfortable grip widths." · "Use chest-supported rowing to minimize unnecessary fatigue." · "Progress weight or repetitions when form remains excellent."
- **sets** 15 standard · 12 intro · 9 deload · **estimateDurationMin** 45 min

Warm-up (`warmup`, in order):

1. **General warm-up** — 5 min easy rower or bike until you're lightly warm.
2. **Shoulders and upper back** — Band pull-aparts ×15, band dislocates ×10, push-ups ×10.
3. **Incline Smith ramp-up** — Empty bar ×10, then about 50% ×6, 70% ×4 and 85% ×2 of today's working weight.
4. **Row feeder set** — One light set ×10 before the first wide row.

| # | Exercise (`name`) | `slug` | Sets | Reps (`repLow`–`repHigh`, `unit`) | RIR | Rest | Intro sets | `note` |
|---|---|---|---|---|---|---|---|---|
| 1 | Incline Smith Machine Press | `incline-smith-press` | 3 | 8–12 (`reps`) | 1–3 | 150 s | 2 | Bench at 15–30°. Bar touches high on the chest. |
| 2 | Chest-Supported Wide Row | `chest-supported-wide-row` | 3 | 8–12 (`reps`) | 1–3 | 150 s | 2 | Elbows wide for upper back and rear delts. No shrugging. |
| 3 | Wide-Grip Lat Pulldown | `lat-pulldown` | 3 | 8–12 (`reps`) | 1–3 | 120 s | 2 | Hands a comfortable width outside the shoulders. Bar to the upper chest. |
| 4 | Flat Dumbbell Bench Press | `db-bench-press` | 2 | 8–12 (`reps`) | 1–3 | 120 s | 2 | Forearms vertical at the bottom; a deep but pain-free stretch. |
| 5 | Pec Deck | `pec-deck` | 2 | 12–15 (`reps`) | 0–2 | 75 s | 2 | Squeeze for a second; return slowly to the stretch. |
| 6 | Single-Arm Cable Row | `single-arm-cable-row` | 2 | 10–15 each (`each`) | 1–3 | 120 s | 2 | Reps per arm. Reach into the stretch, pull the elbow to your hip. |

#### Saturday — Legs & Abs B (`legs_abs_b`)

- **name** `Legs & Abs B` · **short** `Legs & Abs B` · **abbr** `Legs` · **family** `legs_abs` · **weekday** 6 · **sort** 5
- **subtitle** "Quads, glutes, hamstrings and calves"
- **focus** "Complete lower-body muscle development, emphasizing quad fullness, glutes, hamstrings and calves."
- **notes** (Quinton's training notes, verbatim): "Maintain controlled technique." · "Prioritize full comfortable range of motion." · "Use appropriate recovery between hard sets." · "Do not train through joint pain."
- **sets** 19 standard · 15 intro · 11 deload · **estimateDurationMin** 50 min

Warm-up (`warmup`, in order):

1. **General warm-up** — 5–8 min easy bike or incline walk until you're lightly sweating.
2. **Mobility** — Leg swings ×10 each direction, couch stretch 30 s each side, ankle rocks ×10 each.
3. **Activation** — Glute bridges ×12, lateral band walks ×10 each way, bodyweight squats ×10.
4. **Hack squat ramp-up** — Empty sled ×10, then 40% ×6, 60% ×4 and 80% ×2 of today's working weight.
5. **Split squat prep** — One bodyweight set ×6 each leg before the loaded sets.

| # | Exercise (`name`) | `slug` | Sets | Reps (`repLow`–`repHigh`, `unit`) | RIR | Rest | Intro sets | `note` |
|---|---|---|---|---|---|---|---|---|
| 1 | Hack Squat | `hack-squat` | 3 | 8–12 (`reps`) | 1–3 | 180 s | 2 | Deep, controlled reps. Stop with 1–3 left. |
| 2 | Bulgarian Split Squat | `bulgarian-split-squat` | 2 | 8–12 each (`each`) | 1–3 | 120 s | 2 | 8–12 reps per leg. Start with your weaker leg. |
| 3 | Lying Leg Curl | `lying-leg-curl` | 3 | 10–15 (`reps`) | 0–2 | 90 s | 2 | Hips pressed into the pad; slow lowering. |
| 4 | Leg Extension | `leg-extension` | 2 | 12–15 (`reps`) | 0–2 | 75 s | 2 | Pause for a second at the top of every rep. |
| 5 | Hip Thrust | `hip-thrust` | 2 | 8–12 (`reps`) | 1–3 | 120 s | 2 | Chin tucked, ribs down. Pause and squeeze at the top. |
| 6 | Seated Calf Raises | `seated-calf-raise` | 4 | 10–20 (`reps`) | 0–2 | 60 s | 3 | Pause in the stretch, then all the way up. |
| 7 | Cable Crunches | `cable-crunch` | 3 | 10–15 (`reps`) | 0–2 | 60 s | 2 | Ribs to pelvis; your hips stay still. |

Week totals: **105** working sets standard (19 + 15 + 18 + 19 + 15 + 19), **82** intro, **62**
deload; +2 when the optional reverse curls are done. `estimateDurationMin()` (unchanged formula)
gives 45–50 min per day.

### 1.4 Thursday's optional reverse curls (Q§5)

"Add two sets of reverse curls for forearms when recovery permits, or substitute them for another
curling exercise rather than simply accumulating excessive volume." Both halves are implemented:

1. **As an optional add-on** (row 8 above, `optional: true`). "Add two sets ... when recovery
   permits" is an add-on he chooses, so a workout never **starts** with it:
   `buildSessionSets()` (§7.3) materialises optional exercises only when
   `StartOptions.includeOptional` is true, and every app start passes `false` (the flag stays for
   tests and dev scripts). The planned counts (hero, Up next, top bar, summary) therefore never
   include it until he adds it. The workout **offers** it:
   - `suggestOptional(mode, readinessLevel): boolean` (programs.ts, pure): true only when the mode
     is `standard` and today's readiness level is `go` or `unknown` (no check-in). In intro or
     deload mode, or when readiness says `trim`, `legs`, `ease`, `recover` or `rest`, it is false.
   - When it is true, after the last planned working set is logged the workout shows one offer
     ("Reverse Curls · 2 sets of 10–15 · Optional, for forearms", DESIGN-V3 §4.2.4). "Add them"
     appends the exercise through the existing add-exercise op with the template row's sets,
     range, RIR and rest: `templateExerciseSets(t, mode, firstSetIndex)` (new pure helper in
     `src/lib/workout/session.ts`, the same row builder `buildSessionSets()` uses). The Lifts sheet
     also lists optional lifts under "Optional" with "Add" at any time, whatever the readiness.
   - Once added, it is logged, skipped or removed like any other lift.
2. **As a documented substitute**: `reverse-curl` is in the `substitutes` of
   `cross-body-hammer-curl` (new), `cable-curl`, `hammer-curl` and `cable-hammer-curl`, so the swap
   sheet on any Thursday curl offers it. The optional row's note tells him to swap rather than add.

### 1.5 Sunday — rest and recovery (Q§8)

Sunday is `rest` in `ARNOLD_SCHEDULE`. No resistance training is planned, nothing is "missed" on a
rest day (existing `missedWorkouts` logic), and nothing nags. The rest day shows optional
suggestions from `SUNDAY_RECOVERY` (moved to `programs.ts`, shared by both programs, volleyball
and jump wording removed):

- **title** "Rest and recovery"
- "Easy walk (optional)" — "20–40 min at a conversational pace, outside if you can."
- "Mobility flow (optional)" — "10–15 min for hips, ankles, upper back and shoulders. Gentle, never forced."
- "Sleep" — "Aim for 8–9 hours in bed. Growth and recovery happen here."
- "Food and water" — "Hit your calorie and protein targets and drink plenty. Rest days count for the gain."
- "Look back at the week" — "Check your lifts, bodyweight trend and how you felt, then plan next week's loads."
- "Sauna or stretching (optional)" — "15–20 min if it helps you unwind. Skip it if it leaves you drained."

### 1.6 Program rules (`ARNOLD_RULES`, shown in Program and sent to the coach)

1. "Warm up every session: 5 min general, then the day's ramp-up sets before the first heavy lift."
2. "Heavy compound lifts: 1–3 reps in reserve and 2–3 min rest. Never grind them to failure."
3. "Isolation work: 0–2 reps in reserve and 60–120 s rest."
4. "Double progression: once every working set reaches the top of the rep range at the target effort, add the smallest load step next time. Otherwise keep the load and add reps. Loads never go up on their own."
5. "Strict form first: controlled reps through a full, comfortable range, especially on lateral raises."
6. "Monday and Thursday arm work should leave enough for Tuesday and Friday. If pressing or pulling drops the next day, trim a set or change the order."
7. "Six training days are not mandatory. When recovery is poor, take the rest day."
8. "Pain is a stop sign. Never train through joint pain: swap the exercise or skip it."

`PPL_RULES` = today's `TRAINING_RULES` without the two jump/volleyball lines ("Jumps come first …",
"Volleyball counts as training …").

### 1.7 Exercise mapping (same movement → same slug, so history, records and progression carry over)

"History" = he has logged this slug under PPL (from the built-in PPL templates), so "last time",
records, sparklines and the first suggestion continue from it.

| Quinton's exercise | Slug | Existing? | PPL history carries over |
|---|---|---|---|
| Seated Dumbbell Shoulder Press | `seated-db-shoulder-press` | yes | yes (Push A/B) |
| Cable Lateral Raises | `cable-lateral-raise` | yes | yes |
| Reverse Pec Deck | `reverse-pec-deck` | yes | yes |
| EZ-Bar Preacher Curls | `preacher-curl` (EZ bar) | yes | yes (Pull B) |
| Overhead Cable Triceps Extensions | `overhead-cable-triceps-extension` | yes | yes |
| Incline Dumbbell Curls | `incline-db-curl` | yes | no (not in PPL) |
| Rope Triceps Pushdowns | `rope-triceps-pushdown` | yes | yes (Push B) |
| Incline Dumbbell Press | `incline-db-press` | yes | yes (Push A) |
| Neutral-Grip Lat Pulldown | `neutral-grip-lat-pulldown` | yes | yes (Pull B) |
| Chest-Supported Row | `chest-supported-row` | yes | yes (Pull A) |
| Machine Chest Press | `machine-chest-press` | yes | yes (Push B) |
| Low-to-High Cable Fly | `cable-chest-fly` | yes | yes: PPL Push B's "Cable Chest Fly" was already done low-to-high (its note: "Low pulleys, sweep up and in for upper chest"), so it is the same movement. Template `name` differs; the library name stays "Cable Chest Fly". |
| Single-Arm Cable Lat Pulldown | `single-arm-lat-pulldown` | yes | yes (Pull B) |
| Barbell Back Squat | `back-squat` | yes | yes |
| Romanian Deadlift | `romanian-deadlift` | yes | yes |
| Leg Press | `leg-press` | yes | yes (Legs B) |
| Seated Leg Curl | `seated-leg-curl` | yes | yes |
| Standing Calf Raises | `standing-calf-raise` | yes | yes |
| Hanging Leg Raises | `hanging-leg-raise` | yes | no: PPL had hanging *knee* raises (`hanging-knee-raise`), a different movement |
| Machine Shoulder Press | `machine-shoulder-press` | yes | no |
| Dumbbell Lateral Raises | `db-lateral-raise` | yes | no |
| Cable Rear Delt Fly | `cable-rear-delt-fly` | **new** | no |
| Cable Biceps Curls | `cable-curl` | yes | no |
| Single-Arm Overhead Cable Triceps Extension | `single-arm-overhead-cable-triceps-extension` | **new** | no (per-arm load is not comparable with the two-handed extension) |
| Cross-Body Hammer Curls | `cross-body-hammer-curl` | **new** | no (different path from `hammer-curl`; its record starts fresh) |
| Straight-Bar Triceps Pushdowns | `straight-bar-pushdown` | yes | no |
| Reverse Curls (optional) | `reverse-curl` | yes | no (PPL's "Wrist Curls or Reverse Curls" logged under `wrist-curl`) |
| Incline Smith Machine Press | `incline-smith-press` | yes | yes (Push B) |
| Chest-Supported Wide Row | `chest-supported-wide-row` | yes | yes (Pull B) |
| Wide-Grip Lat Pulldown | `lat-pulldown` (grip "slightly wider than shoulder width" in the library = the standard wide pulldown) | yes | only sets he logged under `lat-pulldown`; PPL Pull A's "Weighted Pull-Ups or Lat Pulldown" logged under `weighted-pull-up` either way, so that history is not attributed to `lat-pulldown` |
| Flat Dumbbell Bench Press | `db-bench-press` | yes | no |
| Pec Deck | `pec-deck` | yes | no |
| Single-Arm Cable Row | `single-arm-cable-row` | yes | yes (Pull A) |
| Hack Squat | `hack-squat` | yes | yes |
| Bulgarian Split Squat | `bulgarian-split-squat` | yes | yes (Legs A) |
| Lying Leg Curl | `lying-leg-curl` | yes | no |
| Leg Extension | `leg-extension` | yes | yes |
| Hip Thrust | `hip-thrust` | yes | yes |
| Seated Calf Raises | `seated-calf-raise` | yes | yes |
| Cable Crunches | `cable-crunch` | yes | yes |

26 of the 40 Arnold rows continue existing PPL history. Each Arnold slug appears on exactly one day
of the week, so every exercise has one rep range.

Exercise display name rule: a history row shows its own stored `exercise_name` (e.g. "Cable Chest
Fly" on old sessions). An exercise's page title and the All lifts list use
`exerciseDisplayName(slug, activeTemplates)`: the name the active program's template gives that
slug when it has one ("Low-to-High Cable Fly"), else the library name. Never `exercise_bests.exercise_name`
(that is `max()` of stored names, alphabetical, so it flips between programs).

### 1.8 New library entries (append to `LIBRARY` in `src/lib/training/library.ts`)

```ts
{
  slug: "cable-rear-delt-fly",
  name: "Cable Rear Delt Fly",
  primary: ["rear_delts"],
  secondary: ["upper_back", "traps"],
  category: "isolation",
  equipment: "cable",
  tracking: "weight_reps",
  rest: 60,
  increment: 5,
  instructions: [
    "Set both pulleys at shoulder height and take the handles off, or use single D-handles.",
    "Cross the cables: hold the left cable in your right hand and the right cable in your left hand, then step back to the middle.",
    "With long arms and a slight bend in the elbows, sweep your hands out and back until they line up with your body.",
    "Pause for a second, then return slowly until the cables cross again.",
  ],
  formTips: [
    "Lead with the back of your hands and keep your shoulders down. No shrugging.",
    "Stop when your arms reach your sides; going further turns it into an upper-back squeeze.",
    "Keep it light enough to pause on every rep.",
  ],
  substitutes: ["reverse-pec-deck", "rear-delt-db-fly", "face-pull"],
},
{
  slug: "single-arm-overhead-cable-triceps-extension",
  name: "Single-Arm Overhead Cable Triceps Extension",
  primary: ["triceps"],
  secondary: [],
  category: "isolation",
  equipment: "cable",
  tracking: "weight_reps",
  rest: 60,
  increment: 5,
  perSide: true,
  instructions: [
    "Set a D-handle on a low pulley and stand facing away from the stack.",
    "Hold the handle behind your head with one hand, upper arm pointing up beside your ear.",
    "Straighten your arm overhead, keeping the upper arm still.",
    "Lower slowly into a deep stretch behind your head, finish all reps, then switch arms.",
  ],
  formTips: [
    "The overhead stretch trains the long head of the triceps, so don't cut the range short.",
    "Keep your elbow pointing up; if it drifts out, the weight is too heavy.",
    "Brace your core so your lower back doesn't arch.",
  ],
  substitutes: ["overhead-cable-triceps-extension", "skull-crusher", "rope-triceps-pushdown"],
},
{
  slug: "cross-body-hammer-curl",
  name: "Cross-Body Hammer Curl",
  primary: ["brachialis", "forearms"],
  secondary: ["biceps"],
  category: "isolation",
  equipment: "dumbbell",
  tracking: "weight_reps",
  rest: 75,
  increment: 5,
  perHand: true,
  instructions: [
    "Stand tall with a dumbbell in each hand at your sides, palms facing your thighs.",
    "Curl one dumbbell up and across your body toward the opposite shoulder, thumb up.",
    "Squeeze at the top, then lower it slowly along the same path.",
    "Alternate arms. One rep is one curl with each arm.",
  ],
  formTips: [
    "Keep the upper arm close to your side; the elbow moves forward only a little.",
    "The neutral grip and cross-body path build the brachialis and forearm.",
    "Don't twist your torso to swing the weight up.",
  ],
  substitutes: ["hammer-curl", "cable-hammer-curl", "reverse-curl"],
},
```

Increments follow the library's convention for cable stacks and dumbbells (5 lb). The logged
weight is per stack for the cable fly (both hands pull one stack each, like `cable-chest-fly`),
per hand for the dumbbell curl (`perHand`, UI shows "lb each hand").

Substitute lists gain the new slugs (append, keep existing order):
`reverse-pec-deck`, `face-pull`, `rear-delt-db-fly` += `cable-rear-delt-fly`;
`overhead-cable-triceps-extension` += `single-arm-overhead-cable-triceps-extension`;
`hammer-curl`, `cable-hammer-curl` += `cross-body-hammer-curl`;
`cable-curl` += `reverse-curl`.

### 1.9 Library: jump exercises leave the program

- `LibraryExercise` gains `retired?: boolean`. Set `retired: true` on `box-jump`,
  `approach-jump`, `broad-jump`, `squat-jump`. Rename `approach-jump`'s `name` from
  "Volleyball Approach Jump" to "Approach Jump" (slug unchanged; past sessions keep their stored
  `exercise_name` but the library never says volleyball).
- Retired entries stay in `LIBRARY` so history still resolves them (name, `explosive` category:
  no e1RM, no progression). They are hidden from: the exercise picker (add / swap, mid-session and
  in the template editor), All lifts, substitutes lists, `newTemplateExercise`, coach lift trends.
  Helper: `pickableLibrary(): LibraryExercise[]` = `LIBRARY.filter((e) => !e.retired)`.
- Update the library header comment: drop "Jumps are never loaded and never taken to failure"
  and keep the dumbbell/perSide conventions.

### 1.10 Push/Pull/Legs stays as the optional alternative

- `src/lib/training/program.ts` is renamed (git mv) to `src/lib/training/program-ppl.ts` and
  exports `PPL_TEMPLATES`, `PPL_SCHEDULE`, `PPL_RULES`. Its built-in content changes only to drop
  jump/volleyball work: Legs A loses `box-jump` and `approach-jump`, its "Jump prep" warm-up step,
  the "After the jumps: " prefix of "Squat ramp-up", and its focus becomes "Lower-body strength
  and muscle." with subtitle "Lower Body Strength"; Legs B loses `broad-jump` and its "Jump prep"
  step. Every other PPL exercise, set and range is unchanged.
- Quinton's **stored** PPL rows are never rewritten (§3). When any template row is read
  (`fromRow`, coach, reminders), `visibleExercises()` drops exercises whose library entry is
  `retired`, and `visibleWarmup()` drops a step labelled exactly "Jump prep" and strips the exact
  prefix "After the jumps: " from a detail. So jumps never show or start even if he switches back
  to PPL, and his stored rows stay byte-for-byte as they were.
- PPL gets `short`/`abbr`/`family`: Push A/B → `Push A`/`Push`/`push`, Pull → `pull`, Legs →
  `legs`; `notes: []`.

---

## 2. Keys, types and the active program

### 2.1 Types (`src/lib/training/types.ts`)

```ts
export type ProgramId = "arnold" | "ppl";
export type ArnoldKey = "shoulders_arms_a" | "chest_back_a" | "legs_abs_a" | "shoulders_arms_b" | "chest_back_b" | "legs_abs_b";
export type PplKey = "push_a" | "pull_a" | "legs_a" | "push_b" | "pull_b" | "legs_b";
export type TemplateKey = ArnoldKey | PplKey;
export type DayFamily = "shoulders_arms" | "chest_back" | "legs_abs" | "push" | "pull" | "legs";

export interface LibraryExercise {
  /* … existing fields … */
  /** No longer offered anywhere (jumps); kept so history resolves. */
  retired?: boolean;
}

export interface DayTemplate {
  key: TemplateKey;
  program: ProgramId;
  name: string;
  /** For tight places (top bar, cards): "Shoulders & Arms A". */
  short: string;
  /** Under-date label in week strips, ≤ 5 characters: "Arms". */
  abbr: string;
  family: DayFamily;
  subtitle: string;
  focus: string;
  /** Quinton's training notes for the day (built-in guidance; not stored per user). */
  notes: string[];
  weekday: number;
  warmup: WarmupStep[];
  exercises: TemplateExercise[];
}
```

`TemplateExercise` is unchanged (`rir` stays `string`). `MuscleGroup` is unchanged.

### 2.2 Modules

| Module | Exports |
|---|---|
| `src/lib/training/program-arnold.ts` (new) | `ARNOLD_TEMPLATES: DayTemplate[]` (§1.3, in weekday order), `ARNOLD_SCHEDULE`, `ARNOLD_RULES` |
| `src/lib/training/program-ppl.ts` (renamed from `program.ts`) | `PPL_TEMPLATES`, `PPL_SCHEDULE`, `PPL_RULES` |
| `src/lib/training/programs.ts` (new; the only module screens import program data from) | see below |

`programs.ts`:

```ts
export const DEFAULT_PROGRAM: ProgramId = "arnold";
export interface ProgramDef {
  id: ProgramId;
  name: string;            // "Arnold split" | "Push/Pull/Legs"
  keys: TemplateKey[];     // in weekday order; slot i of one program ↔ slot i of the other
  templates: DayTemplate[];
  schedule: Record<string, TemplateKey | "rest">;
  rules: string[];
}
export const PROGRAMS: Record<ProgramId, ProgramDef>;
export const TEMPLATE_DEFS: Record<TemplateKey, DayTemplate>;   // both programs
export function templateDef(key: string | null | undefined): DayTemplate | undefined;
export function programOfKey(key: string | null | undefined): ProgramId | null;
export function counterpartKey(key: TemplateKey, to: ProgramId): TemplateKey; // same slot index
export function activeProgram(p: { prefs?: unknown; weekly_schedule?: unknown } | null | undefined): ProgramId;
export function programSince(prefs: unknown): ISODate | null;
export function scheduleFor(p: { prefs?: unknown; weekly_schedule?: unknown } | null | undefined): Record<string, string>;
export function resolvePlanKey(date: ISODate, schedule: Record<string, string>, override: { template_key: string; note?: string | null } | null | undefined, ctx: { program: ProgramId; since: ISODate | null }): string;
export function visibleExercises(xs: TemplateExercise[]): TemplateExercise[];
export function visibleWarmup(xs: WarmupStep[]): WarmupStep[];
export function templateLabels(t: { key: string; name: string }): { name: string; short: string; abbr: string; family: DayFamily | null };
export function effortDefaults(lib: LibraryExercise): { rir: string; rest: number };
export function rirRange(text: string | null | undefined): [number, number] | null;
export function exerciseDisplayName(slug: string, active: { exercises: TemplateExercise[] }[]): string;
export function estimateDurationMin(t: DayTemplate): number;   // moved from program.ts, unchanged formula; optional exercises not counted
export function suggestOptional(mode: Mode, level: ReadinessLevel | null): boolean; // §1.4
export function carriedSwaps(storedPpl: StoredTemplate[], arnold: StoredTemplate[]): { from: string; to: string; keys: ArnoldKey[] }[]; // §3.7
export function pickableLibrary(): LibraryExercise[];          // §1.9
export const SUNDAY_RECOVERY: { title: string; items: { label: string; detail: string }[] };
```

Slot mapping (`counterpartKey`): `push_a ↔ shoulders_arms_a`, `pull_a ↔ chest_back_a`,
`legs_a ↔ legs_abs_a`, `push_b ↔ shoulders_arms_b`, `pull_b ↔ chest_back_b`,
`legs_b ↔ legs_abs_b`. It is a bijection, so a switch and a switch back return every key.

`templateLabels(t)`: when the stored name equals the built-in name, use the built-in
`short`/`abbr`; when he renamed the template, `short` = his name and `abbr` = its first word
truncated to 5 characters. `family` always comes from the key.

The old exports `PROGRAM`, `PROGRAM_BY_KEY`, `DEFAULT_SCHEDULE`, `TRAINING_RULES` are **deleted**
(not aliased), so `tsc` lists every reader that must choose a program (§2.5).

### 2.3 Which program is active

- **Stored** in `profiles.prefs.program` (`"arnold" | "ppl"`). It is written **only** by the
  database function `set_training_program()` (§3.2), never by `useSavePrefs` (exclude
  `program`, `schedules` and `programSwitch` from the `PrefsPatch` type). Other prefs keys the
  function writes: `schedules: { ppl?: Week; arnold?: Week }` (each program's last weekly schedule,
  restored on switching back) and `programSwitch: { from, to, at, date, frozen, mapped }`.
- **Read** by `activeProgram(profile)`, mirrored exactly by SQL `public.program_of()`:
  1. `prefs.program` when it is `"arnold"` or `"ppl"`;
  2. else `"arnold"` when any `weekly_schedule` value is an Arnold key;
  3. else `"ppl"` when any value is a PPL key;
  4. else `DEFAULT_PROGRAM` (`"arnold"`).
  So an account the migration has not touched yet (a preview against production) keeps reading as
  PPL, and a new account (the column default is the Arnold week) reads as Arnold.
- `programSince(prefs)` = `prefs.programSwitch.date` when `prefs.programSwitch.to` equals the
  active program, else `null`.
- `parseAppPrefs()` (src/lib/prefs.ts) types these keys as read-only fields of `AppPrefs`
  (`program?`, `schedules?`, `programSwitch?`) and adds the client-written ones used below:
  `modeSetAt?: ISODate`, `lighterSnoozedUntil?: ISODate`, `swapsOffered?: boolean`, and
  `switchNoticeSeenAt?: string` (an ISO timestamp; DESIGN-V3 CR-1, the one-time "Your plan is now
  the Arnold split" notice, DESIGN-V3 §4.3.8). All four are in `PrefsPatch`.
- `useSavePrefs` reads the stored prefs from the server, merges the patch and writes (it never
  merges into the cached copy), and `mergePrefs()` keeps every key it does not know, so a client
  prefs write never drops `program`, `schedules` or `programSwitch`.

### 2.4 One plan resolver for every reader

`resolvePlanKey(date, schedule, override, { program, since })`:

1. `override` (the `day_plans` row for the date) wins: its `template_key`, **except** that a key
   of the *other* program on a date `>= since`, on a row whose `note` is not `'program-switch'`,
   is mapped with `counterpartKey(key, program)`. This is a safety net for a stale device that
   writes an old key after the switch; the switch itself already re-points future rows (§3.3).
   Past rows and the switch's own freeze rows resolve exactly as stored.
2. else `schedule[String(weekday(date))]`, where `schedule = scheduleFor(profile)` =
   `weekly_schedule` merged over the **active** program's default week.
3. else `"rest"`.

Used by: `planFor()` (src/lib/data/training.ts), `resolvePlan()` (src/lib/coach/aggregate.ts),
`plannedKey()`/`scheduleFrom()` (src/lib/reviews/plan.ts, which the reminder server also uses).
The coach context and reminder server must select `day_plans.note` and `profiles.prefs` to pass
`override` and `ctx`.

### 2.5 Every reader, and what changes

| Reader | File (owner) | Rule |
|---|---|---|
| Templates hook | `src/lib/data/training.ts` `useTemplates()` (program) | `templates` = the active program's six, in its order; `byKey` = **every** template of both programs (stored row over built-in), so any key resolves; `program`; `all: Record<ProgramId, StoredTemplate[]>`. Query key `["templates", userId, program]`. Ensures the active program's rows exist (§3.4). |
| Plan for a date | `planFor()` (program) | `resolvePlanKey` + `byKey[key]` (any program, so a frozen past PPL day still shows "Push A"). |
| Train week, strip, hero, day sheet | `src/components/training/hooks.ts` `useTrainingWeek()` (program) and Train screens | via `planFor`; strip label = `templateLabels(t).abbr`; no volleyball fields. |
| Program screen: list, schedule editor, reset | ProgramTab / DESIGN-V3 Program (screens) | list `templates` (active only); schedule options = active keys + `rest`; "Reset" = active program's default week; `scheduleIssues(schedule, PROGRAMS[program].keys)`; switch control → `useSetProgram()`. Inactive program shown only as "Push/Pull/Legs · saved" with the switch. |
| Template editor `/training/program/[key]` | TemplateEditor (screens) | accept any `TEMPLATE_DEFS` key (both programs; he may tweak PPL before switching back); unknown → `notFound()`. Day `notes` shown read-only from `templateDef(key)`. |
| Start today's workout | `useStartWorkout().startToday` (program) | via `planFor`. |
| Deep link `/workout/start?t=key` | StartWorkout (workout screens) | start `key` only if it is an **active** program key; any other key (an old notification `?t=push_a`) falls back to `startToday()` without an error. |
| Live workout, Inscription / summary | components/workout (workout screens) | template lookup by `session.template_key` through `byKey` (any program), so a PPL session in progress keeps its notes and warm-up. Titles show `session.name` (stored). The "Next {template}" block: when the session's template belongs to the active program, title "Next {short}"; otherwise title "Next time" and only lines for slugs that appear in an active template. |
| History, exercise detail, records | Train screens | stored `session.name` / `exercise_name` per row (Push A stays Push A); page titles via `exerciseDisplayName`. |
| Today / Now | `useNowData`, `useDayInput` (screens) | via `planFor`; this week's count via `sealedDays` (no volleyball, §6). |
| Meals week labels | WeekPlanner / Food (screens) | via `planFor`; label `templateLabels(t).abbr` ("Arms day", "Mon 19 · Arms"), as DESIGN-V3 §4.4.1 and §6.3 place it. |
| Coach snapshot | `src/lib/coach/*` (program) | resolver above; program facts for the active program only plus one fact naming the saved alternative; rules = `PROGRAMS[program].rules` (§6.3). |
| Monthly reviews | `src/lib/reviews/*` (program) | `scheduleFrom()` merges over the active program's default; adherence only asks "training day or rest", and both programs train Monday–Saturday, so past months count the same. |
| Reminders | `src/lib/reminders/server.ts` (program) | resolver above (select `prefs`, `note`); `templateFromRow()` uses `templateDef(key)` (both programs) and `visibleExercises`. |
| Onboarding | `src/lib/onboarding/plan.ts` (program) | `SCHEDULE_OPTIONS` = Arnold keys with their `short` labels + Rest; `normalizeSchedule()` defaults to `ARNOLD_SCHEDULE` and accepts only Arnold keys; `scheduleSummary()` → "6 days · Arnold split". Onboarding seeds Arnold rows (`programSeedRows()` defaults to `DEFAULT_PROGRAM`), so `OnboardingFlow.tsx` needs no program change. |
| Weekly split label | `src/lib/training/week.ts` (program) | `splitLabel(keys)` is replaced by `programLabel(program)`, which returns `PROGRAMS[program].name` ("Arnold split" / "Push/Pull/Legs"; DESIGN-V3 CR-2), so every place shows one spelling. |
| Key-prefix logic | `today/plan.ts` `planFacts().legs`, `today/now.ts` `readinessChip()`, `recovery/guidance.ts` `planLite().isLegs` (program) | no more `key.startsWith(...)`. Leg day = `isLegDay(template)` (content, volume.ts); the chip uses `family`: `shoulders_arms` → "Ready for arms", `chest_back` → "Ready for chest and back", `legs_abs`/`legs` → "Ready for legs", `push`/`pull` → "Ready to push"/"Ready to pull", null → "Ready to train" (designer may shorten). |

---

## 3. The switch-over of saved data

### 3.1 Decision: production migrations plus one database function; template rows from the client

- **The switch is SQL migrations**, applied by `scripts/migrate.mjs` on production deploys only:
  `supabase/migrations/20261021000000_arnold_program.sql` (`-- migrate:idempotent`: the column
  default and the two functions, §3.2) and `supabase/migrations/20261021000100_arnold_switch.sql`
  (`-- migrate:idempotent`: only the one-time switch of existing accounts, §3.2 step 4). The two
  files ship in two consecutive deploys (§3.1a). Reasons:
  1. *Publication is the switch.* Preview deployments share the production database and skip
     migrations, so a preview can never switch Quinton's real program (Q§15.12). A client-side
     "switch on load" would switch him the first time he opened a preview link.
  2. *Atomic.* One transaction per account: schedule, prefs and plan rows change together or not
     at all. A client doing four writes could stop halfway (offline, app closed) and leave the
     schedule on Arnold with prefs still saying PPL.
  3. *Multi-device and offline safe.* No device runs it, so two phones cannot race and an offline
     phone cannot half-apply it.
  4. *Exactly once.* `scripts/migrate.mjs` records each file in `public.app_migrations`, so the
     switch runs once; the function itself is also a no-op on an account already on Arnold.
- **One function does the work**, `public.set_training_program(p_program, p_today, p_user)`
  (security definer, row lock). The migration calls it once per account; the app calls it when he
  switches programs himself (§3.6); dev scripts call it to seed demo/QA users (§3.9). One code path
  for all three.
- **Template rows come from the client**, not the migration: `useTemplates()` inserts any missing
  row of the *active* program from the built-in definitions (§3.4), with
  `onConflict: "user_id,key", ignoreDuplicates: true`. The built-in program lives in one place
  (TypeScript), existing rows are never overwritten, and until the rows exist every reader falls
  back to the built-in definition, so nothing shows empty. In a preview against production the
  active program reads as PPL, whose rows exist, so the client writes nothing.

### 3.1a Publication in two deploys (why the switch is its own file)

The app that is live today (`PROGRAM_BY_KEY` with PPL keys only) cannot read an Arnold key:
`planFor()` returns `template: null` for `shoulders_arms_a`, so every training day would read as a
rest day and "Start" would have nothing to start. Old code meets switched data in three ways if
the switch shipped with the new app: (1) `scripts/migrate.mjs` runs **before** `next build`, and the
old deployment keeps serving until the new build is promoted, so for a few minutes the old app
reads switched data; (2) if `next build` then fails, production stays on the old app with switched
data until someone fixes the build; (3) an iOS home-screen app resumed from the background keeps
running the old JavaScript and refetches the profile on focus. So:

1. **Deploy A** (after Quinton approves): every code change plus
   `20261021000000_arnold_program.sql` (column default, `program_of`, `set_training_program`,
   grants). Nothing is switched. Quinton's account still reads as PPL (no `prefs.program`, PPL keys
   in the schedule), and the new app shows it correctly: the new UI, no volleyball, his PPL week.
2. Open the app once on his phone (a cold launch loads the new build: navigations are
   network-first in `public/sw.js`), so no old JavaScript is left running.
3. **Deploy B**, straight after: adds only `20261021000100_arnold_switch.sql` (§3.2 step 4). Every
   client that can meet switched data is now the new one, which reads both programs. If B's build
   failed after its migration, deploy A (program-aware) is still live, so nothing breaks.

Both deploys are part of the one approved publication (Q§15.12). Locally, `supabase start` /
`db reset` apply both files; `scripts/dev/setup-users.mjs` and `qa-arnold.mjs` (§3.9, §8) handle
the users.

### 3.2 The migrations (complete text; validated against the local database inside a rolled-back transaction)

```sql
-- migrate:idempotent
-- Arnold Split 2.0 (docs/PROGRAM-ARNOLD.md §3). Additive and idempotent; safe to run again.
--   1. New accounts default to the Arnold weekly schedule.
--   2. public.program_of(): which program a profile follows (prefs.program, else inferred
--      from the weekly schedule, else Arnold). Mirrors activeProgram() in
--      src/lib/training/programs.ts.
--   3. public.set_training_program(): switches one account's active program in one
--      transaction. It locks the profile row, so two devices switching at once serialise and
--      the second call is a no-op. It writes only profiles.weekly_schedule, profiles.prefs
--      and day_plans; it never touches workout_sessions, exercise_sets, program_templates,
--      volleyball_sessions, athletic_tests or recovery_logs.
--   Step 4, the one-time switch of existing accounts, is its own file
--   (20261021000100_arnold_switch.sql) and ships one deploy later (§3.1a).

alter table public.profiles alter column weekly_schedule
  set default '{"1":"shoulders_arms_a","2":"chest_back_a","3":"legs_abs_a","4":"shoulders_arms_b","5":"chest_back_b","6":"legs_abs_b","0":"rest"}'::jsonb;

create or replace function public.program_of(p_prefs jsonb, p_schedule jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_prefs->>'program' in ('arnold', 'ppl') then p_prefs->>'program'
    when jsonb_typeof(p_schedule) = 'object' and exists (
      select 1 from jsonb_each_text(p_schedule) e
      where e.value in ('shoulders_arms_a','chest_back_a','legs_abs_a','shoulders_arms_b','chest_back_b','legs_abs_b')) then 'arnold'
    when jsonb_typeof(p_schedule) = 'object' and exists (
      select 1 from jsonb_each_text(p_schedule) e
      where e.value in ('push_a','pull_a','legs_a','push_b','pull_b','legs_b')) then 'ppl'
    else 'arnold'
  end
$$;

create or replace function public.set_training_program(p_program text, p_today date default null, p_user uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := coalesce(p_user, auth.uid());
  ppl_keys text[] := array['push_a','pull_a','legs_a','push_b','pull_b','legs_b'];
  arn_keys text[] := array['shoulders_arms_a','chest_back_a','legs_abs_a','shoulders_arms_b','chest_back_b','legs_abs_b'];
  ppl_week jsonb := '{"1":"push_a","2":"pull_a","3":"legs_a","4":"push_b","5":"pull_b","6":"legs_b","0":"rest"}';
  arn_week jsonb := '{"1":"shoulders_arms_a","2":"chest_back_a","3":"legs_abs_a","4":"shoulders_arms_b","5":"chest_back_b","6":"legs_abs_b","0":"rest"}';
  prof record;
  cur text;
  tz text;
  utc_today date := (now() at time zone 'UTC')::date;
  today date;
  from_keys text[];
  to_keys text[];
  old_default jsonb;
  new_default jsonb;
  old_week jsonb;
  new_week jsonb;
  saved jsonb;
  trained_today boolean;
  d date;
  k_old text;
  k_new text;
  row_key text;
  row_note text;
  n int;
  frozen int := 0;
  mapped int := 0;
  cleared int := 0;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if auth.uid() is not null and uid <> auth.uid() then raise exception 'not allowed'; end if;
  if p_program is null or p_program not in ('arnold', 'ppl') then raise exception 'unknown program %', p_program; end if;

  -- one switch at a time per account: a second device waits here, then sees the new program
  select p.id, p.prefs, p.weekly_schedule, p.timezone into prof from public.profiles p where p.id = uid for update;
  if not found then raise exception 'profile not found'; end if;

  cur := public.program_of(prof.prefs, prof.weekly_schedule);
  if cur = p_program then
    if coalesce(prof.prefs->>'program', '') <> p_program then
      update public.profiles set prefs = coalesce(prefs, '{}'::jsonb) || jsonb_build_object('program', p_program) where id = uid;
    end if;
    return jsonb_build_object('changed', false, 'program', p_program);
  end if;

  tz := case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = prof.timezone) then prof.timezone else 'UTC' end;
  today := coalesce(p_today, (now() at time zone tz)::date);
  if today < utc_today - 1 or today > utc_today + 1 then raise exception 'date out of range'; end if;

  if p_program = 'arnold' then
    from_keys := ppl_keys; to_keys := arn_keys; old_default := ppl_week; new_default := arn_week;
  else
    from_keys := arn_keys; to_keys := ppl_keys; old_default := arn_week; new_default := ppl_week;
  end if;
  old_week := old_default || case when jsonb_typeof(prof.weekly_schedule) = 'object' then prof.weekly_schedule else '{}'::jsonb end;

  -- the target program's own saved week (from an earlier switch) when it is valid, else its default
  saved := prof.prefs->'schedules'->p_program;
  if jsonb_typeof(saved) = 'object' and not exists (
       select 1 from jsonb_each(saved) e
       where e.key !~ '^[0-6]$' or jsonb_typeof(e.value) <> 'string' or not (e.value #>> '{}' = 'rest' or e.value #>> '{}' = any(to_keys)))
  then new_week := new_default || saved;
  else new_week := new_default;
  end if;

  trained_today := exists (select 1 from public.workout_sessions s where s.user_id = uid and s.local_date = today and s.status in ('active', 'done'));

  -- 1. the recent past keeps the plan it had (as scheduleFreeze does, 14 days back), and so
  --    does today when a workout was started or finished today (it finishes as it started).
  --    A date's plan before the switch is its override, else the old week. Rows this function
  --    wrote earlier ('program-switch') are dropped when the new week already says the same,
  --    so switching straight back restores the plan exactly. Other overrides are never touched.
  for d in select g::date from generate_series(today - 14, case when trained_today then today else today - 1 end, interval '1 day') g loop
    k_new := coalesce(new_week->>extract(dow from d)::int::text, 'rest');
    select p.template_key, p.note into row_key, row_note from public.day_plans p where p.user_id = uid and p.plan_date = d;
    if not found then
      k_old := coalesce(old_week->>extract(dow from d)::int::text, 'rest');
      if k_old <> k_new then
        insert into public.day_plans (user_id, plan_date, template_key, reason, moved_from, note)
        values (uid, d, k_old, 'custom', null, 'program-switch')
        on conflict (user_id, plan_date) do nothing;
        get diagnostics n = row_count;
        frozen := frozen + n;
      end if;
    elsif row_note = 'program-switch' and row_key = k_new then
      delete from public.day_plans p where p.user_id = uid and p.plan_date = d and p.note = 'program-switch';
      get diagnostics n = row_count;
      cleared := cleared + n;
    end if;
  end loop;

  -- 2. upcoming moves, swaps and replacements keep their days, re-pointed to the same slot of
  --    the new program (Push A <-> Shoulders, Biceps & Triceps A ...); rest days stay rest
  update public.day_plans p
     set template_key = to_keys[array_position(from_keys, p.template_key)]
   where p.user_id = uid
     and p.template_key = any(from_keys)
     and coalesce(p.note, '') <> 'program-switch'
     and (p.plan_date > today or (p.plan_date = today and not trained_today));
  get diagnostics mapped = row_count;

  -- 3. the new week, and the old one kept for a switch back
  update public.profiles
     set weekly_schedule = new_week,
         prefs = coalesce(prefs, '{}'::jsonb) || jsonb_build_object(
           'program', p_program,
           'schedules', coalesce(prefs->'schedules', '{}'::jsonb) || jsonb_build_object(cur, old_week),
           'programSwitch', jsonb_build_object('from', cur, 'to', p_program, 'at', now(), 'date', today, 'frozen', frozen, 'mapped', mapped))
   where id = uid;

  return jsonb_build_object('changed', true, 'from', cur, 'to', p_program, 'at', now(), 'date', today, 'frozen', frozen, 'mapped', mapped, 'cleared', cleared);
end $$;

revoke all on function public.set_training_program(text, date, uuid) from public, anon;
grant execute on function public.set_training_program(text, date, uuid) to authenticated, service_role;
grant execute on function public.program_of(jsonb, jsonb) to authenticated, service_role;
```

`supabase/migrations/20261021000100_arnold_switch.sql` (deploy B only, §3.1a):

```sql
-- migrate:idempotent
-- Arnold Split 2.0, step 4 (docs/PROGRAM-ARNOLD.md §3.1a): every account that never chose a
-- program follows Arnold from today. Needs 20261021000000_arnold_program.sql. Safe to run again:
-- an account already on Arnold only gets prefs.program written.
do $$
begin
  perform public.set_training_program('arnold', null, p.id)
     from public.profiles p
    where not (coalesce(p.prefs, '{}'::jsonb) ? 'program');
end $$;
```

Notes for the implementer:

- `day_plans.user_id` defaults to `auth.uid()`, which is null in the migration, so the insert
  passes `user_id` explicitly (done above).
- Security: security definer bypasses RLS, so the guard is the function's own: a signed-in caller
  can only switch themselves (`'not allowed'` otherwise); `anon` has no execute; the migration and
  the service role (no `sub` claim) may pass `p_user`.
- Checked locally (inside `begin … rollback` on the 231 local profiles, demo user with a future
  PPL move and an active session today): every profile switched; demo's past 14 days frozen
  (Sundays skipped); today frozen because a session existed; the future `push_b` move became
  `shoulders_arms_b` with `moved_from` kept; the `rest` row untouched; `workout_sessions`,
  `exercise_sets` and `program_templates` hashes identical; a second run returned
  `{"changed": false}`; another signed-in user got `not allowed`; switching to PPL deleted exactly
  the 13 rows it had written and restored the original PPL week; switching back reproduced the same
  rows.
- Regenerate `src/lib/supabase/database.types.ts` afterwards (`program_of` and
  `set_training_program` appear under `Functions`).
- Known benign race: `useSavePrefs` reads the stored prefs, merges and writes the whole object.
  A write whose read lands in the milliseconds *before* the switch commits and whose write lands
  *after* it would drop `program`, `schedules` and `programSwitch`. `activeProgram()` still reads
  Arnold from the weekly schedule, so nothing visible changes; only the saved PPL week is lost
  (it equals the PPL default unless he had reordered it). No mitigation beyond this note.

### 3.3 What the switch does, and what it never does

| Data | What happens | Why |
|---|---|---|
| `profiles.weekly_schedule` | becomes the Arnold week (or his own saved Arnold week from an earlier switch). If he had reordered his PPL days, that order is not mapped onto Arnold: Q§1 fixes the Arnold order. His PPL order is kept in `prefs.schedules.ppl` and comes back if he switches back. | Q§13 "active weekly schedule", Q§1 |
| `profiles.prefs` | gains `program`, `schedules.<old program>` = the old week, `programSwitch`; every other key unchanged (server-side `jsonb ||`) | switching back restores his PPL week exactly |
| `profiles.training_mode` | **unchanged** (intro or deload stay on) | task 3 |
| `program_templates` | **unchanged** (PPL rows with his customisations stay; Arnold rows are added by the client, §3.4) | Q§13 "preserve those customizations" |
| `day_plans`, past 14 days | each date with no override whose old-week key differs from the new week gets a frozen row (`reason 'custom'`, `note 'program-switch'`, the old key). His own overrides are never touched. | missed-workout detection (7 days back) and the Train week (14 days back) keep judging the past against what was planned then, as `scheduleFreeze()` does for a schedule edit |
| `day_plans`, today | frozen too when a workout was started or finished today | the session finishes as started and today reads "Pull A done", not "Chest & Back A missed" |
| `day_plans`, upcoming | rows pointing at old-program keys are re-pointed to the same slot (`push_b` → `shoulders_arms_b`); `reason`, `moved_from`, `note` kept; `rest` rows unchanged. Today's row is re-pointed only if nothing was trained today. | keeps his rearrangement of days (a moved day stays moved, a swap stays a swap, a rest day stays rest). Dropping them would silently undo his planning; keeping old keys would plan a PPL day inside the Arnold week. The mapping is a bijection, so switching back restores them. |
| `workout_sessions`, `exercise_sets` | **never touched**: completed sessions, their names, sets, weights, reps, RIR, notes; an active session keeps its `template_key`, `name`, exercises and open sets | Q§13 "do not rewrite workouts that have already been completed", "allowed to finish without having its exercises changed" |
| `set_history`, `exercise_bests`, `exercise_daily`, `pr_events` (views) | unchanged (they read the untouched sets) | Q§13 "preserve all … personal records" |
| `volleyball_sessions`, `athletic_tests`, `recovery_logs.volleyball`, `profiles.volleyball_per_week` | untouched, still exported | task 3 |

### 3.4 Template rows (client, idempotent, never overwriting)

`useTemplates()` query function:

```
rows    = select * from program_templates order by sort
program = activeProgram(profile)            // the query waits for the profile
missing = PROGRAMS[program].keys not present in rows
if missing.length and online:
  upsert programSeedRows(program).filter(key in missing)  { onConflict: "user_id,key", ignoreDuplicates: true }
  rows = select again
return rows.map(fromRow)
```

- `programSeedRows(program = DEFAULT_PROGRAM)` maps the built-ins to rows: `key`, `name`, `focus`,
  `sort` = index within its program (Arnold 0–5), `warmup`, `exercises`.
- `fromRow(r)`: `def = templateDef(r.key)`; `program`, `short`, `abbr`, `family`, `subtitle`,
  `notes`, `weekday` from `def`; `name`, `focus`, `warmup` (falls back to `def.warmup` when empty),
  `exercises` from the row through `visibleExercises`/`visibleWarmup`.
- `useSaveTemplate`: `sort` = index of the key within its own program.
- Two devices inserting at once: the unique `(user_id, key)` plus `ignoreDuplicates` makes the
  second insert a no-op. Offline: no write; screens render the built-ins.
- Switching program (§3.6) ensures the target program's rows *before* calling the function.

### 3.5 In-progress workouts, offline devices, cached apps

- **Active workout during the switch.** All of a session's planned sets are written as
  `exercise_sets` rows when it starts (`buildSessionSets`), so the switch cannot change them. The
  live screen looks its template up through `byKey`, which keeps PPL templates, so its warm-up and
  notes stay. Today's plan is frozen to the old key (§3.3). Finishing works as before; the session
  keeps `template_key = 'pull_a'`, `name = 'Pull A'`.
- **Starting while one is open.** Unchanged: `start()`/`startToday()` resume the open session
  ("still open, finish or discard it first") before anything new starts.
- **Offline set edits.** The outbox (`src/lib/data/outbox.ts`) only updates, inserts or deletes
  `exercise_sets`/`workout_sessions` rows by id; the switch never touches those rows, so queued
  writes land on the same session after the deploy.
- **Persisted query cache.** An offline cold start can show the cached (pre-switch) plan until the
  next successful profile fetch. That is acceptable: anything he starts from it is a real workout
  and is kept.
- **A second device with a stale screen.** It refetches the profile on focus. If it writes a
  `day_plans` row with an old key before that, the resolver's safety net (§2.4) maps it.
- **Old app code.** The pre-Arnold app never meets switched data: the switch ships one deploy
  after the program-aware app (§3.1a).

### 3.6 Switching programs in the app (both ways)

`useSetProgram()` in `src/lib/data/program.ts`:

```
setProgram(next):
  if next === active or busy → false
  if offlineNoChange("The program") → false
  ensure next's template rows (insert missing built-ins, ignoreDuplicates)
  r = rpc("set_training_program", { p_program: next, p_today: useToday() })
  error code PGRST202 (function missing: a preview before publication) →
      toast "Switching programs is available once this update is published." → false
  other error → toast "Couldn't switch. Nothing changed." → false
  invalidate ["profile"], ["templates"], ["day-plans"], ["sessions"]
  savePrefs({ switchNoticeSeenAt: r.at ?? now })   // quiet; the one-time notice never follows his own switch (CR-1)
  toast "{PROGRAMS[next].name} is your program" with Undo → setProgram(previous)
  → true
```

`set_training_program` returns `at` (the same `now()` it wrote to `programSwitch.at`; one
transaction, so the values are equal) with `changed`, `from`, `to`, `date`, `frozen`, `mapped`,
`cleared`.

Facts the confirm sheet must state (DESIGN-V3 §4.3.7 words them as four checked lines plus one
when a workout is live): the program he leaves stays saved with his edits; past workouts and bests
don't change (the last two weeks keep the plan they had); days he moved stay moved; it starts with
his next workout; a workout in progress finishes as it started.

### 3.7 Carried exercise swaps ("ask before replacing", Q§13)

His PPL customisations stay in the PPL rows. If he swapped an exercise in PPL that Arnold also
uses, he is **asked** once whether Arnold should use the same swap:

- `carriedSwaps(storedPpl: StoredTemplate[], arnold: StoredTemplate[]): { from: string; to: string; keys: ArnoldKey[] }[]`
  (pure, programs.ts): for each PPL template, a built-in slug `S` that is missing from his stored
  row, and a stored slug `T` that is not in the built-in, where `T` is in `S`'s library
  `substitutes` or `S` in `T`'s → a swap `S → T`, kept when `S` appears in an active Arnold
  template that still has `S`.
- When the list is non-empty and `prefs.swapsOffered` is not true, Train shows one dismissible
  card: "You use {T} instead of {S} in Push/Pull/Legs. Use it in the Arnold split too?" →
  "Use it" applies `substituteExercise()` to those Arnold rows via `useSaveTemplate` (with Undo);
  "Keep Arnold's" does nothing. Either sets `prefs.swapsOffered = true` via `useSavePrefs`.
- Sets and rep changes he made in PPL are not carried: Arnold's sets and ranges are Quinton's.

### 3.8 What is stored per set and session (Q§9)

| Q§9 item | Where | Status |
|---|---|---|
| Weight | `exercise_sets.weight_lb` (lb; dumbbell lifts per hand) | stored |
| Repetitions | `exercise_sets.reps` (per side when `target_unit = 'each'`) | stored |
| Sets | one `exercise_sets` row per set, `set_index`, `kind` working/warm-up, `completed` | stored |
| Reps in reserve | `exercise_sets.rir numeric(3,1)`, asked for `weight_reps` and `bodyweight_reps` lifts (every Arnold exercise) | stored |
| Rest time | prescribed: `exercise_sets.rest_sec`, copied from the template at start. Taken: derived from consecutive `completed_at` (`timeBetweenSets()`, below). | stored + derived |
| Previous performance | `set_history` view → `fetchRecentHistory()` / `usePriorHistory()` (last 4 sessions per slug, across programs) | stored |
| Personal records | `set_history`, `exercise_daily`, `pr_events` views; record = e1RM ≥ prior best + 1 lb (`PR_MIN_GAIN_LB`) | derived views |
| Workout notes | `workout_sessions.notes` (session), `exercise_sets.notes` (per set) | stored |
| Targets | `target_rep_low/high`, `target_unit`, `target_rir`, `suggested_weight_lb` | stored |

**No new column.** RIR and prescribed rest are already stored per set. The rest actually taken is
the gap between a set's `completed_at` and the previous completed set's in the same session, which
a `rest_taken_sec` column would duplicate (it would be computed from the same two timestamps). New
pure helper in `src/lib/workout/timing.ts`:
`timeBetweenSets(sets: Pick<WSet, "id" | "session_id" | "completed" | "completed_at">[]): Map<string, number | null>`
— seconds since the previous completed set of the same session, null for the session's first set
or a gap over 15 min (not a rest). History and the fatigue-overlap rule (§4.6) read it.

One behaviour change (workout screen owners implement it): when he adjusts the running rest
timer by ±15 s, the adjusted total is written to `rest_sec` of the remaining unlogged working sets
of that exercise in this session (one `updateSets` op), so the stored prescription is the rest he
actually chose and the next rest starts there.

### 3.9 Dev and QA data

`scripts/dev/setup-users.mjs` (program stream): before seeding demo history, set demo's
`weekly_schedule` to the PPL week and remove `prefs.program`/`schedules`/`programSwitch`, seed the
six PPL rows from a frozen fixture `scripts/dev/fixtures/ppl-rows-2026-10.json` (today's PPL rows,
jumps included, as production has them) with one customisation (Pull B "Wrist Curls or Reverse
Curls" 3 sets), seed the PPL history as now (volleyball rows too: they must stay hidden), then call
`admin.rpc("set_training_program", { p_program: "arnold", p_user: uid })` unless `--ppl` is passed
(`--ppl` leaves demo as production looks before publication, to test the switch). Fresh user: no
change (column default is now Arnold).

---

## 4. Progression, intro volume, lighter weeks, rest days, fatigue overlap

### 4.1 Double progression (Q§9) — changes to `src/lib/training/progression.ts`

Rule (unchanged in spirit, now effort-aware and program-aware): recommend more weight **only**
when every working set the reference session prescribed reached the top of the range at the target
effort; otherwise keep the weight and add reps. Nothing is ever increased automatically: the
suggested load fills the set as a ghost and nothing is logged until he taps the check (existing
behaviour; restated as a requirement).

`suggest(t, lib, history, mode, ctx?: { templateKey?: string })`; `PastSet` gains
`template_key?: string | null` (filled by `withSessionModes()`, which now selects
`id,mode,template_key`).

| Step | Rule |
|---|---|
| Retired/explosive, no history, deload mode, only deloads logged | unchanged |
| Reference | latest non-deload session (`ref`) |
| Sets it prescribed | same template (`ref.template_key` equals `ctx.templateKey`, or either is unknown): `plannedSetCount(t, lib, ref.mode)` as today. **Different template** (e.g. last time was PPL Push B with 3 sets, now Arnold Monday with 2): the sets it logged, capped at today's plan: `min(ref.length, plannedSetCount(t, lib, "standard"))`. Its own plan is unknown after the switch, so it is judged on what it logged, never as "missed sets". |
| Top of range | `hitTopAll`: all prescribed sets logged, all at the top load, each with reps (or seconds) ≥ `t.repHigh` of the **current** template |
| Target effort | `[lo, hi] = rirRange(t.rir)`. `belowTarget` = RIR was logged on at least one of those sets and at least half of the logged values are `< lo`. Heavy compounds (`"1–3"`): RIR 0 is below target → hold. Isolation (`"0–2"`): 0 is inside the target → progress. Legacy `"1–2"`: as today. Not logged → judged on reps alone. |
| Increase | `hitTopAll && !belowTarget` → exactly one `increment` (never more), reason "You hit 10, 10, 10 at 60 lb, the top of the range at your target effort. Add 5 lb." When every logged RIR on those sets is `> hi`, add " with reps to spare" (still one increment). |
| Hold (effort) | `hitTopAll && belowTarget` → same load: "Top of the range at 150 lb, but at 0 reps in reserve on a heavy lift. Repeat 150 lb and own every rep." |
| Add reps | every prescribed set within the range → same load, add reps (unchanged copy) |
| Reset after two misses | unchanged (−10% after the range was missed twice at the same load) |
| Otherwise | hold (unchanged copy) |

Tests to add in `progression.test.ts` (Arnold templates from `programs.ts`):

1. Incline DB Press 3×6–10, last 60×10@2, 60×10@1, 60×10@1 → `increase` to 65.
2. Same reps with RIR 0, 0, 1 on a compound → `hold` at 60, reason mentions reps in reserve.
3. Cable Lateral Raises 4×12–20 (isolation), last 15×20@0 ×4 → `increase` to 20 (0 RIR is on target).
4. Cross-template: last session template `push_b` with 3 sets 50×12, Arnold Monday Seated DB
   Shoulder Press 2×6–10 → judged on 2 sets → `increase` to 55; never "1 of 2 sets were completed".
5. Cross-template with fewer logged sets than now planned: last `push_a` lateral raises 3 sets
   15×20@1, now 4 planned → judged on 3 → `increase`.
6. Same template with a set left unlogged → `hold` "Last time 2 of 3 sets were completed" (existing
   behaviour kept).
7. Back squat now 3×5–8, last PPL 225×6,6,6,5 → first three sets judged: in range, not at top →
   `add_reps` at 225.
8. Never more than one increment, whatever the RIR.
9. `rirRange("1–3")` → `[1,3]`, `"0–2"` → `[0,2]`, `"Fresh"` → null.
10. Reverse curls (optional) are not in `buildSessionSets()` output when `includeOptional` is false
    (every app start), and are when it is true; `templateExerciseSets(t, mode, i)` builds exactly
    the rows `buildSessionSets()` would for that exercise (2 sets, 10–15, RIR `0–2`, rest 60,
    `set_index` from `i`); `suggestOptional()` is true only for `standard` + `go`/unknown.

### 4.2 Intro low-volume option (Q§10) — `training_mode = 'intro'`

Unchanged rule `plannedSetCount(..., "intro") = max(2, sets − 1)`; same weights, same RIR; optional
exercises left out. For Arnold that means every 3- and 4-set exercise loses one set and 2-set
exercises stay at 2:

| Day | Standard sets | Intro sets |
|---|---|---|
| Shoulders, Biceps & Triceps A | 2 · 4 · 3 · 3 · 3 · 2 · 2 = 19 | 2 · 3 · 2 · 2 · 2 · 2 · 2 = 15 |
| Chest & Back A | 3 · 3 · 3 · 2 · 2 · 2 = 15 | 2 · 2 · 2 · 2 · 2 · 2 = 12 |
| Legs & Abs A | 3 · 3 · 2 · 3 · 4 · 3 = 18 | 2 · 2 · 2 · 2 · 3 · 2 = 13 |
| Shoulders, Biceps & Triceps B | 2 · 4 · 3 · 3 · 3 · 2 · 2 (+2 optional) = 19 | 2 · 3 · 2 · 2 · 2 · 2 · 2 = 15 |
| Chest & Back B | 3 · 3 · 3 · 2 · 2 · 2 = 15 | 2 · 2 · 2 · 2 · 2 · 2 = 12 |
| Legs & Abs B | 3 · 2 · 3 · 2 · 2 · 4 · 3 = 19 | 2 · 2 · 2 · 2 · 2 · 3 · 2 = 15 |
| **Week** | **105** | **82** (−22%) |

Every §12 muscle group stays inside its zone in the intro week (§5.3). Intro is offered, never
forced: the switch-over leaves `training_mode` as it was. One suggestion is allowed: in the first
7 days after the switch (`programSince`), while mode is `standard`, no Arnold session is done yet
and `prefs.lighterSnoozedUntil` is not in the future, `useTrainingWeek().easeIn` is true (DESIGN-V3
CR-4) and Train shows "Ease into the new split?" → "Use fewer sets" = `setMode("intro")` with
Undo; "Not now" snoozes it (`useLighterSnooze`, which hides it for the rest of the window). The
mode's on-screen name comes from DESIGN-V3's vocabulary: **"Fewer sets"** (Program › How hard), and
onboarding's switch reads "Start lighter" (one name for the mode, because the same mode also
serves a mid-program lighter week, §4.3). The stored value stays `intro`.

Deload (unchanged rule): sets `max(1, ceil(n/2))`, about 10% lighter, RIR "3–4". Arnold deload week
= 62 sets.

### 4.3 Lighter-week suggestions (Q§10) — `lighterWeekAdvice()` in `src/lib/training/block.ts`

```ts
export interface LighterWeekAdvice {
  kind: "deload" | "lighter" | "standard" | null;   // what to suggest; null = nothing
  reasons: string[];                                 // 1–3 short factual lines, numbers first
  signals: { streak: number | null; fatigue: number | null; soreness: number | null; sleep: number | null; performance: { dips: number; compared: number } | null; adherence: number | null };
}
export function lighterWeekAdvice(input: {
  today: ISODate;
  mode: Mode;
  modeSetAt: ISODate | null;          // prefs.modeSetAt
  snoozedUntil: ISODate | null;       // prefs.lighterSnoozedUntil
  sessions: { local_date: ISODate; status: string; mode?: string | null; template_key?: string | null }[]; // 8 weeks
  checkins: { local_date: ISODate; sleep_hours: number | null; soreness: number | null; fatigue: number | null }[]; // 14 days
  sleepGoalH: number;
  history: Record<string, PastSet[]>; // per slug, newest first, with completed_at (performance dips)
  plannedByWeek: { weekStart: ISODate; planned: number; done: number }[]; // last 2 complete weeks
  historyFrom: ISODate | null;
}): LighterWeekAdvice;
```

Signals (each adds one reason when it fires):

| Signal | Fires when | Reason text |
|---|---|---|
| `streak` | `deloadAdvice().hardWeeks ≥ DELOAD_WINDOW` (5) | "5 hard weeks in a row." |
| `fatigue` | fatigue ≥ 4 on ≥ 3 of the last 7 check-ins | "Tiredness 4 of 5 or higher on 3 of your last 7 check-ins." (the numbers are the real counts; "fatigue" is asked as "Tiredness", DESIGN-V3 §4.1.3) |
| `soreness` | soreness ≥ 4 on ≥ 3 of the last 7 check-ins | "Soreness 4 of 5 or higher on 3 of your last 7 check-ins." |
| `sleep` | ≥ 4 nights logged in the last 7 and their average < goal − 1.5 h | "Sleep averaged 6.25 h against 8." |
| `performance` | `performanceDips()` ≥ 3 distinct exercises **and** ≥ 40% of those compared | "Reps dropped on 4 of 9 lifts at the same weight." |
| `adherence` | in each of the last 2 complete weeks, planned − done ≥ 2 | (no reason line on its own) |

`performanceDips(history, today)`: for each exercise whose latest real (non-deload) session is
within the last 10 days and that has a previous real session: compare the two on matched
`set_index`es. A **dip** is: same top load (±0.1 lb) and total reps over the matched sets down by
≥ 2; or a lower top load with best e1RM (1–12 rep sets) down ≥ 3%. A comparison is skipped when the
average `timeBetweenSets` of the latest session was ≥ 45 s shorter than the previous one's (the
drop is explained by rest, not fatigue).

Decision:

- Nothing while `mode === "deload"`, within 14 days after a completed deload week, before
  `snoozedUntil`, or with fewer than 3 weeks since `start_date` (`historyFrom`). `programSince` does
  **not** reset this gate: PPL weeks are real training, so 5 hard PPL weeks still earn a light
  week right after the switch (Train shows it above the ease-in, DESIGN-V3 §4.3.1).
- **deload** when `streak` fires, or two or more of {fatigue, soreness, sleep, performance} fire.
  Copy: title "Take a deload week", body "Half the sets, about 10% lighter, 3–4 reps in reserve."
  + reasons. Action "Start deload week" → `setMode("deload")`.
- **lighter** when exactly one of {fatigue, soreness, sleep, performance} fires, or `adherence`
  fires together with an average soreness or fatigue ≥ 3.5 over the last 7 check-ins. Copy:
  "Take a lighter week", "One set fewer on every exercise, same weights." + reasons. Action "Start
  lighter week" → `setMode("intro")`.
- **standard** (return) when mode is `intro` or `deload` and `modeSetAt` is 7 or more days ago.
  Copy: "Back to the full program?" Action → `setMode("standard")`.
- Wording: the titles and bodies above give the facts each card must state; the words are
  DESIGN-V3's (§2.2, §4.3.4): `deload` → "Light week suggested" / gold "Start light week";
  `lighter` → "Fewer sets this week?" / gold "Use fewer sets"; `standard` → "Back to the full
  plan?" / gold "Back to normal". A change applies to the next workout started (no "Monday").
  Logic keeps the two apart: `deload` sets mode `deload` (half the sets, about 10% lighter, 3–4 in
  reserve); `lighter` sets mode `intro` (one set fewer, same weights; on screen "Fewer sets").
- Every suggestion has "Not now" → `prefs.lighterSnoozedUntil = today + 7`. Mode changes always
  go through `useSetTrainingMode()` (tap, Undo), which now also writes `prefs.modeSetAt = today`.
  Never automatic.
- Shown on Train (one row under the hero, DESIGN-V3 places it) and as a coach fact
  (`tr.lighter`).

`deloadAdvice()` and `blockStrip()` stay (the strip may be dropped from the UI); the weekly
recovery review keeps its `lighter`/`deload` recommendations from soreness and fatigue averages
(§6.1).

### 4.4 "Six training days should not be mandatory" (Q§10) — rest today

When today's readiness level is `recover` (score ≥ 6), or `ease` while `lighterWeekAdvice().kind`
is `deload` or `lighter` (not `standard`, which is a "back to normal" note), and today is a planned
training day with no session started, Today and Train offer (DESIGN-V3 §4.3.4 "Options for
today"):

1. **"Rest today, shift the week"** → `shiftWeek({ from: today, plans, horizon: 7 })` (new, pure,
   `schedule.ts`): find the first planned rest day `R` within 7 days (resolved plan); write
   `today → rest` and, for every day `d` in `(today, R]`, `d → key planned on d − 1` with
   `reason 'rescheduled'`, `moved_from = d − 1`. Example on a Tuesday: Tue rest, Wed Chest & Back A,
   Thu Legs & Abs A, Fri Shoulders, Biceps & Triceps B, Sat Chest & Back B, Sun Legs & Abs B; next
   Monday as normal. The order of the week is kept; only the rest day moves. Returns `[]` when there
   is no rest day within 7 days (then only option 2 shows).
2. **"Rest today, skip it"** → one write `today → rest` (`reason 'rest'`).

Both go through `useDayPlanWrites().apply()` (optimistic, Undo, offline says so). The readiness
`recover` detail changes from "Move {session} to tomorrow" to "Walk, mobility, sleep. Six days
aren't mandatory."; the options carry the action.

### 4.5 Readiness guidance without volleyball (`src/lib/recovery/guidance.ts`)

- Remove the `volleyball` factor, `volleyballDates` input, `CheckinLite.volleyball`, the
  `vbRecent`/`legsLoaded` logic and all volleyball copy.
- Level `legs` now means: today is a leg day (`isLegDay`) and the check-in's soreness is ≥ 4.
  Title "Ease off the legs", detail "Keep leg work at RIR 2–3 and drop one set per exercise. Your
  legs are still sore." Adjustments `{ rir: "2–3", dropSets: 1 }`. `readinessLine()` for `legs`:
  "{n} today, leg work at RIR 2–3, one set fewer. Your legs are still sore."
- `PlanLite` becomes `{ key, name, isLegs }` (`hasJumps` and `Adjustments.skipJumps` are deleted;
  in P1 keep them as optional, always false).
- The check-in's soreness question targets the day: `sorenessFocus(plan, yesterday)` (pure,
  guidance.ts) → `"legs"` when today is a leg day; `"arms"` when today's family is `chest_back` and
  yesterday's done session was an arm day (§4.6); else `"general"`. DESIGN-V3 words the question
  from it ("How do your legs feel?" / "How do your arms feel?" / "How sore are you?"). The value is
  still stored in `recovery_logs.soreness`; the focus is recomputed from the plan when read, so no
  column is needed.

### 4.6 Fatigue overlap: Monday/Thursday arms → Tuesday/Friday chest and back (Q§1, Q§3, Q§2/Q§5 notes)

New pure module `src/lib/training/overlap.ts`. Constants (exported, tested):

```ts
export const OVERLAP = { repDrop: 2, e1rmDropPct: 0.03, soreness: 4, restShorterSec: 45, window: 3, hits: 2 } as const;
```

**When it applies.** Today's template `family === "chest_back"`, and the previous calendar day has
a `done` session that trained arms: its template family is `shoulders_arms`, or (content
fallback, for rearranged weeks and edited templates) it logged ≥ 6 completed working sets whose
library primary includes `biceps`, `brachialis` or `triceps`. PPL days never trigger it.

**Which lifts are watched.** The day's first pressing compound (first exercise with primary
`chest`/`upper_chest`, category compound: Incline DB Press, Incline Smith) and first pulling
compound (first with primary `lats`/`upper_back`, compound: Neutral-Grip Pulldown, Chest-Supported
Wide Row). **Which are trimmed.** For triceps: the last pressing compound after the first one
(Machine Chest Press, Flat DB Bench). For biceps: the last pulling compound after the first two
pulls (Single-Arm Cable Lat Pulldown, Single-Arm Cable Row). Never below 1 set. Logged sets are
never touched.

Three entry points:

1. `overlapPreStart({ today, template, yesterday, checkin })` — before the session starts: fires
   when the check-in soreness is ≥ 4 and `sorenessFocus` was `"arms"`. Advice
   `[{ kind: "drop", slug: <press accessory>, sets: 1 }, { kind: "drop", slug: <pull accessory>, sets: 1 }]`.
   Copy: "Arms still sore from {yesterday's session name}. Today: one set fewer on {Machine Chest
   Press} and {Single-Arm Cable Lat Pulldown}." Actions "Start with this" →
   `start({ …, adjust: { dropSets } })`, "Start as planned". Shown on Today's Up next and the Train
   hero for that day.
2. `overlapInSession({ template, sets, prior, yesterday })` — during the session, evaluated when the
   2nd working set of a watched lift is logged. Reference = the same `set_index` of that exercise's
   most recent previous real session (`usePriorHistory`). A set **dips** when: weight ≥ reference
   weight − 0.1 lb and reps ≤ reference reps − 2; or weight < reference weight and e1RM ≤ reference
   e1RM × 0.97 (1–12 rep sets). Skip set 2 when its `timeBetweenSets` is ≥ 45 s shorter than the
   reference set 2's. **Fires** when both of the first two working sets dip. The reference is the
   last real session of that slug whatever its program, so on the first Arnold Tuesday a PPL Push A
   incline press is a fair reference (same slug, same movement, §1.7). Pressing lift →
   muscle `triceps`; pulling lift → `biceps`; each fires at most once per session.
   - triceps advice: `[{ kind: "reorder", move: <chest isolation: Low-to-High Cable Fly / Pec Deck>, before: <press accessory> }, { kind: "drop", slug: <press accessory>, sets: 1 }]`;
     copy "Triceps look tired from {Monday}: Incline Dumbbell Press is down 2 reps at 70 lb. Try
     the fly next and one set fewer on Machine Chest Press."
   - biceps advice: `[{ kind: "drop", slug: <pull accessory>, sets: 1 }]`; copy "Biceps look tired
     from {Monday}: Neutral-Grip Lat Pulldown is down 2 reps at 140 lb. One set fewer on
     Single-Arm Cable Lat Pulldown."
   - One tip card in the workout (placement and words: DESIGN-V3 §4.2.15, where it takes the rest
     ring's place; calm, never gold or red, dismissible). "Apply" moves the exercise group order
     (existing reorder ops) and deletes the last unlogged set(s) (`ops.deleteSets`), with Undo;
     "Keep plan" dismisses it for the session. Skipped when those exercises are already done.
3. `overlapNextArmDay({ sessions, sets, template })` — prevention (Quinton's Monday note "Do not
   unnecessarily exhaust triceps during shoulder presses" and Thursday note "Shoulder pressing
   volume can be reduced if it interferes with Friday's chest session"): look at the last 3
   chest-and-back sessions that followed an arm day and recompute rule 2's dip on each (pure, from
   `set_history`). When the pressing dip happened in ≥ 2 of them, the next `shoulders_arms` day
   suggests `{ kind: "drop", slug: <its shoulder press: first compound with primary front_delts>, sets: 1 }`
   and `{ kind: "rir", slug: <same>, rir: "2–3" }`; when the pulling dip did, it suggests
   `{ kind: "drop", slug: <its first biceps isolation>, sets: 1 }`. Copy: "Your pressing dropped the
   day after arm day 2 of the last 3 times. Today: one set fewer on Seated Dumbbell Shoulder Press
   and stop with 2–3 reps left." Same placement and actions as rule 1. Never edits the template
   (he can do that himself in the editor).

`StartOptions` gains `adjust?: { dropSets?: Record<string, number>; rir?: Record<string, string>; order?: string[] }`
(applied in `buildSessionSets`, this session only).

Tests (`overlap.test.ts`): applies only after an arm day (family and content fallback); a 1-rep
drop does not fire; 2 at the same load fires; heavier load with fewer reps fires only via e1RM;
shorter rest skips; fires once per muscle; advice never goes below 1 set and never names a logged
set; reorder target is the chest isolation; next-arm-day pattern needs 2 of 3; PPL never fires.

---

## 5. Muscle-group weekly volume (Q§12)

Rewrites `src/lib/training/volume-zones.ts` (new API alongside the old in P1; old removed in P2).

### 5.1 Groups and mapping from `MuscleGroup`

| Group key | Label (Quinton's) | Library muscles credited |
|---|---|---|
| `chest` | Upper chest and chest | `chest`, `upper_chest` |
| `side_delts` | Side delts | `side_delts` |
| `rear_delts` | Rear delts | `rear_delts` |
| `front_delts` | Front delts | `front_delts` |
| `back` | Lats and upper back | `lats`, `upper_back` |
| `biceps` | Biceps | `biceps`, `brachialis` |
| `triceps` | Triceps | `triceps` |
| `forearms` | Forearms | `forearms`, `grip` |
| `quads` | Quadriceps | `quads` |
| `hamstrings` | Hamstrings | `hamstrings` |
| `glutes` | Glutes | `glutes` |
| `calves` | Calves | `calves` |
| `abs` | Abdominals | `abs`, `obliques` |
| — (not tracked) | | `traps`, `lower_back`, `adductors`, `full_body` |

`traps` is not credited: as a lateral-raise secondary it would inflate "lats and upper back".
Exercises not in the library (custom) credit `custom_exercises.primary_muscles` the same way, else
nothing.

### 5.2 Fractional credit

Per completed working set (warm-ups never count): each group gets the **maximum** credit of its
muscles in that exercise: **1** if any primary muscle maps to it, else **0.5** if any secondary
does. A set credits a group once (a row with primary lats + upper back is 1 back set, not 2).
Examples: incline DB press → chest 1, front delts 0.5, triceps 0.5; chest-supported row → back 1,
rear delts 0.5, biceps 0.5; cross-body hammer curl → biceps 1, forearms 1.

```ts
export type GroupKey = "chest" | "side_delts" | "rear_delts" | "front_delts" | "back" | "biceps" | "triceps" | "forearms" | "quads" | "hamstrings" | "glutes" | "calves" | "abs";
export const GROUPS: GroupKey[];                      // the order above
export const GROUP_LABEL: Record<GroupKey, string>;
export const GROUP_ZONES: Record<GroupKey, [number, number]>;
export const SECONDARY_CREDIT = 0.5;
export function groupCredit(slug: string, custom?: Record<string, MuscleGroup[]>): Partial<Record<GroupKey, number>>;
export function groupSets(sets: SetLike[], custom?): Record<GroupKey, number>;          // rounded to 0.5
export function plannedGroupSets(templates: Pick<DayTemplate, "exercises">[], mode: Mode): Record<GroupKey, number>;
export function groupRows(done: Record<GroupKey, number>, planned?: Record<GroupKey, number>, trends?: Record<GroupKey, GroupTrend>): GroupRow[];
export function groupTrends(history: Record<string, PastSet[]>, today: ISODate, custom?): Record<GroupKey, GroupTrend>; // §5.4's trend, shared
export interface GroupTrend { trend: "up" | "flat" | "down" | "unknown"; changePct: number | null; weeks: 6; lifts: { slug: string; name: string; changePct: number }[] }
export interface GroupRow { group: GroupKey; label: string; sets: number; planned: number; zone: [number, number]; status: "under" | "in" | "above"; trend: GroupTrend | null; aria: string }
```

"Track arm and shoulder progression separately" (Q§5 Thursday note) is met three ways: every lift
progresses on its own (§4.1, one rep range per slug); Sets by muscle keeps side, rear and front
delts, biceps, triceps and forearms as separate rows; and each row carries its own strength trend
(`GroupRow.trend`, the §5.4 trend: median e1RM change of the lifts that train it as a primary over
the last 6 weeks, with the lifts behind it), shown in the row's sheet (DESIGN-V3 §4.3.9).

### 5.3 Zones (fractional hard sets per week; a RULE, "a common range")

| Group | Zone | Arnold standard | Arnold intro |
|---|---|---|---|
| Upper chest and chest | 10–20 | 14 | 12 |
| Side delts | 8–20 | 10 | 8 |
| Rear delts | 6–16 | 11.5 | 8 |
| Front delts | 4–12 | 11 | 10 |
| Lats and upper back | 10–22 | 19 | 14 |
| Biceps | 8–20 | 18 | 14 |
| Triceps | 8–20 | 17 | 14 |
| Forearms | 4–12 | 6.5 (8.5 with reverse curls) | 5 |
| Quadriceps | 10–20 | 13 | 11 |
| Hamstrings | 8–16 | 13.5 | 10 |
| Glutes | 6–16 | 13.5 | 11 |
| Calves | 8–16 | 11 | 8 |
| Abdominals | 4–12 | 6 | 4 |

(Computed from §1.3 with §5.2 credit; a unit test asserts both columns and that every value is in
its zone, so the default program never starts with a "do more" or "do less" nag.) Front delts get
most of their work from pressing at half credit; their zone is low on purpose. "Under" is shown
neutrally, never as a failure.

### 5.4 Performance-based suggestions (not "more is better")

`volumeSuggestions(input): VolumeSuggestion[]` (pure). Inputs: the last 4 complete weeks of
`set_history`, sessions with their modes, check-ins (14 days), the active templates, `mode`,
`programSince`.

- **Weekly sets** per group: average of the last 3 complete weeks, skipping deload/intro weeks.
- **Trend** per group: for each exercise that credits the group with 1 and has ≥ 3 sessions in
  the last 6 weeks, `change` = mean best e1RM of its latest 2 sessions ÷ mean of its earliest 2 −
  1 (Epley on the best set; above 12 reps it still ranks sessions at similar loads). Group trend =
  median: `up` ≥ +2%, `down` ≤ −2%, else `flat`; `unknown` with fewer than 2 such exercises (or 1
  with ≥ 4 sessions).
- **Recovery strained** = average soreness or fatigue ≥ 3.5 over the last 7 check-ins.

| Kind | When | Copy |
|---|---|---|
| `trim` | weekly sets > zone high **and** trend `flat`/`down` | "Lats and upper back: about 3 fewer sets a week. It hasn't progressed at 24 sets." + the exercise to trim: the group's last accessory by day order |
| `hold` | trend `down` **and** recovery strained | "Biceps: keep the sets where they are and recover first. Curls are down 3% with soreness 4/5." |
| `add` | weekly sets < zone low **and** trend `flat`/`down` **and** recovery not strained | "Side delts: add 2 sets a week, for example one more set of Dumbbell Lateral Raises." |
| none | trend `up` (whatever the sets: it's working), `unknown`, deload/intro week, fewer than 3 weeks since the later of `programSince` and `start_date` (weekly sets per group change with the program, so a volume judgement waits for 3 weeks of the current one) | — |

At most 2 suggestions, priority trim > hold > add, larger deviation first. "Apply" (DESIGN-V3:
"Open the workout") opens the template editor on the named template; nothing edits a template
automatically. Shown at the top of Train › Sets by muscle (DESIGN-V3 §4.3.9; Train's
SuggestionRow shows `suggestions[0]` when nothing outranks it) and as coach facts (`vol.*`,
`vol.suggest`).

Tests (`volume-zones.test.ts`): credit examples above; one set per group per exercise; traps
ignored; retired and unknown slugs credit nothing; the standard and intro tables of §5.3; each
suggestion rule including "under zone but progressing → none" and "above zone but progressing →
none"; at most 2; nothing in deload weeks; `groupTrends` gives side delts and biceps separate
trends from the same week of sets.

---

## 6. Volleyball removal in logic

Rule: no logic reads, computes or shows volleyball; `volleyball_sessions`, `athletic_tests`,
`recovery_logs.volleyball` and `profiles.volleyball_per_week` stay in the database (no drops, no
updates) and in the export. Writes must not touch them either: the check-in upsert omits the
`volleyball` column so a stored `true` stays `true`.

### 6.1 File by file (program stream)

| File | Change |
|---|---|
| `src/lib/training/program.ts` | renamed `program-ppl.ts`; jumps and volleyball removed from built-ins and rules (§1.10) |
| `src/lib/training/library.ts` | retire 4 jump entries, rename "Approach Jump" (§1.9) |
| `src/lib/training/schedule.ts` (+test) | delete `VolleyballLike`, `ColonnadeDay.volleyball`, the `volleyball` param of `weekDays`, `VolleyballAdvice`, `volleyballAdvice`, `volleyballSessions7d`; header comment; add `shiftWeek` |
| `src/lib/training/week.ts` (+test) | `sealedDays` loses `volleyballDates` and the `volleyball` kind; delete `volleyballDaysLabel`; `splitLabel` → `programLabel` |
| `src/lib/adherence.ts` (+test) | `sessionsSealed` days are `train` or `rest` only (no swap rule) |
| `src/lib/now/day-engine.ts` (+test) | `DayInput.plan` is `train` or `rest`; `trainOf` simplifies |
| `src/lib/today/daily-line.ts` | remove `volleyballToday`, `volleyballDays7` and their four lines |
| `src/lib/today/weekly.ts` | remove the `volleyball` input and day flag |
| `src/lib/today/now.ts` (+test) | check-in patch loses `volleyball`; `readinessChip` by `family` (§2.5) |
| `src/lib/today/plan.ts` | `planFacts().legs = isLegDay(t)`; drop `explosiveFirst` |
| `src/lib/recovery/guidance.ts` (+test) | §4.5 |
| `src/lib/recovery/checkin.ts` (+test) | `CheckinDraft`, `CheckinRowLite`, `EMPTY_DRAFT`, `isDraftEmpty`, `draftsEqual`, `filledCount` (now 7 fields), stored drafts and the row payload lose `volleyball` |
| `src/lib/recovery/hooks.ts` | no `useVolleyball`; `CheckinPayload` omits `volleyball`; `planLite` from the template |
| `src/lib/recovery/weekly.ts` (+test) | remove `VolleyballLite`, the `volleyball` input/output and the `volleyball` recommendation; `restDays` = elapsed days without a finished session; the `rest` reason becomes "Every day had training this week." |
| `src/lib/recovery/volleyball.ts` (+test) | deleted (P2) |
| `src/lib/recovery/prefill.test.ts` | fixtures drop `volleyball` |
| `src/lib/reviews/compute.ts`, `hooks.ts` (+test) | no volleyball query, no `recovery.volleyballDays`; saved `monthly_reviews` JSON that still contains the key is ignored by the type and never rendered |
| `src/lib/data/training.ts` | delete `Volleyball`, `useVolleyball`, `useVolleyballMutations`, `volleyballLoad` (P2) |
| `src/lib/data/workout.ts` | `StartOptions.lighterLegs` removed (P2) in favour of `adjust` and `includeOptional` |
| `src/components/training/hooks.ts` | `useTrainingWeek` loses `volleyball`, `volleyballDays`, `load7d`, `vbAdvice`; delete `useVolleyballLog`, `VB_KINDS`, `vbKindLabel` (P2) |
| `src/lib/progress/athletic.ts` (+`body-photos-athletic-strength.test.ts`) | delete `volleyballFrequency`; delete the module with the Hall Athletic UI (P2); the test file keeps its photo and strength cases and loses the athletic ones |
| `src/lib/progress/hall.ts` (+`hall.test.ts`) | P2: delete the athletic part (`TestLine`, `testLine` and the `./athletic` import, which would break when `athletic.ts` goes) and the "athletic tests" describe block; records and strength stay |
| `src/lib/progress/hooks.ts` | P2: delete `useAthleticWrite` and `AthleticValues` (their only callers, the athletic sheets, are deleted by PROGRESS) |
| `src/lib/data/body.ts` | P2: delete `useAthleticTests` and `useAthleticMutations` (no caller left); keep the `AthleticTest` row type only if something still imports it. The `athletic_tests` table and its rows stay, and the export reads it through `export/tables.ts` |
| `src/lib/onboarding/plan.ts` (+test) | remove `volleyballPerWeek` (answers, defaults, validation); the profile update no longer writes `volleyball_per_week` |
| `src/lib/offline/persist.ts` | drop `"volleyball"` and `"athletic"` from persisted query keys |
| CR-3 copy (DESIGN-V3 §2.3) | `now/day-engine.ts` chip "Dawn · N left" → "Check-in · N left"; `today/now.ts` "{label} sealed" → "{label} done"; `today/daily-line.ts` "Fuel both" → "Eat for both"; `onboarding/plan.ts` step labels ("The climber" → "About you", "The summit" → "Goal", "The training" → "Training", "The fuel" → "Food", "The oath" → "Done"); `recovery/guidance.ts` "Refuel tonight" → "Eat well tonight" |
| `src/lib/export/tables.ts` | tables stay in `EXPORT_TABLES` and the erase order; on-screen labels become `volleyball_sessions: ["archived sport session", "archived sport sessions"]`, `athletic_tests: ["archived test result", "archived test results"]` |
| `src/lib/coach/*` | §6.3 |

### 6.2 Screen-stream handoff (UI files that read volleyball; they must drop it)

`components/art/icons.tsx` (volleyball icon), `meals/week/Mosaic.tsx`, `meals/week/WeekPlanner.tsx`,
`now/CheckIn.tsx`, `now/NowScreen.tsx`, `now/bodies.tsx`, `now/useDayInput.ts`, `now/useNowData.ts`,
`onboarding/OathArt.tsx`, `onboarding/OathSummary.tsx`, `onboarding/steps.tsx` (volleyball per week),
`oracle/context.ts` (the two volleyball suggested questions become "Is my arm day hurting my chest
day?" and "Do I need a lighter week?"; the existing "Do I need a deload week?" chip goes too, since
"deload" is a banned word on screen and the new lighter-week question covers it, and "Why hasn't my
bench press improved?" names a lift from data, not barbell bench, which the Arnold split does not
have), `progress/charts/HistoryChart.tsx` (its `invert` option and "sprint times" comment exist
only for athletic tests), `progress/athletic/AthleticLogSheet.tsx`, `progress/hall/Athletic.tsx`,
`progress/hall/HallTab.tsx`, `progress/hall/TestSheet.tsx`, `progress/context.tsx`,
`progress/ProgressScreen.tsx`, `recovery/DateStrip.tsx`, `recovery/GuidanceCard.tsx`,
`recovery/LedgerCheckIn.tsx`, `recovery/VolleyballSheet.tsx`, `recovery/WeeklyReviewCard.tsx`,
`reviews/sections.tsx`, `settings/SettingsView.tsx`, `settings/inputs.tsx`,
`signature/Colonnade.tsx`, `training/DaySheet.tsx`, `training/ProgramTab.tsx`,
`training/TrainingHub.tsx`, `training/VolleyballList.tsx`, `training/VolleyballSheet.tsx`,
`training/week/ReadinessStrip.tsx`, `training/week/Temple.tsx`, `training/week/TodaySession.tsx`,
`training/week/WeekTab.tsx`, `workout/inscription/data.ts`. Old URLs (`/progress?tab=athletic`,
any volleyball sheet query such as `?vb=1`) land on Strength / Train without an error.

### 6.3 Coach (`src/lib/coach/*`)

- `prompt.ts` — replace the first line and the TRAINING section; drop "jump height" and the
  volleyball bullet:

  > You are COACH, the personal training and nutrition coach inside PROJECT GREEK GOD — THE
  > ASCENT, a private app for one person's ten-month transformation: a lean gain toward the goal
  > weight in the context and a six-day Arnold-style bodybuilding split. You talk to that person
  > directly ("you").

  HONESTY bullet: "No guarantees about physique, strength or timelines." CHANGING SETTINGS
  example: "(for example one fewer set on a lift today)".

  > TRAINING
  > - Follow the program and PROGRAM RULES in the context. The default program is the Arnold
  >   split: shoulders, biceps and triceps on Monday and Thursday, chest and back on Tuesday and
  >   Friday, legs and abs on Wednesday and Saturday, rest on Sunday. The plan facts are the source
  >   of truth: he can move days or follow the saved Push/Pull/Legs alternative.
  > - Effort: heavy compound lifts at 1–3 reps in reserve with 2–3 min rest; isolation work at 0–2
  >   reps in reserve with 60–120 s rest.
  > - Double progression: add the smallest load step only once every working set reaches the top
  >   of the rep range at the target effort; otherwise keep the load and add reps. Never suggest a
  >   load the logged sets don't support.
  > - Plateaus: check the actual lift facts (sessions, top sets, stalls), then sleep, food and
  >   bodyweight trend, fatigue, and how often the lift is trained. A stall is no e1RM gain in 3+
  >   sessions.
  > - Volume: the vol.* facts are hard sets per muscle group over the last 7 days, with secondary
  >   muscles counted as half a set, against the app's zones. More sets are not automatically
  >   better: suggest adding sets only for a group below its zone that is not progressing while
  >   recovery is fine; suggest trimming when a group is above its zone and stalled, or recovery is
  >   strained.
  > - Overlap: Monday and Thursday arm and shoulder work can limit Tuesday and Friday pressing and
  >   pulling. If the facts show next-day reps dropping, suggest one fewer set or a different
  >   exercise order, not extra volume.
  > - Recovery: six training days are not mandatory. After poor sleep, high soreness or fatigue, a
  >   rest day, a lighter week (training mode intro) or a deload week is a reasonable suggestion.
  >   Suggest a deload when fatigue, soreness, poor sleep and stalls pile up across lifts, not for
  >   one bad day.

- `snapshot.ts` — delete `prof.volleyball`, `vb.14`, `vb.yesterday`, `vb.today`, every `ath.*`
  fact and "played volleyball" in check-in lines. Add `prog.active` ("Program": "Arnold split
  since Oct 22" / "Push/Pull/Legs") and `prog.saved` (the inactive program, "saved, not active").
  `prog.<key>` facts only for the active program's templates (from rows, else built-ins, through
  `visibleExercises`). `vol.<group>` facts use §5 groups with fractional sets; add `vol.suggest`
  and `tr.lighter` when present. Rules section uses `PROGRAMS[program].rules`. Weekly volume note:
  "Weekly volume = completed working sets in the last 7 days per muscle group; a secondary muscle
  counts half a set."
- `context.ts` — stop loading `volleyball_sessions` and `athletic_tests`; profile drops
  `volleyball_per_week`, adds `prefs`; `day_plans` select adds `note`; `recovery_logs` select drops
  `volleyball`.
- `aggregate.ts` — `mergeSchedule`/`resolvePlan` delegate to `scheduleFor`/`resolvePlanKey`;
  check-in aggregate loses `volleyball`; `muscleSets` → `groupSets`.
- `mock.ts` — replace the volleyball pattern with `/arm|chest|tuesday|overlap/` (ids
  `plan.today`, `plan.yesterday`, `rec.soreness`, follow-up "Should I trim a set after arm
  day?"); water rationale "Training days add sweat losses (mock text)."; the leg note becomes
  "One fewer set on leg lifts while legs are sore (mock text)."
- `access.ts` — training description "Sessions, sets, lifts and the program."

### 6.4 Grep gate (P2, a vitest in `src/lib/__tests__/no-volleyball.test.ts`)

Scans `src/**/*.{ts,tsx}` (not `__scratch`) for
`/volley|approach.?jump|box.?jump|broad.?jump|squat.?jump|standing_vertical|approach_vertical|standing_reach|\bsprint\b/i`
(not a bare "vertical", which legitimate UI code uses).
Allowed only in: `src/lib/supabase/database.types.ts` (generated), `src/lib/export/tables.ts`
(table names), `src/lib/training/library.ts` (the four retired slugs and their history-only
entries), `src/lib/training/programs.ts` (`visibleWarmup`'s "Jump prep" filter), and this test.

---

## 7. Ownership, phases and the interface for screen streams

### 7.1 Files the program stream owns and changes

New: `src/lib/training/program-arnold.ts`, `src/lib/training/programs.ts` (+`programs.test.ts`),
`src/lib/training/overlap.ts` (+test), `src/lib/data/program.ts`,
`supabase/migrations/20261021000000_arnold_program.sql`,
`supabase/migrations/20261021000100_arnold_switch.sql` (shipped in deploy B, §3.1a),
`scripts/dev/fixtures/ppl-rows-2026-10.json`, `scripts/dev/qa-arnold.mjs`,
`scripts/dev/qa-arnold-ui.mjs`, `src/lib/__tests__/no-volleyball.test.ts`,
`src/lib/__tests__/migration-arnold.test.ts`.

Changed: `src/lib/training/{types,library,progression,volume,volume-zones,block,schedule,week}.ts`
(+ their tests), `src/lib/training/program.ts` → `program-ppl.ts`,
`src/lib/data/{training,workout}.ts`, `src/lib/workout/{session,timing}.ts` (+tests),
`src/components/training/hooks.ts` (logic hooks only), `src/lib/prefs.ts` (+test),
`src/lib/adherence.ts`, `src/lib/now/day-engine.ts`, `src/lib/today/{daily-line,weekly,now,plan}.ts`,
`src/lib/recovery/{guidance,checkin,hooks,weekly}.ts` (`volleyball.ts` deleted),
`src/lib/reviews/{compute,hooks,plan}.ts`, `src/lib/coach/{prompt,context,aggregate,snapshot,mock,access,types}.ts`,
`src/lib/onboarding/plan.ts`, `src/lib/progress/{athletic,hall,hooks}.ts` (+`hall.test.ts`,
`body-photos-athletic-strength.test.ts`), `src/lib/data/body.ts` (athletic hooks only, P2),
`src/lib/offline/persist.ts`, `src/lib/export/tables.ts`, `src/lib/reminders/server.ts`,
`src/lib/supabase/database.types.ts`, `scripts/dev/setup-users.mjs`, and every listed test. Every
other `src/lib/**` file is FOUNDATION's (DESIGN-V3 §6.2); no file is on both lists.

Not owned (screens implement against §7.3): everything under `src/components/**` except
`training/hooks.ts`, and `src/app/**`.

### 7.2 Phases (so screens build in parallel and every commit stays green)

- **P1 (program stream, first).** Everything above, additive: new modules and hooks, migration,
  Arnold data, new APIs next to old ones. Where a screen still reads something being removed (a
  `volleyball` field, `lighterLegs`, `useVolleyball`, the old zone API), it stays exported as
  optional/`@deprecated` and unused by logic, so `tsc` stays green. The old `PROGRAM*` exports are
  the exception: they are deleted in P1 and the program stream fixes their importers in
  `src/components/**` with the minimum change (import from `programs.ts`), since those are
  one-line edits.
- **Screens (parallel).** Build against §7.3, drop volleyball UI (§6.2).
- **P2 (program stream, after screens land).** Delete the deprecated exports, files and tests;
  turn on the grep gate (§6.4).

### 7.3 Interface screens call

```ts
// src/lib/training/programs.ts — §2.2 (DEFAULT_PROGRAM, PROGRAMS, TEMPLATE_DEFS, templateDef,
//   programOfKey, counterpartKey, activeProgram, programSince, scheduleFor, resolvePlanKey,
//   visibleExercises, visibleWarmup, templateLabels, effortDefaults, rirRange,
//   exerciseDisplayName, estimateDurationMin, SUNDAY_RECOVERY, carriedSwaps, pickableLibrary,
//   suggestOptional)
export function suggestOptional(mode: Mode, level: ReadinessLevel | null): boolean;   // §1.4: offer the optional lift after the last planned set

// src/lib/data/program.ts
export function useActiveProgram(): { program: ProgramId; def: ProgramDef; since: ISODate | null; loading: boolean };
export function useSetProgram(): { setProgram(next: ProgramId): Promise<boolean>; pending: boolean };

// src/lib/data/training.ts
export function useTemplates(): { templates: StoredTemplate[]; byKey: Record<string, StoredTemplate>; program: ProgramId; all: Record<ProgramId, StoredTemplate[]>; loading: boolean };
export function planFor(date: ISODate, profile: Profile | undefined, plans: DayPlan[], byKey: Record<string, StoredTemplate>): DayPlanResolved; // same signature, program-aware
export function scheduleOf(profile: Profile | undefined): Record<string, PlanKey>;       // = scheduleFor
export function programSeedRows(program?: ProgramId): Omit<Insert<"program_templates">, "user_id">[];

// src/lib/data/workout.ts
export interface StartOptions {
  template: StoredTemplate; date: ISODate; mode: Mode;
  includeOptional?: boolean;                                       // §1.4; app starts pass false (default)
  adjust?: { dropSets?: Record<string, number>; rir?: Record<string, string>; order?: string[] }; // §4.6
}
export function startTarget(t: string | null, activeKeys: string[]): string | null;   // ?t= rule, §2.5

// src/lib/workout/session.ts
export function templateExerciseSets(t: TemplateExercise, mode: Mode, firstSetIndex: number): SetDraft[]; // §1.4 "Add them"; the row builder buildSessionSets uses

// src/components/training/hooks.ts
export function useTrainingWeek(): { …existing minus volleyball…, program: ProgramId; lighter: LighterWeekAdvice; easeIn: boolean; restToday: { shift: DayPlanWrite[]; skip: DayPlanWrite[] } | null }; // easeIn: §4.2 (DESIGN-V3 CR-4)
export function useWeekVolume(week): { rows: GroupRow[]; suggestions: VolumeSuggestion[]; plannedTotal: number; open; loading; offline; error; refetch }; // rows carry trend (§5.2)
export function useOverlapAdvice(input: { date: ISODate; template: StoredTemplate | null; sessionId?: string }): { preStart: OverlapAdvice | null; nextArmDay: OverlapAdvice | null; inSession: OverlapAdvice | null };
export function useSetTrainingMode(): { mode: Mode; setMode(m: Mode): Promise<boolean>; pending: boolean }; // also writes prefs.modeSetAt
export function useLighterSnooze(): { snooze(): Promise<boolean> };                     // prefs.lighterSnoozedUntil = today + 7

// pure
lighterWeekAdvice(…) (block.ts) · shiftWeek(…) (schedule.ts) · overlapPreStart / overlapInSession / overlapNextArmDay (overlap.ts)
groupCredit / groupSets / plannedGroupSets / groupRows / groupTrends / volumeSuggestions (volume-zones.ts)
scheduleFreeze({ …, trainedToday }) (schedule.ts, §1.1)
suggest / plannedSetCount / modeRir (progression.ts) · timeBetweenSets (workout/timing.ts)
sorenessFocus / computeGuidance / readinessLine (recovery/guidance.ts) · programLabel (week.ts)

export interface OverlapAdvice {
  muscle: "triceps" | "biceps" | "both";
  trigger: "soreness" | "press_dip" | "pull_dip" | "pattern";
  actions: ({ kind: "drop"; slug: string; sets: number } | { kind: "reorder"; move: string; before: string } | { kind: "rir"; slug: string; rir: string })[];
  text: string;                       // one sentence, numbers first, no exclamation marks
  evidence: { slug: string; name: string; weightLb: number; reps: number; refReps: number }[];
}
export interface VolumeSuggestion { group: GroupKey; kind: "trim" | "hold" | "add"; sets: number; exercise: { slug: string; name: string; templateKey: string } | null; reason: string }
```

All suggestions use DESIGN-V3's calm suggestion styles (SuggestionRow, Options for today, the
workout tip card: never gold, never red), need a tap, offer Undo, and write nothing until tapped.

---

## 8. Acceptance tests (Q§15 made literal)

Run locally (dev server `http://localhost:3400`, local Supabase); nothing is pushed or deployed
until Quinton approves publication (Q§15.12).

### 8.1 QA user and fixture (`scripts/dev/qa-arnold.mjs --setup`)

User `qa-arnold@greekgod.local` / `ascent-test-123`, recreated each run. As production looks
before publication:

- profile: `onboarded true`, `timezone 'America/Toronto'`, `start_date = today − 42`,
  `weekly_schedule` = the PPL week, `training_mode 'intro'`, prefs
  `{tapLogsGhost:true, systemKeyboard:false, restFocus:false, haptics:true, restChime:false, gymAuto:false, day:{trainAt:"16:30"}}`
  (no `program`).
- `program_templates`: the six PPL rows from `scripts/dev/fixtures/ppl-rows-2026-10.json` (jumps
  included), with `pull_b` customised: name "Pull B (Q)", `wrist-curl` 3 sets, note "QA custom".
- History: 6 weeks of `done` PPL sessions on their weekdays before today, sets for every
  exercise (Legs A includes box jumps), plus these controlled last sessions:
  `incline-db-press` (template `push_a`) 60×10@2, 60×10@1, 60×10@1 · `seated-db-shoulder-press`
  (`push_b`) 50×12, 50×12 · `back-squat` (`legs_a`) 225×6, 6, 6, 5 · `machine-chest-press`
  (`push_b`) 150×12@0 ×3 · `cable-lateral-raise` (`push_a`) 15×20@0 ×3.
- An **active** session today: template = today's PPL key (on a Sunday use `legs_b`),
  `mode 'intro'`, 3 completed sets and 3 open sets, using exercises of that template other than
  the five controlled slugs above (so finishing it in U0 cannot change the progression fixtures).
- `day_plans`: today+2 `push_b` (`rescheduled`, `moved_from` today+3); today+3 `rest`
  (`rescheduled`); today+5 `rest` (`rest`); today−3 `rest` (`rest`, his own override inside the
  freeze window).
- 3 `volleyball_sessions`, 2 `recovery_logs` with `volleyball = true` (and soreness/fatigue
  values), 2 `athletic_tests`.
- Snapshot: md5 of every row (ordered by id) of `workout_sessions`, `exercise_sets`,
  `program_templates`, `volleyball_sessions`, `athletic_tests`, `recovery_logs`, `weight_entries`,
  `food_entries`, `water_logs`, `meal_plans`, `planned_meals`, `grocery_items`, `progress_photos`;
  counts of `set_history`, `pr_events`, `exercise_bests`.

### 8.2 Switch (`--switch`): apply the real migration files to the local DB with `psql -f`, in deploy order

`--setup` ends by applying `20261021000000_arnold_program.sql` (idempotent `create or replace`),
so the database looks as it will after deploy A: the functions exist and nothing is switched.
`--switch` applies `20261021000100_arnold_switch.sql`, exactly as deploy B will (it is idempotent
and picks this user because `prefs.program` is absent). Between the two, the U-checks marked "A"
below run against the PPL account to prove the new app reads an unswitched account correctly.

### 8.3 Database assertions (`--verify`)

| # | Assertion | Q§15 |
|---|---|---|
| D1 | `weekly_schedule` = `ARNOLD_SCHEDULE` exactly | 6 |
| D2 | `prefs.program = 'arnold'`; `prefs.schedules.ppl` = the PPL week; `programSwitch.from = 'ppl'`, `.to = 'arnold'`, `.date` = today in Toronto; every pre-existing prefs key unchanged | 6 |
| D3 | `training_mode = 'intro'` | — |
| D4 | `program_templates` md5 unchanged (PPL rows incl. "Pull B (Q)"); still 6 rows | 13 |
| D5 | `workout_sessions` and `exercise_sets` md5 unchanged; the active session still `active` with its 6 sets | 8 |
| D6 | `day_plans`: for each d in [today−14, today): d = today−3 → still `rest`/`rest`; weekday ≠ Sunday → (`custom`, PPL key, `program-switch`); Sunday → no row. Today → (`custom`, today's PPL key, `program-switch`). today+2 → `shoulders_arms_b`, `rescheduled`, `moved_from` today+3. today+3, today+5 → `rest` unchanged | 6, 8 |
| D7 | volleyball, athletic, recovery, nutrition, meals, photos, weight md5 unchanged | 14 |
| D8 | `set_history`, `pr_events`, `exercise_bests` counts unchanged | 8 |
| D9 | Run both migration files again: every md5 above and `day_plans`/`profiles` unchanged (the function returns `changed: false`) | — |
| D10 | Two parallel `rpc("set_training_program", {p_program:"ppl"})` calls as the QA user (`Promise.all`): exactly one `changed: true`; while on PPL, `day_plans` equals the fixture (the switch's own rows gone, today+2 back to `push_b`), `weekly_schedule` = the PPL week. Switch back to Arnold: `day_plans` equal to the D6 state, `weekly_schedule` = Arnold. "Equal" compares `(plan_date, template_key, reason, moved_from, note)`, not ids | 13 |
| D11 | As the QA user with `p_user` = demo's id → error `not allowed`; as anon → permission denied | — |
| D12 | After the first app load as the QA user: 6 Arnold rows, keys and content equal to the built-ins (`sameTemplateContent`), `sort` 0–5; PPL rows still unchanged | 5, 6 |
| D13 | `grep`: no client code path writes `weekly_schedule` together with `prefs.program`; only `set_training_program` writes `program`/`schedules`/`programSwitch` | 12 |

### 8.4 UI assertions (`scripts/dev/qa-arnold-ui.mjs`, Playwright chromium, 390×844, `page.clock.setFixedTime` at 09:00 Toronto)

| # | Steps → expected | Q§15 |
|---|---|---|
| U0 | Open the active PPL session: it shows its own PPL exercises and warm-up; log one open set; Finish → status `done`, `name` and `template_key` unchanged, no Arnold exercise added | 7, 8 |
| U1 | Clock on next week's Monday … Sunday (dates after the switch). Train hero and Today Up next: Mon "Shoulders, Biceps & Triceps A", Tue "Chest & Back A", Wed "Legs & Abs A", Thu "Shoulders, Biceps & Triceps B", Fri "Chest & Back B", Sat "Legs & Abs B" (or the `short` form where DESIGN-V3 places it); Sunday shows rest with the §1.5 suggestions and no Start button; strip labels Arms, Chest, Legs, Arms, Chest, Legs, Rest | 1–4 |
| U2 | Each template (Program → template): every row's name, sets, rep range (with "each"), RIR and rest equal §1.3; Thursday shows Reverse Curls as optional; warm-up steps equal §1.3 | 5 |
| U3 | Next Tuesday, intro mode: Start → `exercise_sets` rows: 2 sets for each of the 6 exercises; `target_rep_low/high` per §1.3; `target_rir` `1–3`/`0–2`; `rest_sec` 150/150/120/120/75/120; `suggested_weight_lb` incline DB press = 65 (increase), machine chest press = 150 (hold, compound at 0 RIR) | 7, 9 |
| U4 | Log incline DB press set 1 (65 × 8, RIR 2): row `completed`, 65, 8, 2; rest timer starts at 2:30; +15 → 2:45 and the remaining incline sets' `rest_sec` = 165; Undo un-logs | 7, 9 |
| U5 | Next Monday, standard mode (switch mode, Undo-able): cable lateral raises ghost 20 lb (isolation at 0 RIR progresses), 4 sets; seated DB press ghost 55 lb, 2 sets. Thursday: Start builds 19 sets (no reverse curls); with readiness `go`, logging the last planned set shows the "Reverse Curls · 2 sets" offer and "Add them" appends 2 rows (10–15, `0–2`, rest 60) and the top bar reads "of 21"; with a `trim` check-in no offer shows, and the Lifts sheet's "Optional" row still adds them | 9 |
| U6 | History lists the PPL sessions with their names (Push A, Pull B (Q) …); exercise detail for Incline Dumbbell Press shows PPL sessions and today's; records unchanged plus any new one | 8 |
| U7 | Program → switch to Push/Pull/Legs → PPL week restored, toast with Undo; Undo → Arnold again; `day_plans` as D6 | 6 |
| U8 | Overlap: fixture yesterday = Shoulders, Biceps & Triceps A done; today Chest & Back A; log incline DB press sets 1–2 at the reference load with 2 fewer reps → one suggestion card; Apply → Low-to-High Cable Fly moves before Machine Chest Press, Machine Chest Press has 1 set, logged sets untouched; Undo restores | — |
| U9 | Rest day: check-in sleep 4 h, energy 1, soreness 5, fatigue 5 → "Rest today" options; "shift the week" writes the `shiftWeek` rows (Undo works); "skip it" writes one rest row | — |
| U10 | No volleyball: on `/`, `/training`, Program, every Train sub-view, `/progress`, `/progress?tab=athletic` (lands on Strength, no error), `/recovery`, `/recovery?checkin=1`, `/reviews`, latest month review, `/settings` and sub-pages, `/coach`, `/nutrition`, meals week, and `/onboarding` (fresh user), `document.body.innerText` (and every `aria-label`, `title`, `placeholder`, `alt`) never matches DESIGN-V3 G-1(a): `/volley|approach jump|box jump|broad jump|squat jump|\bsprints?\b|vertical jump|standing vertical|approach vertical|standing reach|jumps (&|and) sprints|\bathletic\b/i` | (d) |
| U11 | Mobile: screenshots at 390×844 and 375×667 of Train (each weekday), Today, Program, a template, workout mid-set on "Single-Arm Overhead Cable Triceps Extension", the switch sheet, Sets by muscle; `shot.mjs` reports no horizontal overflow and no console errors | 10 |
| U12 | Fresh user onboarding → schedule step offers the Arnold days; after finishing, `weekly_schedule` = Arnold, 6 Arnold rows, no PPL rows, `volleyball_per_week` not written | 6 |
| U13 | Change the order on a Wednesday after Wednesday's workout is done (swap Thu and Sat): `weekly_schedule` saved; Mon–Wed of this week keep their plans (frozen rows, Wednesday included because it was trained); Thursday now shows Legs & Abs B and Saturday Shoulders, Biceps & Triceps B; no session or set changes | 6 |
| U14 (A) | Before `--switch` (deploy A state): the new app on the PPL account shows the PPL week from template data (Push A …), no volleyball, Program shows Push/Pull/Legs selected, no new-plan notice, and nothing is written to `program_templates` or `profiles` by loading the app | 12 |

### 8.5 Unit tests (vitest) to add or update

- `programs.test.ts`: the six templates equal a literal copy of §1.3 (key, name, short, abbr,
  family, weekday, every exercise's slug/name/sets/repLow/repHigh/unit/rir/rest/optional), every
  slug resolves in the library and none is retired; `ARNOLD_SCHEDULE`; RIR is `1–3` for every
  compound and `0–2` for every isolation, rest within 120–180 / 60–120; `activeProgram` cases
  (prefs wins; Arnold key → arnold; PPL key → ppl; empty → arnold; junk prefs value ignored);
  `counterpartKey` bijection; `resolvePlanKey` (override wins; other-program key on/after `since`
  maps; before `since` and `program-switch` rows stay raw; schedule fallback; rest);
  `visibleExercises`/`visibleWarmup` on the fixture PPL rows; `templateLabels` with a renamed
  template; `carriedSwaps`.
- `library` (in programs.test.ts): the three new entries have 3–5 instructions, 2–4 tips, existing
  substitutes; no library `name` matches /volley/i; `pickableLibrary()` excludes the four retired.
- `progression.test.ts`: §4.1 cases 1–10.
- `volume-zones.test.ts`: §5 cases. `volume.test.ts`: `RIR_OPTIONS`, `newTemplateExercise` uses
  `effortDefaults`.
- `block.test.ts`: `lighterWeekAdvice` each signal alone; deload vs lighter decision; return to
  standard after 7 days; snooze; deload cooldown; rest-explained dips skipped.
- `schedule.test.ts`: `shiftWeek` (Tuesday example, no rest day within 7 → `[]`, an existing
  override in the window is carried); `scheduleFreeze` with `trainedToday` true freezes today and
  with false does not; no volleyball exports.
- `overlap.test.ts`: §4.6.
- `guidance.test.ts`, `checkin.test.ts`, `weekly.test.ts`, `prefill.test.ts`, `day-engine.test.ts`,
  `adherence.test.ts`, `today.test.ts`, `now.test.ts`, `week.test.ts`, `reviews/compute.test.ts`,
  `coach/snapshot.test.ts`, `coach/aggregate.test.ts`, `onboarding/plan.test.ts`,
  `contracts-edges.test.ts`, `body-photos-athletic-strength.test.ts`: volleyball inputs and
  expectations removed; new expectations for the Arnold program where they resolve plans.
- `coach/prompt` test: `COACH_SYSTEM_RULES` contains "Arnold" and "1–3 reps in reserve" and does
  not match /volley|jump/i.
- `workout/session.test.ts`: `defaultTargets`/`retarget` follow `effortDefaults`; `timing.test.ts`:
  `timeBetweenSets`.
- `migration-arnold.test.ts`: parses both migration files and asserts the key arrays and both weeks
  equal `PROGRAMS.arnold/ppl.keys` and `.schedule`; that neither contains `drop`, `delete from
  public.workout_sessions`, `update public.exercise_sets` or `update public.program_templates`;
  and that `20261021000100_arnold_switch.sql` holds only the `do` block (no `create`, no `alter`),
  so deploy A's file never switches anyone.
- `no-volleyball.test.ts`: §6.4 (P2).

### 8.6 Regression (Q§14) and checks (Q§15.11)

`npx tsc --noEmit -p .`, `npx eslint` on changed files, `npx vitest run` all green; the existing
regression flows for meal planner, food scanner, nutrition coach, calorie/protein trackers, meal
regeneration, grocery list, bodyweight, progress photos, sleep/recovery check-in, sign-in/out and
export run unchanged on the demo user; D7 proves their rows are untouched by the switch.

---

## 9. Traceability: Quinton's request → this spec (and DESIGN-V3 for screens)

| Request | Met in |
|---|---|
| Q main objective: replace the default schedule with the Arnold split; evidence-informed, progressive overload, adjusted to recovery and performance | §1, §2.3 (`DEFAULT_PROGRAM`), §3, §4 |
| Q: bodybuilding only; no volleyball, box jumps, sprints or sport-specific work | §1.9, §1.10, §6; DESIGN-V3 law 14, G-1(a) |
| Q§1 weekly order Mon–Sun | §1.1 (`ARNOLD_SCHEDULE`), §3.2 (`arn_week`), U1, D1 |
| Q§1 shoulders and arms first | Monday and Thursday are shoulders-and-arms days (§1.1); prompt (§6.3) |
| Q§1 manage overlapping fatigue (triceps → chest pressing, biceps → back) | §4.6 (three rules), §4.5 `sorenessFocus`; DESIGN-V3 §4.2.15, §4.3.4 |
| Q§1 rearrange the days whenever needed | §1.1 (weekly order from today, `scheduleFreeze`), per-date move/swap/rest; DESIGN-V3 §4.3.2, §4.3.6; U13 |
| Q§2–§7 every exercise, sets and rep range | §1.3 (checked line by line), `programs.test.ts`, U2, U3 |
| Q§2–§7 focus lines and training notes | §1.3 `focus`, `notes` (verbatim); DESIGN-V3 §4.2.9 "Notes for today", §4.3.12 |
| Q§3 recommend volume or order change when Monday fatigue limits Tuesday | §4.6 rules 1–2 (drop a set, reorder), U8 |
| Q§4 warm-up sets before heavy squats; not to failure | §1.3 Wednesday warm-up, RIR `1–3`, rule 2 (§1.6) |
| Q§5 optional reverse curls when recovery permits, or substitute | §1.4 (offered after the last planned set when `suggestOptional`; listed substitute), U5 |
| Q§5 shoulder pressing can be reduced if it hurts Friday | §4.6 rule 3, TRAIN acceptance 5(a) |
| Q§5 track arm and shoulder progression separately | §4.1 (per lift), §5.2 (`GroupRow.trend` per group); DESIGN-V3 §4.3.9 |
| Q§8 Sunday rest, optional walking, mobility, recovery; nothing compulsory | §1.5 `SUNDAY_RECOVERY`, rest days never "missed"; DESIGN-V3 §4.3.3, §4.1.2 |
| Q§9 store weight, reps, sets, RIR, rest, previous performance, records, notes | §3.8 (no new column needed), `timeBetweenSets` |
| Q§9 double progression; never increase automatically | §4.1, tests 1–10, U3, U5 |
| Q§10 RIR and rest defaults | §1.2, `effortDefaults()`, U3, U4 |
| Q§10 introductory low-volume option | §4.2 (`intro`, 82 sets); DESIGN-V3 Program › How hard "Fewer sets", onboarding "Start lighter" |
| Q§10 lighter-week suggestions from performance, soreness, recovery | §4.3 `lighterWeekAdvice()`; DESIGN-V3 §4.3.1, §4.3.4 |
| Q§10 six days not mandatory | §4.4 rest today (shift or skip), rule 7; U9 |
| Q§11 tracker must-haves, fast on iPhone, black and gold | DESIGN-V3 §4.2 and its §4.2.14 table |
| Q§12 13 muscle groups, overlap counted, performance-based suggestions | §5.1–§5.4; DESIGN-V3 §4.3.9 |
| Q§13 update the real templates, schedule, cards, start actions, all references | §2.5 (every reader), §3, §3.4, D1, D6, D12, U1 |
| Q§13 Arnold is the default active plan | §2.3, §3.2, §3.1a deploy B |
| Q§13 preserve customisations or ask | §3.3 (PPL rows untouched), §3.7 carried swaps (asked once) |
| Q§13 keep PPL as an alternative | §1.10, §3.6 (switch both ways, Undo), U7 |
| Q§13 keep history, weights, reps, records | §3.3, D5, D8, U6 |
| Q§13 never rewrite completed workouts; active workout finishes unchanged | §3.3, §3.5, D5, U0 |
| Q§13 safe, non-destructive database updates | §3.2 (additive, idempotent, row lock), §3.1a (two deploys), `migration-arnold.test.ts`, D9 |
| Q§14 every other feature keeps working | §8.6, D7; DESIGN-V3 §3.6, §3.7 |
| Q§15.1–4 day checks | U1, TRAIN acceptance 1 |
| Q§15.5 exercises, sets and ranges | `programs.test.ts`, U2 |
| Q§15.6 saved schedule updated | D1, D2, D6, D12 |
| Q§15.7 logging works | U0, U3, U4 |
| Q§15.8 history intact | D5, D8, U6 |
| Q§15.9 progressive overload and rest timers | §4.1 tests, U3–U5 |
| Q§15.10 mobile interface | U11; DESIGN-V3 G-3, G-4 |
| Q§15.11 automated tests, regressions fixed | §8.5, §8.6 |
| Q§15.12 preview until publication is approved | Conflicts (top), §3.1, §3.1a; DESIGN-V3 §6.0 |
| (b) Arnold split, no volleyball | all of the above |
| (d) no volleyball anywhere; tables and rows kept and exported | §6 (logic), §6.2 (screens), §6.4 gate, D7; DESIGN-V3 law 14, G-1(a), G-7 |


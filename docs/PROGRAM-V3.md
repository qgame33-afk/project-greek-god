# PROGRAM V3: the two-set split, in kg

Quinton's request of 26 Oct 2026 is the binding source: `S/program-v3.md`, verbatim.

This document **supersedes** `docs/PROGRAM-ARNOLD.md` for:
- the program (§1);
- keys, labels and defaults (§2);
- the switch-over migrations (§3);
- progression, easier weeks, overlap and volume (§4);
- the acceptance run (§6).

PROGRAM-ARNOLD.md still applies, unchanged, to:
- the active-program model and the one plan resolver (its §2.3–2.5);
- the switch function's guarantees (§3.3–3.6);
- volleyball removal (§6).

Arnold Split 2.0 never shipped. Its code, its keys and its two migrations are gone.

## 1. The program

### 1.1 The week

| Day | Template key | Name |
|---|---|---|
| Monday | `arms_a` | Arms & Shoulders |
| Tuesday | `chest_a` | Chest & Back |
| Wednesday | `lower_a` | Legs |
| Thursday | `arms_b` | Arms & Shoulders |
| Friday | `chest_b` | Chest & Back |
| Saturday | `lower_b` | Legs |
| Sunday | `rest` | Rest |

- Each day type has two template rows, A and B. The two rows hold the same content, so he can customise one rotation later. That is §1 of his request: "both weekly rotations should use the same exercises unless I manually customize them".
- Labels:
  - `name` and `short` are the day name;
  - `abbr` is `Arms`, `Chest` or `Legs`;
  - `subtitle` is the weekday;
  - `family` is `shoulders_arms`, `chest_back` or `legs`.

### 1.2 Exercises

Every exercise has exactly 2 working sets. Warm-ups are listed per day and never count as working sets.

| Day | # | Exercise | Library slug | Reps | Effort (RIR) | Rest |
|---|---|---|---|---|---|---|
| Arms & Shoulders | 1 | Seated Dumbbell Shoulder Press | `seated-db-shoulder-press` | 6–10 | 0–1 * | 150 s |
| | 2 | Incline Dumbbell Curl | `incline-db-curl` | 8–12 | 0 | 90 s |
| | 3 | Overhead Cable Triceps Extension | `overhead-cable-triceps-extension` | 10–15 | 0 | 90 s |
| | 4 | Dumbbell Lateral Raise | `db-lateral-raise` | 12–20 | 0 | 90 s |
| | 5 | Cable Biceps Curl | `cable-curl` | 10–15 | 0 | 90 s |
| | 6 | Cable Triceps Pushdown | `cable-triceps-pushdown` | 10–15 | 0 | 90 s |
| Chest & Back | 1 | Incline Dumbbell Press | `incline-db-press` | 6–10 | 0–1 * | 150 s |
| | 2 | Lat Pulldown | `lat-pulldown` | 8–12 | 0 | 150 s |
| | 3 | Machine Chest Press | `machine-chest-press` | 8–12 | 0 | 150 s |
| | 4 | Seated Cable Row | `seated-cable-row` | 8–12 | 0 | 150 s |
| | 5 | Cable Chest Fly | `cable-chest-fly` | 10–15 | 0 | 90 s |
| | 6 | Straight-Arm Cable Pulldown | `straight-arm-pulldown` (new) | 12–15 | 0 | 90 s |
| Legs | 1 | Barbell Back Squat | `back-squat` | 6–10 | 1–2 | 180 s |
| | 2 | Romanian Deadlift | `romanian-deadlift` | 8–12 | 1–2 | 180 s |
| | 3 | Dumbbell Walking Lunges | `walking-lunge` | 8–12 per leg (`each`) | 1–2 | 150 s |
| | 4 | Standing Calf Raises | `standing-calf-raise` | 10–20 | 0 | 90 s |

Set totals: 12, 12 and 8 per day, 64 a week. For lunges, one set covers both legs (the template note says so).

\* **Decision for Quinton.** The two dumbbell presses are neither isolation nor stable machine lifts. PROGRAM set them to 0–1 RIR. He can change it in the workout editor; every effort target stays editable.

Effort rules for a lift added from the library (`effortDefaults`):
- compound on a machine, cable, Smith or plate-loaded: 0 RIR;
- barbell, or a quad/hamstring/glute compound: 1–2 RIR;
- any other compound: 0–1 RIR;
- isolation and core: 0 RIR;
- carries: 1–2 RIR;
- explosive: Fresh.

Rest defaults: compounds 150–180 s, isolation 90–120 s. Custom rest stays editable.

A newly added exercise defaults to 2 sets (`defaultTargets`, `newTemplateExercise`).

Library change: one entry was added, `straight-arm-pulldown`. No exercise was swapped and none was added to his days.

Push/Pull/Legs stays available as the alternative (`PROGRAMS.ppl`, unchanged).

## 2. Interface for the screens

- `ProgramId = "twoset" | "ppl"`. `TwoSetKey` is the type for the six new keys.
- `PROGRAMS.twoset.name` is "Two-set split". `DEFAULT_PROGRAM` is "twoset".
- The new names are `TWOSET_TEMPLATES`, `TWOSET_SCHEDULE` and `TWOSET_RULES` (`src/lib/training/program-twoset.ts`).
- These are gone:
  - `ARNOLD_*` and `ArnoldKey`;
  - the program id "arnold";
  - the `legs_abs` family;
  - `program-arnold.ts`;
  - the optional reverse curls.
- `MODE_LABEL.intro` is "Easier sets".

### 2.1 kg: `src/lib/training/loads.ts`

The database keeps pounds and inches. `profiles.weight_unit` and `profiles.length_unit` decide what is shown, and they default to kg and cm.

Every value is converted exactly once in each direction:
- display: `displayLoad(lb, unit)`;
- input: `storeLoad(value, unit)`.

| Helper | What it does |
|---|---|
| `displayLoad(lb, unit)` | Stored lb to the display unit: kg on a 0.5 grid, lb on a 0.1 grid. |
| `storeLoad(value, unit)` | A typed value to lb at the column's 0.1 precision. |
| `loadText(lb, unit, withUnit?)` | "22.5 kg", "84 kg", or "—". |
| `displayBodyweight` / `storeBodyweight` | Bodyweight on a 0.1 grid. |
| `loadStep(lib, unit)` | Stepper and progression step. kg: dumbbells (per hand) 2, barbell/Smith 2.5 total, stacks and machines 2.5. lb: the library increment. |
| `stepUp(lb, lib, unit)` / `scaleLoad(lb, f, lib, unit)` | One step up, or a lighter load landed on a step. Both return lb to store. |
| `BAR`, `LOAD_GRID`, `BODY_GRID` | The 20 kg / 45 lb bar and the display grids. Plates: `workout/plates.ts` `platesLabel(total, "kg")`. |

Other unit-related changes:
- `units.ts` `formatLoad` now snaps kg to 0.5, so it agrees with `loadText`.
- `useUnits()` defaults to kg.
- These take the unit, default kg; pass the profile's unit:
  - `suggest(…, { unit })`;
  - `keyLift(…, fmt, unit)`;
  - `StartOptions.unit` (`useStartWorkout` fills it from the profile);
  - `overlapInSession({ unit })`.

Precision: `exercise_sets.weight_lb` is `numeric(6,1)`.
- 0.1 lb is 0.045 kg, under half the 0.5 kg grid, so every 0.5 kg value from 0 to 300 kg round-trips exactly. For example, 22.5 kg is stored as 49.6 lb and shown as 22.5 kg.
- `weight_entries.weight_lb` is `numeric(5,1)`, so every 0.1 kg of bodyweight round-trips.
- Measurements are inches, `numeric(4,2)` or `numeric(5,2)`. 0.01 in is 0.0254 cm, so 0.1 cm round-trips.

`loads.test.ts` covers all of these, and the column definitions were checked against `20261016000000_init.sql`.

Old pound history displays on the 0.5 kg grid. For example, 185 lb shows as 84 kg and 50 lb as 22.5 kg. The stored rows are never rewritten.

The export stays lossless because it exports the stored pounds and inches.

## 3. Switch-over: two migrations, two deploys

Both files are additive and idempotent.

`20261026000000_program_v3.sql` (deploy A):
- changes the column defaults to the two-set week, `weight_unit 'kg'` and `length_unit 'cm'`;
- defines `program_of()` and `set_training_program()` for `twoset | ppl`.

The function has the same guarantees as before:
- one transaction, holding a row lock;
- the past 14 days are frozen, and today too when he has trained today. A workout that is open finishes as it started.
- upcoming moves are re-pointed slot to slot:

  | Push/Pull/Legs | Two-set split |
  |---|---|
  | `push_a` | `arms_a` |
  | `pull_a` | `chest_a` |
  | `legs_a` | `lower_a` |
  | `push_b` | `arms_b` |
  | `pull_b` | `chest_b` |
  | `legs_b` | `lower_b` |

- the old week is saved in `prefs.schedules`;
- it never touches sessions, sets or template rows;
- a second run changes nothing.

`20261026000100_program_v3_switch.sql` (deploy B):
- switches every account without `prefs.program` to the two-set split;
- sets `weight_unit = 'kg'` and `length_unit = 'cm'` once per account, recording `prefs.unitsSwitch {at, from}`. A re-run never undoes a unit he picks later.

The PPL template rows and the history stay as they are. The two-set rows are inserted on the first app load.

### 3.1 Publication: exactly how (after Quinton approves)

The branch ends in two commits that exist only for this:

| Commit (subject starts with) | What it holds | Deploy |
|---|---|---|
| `Publication A:` | every code change and `20261026000000_program_v3.sql` in `supabase/migrations/`; the switch waits in `supabase/held/` | **Deploy A** |
| `Publication B:` | only `git mv supabase/held/20261026000100_program_v3_switch.sql supabase/migrations/` | **Deploy B** |

`scripts/migrate.mjs` (the `vercel-build` step) applies only `supabase/migrations/*.sql`, so Deploy A cannot run the switch. Both commits pass tsc, eslint and vitest (`migration-v3.test.ts` checks that the switch is in exactly one of the two folders and, when present, is the last migration).

1. **Deploy A.** Make the `Publication A` commit production (for example, fast-forward `main` to it and push; Vercel builds `main` as production). The build log must show `[migrate] applied 20261026000000_program_v3.sql` and nothing else. Nothing is switched: his account still reads as Push/Pull/Legs in pounds, now in the new UI.
2. **Cold launch.** On his iPhone, open the app from the home screen, then close it from the app switcher and open it again. That loads Deploy A's code everywhere (navigations are network-first and the service worker is versioned per build), so no old JavaScript is left running. Check that Today shows his Push/Pull/Legs day.
3. **Deploy B**, straight after. Make the `Publication B` commit production. The build log must show `[migrate] applied 20261026000100_program_v3_switch.sql`. The next app load shows the two-set split in kg; a workout that was open finishes as it started.
4. If a build fails after its migration, the previous deployment keeps serving and is program-aware from Deploy A on, so nothing breaks; fix and redeploy.

Preview deployments never migrate (`migrate.mjs` exits when `VERCEL_ENV` is not `production`), so a preview link cannot switch his account.

Rehearsed locally on a scratch database with the real runner (27 Oct): main's six migrations, a PPL account in lb with a live workout and a moved day, then Deploy A (only A applied; every row of his byte-identical), a preview build with B present (skipped), Deploy B (only B applied: two-set week, kg/cm, the past 14 days and today frozen, the moved day re-pointed, sessions, sets and weigh-ins unchanged), and both again (nothing changed).

## 4. Two-set rules

### 4.1 Progression

- An increase is suggested only when **both** sets reach the top of the range at the target effort.
- The increase is one load step: 2 kg on dumbbells, 2.5 kg on bars and stacks.
- Otherwise the suggestion is "add reps" or "hold".
- On a 1–2 RIR lift, the top of the range at 0 RIR holds the load.
- Nothing is ever applied automatically. The suggestion is only the ghost value.

### 4.2 Easier weeks (intro)

- A lift with 3 or more sets loses one set.
- A two-set lift keeps both sets at 2–3 RIR.

### 4.3 Deload

- A two-set lift keeps both sets at 3–4 RIR, about 10% lighter.
- The lighter-week signals are unchanged.

### 4.4 Overlap (arm day, then Chest & Back)

The rules watch:
- Incline Dumbbell Press and Lat Pulldown;
- Machine Chest Press and Seated Cable Row, which are the lifts they ease.

A two-set lift is eased by effort ("stop 1–2 reps short"), never by dropping a set. A lift with 3 or more sets still drops one.

Next arm day: after 2 of the last 3 dips, the shoulder press is "stop with 2–3 reps left", and the curl is "stop 1–2 reps short".

### 4.5 Volume

- Muscle-group volume is counted honestly and the zones are unchanged.
- In the two-set week these groups read "under": side delts 6, rear delts 2, quads 8, calves 4, abs 0.
- `volumeSuggestions` returns holds only while every planned exercise has 2 sets or fewer (`isFixedTwoSet`). The set count is Quinton's rule, so the app never suggests adding or trimming sets.

**Open, not changed:** readiness guidance (`recovery/guidance.ts`: "trim", "ease", "legs") still offers "one set fewer" on a bad day. That is opt-in, and it is shown in Options for today.

## 5. Coach

The prompt describes the two-set split, its effort and rest rules, and "weights in the units written in the context (kg by default)". The snapshot writes every weight in the profile's unit, and a test asserts there are no pound figures for a metric account.

## 6. Acceptance (local only)

**`scripts/dev/qa-program.mjs`**
- `--setup` builds a PPL account in lb/in with history, then applies A.
- `--switch` applies B.
- `--verify` runs D1–D16:
  - D1–D13 are the Arnold checks, re-pointed to the new program;
  - D14: all 7 days, his exercises in his order, 2 sets each;
  - D15: kg/cm, recorded once;
  - D16: history unchanged in lb and correct in kg (last loads, weigh-ins, measurements, PRs).

**`scripts/dev/qa-program-ui.mjs`**
- U1, U2, U10, U11 and U12;
- U15: kg on every screen, with no pound or inch figure.

**`scripts/dev/setup-users.mjs`**
- Seeds demo as PPL in lb, then switches it to the two-set split in kg.
- `--ppl` stops before the switch.

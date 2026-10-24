# Project Greek God — DESIGN v3 "Simple" (binding)

**Status.** This is the binding UI spec for the simpler app. It replaces `docs/DESIGN-V2.md` ("Olympus") for every screen, token, word and piece of navigation it covers. DESIGN-V2 stays in the repo as history. When the two disagree, this file wins. On a *data* rule, `CONVENTIONS.md` wins. On *training-program content* (days, exercises, sets, reps, rest, RIR, progression rules, lighter-week and fatigue rules, Sunday ideas, the PPL → Arnold switch-over and its database work), `docs/PROGRAM-ARNOLD.md` wins. This file only designs the screens that show that content. Every program name, lift and number in this file and its mockups is an example taken from Quinton's request; build from program data, never from these strings.

**Why.** Quinton asked for an app that is "simpler", "clean and crispy" like Cal AI, in "Dark, but Cal AI clean": black and gold, big bold numbers, simple rounded cards, one crisp sans font, lots of space, one thing per card. He also asked for the Arnold split and for no volleyball anywhere.

**What was chosen.** The judge's winner, **calai** (one skeleton everywhere: title, day strip, one hero number with a ring, a trio of small cards, a plain list, four tabs and a white +). Grafted onto it: **gym**'s workout layout (number cards with steppers beside them, bottom-anchored, a rest screen whose button names what it logs, the Finish sheet, Train's list of today's lifts with targets, "N beats your best", the laurel-A icon on sign-in, a whole-week glance on Food, a soft AI tint) and **plain**'s record moment (an in-flow win card whose hero is the set he lifted, with the main action turning white), "lb each hand", a quiet "Done for today", and the first-viewport budget as a gate. Every `must_fix` and `still_complicated_anywhere` item in the judge's verdict is resolved below. Section 4 marks each one where it is fixed.

**Inputs** (scratchpad, not in the repo): `simple/proposals.json` and `simple/proposals/{calai,gym,plain}/`, `simple/verdict.json`, `simple/arnold-2.0.md` (Quinton's program request, verbatim), stills of what shipped in `ui-v2/final/`.

**Final mockups** (self-contained HTML at 390 px, dark, plus PNG renders at 390×844 @2x, `-full.png` where the page is taller, and 375×667 checks in `small/`): `/tmp/claude-0/-home-user/8aec0eae-e96d-585e-8153-9de2b16d1dbb/scratchpad/simple/final/`. Appendix A maps every mockup to its section. **Where a mockup and this text disagree, this text wins.** The mockups render Inter because Linux has no SF Pro. The iPhone renders SF Pro (§1.2).

Contents: §0 Laws · §1 Visual system · §2 Words · §3 Navigation and URLs · §4 Screens · §5 Budget and acceptance checks · §6 Stream plan and ownership · §7 Deferred · Appendix A mockups · Appendix B ownership check.

---

## 0. Laws

Restate these in every implementation prompt.

1. **Plain words.** Every label is a word a 17-year-old says out loud. No ritual words (Offering, Oracle, Inscribe, Seal, Inscription, Chronicle, Ascent, Hall, Market, Fuel, Dawn, Dusk, rites, terraces, Olympus). Sentence case. No uppercase tracked eyebrows. No exclamation marks, no emojis, no guilt.
2. **One job per screen, one thing per card.** Each screen answers one question in its first viewport. Everything else is one tap away (a row, a pill, a ⋯ menu, a sheet or a Settings page). **Nothing is deleted**: every feature, setting and record stays reachable.
3. **One sans font.** SF Pro on the iPhone, Inter elsewhere (§1.2). No serif, no italics, no display or monument faces.
4. **Gold is earned.** Gold fills only the one main action of the viewport (at most **one** `[data-gold="fill"]` per viewport). Gold outline or gold text marks only real wins: protein goal hit, a ring at its goal, a new best, a planned workout done, the goal weight reached. Never gold on tabs, headers, icons, charts, plans, the + button or decoration.
5. **No provenance tags** except the AI label. `LOG`, `PLAN`, `RULE`, `CALC` and `PROJ` leave the UI. Honesty moves into words and taps: every derived number has a visible tap affordance (a 16 px chevron) and a VoiceOver hint that opens "How we got this" (§1.4.21). Projections stay dashed and say "If you keep this pace". AI output always says "AI estimate · Not saved yet" or "AI" in the AI tint and never saves without the gold confirm.
6. **No ornaments.** No statue, laurels, meander, sundial, temple, columns, ridge, terraces, frieze, coins, marble, grain, spotlight, glow, gradients, glass or blur. The laurel-A app icon appears on the sign-in screen only.
7. **Numbers always carry plain units**: "185 g protein", "165.1 lb", "25 lb each hand", "1:24 rest", "about 45 min". Missing data shows "—" plus the next step. Never NaN, never "undefined". One exception for compact list rows (Bests, Lifts, Sessions, the Lifts sheet, summary rows): a set may read "70 × 10" and a load "25 lb" without "each hand", because the screen's hero places (NumberCard, Next card, WinCard, the exercise detail's "Best set · each hand") carry the full unit. A **rep** range always says "each side" for per-side lifts, everywhere, because it changes what the number means.
8. **Never fabricate.** Unchanged from CONVENTIONS.md: every number comes from a log, the plan, a fixed rule or arithmetic on logs.
9. **Gym first.** In a workout every control is at least 56 px tall and sits in the bottom 40% of the screen. Logging a prefilled set is one tap. No gesture is the only way to do anything.
10. **Accessible by construction.** Text meets WCAG AA. State marks meet 3:1. Targets are at least 44×44. Sizes are in rem and follow the iPhone text-size setting. Every visual has a VoiceOver name.
11. **Motion is quick and quiet.** 150–250 ms, transform and opacity (and `stroke-dashoffset` for rings) only, ease-out, never blocking input. A reduced-motion path for everything. Keep the smooth tab and push transitions that already exist.
12. **Every URL and feature keeps working** (§3.6). No redirects in `next.config.ts`; pages read their own query strings.
13. **View layer only**, except what `docs/PROGRAM-ARNOLD.md` specifies. Workout outbox and sync, idempotent food logging, the meal planner engine, reminders, export and account deletion keep their logic. Code identifiers may keep old names (`openOffering`, `dayState().next.kind === "seal"`); only user-visible text, aria labels and titles change.
14. **No volleyball anywhere** in the UI: no logging, sheets, lists, check-in questions, readiness inputs, Up next items, adherence lines, reviews, settings, onboarding, coach suggestions, icons or copy. Tables and rows stay untouched and stay in the data export.

---

## 1. Visual system

### 1.1 Colour tokens (`src/app/globals.css`, `:root`, dark only)

Foundation writes exactly this block (new names) and maps the Tailwind colours in `@theme inline` (§1.1.3).

```css
:root {
  color-scheme: dark;
  /* surfaces */
  --bg: #000000;           /* app, workout, sheet backdrop */
  --card: #141416;         /* cards, list groups */
  --card-2: #222226;       /* controls: secondary buttons, steppers, tiles, inputs, pills */
  --card-3: #2c2c31;       /* selected segment, chips on card-2, the workout bar */
  --sheet: #18181b;        /* sheet body; cards inside a sheet use --sheet-card */
  --sheet-card: #232327;
  --track: #2a2a2f;        /* ring and bar tracks (decoration only, never meaning) */
  --ui-line: #6b6b72;      /* state marks that must reach 3:1: day rings, empty check circles, outlines */
  --line: rgb(255 255 255 / 0.08); /* hairlines between rows in a group */
  --scrim: rgb(0 0 0 / 0.62);
  /* text */
  --text: #f5f5f7;
  --text-2: #a1a1a6;       /* labels, units, captions */
  --text-3: #6e6e73;       /* chevrons and decorative glyphs only, never words */
  --tab-off: #8e8e93;      /* inactive tab icon and label */
  /* gold: the one main action and real wins */
  --gold: #e9b949;
  --gold-ink: #141006;     /* text and icons on gold */
  --gold-soft: rgb(233 185 73 / 0.14); /* win-card and win-chip background */
  --gold-line: rgb(233 185 73 / 0.55); /* win-card border, protein-hit day ring (use at .75 alpha in the strip) */
  /* signals */
  --ai: #a9bef2;           /* only the sparkle, the word "AI", "AI estimate" and AI card borders */
  --ai-soft: rgb(169 190 242 / 0.12);
  --ai-line: rgb(169 190 242 / 0.38);
  --danger: #ff6b5e;       /* errors, destructive actions, pain notes. Never food, pace, misses */
  --danger-soft: rgb(255 107 94 / 0.12);
  /* type */
  --font-sans-stack: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", var(--font-inter), system-ui, sans-serif;
}
```

**Success, warning, danger.** There is no green and no amber. *Success* is a win and uses gold text or outline (`--gold`, `--gold-soft`, `--gold-line`). *Warning* is a word, not a colour: `--text` with an `Info` glyph (for example "A bit slow"). *Danger* is `--danger` text, used only for errors, destructive actions and pain.

#### 1.1.1 Contrast (measured)

| Pair | Ratio | Use |
|---|---|---|
| `--text` on bg / card / card-2 / card-3 | 19.3 / 16.9 / 14.6 / 12.8 | all body text |
| `--text-2` on bg / card / card-2 / card-3 | 8.2 / 7.2 / 6.2 / 5.4 | labels |
| `--tab-off` on bg | 6.4 | inactive tabs |
| `--text-3` on bg / card | 4.1 / 3.6 | glyphs only (3:1 non-text) |
| `--ui-line` on bg / card / card-2 | 4.0 / 3.5 / 3.0 | state marks (3:1) |
| `--gold` on bg / card / card-2 | 11.5 / 10.1 / 8.7 | win text, win rings |
| `--gold-ink` on `--gold` | 10.4 | gold button labels |
| black on `--text` (white button) | 19.3 | the inverse button |
| `--gold` on `--gold-soft` over card | 7.7 | win-card text |
| `--ai` on card / on `--ai-soft` | 9.9 / 7.9 | AI chip |
| `--danger` on bg / card | 7.5 / 6.6 | destructive text |
| gold ring at 75% alpha on bg | 6.6 | protein-hit day ring |

Any new pairing must be computed and must meet AA (text) or 3:1 (marks) before use.

#### 1.1.2 Night dimming (replaces the Seal variant)

`html[data-night="on"]` (set by `src/lib/appearance.ts` from Settings › Profile › Display: Off, 9 PM–5 AM, Always) changes only `--text: #e2e2e6` and `--gold: #d9ae48`. Every pair above still passes. There is no other variant: the workout uses the same tokens (the background is already black), and there is no glass, so the Reduce transparency setting is retired (its stored value is ignored, not deleted).

#### 1.1.3 Tailwind names (`@theme inline`)

`bg`, `card`, `card-2`, `card-3`, `sheet`, `sheet-card`, `track`, `ui-line`, `line`, `text` (as `text-fg`), `text-2` (as `fg-2`), `text-3` (as `fg-3`), `tab-off`, `gold`, `gold-ink`, `gold-soft`, `gold-line`, `ai`, `ai-soft`, `ai-line`, `danger`, `danger-soft`. Examples: `bg-card`, `text-fg-2`, `border-ui-line`, `bg-gold text-gold-ink`. Charts and SVG read `var(--…)` through `style={{ stroke: "var(--text)" }}`. Hex literals in components stay banned.

### 1.2 Type

#### 1.2.1 One family

`src/app/layout.tsx` loads exactly one Google font, as the fallback for non-Apple devices:

```ts
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-inter", display: "swap", preload: false });
// <html className={inter.variable}>
```

`body { font-family: var(--font-sans-stack) }`. On the iPhone `-apple-system` matches first, so SF Pro renders with native Dynamic Type and zero bytes; Inter (with its optical-size axis giving the display cut at large sizes) renders on desktop and in Linux screenshots. **Cormorant Garamond, Bodoni Moda and Inter Tight are removed** from `layout.tsx` in the Foundation phase (their CSS variables become aliases of the sans stack, §1.7). Every number uses `font-variant-numeric: tabular-nums` (set on `body`).

#### 1.2.2 Root and Dynamic Type

Unchanged mechanism: `html { font-size: 100% }` and, under `@supports (font: -apple-system-body)`, `html { font: -apple-system-body }` (17 px on the iPhone by default, following the text-size setting). Every size is in rem. Giant numbers are `min(rem, vw)` so they cap at large text sizes. Layout switches for large text use container queries in rem: `@container (width < 24rem)` is the **AX layout** (a 390 px phone at AX sizes measures narrower than 24rem). Short screens use `@media (max-height: 700px)` (the **short layout**).

#### 1.2.3 Scale (utility classes in `globals.css`; streams use these, never `text-[Npx]`)

Pixel values are at the iPhone's default 17 px root.

| Class | Size | Weight | Tracking / line height | Use |
|---|---|---|---|---|
| `t-gym` | `min(6.5rem, 29vw)` ≈ 110 px; short layout `min(5rem, 22vw)` ≈ 84 | 800 | −0.045em / 0.9 | workout weight and reps |
| `t-timer` | `min(5.5rem, 25vw)` ≈ 94; short `min(3.75rem, 17vw)` ≈ 64 | 800 | −0.04em / 0.9 | rest timer |
| `t-big` | `min(5.625rem, 25vw)` ≈ 96; short ≈ 80 | 800 | −0.045em / 0.95 | sheet values: weigh-in, check-in, onboarding |
| `t-hero` | `min(3.3rem, 15vw)` ≈ 56 | 800 | −0.04em / 1 | the hero number of a screen |
| `t-title` | `1.875rem` ≈ 32 | 800 | −0.025em / 1.1 | page title (one per screen) |
| `t-head` | `1.625rem` ≈ 28 | 800 | −0.02em / 1.12 | hero-card title, lift name, sheet values in cards |
| `t-num` | `1.625rem` ≈ 28 | 800 | −0.03em / 1.05 | card number |
| `t-num-s` | `1.3rem` ≈ 22 | 800 | −0.025em / 1.05 | trio and stat numbers |
| `t-sheet` | `1.4rem` ≈ 24 | 800 | −0.02em / 1.15 | sheet title |
| `t-section` | `1.175rem` ≈ 20 | 700 | −0.015em / 1.2 | section heading |
| `t-row` | `1rem` ≈ 17 | 600 | −0.01em / 1.3 | row title, card title |
| `t-body` | `1rem` | 400 | 0 / 1.4 | body text |
| `t-label` | `0.875rem` ≈ 15 | 500 | 0 / 1.35, `--text-2` | labels, row subtitles |
| `t-cap` | `max(12px, 0.775rem)` ≈ 13 | 500 | 0 / 1.3, `--text-2` | captions (the floor) |
| `t-tab` | `max(11px, 0.65rem)` ≈ 11 | 600 | 0 / 1.1 | tab labels only |
| `t-button` | `1rem` | 700 | −0.01em | buttons; the gym button is `1.125rem` ≈ 19 |
| `unit` | `0.5em` of its number | 700, `--text-2` | margin-left 3px | "g", "lb", "kcal" after a number |

No other sizes. No weight under 400. The unit is always next to its number ("185 g"), never above it.

### 1.3 Layout, spacing, radii, z-order

- **Spacing** is the 4-pt Tailwind scale in rem. **Gutter** 20 px (`px-gutter`), 16 px under 360 px wide and inside the workout dock.
- **Gaps:** 12 px between cards; 10 px inside the trio and duo; section heading 28 px above, 12 px below; card padding 20 px (hero 24/22, list rows 14–16).
- **Radii:** `rounded-card` 24 (hero and standard cards, the gym number cards); `rounded-tile-lg` 20 (trio and duo cards, list groups, list items); `rounded-field` 18 (inputs, the Add field); `rounded-tile` 14 (52 px icon tiles); `rounded-pill` 9999 (buttons, pills, chips); `rounded-sheet` 28 (sheet top corners).
- **Widths:** the phone column is full width minus gutters. From 768 px content is centred at `max-w-col` (560). From 1024 px the existing left rail shows (§3.5).
- **Targets:** 44×44 minimum everywhere (pad small visuals with `hit-44`). Workout controls 56 px or more; the gym button 64 px.
- **Z:** `--z-sticky 20 · --z-chrome 50 (tab bar, +, workout bar) · --z-sheet 60 · --z-confirm 65 · --z-toast 70` (unchanged values).
- **Safe areas:** `--safe-top`, `--safe-bottom` (unchanged). Pages pad their bottom by `--chrome-clear` = tab bar (49 px) + safe bottom + 24 px, plus 64 px while the workout bar shows.

### 1.4 Components (Foundation builds or restyles these in `src/components/ui/*`)

Each component keeps its current file and export name where one exists, so old call sites compile. New props are additive.

1. **Card** (`card.tsx`): flat `--card`, radius 24, padding 20, no border, shadow, gradient or texture. `Card` with `onClick`/`href` becomes a button with the press scale (§1.6).
2. **HeroNumberCard** (new, `hero-card.tsx`): `{ value, unit?, label, ring?: {pct, icon, goal?: boolean}, onDetails }`. Number `t-hero` left, label `t-label` under it followed by a 16 px `ChevronRight` in `--text-3`, ring 112 px (stroke 11) right. The whole card is one button that opens the Details sheet (item 21). VoiceOver: "1,413 calories to go. Shows today's numbers and how they are worked out."
3. **StatCard** (new, `stat-card.tsx`; the trio and duo): `{ value, unit, label, ring?: {pct, icon, goal}, onDetails? }`. Number `t-num-s` + unit, label `t-cap` on one line (ellipsis), optional 64 px ring (stroke 7) centred below, 12 px chevron top-right when tappable. Laid out by `<StatRow cols={3|2}>` with `grid-template-columns: repeat(n, minmax(0, 1fr))`. **AX layout and short layout:** one column, rings hidden.
4. **Ring** (`ring.tsx`, restyled): round caps, starts at 12 o'clock, `--text` progress on `--track`, one centred Lucide glyph in `--text` (no macro colours). At its goal the stroke and glyph turn `--gold` and the glyph becomes `Check`.
5. **Bar** (`progress.tsx`): 8 px (or 4 px `thin`) `--text` fill on `--track`, radius full. An optional `band={[lo, hi]}` draws the target range as a `#3a3a40` segment under the fill (Sets by muscle).
6. **DayStrip** (new, `day-strip.tsx`): 7 columns for **the current Monday–Sunday week** on every screen that shows one (Today, Train, Food, Check-ins). Swipe or the VoiceOver actions "Previous week" / "Next week" move by a week. Each column is a button with a hit area of at least 44 wide × 56 tall: weekday letter (`t-cap` 600), a 38 px date circle (15/700), and below it either a 5 px mark row or a `t-cap` label (Train: the workout's `abbr`, "Arms"). States: **selected** white fill, black number; **today, not selected** a 4 px white dot above the circle; **logged** 1.5 px `--ui-line` ring; **missed** (a planned workout not done, past) 1.5 px dashed `--ui-line`; **win** (Today/Food: protein goal hit; Train: the planned workout done) 1.5 px gold ring at 75% alpha **plus** a 5 px gold dot under the circle (Today/Food) or a gold label (Train), so the win never depends on colour alone; **future** `--text-3` number, no ring. Future days are inert (`aria-disabled`) on Today and Check-ins, and selectable on Train and Food (to see the plan). VoiceOver per column: "Thursday 22 October, today, protein goal hit" / "Friday 23, Chest and Back B, planned". The strip is one `data-budget-group` (§5.1).
7. **UpNextCard** (new, `up-next.tsx`): caption "Up next", a 52 px tile with a glyph, title `t-row` (max 2 lines, ellipsis; VoiceOver reads it whole), subtitle `t-label` 14 px (1 line), and one button: `sm` (44 px) on the right, or full width below the text when `stack` is set (used when the button label is longer than "Start"). It is the place for the Day Engine's next action (§4.1.2). Never blank.
8. **ListGroup / Row** (restyle `placard.tsx` into `list.tsx`; `Placard` and `PlacardRow` stay as wrappers): a `--card` group, radius 20, rows at least 56 px (68 px with a subtitle) separated by `--line` hairlines; a row is `[icon tile 32] title (+ subtitle) [value in --text-2] [chevron]`. **ListItem** is the standalone 76 px card row with a 52 px tile (meals, eaten food).
9. **CheckCircle** (new): 44 px. `done` white fill with a black check (VoiceOver "Eaten, undo"); `next` gold fill with `--gold-ink` check (it is the screen's gold fill, `data-gold="fill"`); `todo` 2 px `--ui-line` ring.
10. **Button** (`button.tsx`): variants `primary` (gold fill, `--gold-ink`, sets `data-gold="fill"`), `inverse` (white fill, black text; the main action while a win card shows), `secondary` (`--card-2`), `ghost` (text only), `destructive` (`--danger` text), `link`. Sizes `sm` 44, `md` 52, `lg` 56, `xl` 64 (gym). Radius full, label `t-button`, sentence case, never uppercase. Old variants alias: `outline` → secondary, `outline-gold` → secondary, `destructive-solid` → destructive. `shine` is ignored.
11. **Pill** (header accessory) 36 px `--card-2`, 15/600. **Chip** 30 px (44 px hit), `--card-2`; `win` = `--gold-soft` + gold text; `ai` = `--ai-soft` + `--ai`; `outline` = 1.5 px `--ui-line`. Selected chip = `--text` fill, black text (never gold).
12. **Segmented** (`controls.tsx`): 44 px, `--card` track, selected `--card-3` + `--text`, others `--text-2`. Used only on Progress (Weight · Strength · Body), Train › Lifts (Lifts · History) and the scanner (Photo · Barcode).
13. **Switch**: 51×31, off `--card-3`, on `--text` with a black knob. **RadioRow**: a row with a 24 px circle (selected = white fill + black check).
14. **Field / Input / Textarea / Select** (`field.tsx`): 56 px, radius 18, `--card` (`--sheet-card` in sheets), 17 px text (never under 16 px), placeholder `--text-2`, focus ring 2 px `--text`.
15. **BigValue** (new, `big-value.tsx`): a centred `t-big` number with its unit and a caption, plus a `StepperPair` of two 64 px secondary buttons ("−0.1" / "+0.1", "−15 min" / "+15 min"). The number is a `spinbutton` (arrow keys and VoiceOver increment/decrement); tapping it opens the keypad. Used by the weigh-in and check-in sheets and onboarding.
16. **NumberCard** (new, `number-card.tsx`, the gym control): a `--card` radius-24 card, number `t-gym` + unit (`t-label` 18/700, `white-space: nowrap`, wraps under the number only if it cannot fit), an optional 15 px note under it ("17 beats your best"), and two 60 px round `--card-2` buttons stacked on the right (+ on top, − below; 56 px in the short layout). `role="group"` named "Weight, 25 pounds each hand"; the number is a `spinbutton`; tapping it opens the keypad sheet. Hold-to-repeat on ± is kept.
17. **Sheet / Confirm** (`sheet.tsx`, vaul, APIs unchanged incl. `clearStickyFooter`, `keepOpenForToasts`): `--sheet` body, top radius 28, a 36×5 grabber, title `t-sheet` + a 44 px close button, `--scrim` backdrop. Cards inside use `--sheet-card`. A sheet is its own viewport for the gold rule.
18. **Toast** (sonner, `providers.tsx`): `--card-2`, radius 16, 15/500 text, action in `--text` 600 ("Undo"), never gold, top of screen under the header; in the workout it sits under the top bar (it never covers ⌄ or Finish: offset 56 px + safe top).
19. **AiChip / AiCard** (`estimate-card.tsx` restyled, `ai-chip.tsx` new): chip = `Sparkle` 14 px + "AI estimate" or "AI" in `--ai` on `--ai-soft`, followed by "Not saved yet" in `--text-2` while unsaved. The card is `--card` with a 1 px `--ai-line` border so an unsaved estimate can never look like a logged row. A saved diary row keeps a small "AI" mark (sparkle + "AI" in `--ai`, `t-cap`) next to its time.
20. **WinCard** (new, `win-card.tsx`; replaces `RecordMark` on screens): `--gold-soft` fill, 1.5 px `--gold-line` border, radius 24; a `Trophy` 20 px + "New best" in gold 700; the set he lifted as the hero ("25 lb × 17", `t-hero` 52–64 px, gold); one plain sentence in `--text` ("Most reps you've done at 25 lb each hand."); the lift name `t-cap`. `role="status"`, `aria-live="polite"`. It is a win mark, not a fill.
21. **DetailsSheet** ("How we got this", new, `details-sheet.tsx`): `{ title, rows: {label, value, detail?}[], note?, how: string }`. Every derived number opens one. The "How we got this" paragraph names the inputs and the rule in plain words. This is where provenance lives now.
22. **SuggestionRow** (new, `suggestion-row.tsx`): a calm `--card` row with a 44 px tile and a neutral glyph (`Moon`, `Activity`, `Info`), title `t-row`, one-line reason `t-label`, chevron. Never gold, never red. Opens a sheet with options (RadioRows), a gold "Use for today"/"Start…" and a ghost "Not now".
23. **TabBar, PlusButton, WorkoutBar, PageHeader, BackHeader** live in `shell/*` (§3).
24. **Skeleton / Empty / ErrorNote** (`misc.tsx`): Skeleton = `--card` blocks in the final layout's shapes, a 1.2 s opacity pulse (none under reduced motion). Empty = a `--card` with one `t-row` line and one `t-label` next step, centred, no art ("Nothing yet today" / "Tap + to add food"). ErrorNote = a `--card` with "Couldn't load this." and a secondary "Try again", text `--text` (not red unless something was lost).

### 1.5 Icons

Lucide outline only, stroke 1.9 (2.2 at 16 px), `currentColor`, `aria-hidden` unless labelled: 24 px in tabs and tiles, 20 px in rows, 16 px inline. Verified names (lucide-react 1.57): `House`, `Dumbbell`, `Utensils`, `ChartLine`, `Plus`, `Minus`, `ChevronLeft/Right/Down/Up`, `Ellipsis`, `X`, `Check`, `Flame`, `Drumstick`, `Wheat`, `Droplet`, `GlassWater`, `Scale`, `ScanBarcode`, `ScanLine`, `Search`, `Camera`, `Image`, `Sparkle`, `MessageCircle`, `Trophy`, `Moon`, `Bed`, `Footprints`, `Activity`, `Clock`, `Timer`, `Bell`, `User`, `Target`, `Download`, `LogOut`, `ShoppingCart`, `ListChecks`, `Repeat`, `Info`, `CalendarDays`, `GripVertical`, `SlidersHorizontal`, `Ruler`, `NotebookPen`, `RotateCcw`, `CookingPot`, `Shield`, `KeyRound`, `Lock`, `Layers`, `Undo2`. Food rows use the existing per-recipe `RecipeGlyph` drawn in `--text` on a 52 px `--card-2` tile. Every custom icon in `art/icons.tsx` (NowSunrise, TrainColumn, FuelAmphora, AscentPeak, OfferingPlus, OracleSparkles, LaurelSprig, **Volleyball**, PlateStackIcon, TempleGlyph, SealTick, CoinMissed, Moon) is retired (§1.7). `Trophy` is the only win glyph.

### 1.6 Motion

- Tokens stay in `src/lib/motion.ts` and CSS vars; only these are used by V3 screens: `press` 90 ms, `fast` 160 ms, `base` 220 ms, `route` 200 ms, `sheet` (vaul's own 400 ms curve), `ring` 600 ms (a ring filling to a new value), easing `--ease-out` `cubic-bezier(.22,1,.36,1)`. The `gild`, `inscribe`, `count` and `lift` tokens become aliases of `base` (and are deleted at integration).
- **Press:** cards scale .98, buttons .97, 90 ms, spring release (existing `press`, `press-soft`). **Route:** the existing tab crossfade and push/pop slide (`data-nav`), 200 ms; a second navigation within 400 ms is instant; no route transition inside the workout.
- **Rings and bars** fill with `stroke-dashoffset` / `scaleX` over 600 ms ease-out on first paint and on change. **Numbers change instantly** (no count-up, no digit roll). **Log set:** the set dot fills (scale .6 → 1, 160 ms) and the screen swaps to rest with a 160 ms crossfade. **Win card:** fades and rises 8 px in 220 ms; after 8 s or the next tap it collapses (200 ms) into the "New best" label on the set row. **Sheets:** vaul. **Toasts:** 200 ms slide down.
- **Reduced motion** (system setting or Settings › Display › Motion = Reduce, read by `prefersReducedMotion()`): every transition becomes a 150 ms opacity fade or instant; rings draw at their final value; the rest ring still drains (it carries information, class `motion-keep`).
- No confetti, no shimmer, no sheen, no idle loops, no parallax. One success haptic is not possible in an iOS PWA and is not attempted.

### 1.7 Retiring Olympus without breaking the build

Foundation does this in its first commit (**F1**) so every old screen compiles, re-themes and loses its ornaments at once, before any screen stream starts:

1. **Token aliases.** Every Olympus variable keeps its name and points at a V3 value, so old classes (`bg-m2`, `text-ivory`, `text-stone`, `bg-s3`, `text-fg-2`, `border-vein-2`, `text-leaf-300`, `bg-aegean-tint`, `text-cinnabar` …) re-theme. Names that V3 reuses with the same meaning (`--bg`, `--line`, `--track`, `--text-2`, `--danger`) simply take the V3 value. Old **tertiary text was words** (eyebrows, meta), so the Tailwind aliases `fg-3`, `ash` and `stone` point at `--text-2`, never at V3's glyph-only `--text-3` (4.1:1 would fail AA for words):

| Old | Becomes |
|---|---|
| `--night`, `--obsidian`, `--bg-deep` | `--bg` |
| `--m1`, `--surface-1` | `--sheet` |
| `--m2`, `--surface-2` | `--card` |
| `--m3`, `--surface-3` | `--card-2` |
| `--m4`, `--m5`, `--surface-4`, `--surface-5` | `--card-3` |
| `--vein`, `--vein-2`, `--line-hair`, `--line` (old meaning) | `--line` |
| `--vein-3`, `--line-strong`, `--line-field`, `--ui-line` (old) | `--ui-line` |
| `--ivory`, `--text-1` | `--text` |
| `--stone`, `--ash`, and the Tailwind colours `fg-2`, `fg-3`, `stone`, `ash` | `--text-2` (`--text-3` itself is redefined to the V3 glyph colour) |
| `--disabled`, `--text-disabled` | `--text-3` |
| `--ink` | `--gold-ink` |
| `--leaf-50…--leaf-800`, `--gold-50…900`, `--success`, `--series-protein`, `--s-gold` | `--gold` |
| `--leaf-tint`, `--gold-tint`, `--success-tint` | `--gold-soft` |
| `--leaf-line`, `--line-gold` | `--gold-line` |
| `--leaf`, `--leaf-v`, `--leaf-h`, `--leaf-btn`, `--leaf-text`, `--grad-*` | `var(--gold)` (flat; gradients die) |
| `--leaf-spec`, `--glow`, `--glow-cta`, `--spot*`, `--e1`, `--e2`, `--e3` | `none` / `transparent` |
| `--aegean*`, `--lapis*`, `--info` | `--ai*` |
| `--cinnabar*`, `--danger` (old) | `--danger*` |
| `--warning`, `--series-sleep`, `--series-kcal`, `--s-marble`, `--proj` | `--text-2` (`--proj` = `--text-2`) |
| `--series-carbs`, `--series-fat`, `--series-water`, `--s-*` | `--text` (no macro colours) |
| `--corridor` | `rgb(255 255 255 / .05)` |
| `--glass-bg` | `--card-3`; `--glass-filter: none` |
| `--font-voice-stack`, `--font-voice-italic-stack`, `--font-monument-stack`, `--font-serif`, `--font-num`, `--font-cormorant`, `--font-bodoni`, `--font-inter-tight` | `var(--font-sans-stack)` |

2. **Type aliases.** Old utilities keep compiling and render in the V3 scale: `t-monument` → `t-big`; `t-dial` → `t-hero`; `t-title-1`, `t-h1`, `t-title` → `t-title`; `t-title-2`, `t-h2`, `t-card` → `t-section`; `t-verdict` → `t-section` (no italic); `t-film` → `t-section` (no uppercase, no tracking); `t-title-3`, `t-h3` → `t-row`; `t-num-l` → `t-num`; `t-num-m` → `t-num-s`; `t-num-s` (old) keeps 17/600; `t-callout` → `t-label`; `t-meta` → `t-cap`; **`t-eyebrow`, `eyebrow`, `t-tag`, `t-key`, `t-plaque` → `t-cap` with `text-transform: none; letter-spacing: 0`**; `t-hero` (old Pantheon) → `t-hero`; `num-*` → `t-num`/`t-num-s`; `font-voice`, `font-monument`, `font-serif`, `font-num` → the sans stack; italics off.
3. **Material aliases.** `card-monument`, `monument`, `card-instrument`, `card-accent`, `card-inset`, `slab` → the V3 card; `glass`, `chrome` → opaque `--card-3` / `--bg`; `leaf`, `leaf-btn` → flat `--gold` (still counted by gold-audit through `data-gold`); `grain`, `spotlight`, `spot-in`, `sheen`, `flash-gold`, `pulse-soft`, `hatch` (except in Bar bands) → no-op. `seal-in`, `turn-in`, `rise`, `swap-in` keep their 160–220 ms behaviour.
4. **Ornaments neutralised centrally.** These components keep their exports and props but render `null` from F1: `art/Statue`, `art/Laurel`, `art/Ridge`, `art/Terrace`, `art/Motifs` (Meander, Laurel, LaurelBullet, ColumnFluted, Plinth, Pediment, EmptyArt), `art/Mark` (except as the sign-in icon wrapper, below), `signature/Colonnade`, `signature/GildedBust`, `signature/AscentFrieze`, `ui/coin` (renders a plain 28 px CheckCircle-style mark so Food's old mosaic stays readable until Food replaces it), `ui/record-mark` (renders the text "New best" in gold, `t-cap` 600). `art/Sundial` renders a plain `Ring` (white on track, no ticks), `art/PlateStack` renders the plain "Plates on each side" chip row (§4.2.7). `art/icons.tsx` exports map to Lucide: NowSunrise → House, TrainColumn → Dumbbell, FuelAmphora → Utensils, AscentPeak → ChartLine, OfferingPlus → Plus, OracleSparkles → MessageCircle, LaurelSprig/SealTick → Check, TempleGlyph → CalendarDays, PlateStackIcon → Layers, CoinMissed → Circle, Moon → Moon, **Volleyball → renders null** (and every caller is removed by its owner).
5. **The Tag.** `ui/tag.tsx` keeps its API. `kind` `LOG | PLAN | RULE | CALC | PROJ` renders **nothing** (if `explain` is set it renders a 44 px `Info` icon button that opens a DetailsSheet with the explanation, so honesty is not lost before the owning stream adds its own "How we got this"). `kind="AI"` renders the AiChip. Old badges (`LoggedBadge`, `PlanBadge`, `SuggestedBadge` with RULE, `OptionalBadge`, `AutoBadge`) render nothing; `EstimateBadge` and `SuggestedBadge kind="AI"` render the AiChip; `PRBadge` renders RecordMark's text; `SourceBadge` and `DatabaseBadge` stay as small source chips; `FirstBenchmarkBadge` renders "First time".
6. **Removed at integration** (§6.7), once a grep finds no caller: every alias above, the neutralised components and their files (`art/**` except the sign-in icon, `signature/**`, `ui/tag.tsx`, `ui/coin.tsx`, `ui/seal-key.tsx`, `ui/hold-button.tsx`, `ui/meter.tsx`, `ui/placard.tsx`, `ui/record-mark.tsx`), the statue and texture files in `public/art/` (keep `CREDITS.md` only if a credited asset is still shown), and the `data-phase`, `data-mode="gym"` and `data-transparency` attributes.

---

## 2. Words

### 2.1 Copy rules

- Write what a 17-year-old says out loud. Short, declarative, numbers first. "1,413 calories to go", not "Remaining energy budget".
- Units always: "g", "lb", "kcal", "min", "L". Dumbbell and other per-hand lifts say **"lb each hand"** (`perHand` in the library); per-side reps say "each side". Times are "4:30 PM" (12-hour, as now) and rest is "1:24".
- A bulk is a target to reach: **"to go"**, never "left" or "remaining" for calories and protein. Over target is **"+120 over"** in `--text`, never red.
- Misses are quiet: "Not done", "Missed · Move it", never "failed" or "skipped" in red.
- No ritual words, no tags, no roman numerals, no "Day 36 of the climb", no "Book II". Months are "September", weeks are "This week · Mon 19 – Sun 25".
- Program names come from template data and are never hardcoded in components. Strips use `abbr` ("Arms"), tight places use `short` ("Shoulders & Arms B"), everything else the full `name` (§6.3).
- A button names its result: "Log set 3", "Add as dinner", "Finish workout", "Start light week".
- Toasts: one line, past tense, with Undo where the action can be undone: "Set 3 logged · 25 × 17", "Berry Protein Smoothie eaten", "Weight saved · 164.8 lb".

### 2.2 Map (old → new), every user-visible place

| Old | New |
|---|---|
| Now (tab, page title "Now") | **Today** |
| Train (tab, page title "Training") | **Train** |
| Fuel (tab, titles "Fuel", "Fuel · Week") | **Food** |
| Ascent (tab, "Progress" title) | **Progress** |
| Offering, + sheet, "Log or ask", Log mode | **Add** (aria "Add") |
| Oracle, "Ask the Oracle", ✦, Ask mode, Food Coach, "Food coach" title | **Coach**, "Ask coach" |
| "What the Oracle can see", Settings › Oracle | **Coach data** ("What the AI can read") |
| "The Oracle isn't connected" / "needs an AI key on the server" | "Coach isn't set up yet. It needs an AI key on the server." |
| Inscribe (save weigh-in) | **Save** |
| THE SCALE, Dawn scale | **Weigh in** |
| 7-day trend, trend weight | **7-day average** |
| Dawn check-in, "Three questions, then the scale" | **Check-in**, "3 quick questions" |
| Dawn / Fuel / Train / Refuel / Dusk / Seal (phase rail and labels) | not shown; the one card is **Up next** |
| Seal the day, "Close the day", "The day, sealed.", "Seal · the day in summary" | **Done for today** (button), **Day done** (card), "Close Thursday" after midnight |
| Rites, AUTO rite, "rites kept", "Rites by month" | **Habits**, "ticks itself", "habits done", "Habits by month" |
| corridor, "a little under your corridor", "On pace for Olympus." | **On track** / **A bit slow** / **A bit fast** |
| Olympus, Summit, "Where is the summit?" | **Goal (180–185 lb)**, "Where is my goal?" |
| The climb, "% of the climb", gilding, statue lines | "**10% of the way**" (progress bar); statue lines removed |
| Terraces I–VII, Terrace moment | **Milestones** (165, 170, 175 lb…) |
| Mountain / Hall / Gallery | **Weight / Strength / Body** |
| "The Hall is waiting" | "No bests yet. Log a workout to start." |
| Chronicle, Book, "Book sealed", "being written", "Read the full ledger" | **Monthly recap**, "September recap", "Ready Sun 1 Nov", "So far", "Print or save" |
| Recovery ledger, "Recovery & Habits" title | **Check-ins** |
| Market, "Fuel · Market" | **Grocery list** |
| "The week's table", "Fuel · the planner" | **This week**, "Meal plan" |
| BRK / LUN / SNK 1 / DIN / SNK 2 | Breakfast / Lunch / Snack / Dinner |
| Coins, "planned", mosaic | rows with check circles |
| Raised, "0/6 RAISED", temple, colonnade | **Workouts** ("3 of 6 workouts") |
| BEGIN, "Begin Push A" | **Start workout** (Train), **Start** (Up next) |
| Gym Mode, Lights Out | Workout; **Minimise** (⌄) |
| Live slot | **Workout bar** |
| Seal set, "Seal set 3 · 180 × 6" | **Log set 3** |
| "Rest starts when you seal" | "Rest starts when you log a set" |
| Seal session, "Hold to seal", "Seal Push A?", "Unlogged sets are dropped when you seal" | **Finish workout**, "Finish Shoulders, Biceps & Triceps B?", "2 sets are not logged. They will be dropped." |
| Session sealed, The Inscription | **Workout done** |
| e1RM, "Best e1RM" | **Est. max** (secondary line only) |
| TOP, top set | **Best set** |
| Record, PR, "NEW RECORD", Gold-Leaf Record | **New best** |
| Records (Hall) | **Bests** |
| FIRST BENCHMARK | **First time** |
| Record carrot "8 reps sets a record" | "**9 beats your best**" |
| RIR, "Target RIR" | "Leave 1–2 reps in the tank" (How to), "**Left in the tank?**" (input), "Reps in the tank" (editor label) |
| Matched / beat last / below last | **Same** / **+1 rep** / **−1 rep** |
| Per side, PER SIDE | **Plates on each side** |
| Deload, deload week, "The deload window is reached", "Switch to a deload week?" | **Light week** ("**Light week suggested**", gold "Start light week") |
| Intro volume (training mode) | **Fewer sets** (Program › How hard: "Fewer sets · One set fewer on most lifts, same weights"). One name for the mode, because the same mode serves the first weeks and a mid-program lighter week. Onboarding's switch reads "**Start lighter**" (it sets the same mode). PROGRAM's `lighter` advice reads "**Fewer sets this week?**" / "Use fewer sets"; its first-week ease-in reads "**Ease into the new split?**" / "Use fewer sets"; toast "Fewer sets on · Undo" |
| Fatigue (check-in detail) | **Tiredness** ("How tired is your whole body?"; reasons read "Tiredness 4 of 5 …") |
| `standard` return advice ("Back to the full program?") | "**Back to the full plan?**" / "Back to normal" |
| Standard (training mode) | **Normal** |
| Hard sets this week · zones | **Sets by muscle** |
| Readiness, "Ready to push", readiness call | Check-in result: **Ready** / **Go lighter** |
| LOG, PLAN, RULE, CALC, PROJ tags | removed; "How we got this" |
| PROJ line, projection fan | "**If you keep this pace**" (dashed line label) |
| AI · ESTIMATE · NOT SAVED YET | **AI estimate · Not saved yet** |
| Proposed · not saved, Apply… | **Suggested change · Not saved**, **Review** |
| Eat as planned, EATEN | **Eaten** |
| Calories left, Protein left | **Calories to go**, **Protein to go**; "Protein done" at goal; "+120 over" |
| Push · Pull · Legs (program name), "Push, pull, legs" | **Arnold split** (default) / **Push/Pull/Legs** (alternative), always rendered from `PROGRAMS[id].name`, never typed in a component (CR-2 makes `programLabel()` return the same string) |
| Push A … Legs B (on Today, Train, Food, Add, workout start, coach suggestions) | the active program's names from template data ("Shoulders, Biceps & Triceps A" …). Past sessions keep their stored names. |
| Volleyball, "Log volleyball", "Lighter legs", "volleyball per week", "Volleyball today?", "volleyball load", Jumps & sprints, Athletic, vertical, broad jump, sprint | **removed** from the UI |
| The Oath, "Hold to begin the ascent", "The climber", "The summit" | **Get started**, **Start**, plain question titles |
| "The Ascent", "Sign in to keep climbing", "PROJECT GREEK GOD / THE ASCENT" | "Project Greek God", "Sign in to keep going." |
| Week 6 of 46, Day 36 (headers) | removed from headers; "286 days to go" lives in Progress › Weight details |
| "Volume −1% vs last Push A" | Summary ⋯ › Details: "Total lifted: 1% less than last time" |
| Art credits row | removed while no credited art is shown |

**Page titles** (`metadata.title`): `/` "Today" · `/training` "Train" · `/workout/*` "Workout" · `/nutrition` and `/nutrition/meals` "Food" · `/nutrition/meals/grocery` "Grocery list" · recipe pages the recipe name · `/nutrition/meals/preferences` "Meal preferences" · `/nutrition/scan` "Scan food" · `/nutrition/coach` and `/coach` "Coach" · `/progress` "Progress" · `/reviews` "Monthly recap" · `/reviews/[month]` "September recap" · `/recovery` "Check-ins" · `/settings` "Settings" · `/onboarding` "Get started" · `/sign-in` "Sign in". Root description (layout.tsx): "Training, food and progress in one place."

### 2.3 Lib copy edits (done by the file's owner in its first commit)

User-visible strings that live in `src/lib`. Every `src/lib` file belongs to PROGRAM (the files listed in PROGRAM-ARNOLD.md §7.1) or to FOUNDATION (everything else), so the owner is fixed:

- **FOUNDATION:** `progress/pace.ts` verdict sentences ("On pace for Olympus." → "On track.", "at the top of your corridor" → "a bit fast", "under your corridor" → "a bit slow"), `today/ascent.ts` ("Under / Top of / Faster than your corridor" → "A bit slow / On track / A bit fast"), `progress/ascent-copy.ts`, `reviews/chronicle.ts` ("The Chronicle · 1 Nov" → "Ready Sun 1 Nov", "being written" → "So far", terrace sentences → milestone sentences), `recovery/heatmap.ts` ("N of M rites kept" → "N of M habits done", "no rites" → "no habits"), `bodyweight.ts` ("Fuel check" → "Food check"), `fuel/consequence.ts` (doc only), `coach/apply.ts` effects text ("The water meter on Fuel and the water rite on Now" → "Your water goal on Today"), `appearance.ts` (§1.1.2).
- **PROGRAM** (CR-3, filed with this spec): `now/day-engine.ts` chip "Dawn · N left" → "Check-in · N left"; `today/now.ts` "{label} sealed" → "{label} done"; `today/daily-line.ts` "Fuel both" → "Eat for both" (its volleyball lines are deleted by PROGRAM anyway); `onboarding/plan.ts` step labels ("The climber" → "About you", "The summit" → "Goal", "The training" → "Training", "The fuel" → "Food", "The oath" → "Done"); `recovery/guidance.ts` ("Refuel tonight" → "Eat well tonight"); every volleyball string in its files.

A stream that finds another lib string with a banned word files a change request (§6.4); it never edits the lib file.

---

## 3. Navigation

### 3.1 Tab bar and +

- **Tab bar** (`shell/TabBar.tsx`, replaces `Capsule.tsx`; `Capsule` stays as a re-export until integration): opaque `--bg`, a 1 px `--line` hairline on top, 49 px + safe bottom (86 px on a notched iPhone). Four tabs, each an icon (24 px) over a `t-tab` label: **Today** (`House`, `/`), **Train** (`Dumbbell`, `/training`), **Food** (`Utensils`, `/nutrition`), **Progress** (`ChartLine`, `/progress`). Active = `--text`, inactive = `--tab-off`. No pill, no gold, no blur, no shrink on scroll. Tapping the active tab scrolls to top. At AX sizes the labels stay (max 13 px) and the bar grows; icons stay 24 px.
- **+** (`shell/PlusButton.tsx`, replaces `OfferingButton.tsx`): a 58 px **white** circle with a black 28 px `Plus` (stroke 2.6), at the right end of the bar, rising 14 px above it. VoiceOver "Add". It opens the Add sheet (§4.7) through the existing `openOffering({ mode: "log" })` store.
- Hidden on focus routes: the workout, onboarding, cooking mode, the scanner, sign-in (`isFocusRoute`, `hidesCapsule` unchanged in meaning). Hidden while the keyboard is open.

### 3.2 Headers

Each tab page starts with **PageHeader**: the `t-title` on the left and **at most one** accessory on the right: Today → the avatar (40 px `--card-2` circle with the display-name initial, never the email's; opens `/settings`); Train → "Program" pill; Food → "Grocery list" pill (`ShoppingCart`); Progress → nothing. The ✦ Oracle button and the TabHeader eyebrow are removed from every header. Pushed pages use **BackHeader**: "‹ {parent}" (44 px) on the left, an optional ⋯ or one icon on the right, then the `t-title`. The sticky top bar shows the title once it scrolls under (existing `useScrolledPageTitle`, opaque `--bg`, no blur).

### 3.3 Workout bar

While a workout is live and the route is not the workout (`hidesLiveSlot` unchanged), a 56 px `--card-3` bar (radius 18, 12 px side insets) sits 8 px above the tab bar: a 44 px tile with `Dumbbell`, the workout name (one line, ellipsis), then "Rest 1:12" (ticking, tabular) or "Set 4 of 19", and a chevron. **Truncation order** when space runs out: drop the set first, then the rest, then shorten the name. It has no log button. Tap → back to the workout. It steps aside while Today's Up next "Return" card is on screen (`[data-today-resume]`, existing). VoiceOver: "Back to Shoulders, Biceps and Triceps B. Rest 1 minute 12." Mockup: `workout-bar.png`.

### 3.4 Focus routes

The workout (`/workout/[id]`), cooking mode, the scanner, onboarding and sign-in have no tab bar and no +. Each has its own way out in the top-left (⌄ minimise or ✕ close or ‹ back).

### 3.5 Desktop (≥ 1024 px)

The existing left rail stays, restyled: Today, Train, Food, Progress, a divider, then Add (white +), Coach, Settings. Content is centred at 560 px. No new layouts are designed for desktop; every screen is the phone column.

### 3.6 Where every secondary thing lives

| Thing | Home | How he gets there |
|---|---|---|
| Today's numbers in detail, "If you eat what is planned", How we got this | Details sheet | tap the hero or any trio card on Today |
| Check-in (sleep, energy, soreness; tiredness, stress, sleep quality, pain on the last screen) | Check-in sheet | Today's Up next in the morning; + is not needed; `/?dawn=1`, `/recovery?checkin=1` |
| Weigh-in | Weigh-in sheet | Up next; + › Weigh in; Progress › Log weight; `/progress?log=1` |
| Water | Today below the fold (row with +250 ml; long-press for +500 / custom) | + › Water |
| Habits (tick today) | Habits sheet | Today below the fold › Habits row |
| Check-in history, sleep, habits editor, water history, weekly review | `/recovery` (Check-ins) | Today › "Checked in" row; Settings › Day schedule › Check-ins |
| Program choice, week order, fewer sets / light week, usual training time | Train › Program (`/training?tab=program`) | Train header pill; Settings › Workout › Program |
| Muscle volume | Train › Sets by muscle (`/training?tab=volume`) | Train row |
| All lifts, history, exercise detail | Train › Lifts (`?tab=lifts`, `&view=history`) · `/training/exercise/[slug]` | Train row; a lift row; workout ⋯ › History |
| Workout editor | `/training/program/[key]` | Program › a day |
| Light week, fewer sets, back to normal, ease-in, carried swap, volume tips | One SuggestionRow on Train (one at a time, priority §4.3.1) → its sheet (§4.3.4) | Train |
| Today-only options: fatigue overlap before the start, check-in "go lighter", rest today (shift or skip) | **Options for today** sheet (§4.3.4) | a line in Train's hero; Today's Up next subtitle; never blocks Start |
| Fatigue overlap during a workout | the in-workout tip card (§4.2.15) | appears by itself after set 2 of a watched lift |
| Program rules, a day's training notes, warm-up steps | "How the plan works" sheet (Program); "Notes for this day" (workout editor); "Notes for today" (workout Lifts sheet); "Warm-up" row (workout start) | Program; editor; workout |
| Sunday recovery ideas | Train hero on a rest day; Today's Up next on a rest day | Train / Today |
| A day's plan (any date), move or rest a date | Day sheet (`/training?day=YYYY-MM-DD`) | Train strip |
| Meal plan for any day, whole-week glance, plan this week again (keeps locked meals), plan next week | Food (`/nutrition`, `?date=`, `?tab=week`) | Food strip, "This week" rows, the group under them |
| One planned meal's actions: swap for another (meal regeneration), eaten but changed, lock, move to another day, repeat on another day, remove from plan, not this again | the recipe's ⋯ when opened from a planned meal (§4.4.3) | tap a planned meal row → ⋯ |
| Grocery list; update it from the plan; this week's grocery budget | `/nutrition/meals/grocery` (⋯: "Update from the plan", "Budget") | Food header pill |
| Meal preferences | `/nutrition/meals/preferences` | Food › This week › Meal preferences; Settings › Your data |
| Recipe, cooking mode | `/nutrition/meals/recipe/[key]`, `/cook/[key]` | any meal row |
| Search, recent, saved, manual food | panels inside the Add sheet | + › Search food (`/nutrition?add=1&tab=search…`) |
| Photo and barcode scanning | `/nutrition/scan` | + › Scan food; the camera button in the Add field |
| Coach chats and history | `/coach` | + › Ask coach; clock icon on Coach |
| Weight chart, milestones, all weigh-ins | Progress › Weight | tab |
| Bests and strength | Progress › Strength | tab |
| Photos, measurements | Progress › Body | tab |
| Monthly recap | `/reviews`, `/reviews/[month]` | Progress › Weight › Monthly recap; Today below the fold on days 1–3 |
| Every setting | Settings index → 8 pages | avatar on Today |

### 3.7 Every existing URL → where it lands

No Next.js redirects; each page reads its own params. Owner in brackets.

| URL | Lands on |
|---|---|
| `/` | Today [TODAY] |
| `/?dawn=1` | Today with the check-in sheet open [TODAY] |
| `/training` | Train week view [TRAIN] |
| `/training?tab=week` | Train week view |
| `/training?tab=program` | Train › Program |
| `/training?tab=lifts` (`&view=library\|history`), `?tab=history`, `?tab=exercises` | Train › Lifts (Lifts or History segment) |
| `/training?tab=volume` (new) | Train › Sets by muscle |
| `/training?day=YYYY-MM-DD` | Train with that day's sheet open |
| `/training/exercise/[slug]` | Exercise detail |
| `/training/program/[key]` | Workout editor |
| `/workout/start`, `/workout/start?t=<key>` | starts or resumes, then the workout [WORKOUT] |
| `/workout/start?t=push_a` (a key of the inactive program, e.g. an old reminder) | starts today's planned workout (`startTarget()`, PROGRAM §2.5), no error |
| `/workout/[id]` | the workout (live) or its summary (done) |
| `/nutrition`, `?date=YYYY-MM-DD`, `?tab=today` | Food with that day selected [FOOD] |
| `/nutrition?tab=week` (`&week=next`) | Food scrolled to "This week" (next week selected) |
| `/nutrition?tab=market` | Grocery list |
| `/nutrition?add=1` (`&meal=`, `&tab=search\|recent\|saved\|manual`) | Food with the Add sheet open (slot preselected, panel open) |
| `/nutrition/meals` (`?week=next`, `?day=`, `?generate=1`) | Food (that day; `generate=1` opens the plan-week confirm) |
| `/nutrition/meals/grocery` (`?week=`) | Grocery list |
| `/nutrition/meals/recipe/[key]` (`?meal=`, `?servings=`) | Recipe (that planned meal's actions in ⋯; the servings stepper starts at `servings`) |
| `/nutrition/meals/cook/[key]` (`?meal=`, `?servings=`) | Cooking mode |
| `/nutrition/meals/preferences` | Meal preferences |
| `/nutrition/scan` | Scanner |
| `/nutrition/coach` (`?c=`) | Coach with food context (thread `c`) [SHEETS] |
| `/coach` (`?c=`, `?q=`) | Coach [SHEETS] |
| `/progress`, `?tab=weight\|mountain\|roadmap` | Progress › Weight [PROGRESS] |
| `/progress?tab=strength\|hall\|athletic` | Progress › Strength (`athletic` lands on Strength, no error) |
| `/progress?tab=body\|photos\|gallery` | Progress › Body (photos scrolled to) |
| `/progress?log=1`, `?tab=weight&log=1` | Weight with the weigh-in sheet open |
| `/reviews`, `/reviews/[month]`, `?view=ledger` | Monthly recap list, a month, the printable page |
| `/recovery`, `?date=`, `#habits`, `#history` | Check-ins (scrolled to the section) [TODAY] |
| `/recovery?checkin=1` | navigates to `/?dawn=1` |
| `/settings` | Settings index [SHEETS] |
| `/settings?section=<id>` (new) | that Settings page |
| `/settings#profile`, `#appearance` → Profile; `#goal`, `#nutrition` → Goals and targets; `#day` → Day schedule; `#program`, `#workout` → Workout; `#reminders` → Reminders; `#oracle` → Coach data; `#data` → Your data; `#account` → Account | that Settings page |
| `/settings?reset=1` | Account with "Set a new password" open |
| `/onboarding`, `/sign-in` (`?next=`, `?error=`, `?deleted=`), `/auth/*` | unchanged routes and params |
| Any volleyball sheet or query (`?vb=…`, `?log=volleyball`) | the page it sits on, sheet ignored, no error |
| Manifest shortcuts (`/nutrition?add=1`, `/progress?tab=weight&log=1`, `/training`) and reminder URLs (`/`, `/nutrition?add=1`, `/recovery`, `/progress?tab=weight&log=1`, `/progress?tab=photos`, `/reviews/YYYY-MM`) | covered above |

`shell/nav.ts` (FOUNDATION): `PRIMARY_NAV` = Today `/` House, Train `/training` Dumbbell, Food `/nutrition` Utensils, Progress `/progress` ChartLine. `SECONDARY_NAV` (rail) = Coach `/coach`, Settings `/settings` (Monthly recap and Check-ins are reached from their parents). `motion.ts` `SECTIONS` order stays `["/", "/training", "/nutrition", "/progress", "/coach", "/reviews", "/recovery", "/settings"]`. Their tests are updated.

---

## 4. Screens

Each screen lists: route, owner, mockup; the **first viewport** at 390×844 from top to bottom; what is **one tap away**; what is **removed**; **states**; the **short layout** (375×667) and **AX layout**; **VoiceOver**. Demo values are examples from the mockups (Thursday 22 Oct 2026, the Arnold split's Thursday: Shoulders, Biceps & Triceps B). Build from real data.

### 4.0 Where each judge item is fixed

| Verdict item | Fixed in |
|---|---|
| must_fix: Arnold split on every screen, names from data, short strip labels, hero wraps, workout bar truncation, Settings "Arnold split", past sessions keep stored names | §1.4.6, §2.2, §3.3, §4.1, §4.2.2, §4.3.1, §4.4.1, §4.9, §6.3 |
| must_fix: remove volleyball (trio, More row, check-in, strength jumps and sprints, load, onboarding, program settings), old URLs land safely | §0 law 14, §2.2, §3.7, §4.1.3, §4.3, §4.5.3, §4.9, §4.10, §5.2 |
| must_fix: steppers beside their numbers, verified at 375×667 and AX | §1.4.16, §4.2.3 (`workout-set`, `small/workout-set-375x667`) |
| must_fix: rest button says what it logs | §4.2.4 ("Log set 3", "Log set 1 · Cable Rear Delt Fly") |
| must_fix: record toast covered the top bar; undo reachable the whole time | §4.2.5 (in-flow win card and in-flow undo strip) |
| must_fix: Seal is not nothing (`pgg.sealed.<date>`), Up next never blank | §4.1.2 (`seal`, `none`, after midnight) |
| must_fix: one hero-tap rule | §1.4.2, §4.1.8 (one Details sheet, no silent toggling) |
| must_fix: two weights in the morning | §4.1.3 (Up next "Weigh in" shows no weight; "Last time" lives in the sheet) |
| must_fix: strip hit areas and non-colour win cue, per-day VoiceOver | §1.4.6 |
| must_fix: one strip meaning everywhere (current Mon–Sun, future dim and inert on Today) | §1.4.6 |
| must_fix: "to go", "+120 over" in white, gold ring at target | §2.1, §4.1.1 |
| must_fix: no coral, sky, lilac glyphs | §1.4.4 (white glyphs) |
| must_fix: provenance survives without tags; projections dashed and labelled; tests | §0 law 5, §1.4.21, §4.5.1, §5.4 |
| must_fix: AI estimate never saved without the gold confirm, AI mark on saved rows, "Replaces" | §1.4.19, §4.7.2 |
| must_fix: photo AI logging reachable | §4.7.1 (camera button in the Add field) and §4.4.8 |
| must_fix: Train trio deleted; lift list; light week row only when due | §4.3.1 |
| must_fix: one gold fill per viewport; wins are outlines or text | §0 law 4, §1.4.6, §1.4.20, §5.1 |
| must_fix: Dynamic Type, rem, trio one column, gym numbers capped | §1.2, §1.4.3, §1.4.16, each screen's AX notes |
| still_complicated: fewer Today cards | §4.1.1 (5 blocks; weight card last, no second weight) |
| still_complicated: weights restated three times on the set screen | §4.2.3 (set dots instead of set pills) |
| still_complicated: Progress legend and "Days to go" duplicate | §4.5.1 |
| still_complicated: Settings 13 rows | §4.9 (8 entries) |
| still_complicated: Add tiles duplicate Up next | §4.7.1 (secondary tiles, never gold) |
| still_complicated: recipe ⋯ holds the extras | §4.4.4 |
| still_complicated: Today hero changes shape; Food repeats Today | §4.1.1 (one skeleton all day), §4.4.1 (no to-go numbers on Food) |
| still_complicated: long words, deload card with two buttons in Train's first viewport | §2.1, §4.3.1 (one calm row, options in a sheet) |
| still_complicated: no mockup proves the Arnold names at 375 px | `final/` mockups, all with Arnold names; `small/*-375x667.png` |

### 4.1 Today (`/`) — TODAY stream

Mockups: `today-morning`, `checkin-sheet`, `weighin-sheet`, `today-midday`, `today-details`, `today-after-workout`, `today-evening`, `today-night`.

#### 4.1.1 The skeleton (the same at every hour)

First viewport, top to bottom:
1. PageHeader "Today" + avatar.
2. DayStrip, current Monday–Sunday week. Past days: logged ring, or gold ring plus gold dot when the protein goal was hit. Future days dimmed and inert. Tapping a past day shows that day's numbers in items 3–4 (hero label becomes "Calories eaten", the ring shows eaten / goal), item 5 becomes a "Food for Tue 20 ›" row to `/nutrition?date=`, and a "Today" pill appears in the header to come back.
3. HeroNumberCard: calories **to go** ("1,413" + "Calories to go"), ring = eaten / goal with a `Flame` glyph. At the goal the ring and glyph turn gold. Over the goal: the number becomes "+120", the label "Calories over", the text stays white and the ring stays full gold.
4. StatRow of three with rings: Protein to go (`Drumstick`), Carbs to go (`Wheat`), Fat to go (`Droplet`). When protein reaches its goal its card shows the grams eaten, the label "Protein done", a gold ring and a gold `Check`. Carbs and fat never turn gold (only protein is the lever and a win).
5. UpNextCard (§4.1.2).
6. Weight card: "Weight · 7-day average" (`t-cap`), "165.1 lb" (`t-num`), a chip "On track" / "A bit slow" / "A bit fast" (from `pace()`), chevron → Progress › Weight. With fewer than 4 weigh-ins: "—" and "3 more weigh-ins to see your average", no chip. It may sit partly under the tab bar at 844 px; that is fine.

Below the fold: "Recently eaten" (the last three diary rows, newest first, time + AI mark, name, "1,030 kcal · 46 g protein"; "All food" → `/nutrition`; empty: "Nothing yet today" / "Tap + to add food"). Then one ListGroup: **Water** "1.5 of 3.0 L" with a "+250 ml" pill (long-press: +500 ml or custom; Undo toast), **Habits** "2 of 4" (→ Habits sheet: today's habits with CheckCircles; habits that tick themselves say so and are not tappable; "Edit habits" → `/recovery#habits`), **Check-in** "Checked in · Ready" (→ `/recovery`) or "Not checked in" (→ the sheet). On days 1–3 of a month a row "September recap is ready" (→ `/reviews/2026-09`), never auto-opened.

Removed: the statue, the phase rail, the climb rule, the verdict paragraph, the CALC/PROJ tags, the eyebrow date line, rites with AUTO tags, the Later/Earlier lists (Food is the plan's home), the hydration duplicate, the latest-record laurel card (Progress › Strength owns bests), ✦.

#### 4.1.2 Up next (from `dayState().next`)

The card is never blank. Copy and actions per kind:

| `next.kind` | Tile | Title | Subtitle | Button |
|---|---|---|---|---|
| `checkin` | `Bed` | Check-in | 3 quick questions | gold "Start" → check-in sheet |
| `weighin` | `Scale` | Weigh in | Before breakfast | gold "Log" → weigh-in sheet. **No weight is printed on this card.** |
| `begin` | `Dumbbell` | template name (2 lines max) | "7 lifts · about 45 min" (`estimateDurationMin`), plus " · 1 change suggested" when Options for today has something (§4.3.4: overlap advice, check-in "go lighter", rest today); tapping the card body then opens that sheet | gold "Start" → `/workout/start?t=<key>` as planned (set 1 visible after one tap) |
| `return` | `Dumbbell` | template name | "Rest 1:12 · set 5 of 19" (ticking) | gold "Return"; the card carries `data-today-resume` |
| `eat` | the meal's RecipeGlyph | meal name (2 lines max) | "3:00 PM · 30 g protein" | gold "Eaten" → `useLogPlannedMeal` (idempotent; toast "… eaten · Undo"). Tapping the card body opens the recipe |
| `log_food` | `Utensils` | Log food | Nothing planned right now | gold "Add" → Add sheet |
| `seal` (21:00–04:59, not done) | `Moon` | Day done | "Tomorrow: Chest & Back B" (or "Tomorrow: Rest day") | **secondary**, full width under the text: "Done for today". It sets `localStorage pgg.sealed.<date>` through `components/now/local.ts` (unchanged key), and the card becomes `none` |
| `seal` after midnight (00:00–04:59) | `Moon` | Thursday is done | "Sleep well. Today: Chest & Back B" | secondary "Close Thursday" → sets `pgg.sealed.<yesterday>` |
| `none` | `Moon` | Day done (or "Thursday is done" after midnight) | "Tomorrow: Chest & Back B · 4:30 PM" / "Sleep well." | none |

After a finished workout, a second card sits between Up next and the weight card until midnight: tile `Check`, "Workout done", "58 min · 19 sets · **1 new best**" (the last part in gold text only when there is one), chevron → the summary.

On a **rest day** (plan kind `rest`) the Day Engine still drives Up next (meals, check-in). When it would show `none` before the evening, it shows tile `Footprints`, "Rest and recovery", "Nothing to lift today", secondary "Ideas" → a sheet with all of `SUNDAY_RECOVERY.items` (the same list as Train §4.3.3). While the training mode is `intro` or `deload`, the `begin` subtitle adds " · lighter".

#### 4.1.3 Morning, check-in and weigh-in

Mockups `today-morning`, `checkin-sheet`, `weighin-sheet`. At 7:05 the skeleton shows 3,300 / 185 / 449 / 85 to go with empty rings and Up next "Check-in".

**Check-in sheet** (`/?dawn=1`, `/recovery?checkin=1`): one question per screen with "Check-in · 1 of 3", a thin progress bar and a close button.
1. "How long did you sleep?" — BigValue "7 h 15 min", prefilled from the 7-night median (`recovery/prefill.ts`), caption "Your usual is 7 h 15 min.", secondary "−15 min" / "+15 min".
2. "How's your energy?" — five 56 px pills: Low · Meh · OK · Good · Great.
3. Soreness, worded from PROGRAM's `sorenessFocus(plan, yesterday)`: "How do your legs feel?" (leg day), "How do your arms feel?" (a chest-and-back day after an arm day), else "How sore are you?" — five pills: Fresh · OK · A bit sore · Sore · Very sore (stored in `recovery_logs.soreness` as today). Under them, four rows open optional detail: Tiredness ("How tired is your whole body?", five pills, stored in `recovery_logs.fatigue`, which PROGRAM's lighter-week and rest-today rules read), Stress, Sleep quality, "Anything hurt?" (pain note; pain text renders in `--danger`). Nothing the old check-in asked is dropped except volleyball.

Each answer saves on tap (existing merge, never clears a field set on `/recovery`). Gold "Next" then "Done". Caption "Saved as you go. Skip any question." The result toast reads "Checked in · Ready" or "Checked in · Go lighter today". There is no volleyball question.

**Weigh-in sheet** (Up next, + › Weigh in, Progress, `?log=1`): title "Weigh in", "Before breakfast, after the bathroom.", BigValue prefilled with the last weigh-in, "−0.1" / "+0.1" (64 px), gold "Save", caption "Last time 164.7 lb · tap the number to type it". After Save: toast "Weight saved · 164.8 lb · Undo", Up next moves on.

#### 4.1.4 Midday (`today-midday`)

1,413 / 87 / 269 / 33 to go, rings partly filled; Up next "Shoulders, Biceps & Triceps B" / "7 lifts · about 45 min" / gold "Start".

#### 4.1.5 After the workout (`today-after-workout`)

Up next is the refuel meal (the Day Engine's `refuel` → `eat`): "Chocolate Peanut Butter Banana Shake" / "6:15 PM · 30 g protein" / gold "Eaten". Under it the Workout done card.

#### 4.1.6 Evening and "Done for today" (`today-evening`)

At 9:40 PM: 95 calories to go (ring 97%), protein done (gold ring and check), Up next "Day done" / "Tomorrow: Chest & Back B" / secondary "Done for today". **No gold fill** on this screen. Below the fold, Recently eaten shows the AI-logged pizza with its AI mark.

#### 4.1.7 After midnight (`today-night`)

At 12:40 AM the strip selects Friday (`useToday` rolled over), the numbers are Friday's (3,300 to go), and Up next closes Thursday: "Thursday is done" / "Sleep well. Today: Chest & Back B" / secondary "Close Thursday".

#### 4.1.8 Details sheet (`today-details`)

Tapping the hero or any trio card opens **one** sheet, "Today in numbers": rows for Calories, Protein, Carbs, Fat and Water (eaten value on the right; "1,413 to go of 3,300 kcal" under the name), a card "If you eat what is planned · 3,386 kcal and 198 g protein by tonight", and "How we got this": "Goals come from Settings › Goals. Eaten adds up the 3 foods you logged today. Planned adds the 3 meals left in today's plan." Tapping the hero never toggles what it shows.

#### 4.1.9 States, short, AX, VoiceOver

- **Loading:** skeleton blocks in the final shapes (header, strip, hero, trio, one card).
- **Fresh user** (onboarded, no logs): goals to go, empty rings, Up next "Check-in", weight card "—", Recently eaten empty card. No NaN.
- **Offline:** the 36 px opaque banner under the header, "Offline · changes sync when you're back". Cached numbers show; logging queues as today.
- **A block fails to load:** that card shows ErrorNote "Couldn't load this." + "Try again"; the rest of the screen works.
- **Short layout:** the trio rings hide (numbers and labels stay) and the hero ring scales to 90 px, so Up next and its button sit above the tab bar (`small/today-midday-375x667.png`).
- **AX layout:** the trio becomes one column, the strip hides weekday letters and its circles grow to 44 px, the hero number caps at 15vw, the Up next button moves under its text.
- **VoiceOver:** "Today, heading"; strip columns as §1.4.6; hero "1,413 calories to go. Shows today's numbers and how they are worked out."; trio "87 grams of protein to go" … "Protein goal done, 189 grams"; Up next "Up next: Shoulders, Biceps and Triceps B, 7 lifts, about 45 minutes. Start"; weight card "Weight, 7-day average 165.1 pounds, on track. Opens Progress."

### 4.2 Workout (`/workout/start`, `/workout/[id]`) — WORKOUT stream

Mockups: `workout-set`, `workout-rest`, `workout-record`, `workout-tip`, `workout-lifts`, `workout-more`, `workout-swap`, `workout-keypad`, `workout-finish`, `workout-summary`, `workout-bar` (Food with the bar). A focus route: no tab bar, no +. Background `--bg`.

#### 4.2.1 Starting

Every plain start goes through `/workout/start?t=<key>` (existing create-or-resume): Train's hero "Start workout" (the large 56 px gold button), Today's Up next "Start", + › Start workout, the Day sheet's "Do it today". One tap shows set 1 of lift 1. While the session is created a skeleton reads "Starting Shoulders, Biceps & Triceps B…" (≤ 1 s). If another workout is live: a sheet "Chest & Back A is still going" with gold "Go to it" and danger "Discard it and start" (own confirm). Suggestions never block a start: "Start" always starts as planned, and "Start with this" in Options for today (§4.3.4) calls `useStartWorkout().start({ …, adjust })` directly (the same create-or-resume, with the advice applied for this session) and then opens `/workout/[id]`. A workout never starts with an optional lift (Thursday's Reverse Curls): the workout offers it at the end (§4.2.4) and the Lifts sheet lists it under "Optional" (§4.2.9), PROGRAM §1.4. Before the first working set of the first lift, a quiet row under "Last time" reads "Warm-up · 4 steps ›" (`visibleWarmup()` of the template, in a sheet); it disappears once a set is logged.

#### 4.2.2 Top bar and progress

A 56 px row: a 44 px ⌄ (minimise, VoiceOver "Minimise workout"), a centre button (the workout's short name, `templateLabels({ key: session.template_key, name: session.name }).short`, e.g. "Shoulders & Arms B", on one line, 15/600, ellipsis; VoiceOver reads the full name; under it "3 of 19 sets · 14 min" in `t-cap`; it opens the Lifts sheet), and a 44 px "Finish" pill. Under it a 4 px Bar: sets logged / sets planned. That bar plus the count is the **progress indicator**.

#### 4.2.3 Logging a set (`workout-set`)

A full-height flex column: a top block, flexible empty space, and a bottom dock (16 px gutters, safe-area padding).
- **Top block:** the lift name (`t-head` at 30 px, max 2 lines; one line at 24 px in the short layout) and a 44 px ⋯; a line "Set 2 of 4 · aim 12–20 reps" (17/500 `--text-2`) with the **set dots** on its right (one 10 px dot per set: logged = white fill, current = white ring, later = `--ui-line` ring; the dots are one 44 px button "1 of 4 sets logged. Edit sets" → the set sheet §4.2.8); a line "Last time 25 × 16, 15, 14, 13" (`t-label`) — the **previous-session comparison** ("First time" when there is none).
- **Dock:** the weight NumberCard ("25" + "lb each hand"; "lb" for barbell, machine and cable; "lb added" for weighted bodyweight lifts; bodyweight-only lifts show no weight card, only a small "Add weight" pill), the reps NumberCard ("16" + "reps", "reps each side" for per-side lifts, "sec" for timed) with the note "**17 beats your best**" shown only when the reps value is the best or one under it at this weight (from PROGRAM's best-reps lookup), and the gold **"Log set 2"** (64 px, full width). ± step by the lift's increment and 1 rep; tap a number for the keypad (§4.2.7).
- Logging is one tap. The just-logged set dot fills; the view becomes Rest.

Removed: the 17-segment frieze, the sundial before rest, the greyed −15/Skip/+15 before rest, the record carrot, CALC and RULE tags, the "LIFT 1 OF 6 · CHEST" eyebrow, three header icons, the plate chart under the deck, the gradient seal key, the set pills that restated the weight.

#### 4.2.4 Rest (`workout-rest`)

- A context line "Dumbbell Lateral Raises · 2 of 4 done" (hidden in the short layout).
- The rest Ring: 252 px (196 px short), stroke 12, white draining on `--track` (`motion-keep`), "Rest" over the timer (`t-timer`). At 0:00 the existing chime plays (if on) and the label becomes "Rest over · 0:12" counting up in `--text-2`. No gold countdown.
- Three 56 px secondary pills: "−15", "Skip", "+15".
- **"Left in the tank?"** with four 44 px chips "0 · 1 · 2 · 3+" and the caption "Aim 0–2 reps" (the lift's target from PROGRAM). Optional; it writes `exercise_sets.rir` of the set just logged; tapping the chosen chip again clears it. Hidden in the short layout (still in the set sheet).
- Dock: a **Next** card ("Next · set 3" + "25 lb each hand × 16" in `t-num`, an "Edit" pill that expands the two NumberCards in place) and the gold button that **names what it logs**: "Log set 3", or, when the next set is a new lift, "Log set 1 · Cable Rear Delt Fly" (the lift name truncates; VoiceOver reads "Log set 1 of Cable Rear Delt Fly, 30 pounds times 15"). It logs those values and ends rest.
- Rest length per set comes from the set's `rest_sec` (PROGRAM's defaults: heavy lifts 2–3 min, isolation 60–120 s). When he taps −15 or +15, the adjusted total is also written to `rest_sec` of the remaining unlogged working sets of that lift (one `updateSets` op, PROGRAM §3.8), so the next rest starts there. No toast for this.
- **After the last planned set** there is nothing left to log, so the dock changes: the Next card becomes either the optional offer or nothing, and the gold button reads **"Finish workout"** (it opens the Finish sheet, §4.2.10). The optional offer shows only when the template has an optional lift not yet added and PROGRAM's `suggestOptional(mode, readiness)` is true: a `--card` "Optional · Reverse Curls" / "2 sets of 10–15 · for forearms" with a secondary "Add them" (PROGRAM's `templateExerciseSets()` through the existing add-exercise op; the view then shows set 1 of Reverse Curls and the gold button names it). It is never gold and never blocks Finish.

#### 4.2.5 New best (`workout-record`)

When a logged working set beats the best (the existing one-PR rule; never on a lift's first log, which is "First time"):
- An **in-flow undo strip** under the progress bar: "✓ Set 3 logged · 25 × 17" + "Undo". It stays as long as the win card shows (not a 4 s toast).
- The **WinCard** replaces the rest ring: "New best", "25 lb × 17", "Most reps you've done at 25 lb each hand.", the lift name. Copy by case: more reps at the same weight → "Most reps you've done at 25 lb"; more weight for the same reps → "Heaviest you've done for 10 reps"; otherwise (estimate only) → "Your strongest set yet". The estimated max is not shown here.
- A compact rest card ("Rest 1:51", "+15", "Skip").
- Dock: one line "Next · set 4 · 25 lb each hand × 16" and the main action in **inverse** (white): "Log set 4". The win is the only gold on screen.
- After 8 s or any tap outside the card, it collapses into the normal rest view; the set sheet marks that set "New best" in gold text. Undo stays reachable afterwards through the set dots → set sheet → "Undo set 3".

#### 4.2.6 Lift menu (⋯) and swap (`workout-more`, `workout-swap`)

The ⋯ sheet, titled with the lift: **How to do it** (steps, form tips, "Leave 0–2 reps in the tank", default rest, muscles worked), **Swap exercise**, **History** (the exercise detail as a sheet), then **Add a set**, **Add a warm-up set**, **Note**, **Skip this exercise** (toast with Undo). **Swap for today**: "Instead of Dumbbell Lateral Raises. Your plan stays the same.", "Works the same muscles" list from PROGRAM's substitutes with "Last time 20 × 15" or "Not done yet", and a "Search all exercises" field. Choosing one replaces it for this workout only (existing replace). Permanent changes live in the workout editor (§4.3.12).

#### 4.2.7 Keypad and plates (`workout-keypad`)

Tap the weight (or reps) number: a sheet "Barbell Back Squat · weight", the value in `t-big` with its unit, a "Last 220" pill that fills the value, and for barbell, Smith and plate-loaded lifts a card "Plates on each side · 45 lb bar" with plate chips ("45 · 45 = 90 lb a side"; the plate that changed since last time has a 1.5 px white outline). A 3×4 keypad (52 px keys) and a gold "Done". The existing NumberPad logic (draft, validation, 0 lb rules) is unchanged; Settings › Workout › "Use the phone keyboard" swaps in the system keyboard.

#### 4.2.8 Set sheet (tap the dots)

Rows "Set 1 · 25 × 16 ✓", "Set 2 · now", "Set 3 · 25 × 16" (planned values in `--text-2`). Tap a logged set: edit weight, reps, "Left in the tank", note; "Unlog"; "Remove set". Also "Copy last time's sets" and "Add a set". A new best shows "New best" in gold text on its row.

#### 4.2.9 Lifts sheet: the exercise list (`workout-lifts`)

Opened from the top bar's centre. Title = workout name, "5 of 19 sets · 19 min · done about 5:45 PM", the progress bar, then one row per lift: name, "4 sets · 12–20 reps · 25 lb" ("10–15 each side" for per-side lifts; law 7), status (white check when done, "3 of 4", "0 of 3"), and a drag handle (with VoiceOver actions "Move up" / "Move down"; existing reorder). The current lift is highlighted. Tap a lift to jump to it. When the template has an optional lift that is not in the workout, an "Optional" caption follows with its row ("Reverse Curls · 2 sets · 10–15 reps") and a secondary "Add" pill (works whatever the check-in said; PROGRAM §1.4). Then "Add exercise" (library picker; retired lifts are never offered, `pickableLibrary()`), "Notes for today" (the day's training notes, `templateDef(key).notes`, read-only), "Workout note" (session notes), and danger "Discard workout" (Confirm: "Discard this workout? Its logged sets are removed.").

#### 4.2.10 Finish (`workout-finish`)

"Finish" → a sheet "Finish Shoulders, Biceps & Triceps B?" with "2 sets are not logged. They will be dropped." (or "All 19 sets are logged."), gold **"Finish workout"** (the existing finish, reconcile and outbox call; no hold, no undo after finish), secondary "Keep going", danger "Discard workout" with its own confirm. When the last set is logged, the existing toast reads "Every set is logged. Finish when you're ready."

#### 4.2.11 Workout done (`workout-summary`)

`/workout/[id]` for a finished session (replaces the Inscription). ⋯ top right: Details (total lifted vs last time: "Total lifted: 1% less than last time"; set times), Edit sets, Notes, Ask coach about this workout. Then:
- "Workout done" (`t-title`) and "Shoulders, Biceps & Triceps B · Thu 22 Oct".
- The WinCard for the top new best ("3 new bests" in its caption when there are more). With none: a `--card` "Beat last time on 3 of 7 lifts" (white text, no gold).
- Trio (no rings): "58 min · Time", "19 of 19 · Sets", "9,840 lb · Lifted".
- "Lifts": rows with "Best 130 × 12 · next time 135 lb" (the next-time weight only when PROGRAM's double progression says to add weight) and a verdict on the right: "New best" (gold + trophy), "+1 rep", "Same", "−1 rep".
- Sticky gold "Done" → Today. The refuel suggestion becomes Today's Up next (not shown here). No share button.

#### 4.2.12 Minimise, workout bar, resume

⌄ returns to the previous route (Today by default) and the workout bar (§3.3) appears. With Settings › Workout › "Open the workout when the app opens" on (existing `gymAuto`), opening the app with a live session lands on the workout.

#### 4.2.13 States, short, AX, VoiceOver

- **Offline:** logging works as today (outbox); a 36 px strip under the top bar "Offline · sets sync when you're back".
- **Second device:** existing resync, no lost or doubled sets.
- **Stale session** (started on an earlier day): a sheet "This workout started yesterday" with gold "Finish it" and danger "Discard it".
- **Discarded or missing:** Empty "This workout was discarded" / "This workout doesn't exist" + "Back to Train".
- **Screen stays on:** one toast the first time, "Screen stays on during your workout".
- **Short layout** (verified in `small/workout-*-375x667.png`): numbers 84 px, round buttons 56 px, lift name one line, the rest context line and the tank row hide, the ring is 196 px. Nothing overlaps.
- **AX layout:** numbers cap at `min(rem, vw)` (never wider than the card), the unit wraps under the number, ± stay 56 px beside the number; the top block scrolls above the fixed dock if it cannot fit.
- **VoiceOver:** top bar "Minimise workout", "Shoulders, Biceps and Triceps B, 3 of 19 sets, 14 minutes. Shows all lifts", "Finish"; NumberCards as adjustable spinbuttons ("Weight, 25 pounds each hand", "Reps, 16"); "Log set 2"; the ring "Rest, 1 minute 24 seconds left"; the win card is announced politely: "New best. 25 pounds times 17. Most reps you've done at 25 pounds each hand."

#### 4.2.14 Quinton's §11 tracker must-haves, where each lives

| Must-have | Where |
|---|---|
| Large Start Workout button | Train hero, 56 px gold, full width (§4.3.1); Today's Up next "Start" |
| Interactive exercise list | Lifts sheet (§4.2.9): jump, reorder, add (including the optional lift), status per lift |
| Weight and repetition inputs | NumberCards with ± beside each number, keypad on tap (§4.2.3, §4.2.7) |
| Set completion controls | "Log set N" (one tap), set dots and set sheet (unlog, edit, remove, add) |
| Previous-session comparison | "Last time …" line, the Next card, summary verdicts (+1 rep, Same) |
| Rest timer | Rest view: ring, −15 / Skip / +15, chime (§4.2.4) |
| Exercise substitutions | ⋯ › Swap exercise (§4.2.6) |
| Workout progress indicator | Top bar "3 of 19 sets" + 4 px bar + set dots |
| Personal-record detection | "17 beats your best", the WinCard, summary "New best" |
| Workout completion summary | Workout done (§4.2.11) |
| Stored per exercise: weight, reps, sets, RIR, rest, previous performance, bests, notes | existing set rows + "Left in the tank" (`rir`), set timing, Note (`notes`) |

#### 4.2.15 In-workout tip: fatigue overlap (`workout-tip`)

Source: `useOverlapAdvice({ date, template, sessionId }).inSession` (PROGRAM §4.6 rule 2). It can fire on a chest-and-back day after an arm day, when the 2nd working set of a watched press or pull is logged, at most once per muscle per session. It takes the place of the rest ring, as the WinCard does (a new best wins if both happen on the same set; the tip then shows after the win card collapses):
- A `--card` (never gold, never red) with `role="status"`, `aria-live="polite"`: a 44 px tile with `Activity`, the title "Triceps tired from Thursday" / "Biceps tired from Thursday" (muscle from `advice.muscle`, the day from yesterday's session date), one line from `advice.evidence[0]`: "Incline Smith Machine Press is down 2 reps at 135 lb.", then the changes as plain rows built from `advice.actions`: `reorder` → "Pec Deck next · Before Flat Dumbbell Bench Press"; `drop` → "Flat Dumbbell Bench Press · 1 set instead of 2"; `rir` → "Stop with 2–3 reps left · On {lift}".
- Two buttons in a row: secondary **"Apply"** and ghost **"Keep plan"**. Apply runs the existing reorder ops and `ops.deleteSets` on the last unlogged sets only, then toasts "Changed for today · Undo". Keep plan dismisses it for this session. Logged sets are never touched, and the template never changes.
- Under it the compact rest card ("Rest 2:05", "+15", "Skip"); the dock is unchanged (Next card + gold "Log set 3"), so the screen keeps one gold fill.
- **Short layout:** the change rows hide and "Apply" reads "See change", opening a sheet with the rows and a gold "Apply" (`small/workout-tip-375x667.png`).
- If the named lifts are already done, PROGRAM returns nothing and no card shows.

### 4.3 Train (`/training`) — TRAIN stream

Mockups: `train`, `train-day`, `train-sunday`, `train-suggestion` (Options for today), `train-rest-today`, `train-light-week`, `train-swap-carry`, `train-program`, `train-rules`, `train-rearrange`, `train-switch`, `train-new-plan`, `train-volume`, `train-lifts`, `exercise-detail`, `template-editor`.

Data comes only through PROGRAM's interface (PROGRAM-ARNOLD.md §7.3): `useActiveProgram`, `useSetProgram`, `useTemplates`, `planFor`, `useTrainingWeek` (`lighter`, `restToday`), `useOverlapAdvice`, `useWeekVolume`, `useSetTrainingMode`, `useLighterSnooze`, `templateLabels`, `templateDef`, `estimateDurationMin`, `SUNDAY_RECOVERY`, `carriedSwaps`, `PROGRAMS[program].rules`. §6.3 maps each to its place on screen.

#### 4.3.1 The week (`train`)

1. PageHeader "Train" + "Program" pill.
2. DayStrip, current week, with each day's `abbr` under the date from PROGRAM (`Arms · Chest · Legs · Arms · Chest · Legs · Rest` for the Arnold split; `Push · Pull · Legs …` for PPL; never hardcoded). Done = gold ring and the label in `--text`; missed = dashed ring; today = white fill; rest label in `--text-3`. Tap a day → its Day sheet (§4.3.2); today's day keeps the hero.
3. **Hero card:** caption "Today · Thursday"; the template name in `t-head`, wrapping to two lines (three at AX), **never truncated**; "7 lifts · 19 sets · about 45 min" (lifts and sets exclude optional ones and follow the training mode; duration = median of the last 4 sessions of that template, else `estimateDurationMin`); the gold **"Start workout"** (56 px, full width, `Dumbbell` icon). Variants: workout live → gold "Back to workout"; today's workout done → "Done · 58 min · 1 new best" + secondary "See workout"; when Options for today has something, one line under the numbers: "1 change suggested · Options ›" (opens §4.3.4; the gold button still starts as planned).
4. **SuggestionRow**, at most one, only when PROGRAM returns one, in this priority: the one-time new-plan notice (§4.3.8) › a carried swap ("Use the same swap? · Cable Lateral Raises", §4.3.4) › a missed workout ("Missed Tuesday's Chest & Back A · Move it") › `lighter.kind` (`deload` "Light week suggested · 5 hard weeks in a row"; `lighter` "Fewer sets this week? · Tiredness 4 of 5 on 3 check-ins"; `standard` "Back to the full plan? · Light week since Mon 12") › the first-week ease-in (`useTrainingWeek().easeIn`: "Ease into the new split? · One set fewer this week") › a volume suggestion ("Side delts · add 2 sets a week?"). The subtitle is the first of PROGRAM's `reasons`. It opens the matching sheet (§4.3.4). Fatigue overlap and rest today are not here: they are today-only and live in Options for today.
5. "Today's lifts": one row per exercise: name (one line, ellipsis; VoiceOver full), "4 sets · 12–20 reps · each hand" ("10–15 reps each side" when `unit` is `each`; "· optional" for optional lifts, which come last and are excluded from the hero counts), the target weight on the right ("25 lb"; "—" before the first log), chevron → exercise detail.
6. A ListGroup: "Sets by muscle · This week" › and "Lifts and history" ›.

Removed: the temple, the block strip, Week/Program/Lifts segmented control, readiness and volleyball tiles, RULE tags, "0/6 RAISED", the trio of counts ("0 of 121 Sets"), the two-button deload card.

#### 4.3.2 Day sheet (`train-day`, `?day=`)

Caption "Friday 23 Oct", title the template name, "6 lifts · 15 sets · about 45 min", the first four lifts with targets and "+ 2 more lifts" (tap expands). Actions: today → gold "Start workout"; other days → secondary "Do it today" and "Move it" (date picker), ghost "Make Friday a rest day"; an overridden date → ghost "Back to the usual plan". A done day shows that workout's rows and "See workout". A rest day shows "Rest day" and ghost "Train anyway" (pick a workout). These are the existing `day_plans` actions; done workouts are never rewritten.

#### 4.3.3 Rest day (`train-sunday`)

The hero reads "Today · Sunday", `SUNDAY_RECOVERY.title` ("Rest and recovery"), "Nothing to lift today." No button. "If you feel like it": a ListGroup with the first three of `SUNDAY_RECOVERY.items` (label verbatim, detail clamped to two lines; VoiceOver reads it whole) and a fourth row "3 more ideas ›" that opens a sheet with all of them; caption "Nothing here counts against you." No tick circles. Then "Tomorrow" with Monday's workout card (→ its Day sheet). The same layout shows on any planned rest day of either program; a day made rest by "Rest today" shows it too.

#### 4.3.4 Suggestion sheets (`train-suggestion`, `train-rest-today`, `train-light-week`, `train-swap-carry`)

Every suggestion sheet has the same parts: a `t-sheet` question as the title, one or two sentences of plain reason in `--text-2` (this is the "How we got this" for the suggestion, built from PROGRAM's `reasons` / `evidence`), the changes as a checked list or the choices as RadioRows, one gold primary that names the change, and a secondary or ghost way out. Applying writes only what PROGRAM specifies, offers Undo in a toast, and never changes a completed or active workout. Calm by design: no red, no amber, no alarm words. Close (✕) writes nothing.

**Options for today** (`train-suggestion`, `train-rest-today`). One sheet per day, opened from Train's hero line or Today's Up next. It holds whichever of these apply, in this order, and shows the first one:
1. **Fatigue overlap before the start** (`useOverlapAdvice().preStart ?? .nextArmDay`). Title "Save some for tomorrow?" (next-arm-day prevention) or "Arms still sore?" (pre-start after an arm day); reason = `advice.text` without its "Today: …" clause; "Today only" list from `advice.actions` ("Machine Shoulder Press · 1 set instead of 2", "Stop with 2–3 reps left · On Machine Shoulder Press"); gold **"Start with this"** → `start({ …, adjust })`; secondary **"Start as planned"**.
2. **Check-in says go lighter** (readiness level `legs`, `trim` or `ease` with adjustments). Title "Go lighter today?"; reason = `readinessLine()`; list of the adjustments; gold "Start with this", secondary "Start as planned".
3. **Rest today** (`useTrainingWeek().restToday`, PROGRAM §4.4). Title "Rest today?"; reason from the check-in ("Your check-in: 4 h of sleep, very sore, very tired. Six days a week isn't a must."); RadioRows "Rest today, shift the week" (subtitle: the shifted days' short labels, "Fri Arms · Sat Chest · Sun Legs"; hidden when `shift` is empty), "Rest today, skip this workout" (subtitle "Friday stays Chest & Back B"), "Train anyway" (subtitle: today's workout); gold label follows the choice: "Rest today" or "Start workout". Writes through `useDayPlanWrites().apply()`; toast "Today is a rest day · Undo"; caption "You can undo this."

**Light week, fewer sets, back to normal** (`train-light-week`; from `useTrainingWeek().lighter`, PROGRAM §4.3). `deload`: title "Light week suggested", reasons, checked list "Same lifts and days · About half the sets · About 10% lighter · Leave 3–4 reps in the tank", caption "Starts with your next workout. Back to normal in Program any time.", gold **"Start light week"** → `setMode("deload")`. `lighter`: title "Fewer sets this week?", list "Same lifts, days and weights · One set fewer on most lifts", gold "Use fewer sets" → `setMode("intro")`. `standard`: title "Back to the full plan?", gold "Back to normal" → `setMode("standard")`. First-week ease-in (PROGRAM §4.2): title "Ease into the new split?", list "Same lifts, days and weights · One set fewer on most lifts", gold "Use fewer sets" → `setMode("intro")`. Each has ghost **"Not now"** → `useLighterSnooze().snooze()` (hidden for 7 days). Mode changes toast "Light week on · Undo" / "Fewer sets on · Undo" / "Back to normal · Undo". There is no "Monday": the change applies to the next workout started.

**Carried swap** (`train-swap-carry`; `carriedSwaps()` non-empty and `prefs.swapsOffered` not true, PROGRAM §3.7). Title "Use the same swap?", reason "In Push/Pull/Legs you do {T} instead of {S}." ({S} is a lift of the built-in PPL template that he swapped out, so it must be one PPL has: for example "Dumbbell Lateral Raises instead of Cable Lateral Raises"), a checked row per Arnold template it changes ("Shoulders, Biceps & Triceps A · Cable Lateral Raises → Dumbbell Lateral Raises"), gold "Use it in the Arnold split" (Undo toast), secondary "Keep Arnold's". Either button sets `prefs.swapsOffered = true`; ✕ does not, so the row comes back next time.

**Volume suggestion** (`useWeekVolume().suggestions[0]`): no sheet; the row opens Sets by muscle with the suggestion at the top, whose "Open the workout" goes to the workout editor of the named template (nothing edits a template by itself).

#### 4.3.5 Program (`?tab=program`, `train-program`)

BackHeader "Train", title "Program".
- **Plan:** RadioRows from `PROGRAMS`: "Arnold split · 6 days · shoulders and arms first" (default) and "Push/Pull/Legs · 6 days · saved with your changes" (the inactive one). The active one is selected (`useActiveProgram().program`). Choosing the other one opens the switch sheet (§4.3.7).
- **Your week** with the action "Change order": seven rows "Mon / Shoulders, Biceps & Triceps A ›" (the active program's `templates` placed by `scheduleFor()`; names wrap). A workout row → the workout editor; the rest row → "Train on Sunday?" (pick a workout, writes the schedule). Schedule problems from `scheduleIssues()` show as one plain line under the group ("Chest & Back B isn't in your week").
- **How hard:** RadioRows "Normal · The full plan", "Fewer sets · One set fewer on most lifts, same weights" (the intro option, Q§10's introductory low-volume option; also what "Use fewer sets" turns on), "Light week · About half the sets, a bit lighter" (deload). Writes through `useSetTrainingMode()` with an Undo toast; offline says "You're offline. Try again when you're back."
- A ListGroup: "Usual training time · 4:30 PM ›" (existing picker, `useSavePrefs`) and "How the plan works · 8 rules ›" → a sheet listing `PROGRAMS[program].rules` verbatim, numbered (`train-rules`).

Removed: volleyball per week, RULE tags, the schedule dropdown wall.

#### 4.3.6 Change the order (`train-rearrange`)

A sheet: "Drag a workout to another day. Done workouts stay where they were." Seven rows (handle, day caption over the workout name, ↑ and ↓ buttons for one-thumb and VoiceOver use). Caption with when it applies, as PROGRAM §1.1 decides: "Starts today. Days before today keep the plan they had." (and today too once a workout was started or finished today). Gold "Save" writes `profiles.weekly_schedule` and the `scheduleFreeze({ …, trainedToday })` rows; ghost "Back to the usual order" restores PROGRAM's default order. Moving one date stays in the Day sheet.

#### 4.3.7 Switch plan (`train-switch`)

"Switch to Push/Pull/Legs?" (or "Switch to the Arnold split?") and the facts PROGRAM §3.6 requires, as checked lines: "Your Arnold split stays saved, with your edits", "Past workouts and bests don't change", "Days you moved stay moved", "Starts with your next workout", plus "Your workout in progress finishes as it started" when one is live. Caption "Switch back any time in Program." Gold **"Switch plan"** → `useSetProgram().setProgram(next)`; secondary "Keep Arnold split". The button shows a spinner while `pending`. Results are PROGRAM's toasts: success "Push/Pull/Legs is your program · Undo" (Undo switches back); offline "You're offline. Try again when you're back."; before publication (the database function is missing) "Switching programs is available once this update is published."; any other error "Couldn't switch. Nothing changed." After a success the sheet closes and Train shows the new week.

#### 4.3.8 New plan notice (`train-new-plan`)

Shown once, as a SuggestionRow-priority sheet that opens by itself on the first Train or Today visit after the publication moved the active plan to the Arnold split. Rule: `prefs.programSwitch.from === "ppl" && .to === "arnold"`, the active program is `arnold`, and `prefs.switchNoticeSeenAt` (new client key, CR-1) is not set. "Your plan is now the Arnold split", four checked lines (the week by family: "Shoulders and arms Monday and Thursday" …), "Your workouts, weights and bests are all kept. Push/Pull/Legs is saved with your changes, under Program." Gold "See my week" (closes), secondary "Keep Push/Pull/Legs" (the same switch path as §4.3.7). Any way of closing it writes `switchNoticeSeenAt = programSwitch.at` through `useSavePrefs`; a successful in-app `setProgram` writes it too, so the notice never follows his own switch. A fresh account never sees it (no `programSwitch`).

#### 4.3.9 Sets by muscle (`?tab=volume`, `train-volume`)

BackHeader "Train", title "Sets by muscle", "This week · Mon 19 – Sun 25" with ‹ › week buttons (and swipe; next is disabled on the current week). Rows come from `useWeekVolume(week).rows` (`GroupRow`), one per Quinton's §12 group, in PROGRAM's `GROUPS` order: Upper chest and chest, Side delts, Rear delts, Front delts, Lats and upper back, Biceps, Triceps, Forearms, Quadriceps, Hamstrings, Glutes, Calves, Abdominals (labels from `GROUP_LABEL`). Each row: the name and a Bar with the zone as its band (`--card-3` segment). **The current week** reads "**7** of 14 planned" (`sets` of `planned`, halves as ".5") and shows **no judgement word**, because a week in progress is always "low". **A finished week** reads "**13** · in range" (`status`: "a bit low", "in range", "a bit high"). Tap a row → a sheet listing the lifts that counted and how ("Machine Shoulder Press · 2 sets · counts half"), the zone ("Usual range 8–20 sets a week"), the group's own strength trend from `row.trend` ("Stronger · up 3% in 6 weeks", "About the same", "Down 2% in 6 weeks" in `--text`, or "Not enough sessions yet"; the lifts behind it as rows), and its `aria`. That trend is how arm and shoulder progress are tracked separately (Q§5; PROGRAM §5.2). At most one `suggestions[0]` sits at the top as a SuggestionRow ("Side delts · add 2 sets a week?", reason as subtitle) whose sheet's gold "Open the workout" goes to the editor of `exercise.templateKey`. Caption: "White: sets you logged. Grey band: the usual range for a week. A muscle that only helps counts as half a set. Tap a muscle to see which lifts count." Loading: skeleton rows; offline: cached week; error: ErrorNote. No red, no amber.

#### 4.3.10 Lifts and history (`?tab=lifts`, `train-lifts`)

Segmented "Lifts · History". Lifts: a search field and rows "Incline Dumbbell Press · Best 70 × 10 · +10 lb" (change since the first logged set) → exercise detail; a last row "All exercises" opens the library (region filter, existing). History: sessions newest first, "Thu 22 Oct · Shoulders, Biceps & Triceps B · 58 min · 1 new best" → the session sheet. Old sessions keep their stored names ("Push A"); these rows carry `data-history` (§5.2).

#### 4.3.11 Exercise detail (`/training/exercise/[slug]`, `exercise-detail`)

BackHeader "Lifts" + ⋯ (Swap options, Edit in workout). Title. A card "Best set · each hand", "70 lb × 10" (`t-hero` 48) and PROGRAM's double-progression line "Next time: try 75 lb. You hit 10 reps on all 3 sets." (or "Next time: same weight, aim for more reps."), with a chevron → DetailsSheet (est. max, the rule, the sessions it used). A chart card ("Weight for 10 reps", 3M / All chips, one white line with dots, two gridlines, right labels). "Sessions" (date, "70 × 10 · 10 · 10", verdict). "How to do it". Timing marks leave the view (the data stays).

#### 4.3.12 Workout editor (`/training/program/[key]`, `template-editor`)

BackHeader "Program" + ⋯ (Rename, Reset to the plan). Accepts any key of either program (`TEMPLATE_DEFS`); an unknown key is `notFound()`. Title = template name, "Monday · 7 lifts · 19 sets". Rows: handle, name, "4 sets · 12–20 reps each side · rest 1:00" (rest exactly as stored, m:ss), chevron → an exercise sheet (sets, low and high reps, rest, "Reps in the tank" target from `RIR_OPTIONS`, coaching note, Optional switch, Swap, Remove). "Add exercise" (new rows take `effortDefaults()`), "Warm-up steps · 4 ›", "Notes for this day · 4 ›" (`templateDef(key).notes`, read-only: they are Quinton's notes, not stored per user). Ghost "Reset to the plan" (Confirm "Put Shoulders, Biceps & Triceps A back to the plan? Your past workouts don't change."). Sticky gold "Save". Leaving with changes → Confirm "Discard your changes?". Edits never touch completed or active workouts (existing).

#### 4.3.13 States, short, AX, VoiceOver

- **Fresh user:** planned labels, hero with Start, target weights "—" and "First time" in the lift sub line; Lifts empty "No lifts yet. Your first workout fills this."
- **Offline:** reads from cache; plan writes say "You're offline. Try again when you're back."
- **AX:** strip labels hide (VoiceOver keeps them), the hero title may take three lines, lift rows put the weight under the name.
- **VoiceOver:** strip "Thursday 22, Shoulders, Biceps and Triceps B, today"; hero "Today, Thursday. Shoulders, Biceps and Triceps B. 7 lifts, 19 sets, about 45 minutes. Start workout"; lift rows "Dumbbell Lateral Raises, 4 sets of 12 to 20 reps, 25 pounds each hand".

### 4.4 Food (`/nutrition`) — FOOD stream

Mockups: `food-today`, `food-week`, `workout-bar`, `recipe`, `cooking`, `grocery`, `meal-prefs`, `scanner`.

#### 4.4.1 Food (`food-today`)

1. PageHeader "Food" + "Grocery list" pill.
2. DayStrip, current week, the same marks as Today; future days selectable (to see the plan).
3. "Today · Arms day" (`t-section` + the short label + " day"; "Rest day") and "2 of 5 eaten" on the right.
4. The day's plan and diary merged by time (existing `lib/fuel/timeline.ts`): planned meals as ListItems with a CheckCircle (done white; **the next one gold**, the screen's one gold fill; later ones outlined), food logged outside the plan (search, scan, AI) as ListItems with their time, AI mark and no circle. Tap a planned row → recipe; tap a logged row → the existing edit sheet. Tapping a done circle offers Undo (existing).
5. A card "If you eat it all today · 3,450 kcal · 198 g protein" (eaten + planned left; chevron → How we got this).
6. "This week": seven rows "Mon 19 · Arms · 5 of 5 eaten" (past) or "Fri 23 · Chest · 5 meals · 3,399 kcal" (future); the selected day is highlighted; tap selects it.
7. "Plan next week" ›, "Meal preferences" ›.

Food never repeats Today's to-go numbers. Water is not here (Today and +).

**Unplanned week:** in place of item 4, a card "This week isn't planned yet" + gold "Plan my week" (the existing generate flow; `?generate=1` opens its confirm). Logged food still lists. **Past day:** rows show "Eaten" in `--text-2` instead of circles; no gold.

#### 4.4.2 Another day (`food-week`)

The selected day's planned meals as ListItems with chevrons (no circles on future days), "Day total · 3,305 kcal · 204 g protein", then "This week". Meal actions live behind the row → recipe ⋯: Swap this meal (regenerate), Eaten at another time, Log with changes (portion), Not this again (dislike, existing DislikeSheet), Save.

#### 4.4.3 Recipe (`/nutrition/meals/recipe/[key]`, `recipe`)

BackHeader "Food" + ⋯ (Make it easier, Save, Like, Dislike, About: difficulty and cost). Title (wraps). "25 min · 7 ingredients". HeroNumberCard "1,030 · Calories · 1 serving" with **one** inline servings stepper (the "Cook for 1 2 4" chips go). Trio (no rings, no "% of day"): Protein, Carbs, Fat. "Ingredients" (scales with servings). Dock: secondary "Cook" and gold "Log as eaten" (idempotent; links to the planned meal when it is one; once eaten it reads "Eaten · Undo", secondary). The USDA / Health Canada note lives in How we got this (the calories chevron).

#### 4.4.4 Cooking mode (`/nutrition/meals/cook/[key]`, `cooking`)

Focus route. ✕, "Step 2 of 6", a progress bar, the recipe name (`t-cap`), the step in 30/700 (readable from the counter), a timer card when the step has one ("15:00 · Start"; running timers show as chips, existing timer model). Dock: secondary "Back", gold "Next step"; on the last step gold "Log as eaten" (never logs twice) and secondary "Done". The screen stays on.

#### 4.4.5 Grocery list (`/nutrition/meals/grocery`, `grocery`)

BackHeader "Food" + "Copy list" pill. Title, "Mon 19 – Sun 25 · 34 items · 6 in the cart" (‹ › to change week, `?week=`). Aisles as `t-cap` headings with groups of rows: a 28 px circle, name, quantity. Ticked rows dim, strike through and sink to the bottom of their aisle. Works offline (existing).

#### 4.4.6 Meal preferences (`/nutrition/meals/preferences`, `meal-prefs`)

BackHeader "Food". Title, "The planner uses these every time it plans." "Never use" chips with ✕ and an "Add" chip (existing IngredientPicker). Rows: Allergies, Cooking time, Budget. "Learned from you": More often, Less often; ghost "Forget what was learned" (Confirm).

#### 4.4.7 Scanner (`/nutrition/scan`, `scanner`)

Focus route, full-screen camera. ✕ and "Scan food" at the top, a frame guide, "Fit the whole plate in the frame". Bottom: a Segmented "Photo · Barcode" on a dark translucent track, a photo-library button (VoiceOver "Choose a photo"), a 76 px white shutter, a "Type it instead" button, and the caption "AI estimates it. Nothing saves until you tap Add." A photo result opens the AI estimate sheet (§4.7.2). A barcode result opens the database product card (a source chip, not AI) with a portion stepper and gold "Add".

#### 4.4.8 States

Fresh user without a plan: the unplanned card. Offline: cached plan and diary; Eaten queues as now; "Plan my week" says it needs a connection. Planner errors: ErrorNote. AX: ListItems wrap names to three lines; the CheckCircle stays 44 px on the right. VoiceOver: "Chocolate Peanut Butter Banana Shake, 3 PM, 520 calories, 30 grams protein. Mark eaten".

### 4.5 Progress (`/progress`) and Monthly recap (`/reviews`) — PROGRESS stream

Mockups: `progress-weight`, `progress-pace`, `progress-strength`, `progress-body`, `recap-list`, `recap-month`.

#### 4.5.1 Weight (`progress-weight`)

PageHeader "Progress", Segmented "Weight · Strength · Body", then:
1. A card: "Weight · 7-day average" with the chip "On track" (→ pace sheet), "165.1 lb" (`t-hero`), a Bar at 10% (VoiceOver "10% of the way") with "Start 163.0" and "Goal 180–185" under it (the real band, never "180" or "183"), gold "Log weight".
2. A "Trend" card with 1M / 3M / All chips (3M while the programme is under 12 weeks old, then All): grey weigh-in dots, a white 3 px line for the 7-day average, a white dot at today, a dashed `--text-2` line forward labelled inline once, "If you keep this pace" (no legend), three right-axis labels and month labels. The chart is one budget group. Tap → All weigh-ins.
3. A duo: "+0.4 lb · a week, last 4 weeks" and "+2.1 lb · since you started", each with a chevron → How we got this.
4. Rows: Milestones ("165 reached · next 170"), All weigh-ins, Monthly recap ("September is ready").

Fewer than 4 weigh-ins: the hero shows the latest weigh-in labelled "Latest weigh-in", the caption "3 more weigh-ins to see your average", no chip, no dashed line, the duo "—".

Removed: terraces and roman numerals, the ridge, the projection fan, the pace slider, the verdict paragraph, the legend, the "Days to go" duplicate, CALC/PROJ/LOG tags.

#### 4.5.2 Pace sheet (`progress-pace`)

Title "On track" (or "A bit slow" / "A bit fast"), one plain sentence ("You're gaining about 0.4 lb a week. To reach 180–185 lb by 1 Aug 2027 you need 0.37 to 0.49 lb a week."), rows Your pace, Pace you need, Calories ("Keep 3,300", or "Try 3,400" with "Review" → the existing goal-change confirm through `useSaveProfile`), Days to go ("286"), and How we got this ("Your pace is the change in your 7-day average over the last 4 weeks (31 weigh-ins). The dashed line carries that pace forward. It is a guide, not a promise.").

#### 4.5.3 Strength (`progress-strength`)

A WinCard "Latest best · Thu 22 Oct" (lift, set, plain sentence). "Bests" with "14 this month": rows name / date / set → exercise detail. A row "All lifts · First and latest for each lift". **No athletic section:** no vertical, reach, broad jump or sprint tests, no "Jumps & sprints". `?tab=athletic` lands here. The estimated max appears only in the exercise detail's How we got this.

#### 4.5.4 Body (`progress-body`)

A Photos card ("Only on your account" with a lock), the two latest photos 2-up with date chips, secondary "Compare" and "Add photos" (existing compare, viewer and upload). "Measurements" with an "Add" action: Arms, Chest, Waist, Thighs … with the change since the first entry, each → its history.

#### 4.5.5 Monthly recap list (`/reviews`, `recap-list`)

BackHeader "Progress", title "Monthly recap", "One page per month. Each is ready on the 1st." Rows: "October · Ready Sun 1 Nov · So far", "September · +1.2 lb · 24 workouts · 14 bests", and so on.

#### 4.5.6 A month (`/reviews/[month]`, `recap-month`)

BackHeader "Monthly recap" + a download icon ("Print or save" → `?view=ledger`, the printable page, content unchanged). Title "September". A hero card "Weight change · 7-day average", "+1.2 lb", "163.9 → 165.1 lb. Right in your range." A trio: "24 of 26 · Workouts", "22 of 30 · Protein days", "14 · New bests". Rows that expand in place: Weight, Training, Food, Sleep and check-ins, Next month (one change to try; AI-labelled when written by AI). No story viewer, no books, no statue, no volleyball section (the data stays in the export).

#### 4.5.7 States, AX, VoiceOver

Fresh: Weight shows the guard state; Strength "No bests yet. Log a workout to start."; Body "No photos yet" + "Add photos". Offline: cached. AX: the duo becomes one column; the chart is 240 px tall. VoiceOver: the chart has a sentence ("Weight trend over 3 months: from 163.4 to 165.1 pounds, about 0.4 pounds a week. Dashed line: if you keep this pace.") and the existing hidden data table.

### 4.6 Check-ins (`/recovery`) — TODAY stream

Mockup `recovery`. BackHeader "Today", title "Check-ins", DayStrip (checked-in days ringed; future inert). A card for the selected day: "Today · Ready" (or "Go lighter", or "Not checked in" + gold "Check in"), rows Sleep, Energy, Legs (and Stress, Sleep quality, Pain when set; pain in `--danger`), "Edit" pill → the check-in sheet for that date. Rows: Sleep ("7 h 05 a night, last 14 nights" → the 14-night chart), Habits (→ the habits editor: choose habits, which tick themselves), Water ("2.6 L a day this week" → history), Weekly review. `#habits` and `#history` open those rows. Removed: the volleyball sheet and rows, RULE and AUTO tags, six stacked chip groups.

### 4.7 Add (+) — SHEETS stream

Mockups `add-sheet`, `add-estimate`.

#### 4.7.1 The Add sheet (`add-sheet`)

Over any tab: title "Add" + close. The AI field (58 px, `Sparkle` in `--ai`, placeholder "Describe what you ate", a 40 px **camera** button that takes or picks a photo for the AI photo estimate (same pipeline as the scanner's photo mode), and a 40 px white send button). Caption "AI estimates it. Nothing saves until you tap Add." Six 104 px tiles in a 2×3 grid (`--sheet-card`, **never gold**): Scan food ("Photo or barcode" → scanner), Search food ("Recent and saved too" → the existing Search · Recent · Saved · Manual panels inside the sheet), Weigh in (→ weigh-in sheet), Water ("+250 ml": tap logs it with an Undo toast; long-press offers +500 ml or custom), Start workout (subtitle: today's workout name; "Back to Shoulders, Biceps & Triceps B" while live; "Pick a workout" on a rest day), Ask coach (→ `/coach` with this screen as context). No Log/Ask segmented control, no "Suggested now" row (Up next is its home). `?add=1&meal=` preselects the slot; `&tab=…` opens a panel.

#### 4.7.2 AI estimate (`add-estimate`)

The field keeps the sentence. An AiCard: the chip "AI estimate" + "Not saved yet", the food name (`t-section`), the portion, the calories (`t-hero` 52 + "kcal"), a trio Protein / Carbs / Fat, "Replaces: Chicken Parmesan with Spaghetti (planned)" when the sentence replaces a planned meal (existing `replaces.ts`), and "After this: 152 kcal and 23 g protein to go today." (`fuel/consequence.ts`). Gold "Add as dinner" (the existing idempotent confirm; one row even on a double tap). Ghost "Edit" (item-by-item portions) and "Discard". After Add the diary row keeps its AI mark; toast "Pepperoni pizza added · Undo". AI not set up: the field says "AI isn't set up yet. Search food instead." Offline: "You're offline. Search your recent foods instead." A follow-up message keeps the estimate (existing).

### 4.8 Coach (`/coach`, `/nutrition/coach`) — SHEETS stream

Mockup `coach`. BackHeader "Today" (or "Food" from `/nutrition/coach`) + a clock button (past chats). Title "Coach", "Answers from your own logs. Changes need your OK." The thread: his messages right-aligned on `--card-2`; answers in cards with the AI chip and their sources ("From 31 weigh-ins and 28 days of food"), a bold first sentence, then body text. A meal draft from the food coach is an AiCard with a gold "Add as …". A **Suggested change** AiCard ("Suggested change · Not saved", before → after rows) with a secondary "Review" → the existing proposal confirm (Apply updates the profile and writes `goal_changes`; Not now writes nothing). Two suggestion chips. The composer is fixed at the bottom ("Ask anything" + a white send). Data access lives in Settings › Coach data. Coach never mentions volleyball and uses the active program's names (PROGRAM owns the prompt, context and mock). Not set up, offline and errors are one plain line each.

### 4.9 Settings (`/settings`) — SHEETS stream

Mockups `settings`, `settings-workout`. The index: BackHeader "Today", title "Settings", a profile card (avatar, name, "Profile, units, display") and seven rows in two groups — **8 entries**: Goals and targets ("3,300 kcal"), Day schedule ("Meal and training times"), Workout ("Arnold split"), Reminders ("Off"), Coach data ("What the AI can read"), Your data ("Export, privacy, delete"), Account ("Email, password, sign out"). A version caption.

Each entry pushes `/settings?section=<id>` (the back gesture returns to the index) and holds the **existing** controls and save logic:
- `profile`: Name, Height, Weight unit, Length unit, Time zone; Display: Motion (System / Reduce), Night dimming (Off / 9 PM–5 AM / Always).
- `goals`: Start, Goal and band, Target date, Goal history; Calories, Protein, Carbs ("Balanced from the others" caption instead of a CALC tag), Fat, Water, Sleep goal, Steps. Footer "Goal changes are saved with the date."
- `schedule`: meal times, usual training time, pre-workout snack; a link "Check-ins and habits" → `/recovery`.
- `workout`: Program › (→ `/training?tab=program`), Experience, "One tap logs the shown values", "Use the phone keyboard", "Rest chime", "Open the workout when the app opens" (`gymAuto`). Caption "Plan, week order and lighter options are in Train › Program."
- `reminders`: the existing ReminderSettings.
- `coach-data`: the data toggles and "Progress photos are never sent."
- `data`: Export data (a ZIP of every table, volleyball rows included), Meal preferences ›, Privacy, AI and your data, Delete all logged data (danger; typed confirm unchanged).
- `account`: Email, Change password, Sign out, Delete account (danger; typed confirm unchanged).

Removed: volleyball per week and the Program volleyball row, the Reduce transparency toggle, the CALC tag, the serif header, the 11-group single scroll.

### 4.10 Onboarding (`/onboarding`) — SHEETS stream

Mockups `onboarding`, `onboarding-program`. One question per screen: a back chevron, a thin progress bar, "4 of 9". 1 Name ("What should we call you?"). 2 Weight today (BigValue; "Also save as today's weigh-in" switch, on). 3 Height. 4 Goal weight (BigValue "180 lb", "Happy anywhere up to 185", a card "That's about 0.4 lb a week by 1 Aug 2027. A steady, lean pace."). 5 Target date. 6 **Your training week**: "The Arnold split: six days, Sunday off. Tap a day to change it." and seven rows "Mon · Shoulders & Arms A ›" … "Sun · Rest ›" (the existing schedule editor with PROGRAM's `SCHEDULE_OPTIONS`, Arnold keys and Rest only, `short` labels), a "Start lighter" switch ("One set fewer on most lifts at first. Turn it off any time.", the existing `introVolume` answer → `training_mode = 'intro'`), and the caption "Push/Pull/Legs is in Train › Program if you want it later." Onboarding offers no program choice: PROGRAM §2.5 seeds only Arnold rows for a new account. 7 Usual training time ("Not sure" skips). 8 Targets (calories and protein as two StatCards from the existing `onboarding/macros.ts`, "Edit" optional). 9 "You're set" + gold "Start". Units and time zone are auto-detected with a small "lb · Toronto" link on screens 2–3. **No volleyball step.** Templates are seeded through PROGRAM's seed function (the existing call). Continue is a gold button pinned at the bottom with the content scrolling above it, so it never covers content (the 375×667 render shows why). Profile values equal the old flow's for the same answers (existing `profileUpdateFromAnswers` test). Hold-to-begin becomes a tap on "Start".

### 4.11 Sign-in (`/sign-in`) — SHEETS stream

Mockup `signin`. The laurel-A app icon (`/icons/icon-192.png`, 76 px, radius 18; the only surviving Olympus mark), "Project Greek God" (`t-title`), "Sign in to keep going.", Email and Password fields, gold "Sign in", "Create account" (`--text`) and "Forgot password" (`--text-2`). Errors inline under the fields in `--danger`; the redirect is unchanged. No statue.

### 4.12 Global states (FOUNDATION)

- **Loading:** each page's own Skeleton in its final shapes; never a spinner over a blank page.
- **Offline banner:** 36 px opaque `--card-3` strip under the header, "Offline · changes sync when you're back" (the workout uses its own strip, §4.2.13). Never a toast.
- **`error.tsx` / `global-error.tsx`:** a centred card "Something went wrong." + secondary "Try again" + ghost "Go to Today".
- **Not signed in:** `/sign-in`. **Not onboarded:** `/onboarding` (unchanged rules).
- **Toasts** per §1.4.18.

---

## 5. Budget and acceptance checks

### 5.1 Complexity budget (the first viewport)

Measured on the rendered page at scroll 0, at 390×844 and again at 375×667: from under the status bar to the top of the tab bar (in the workout, to the top of the dock; for a sheet, from the sheet's top edge to the screen bottom).

| Measure | Rule |
|---|---|
| **Text block** | Each element that directly holds visible text (opacity ≥ 0.6) is one block. An element with `data-budget-group` counts as **one** block in total and its words are not counted: the DayStrip, a chart, the set dots, the rules list, a "How we got this" paragraph (`data-how`), an AI answer body (`data-ai-answer`). |
| **Words** | Tokens with a letter or digit, in blocks outside a `data-budget-group`. Text inside `data-budget-name` (a name that comes from data: food, recipe, lift, workout, rest idea) counts as **one** word, because the budget measures our copy, not his data. The status bar and the tab bar are not counted. |
| **Gold fills** | Visible elements with `data-gold="fill"` (Button `primary`, CheckCircle `next`). Also checked at every scroll stop (scroll by 80% of the viewport to the end; a sticky dock counts at every stop). |
| **Font families** | The first family of the computed `font-family` of every text node: `-apple-system` on the iPhone, `Inter` in Chromium. Exactly one. |
| **Provenance tags** | Elements whose whole text is `LOG`, `PLAN`, `RULE`, `CALC` or `PROJ`: none. The AI chip is the only label. |

| Kind | Screens | Blocks | Words | Gold fills | Families | Tags |
|---|---|---|---|---|---|---|
| **Main** | Today in every state (§4.1), Train week and rest day, Workout set, rest, new best and tip, Food today, Progress Weight / Strength / Body, the Add sheet | ≤ 25 | ≤ 60 | ≤ 1 | 1 | 0 |
| **Detail** | every other screen and sheet in §4 | ≤ 35 | ≤ 90 | ≤ 1 | 1 | 0 |

Measured on the final mockups with the same rules (counter `src/__scratch/v3/count.mjs`; blocks / words / gold fills; one family and no tags everywhere). For scale, the shipped Olympus Today measured 48 blocks, 87 words, 2 families and 2 tags.

| Main screen | B / W / G | Main screen | B / W / G |
|---|---|---|---|
| today-morning | 22 / 35 / 1 | workout-set | 12 / 38 / 1 |
| today-midday | 22 / 40 / 1 | workout-rest | 20 / 45 / 1 |
| today-after-workout | 21 / 43 / 1 | workout-record | 16 / 48 / 0 |
| today-evening | 19 / 34 / 0 | workout-tip | 20 / 59 / 1 |
| today-night | 19 / 37 / 0 | food-today | 20 / 45 / 1 |
| train | 18 / 44 / 1 | progress-weight | 22 / 33 / 1 |
| train-sunday | 16 / 53 / 0 | progress-strength | 23 / 60 / 0 |
| add-sheet | 13 / 37 / 0 | progress-body | 21 / 33 / 0 |

The busiest detail screens: train-volume 33 / 60, workout-summary 33 / 70, recipe 32 / 56, workout-lifts 27 / 90, onboarding-program 21 / 71, today-details 20 / 69, template-editor 21 / 67. Every other mockup is lower. All 57 have at most one gold fill.

**In the app**, FOUNDATION's kit sets the attributes so the same counter works on live pages: `DayStrip`, charts and the set dots carry `data-budget-group`; `Row`, `ListItem`, `UpNextCard` and `HeroNumberCard` take a `dataName` prop that renders `data-budget-name` on the title; `DetailsSheet` marks its paragraph `data-how` + `data-budget-group`; Coach answer bodies are `data-ai-answer` + `data-budget-group`. `scripts/dev/budget.mjs` (§6.1, F3) is the live counter.

### 5.2 Gates every stream passes (run literally)

Each stream runs these on every route and sheet it owns (the route list per stream is in §5.5), with `scripts/dev/v3-gates.mjs <routes…>` (FOUNDATION, F3) unless the check says otherwise. A gate passes only with zero findings.

- **G-1 Banned text.** Collect `document.body.innerText` plus every `aria-label`, `title`, `placeholder` and `alt` on the page, with each sheet open in turn.
  - (a) **Volleyball**, no exclusions anywhere: `/volley|approach jump|box jump|broad jump|squat jump|\bsprints?\b|vertical jump|standing vertical|approach vertical|standing reach|jumps (&|and) sprints|\bathletic\b/i`.
  - (b) **Ritual and jargon words**, case-sensitive: `/\b(Offering|Oracle|Inscribe|Inscription|Seal|Sealed|Chronicle|Ascent|Olympus|Summit|Terraces?|Rites?|Dawn|Dusk|Fuel|Refuel|Market|Hall|Gallery|Mountain|Oath|Gild(ing)?)\b/` and case-insensitive `/\b(corridor|the climb|rites?|deload|e1rm|rir)\b/i`. Text inside `[data-food]` (food and recipe names and steps from databases or AI), `[data-ai-answer]` (coach replies) and `[data-program-text]` (PROGRAM's rules, day notes, library how-to text and suggestion reasons) is excluded from (b) only; the gate prints any hit found there as a change request to the text's owner instead of failing.
  - (c) **Old program names while the Arnold split is active**: `/\b(Push|Pull|Legs) [AB]\b/` must not appear on `/`, `/training` (all tabs), `/nutrition`, the Add sheet and `/workout/start`, outside `[data-history]` (stored names of past sessions: Lifts › History, exercise detail sessions, a past summary, the monthly recap). Skipped when the QA user has switched to Push/Pull/Legs.
  - (d) **No uppercase eyebrows**: no element with computed `text-transform: uppercase`, or with `letter-spacing` above 0.02em on two or more letters.
- **G-2 Rendered style.** No computed `font-style: italic`. Every text node's first font family is the sans stack. No element with a `background-image` gradient except the workout dock's fade (`[data-dock-fade]`). No `backdrop-filter`. No provenance tags. At most one gold fill at every scroll stop. No `<img>` from `/art/` except the sign-in icon.
- **G-3 Layout.** At 390×844 and 375×667: `document.documentElement.scrollWidth <= innerWidth`; no console errors and no page errors; every `button`, `a[href]`, `[role=button|radio|switch|tab]` and `input` has a box at least 44×44 (or sits in a `.hit-44` box); in the workout every dock control is at least 56 px tall and the gold button at least 64 px. Scrolled to the end, the last interactive element's bottom is above the tab bar or dock.
- **G-4 Large text.** With `scripts/dev/ax-shot.mjs` (forces `html { font-size: 28px }`): no horizontal overflow, the main action reachable without horizontal scroll, trio and duo in one column, workout numbers inside their cards.
- **G-5 Reduced motion.** With `reducedMotion: "reduce"`, 300 ms after load no element has a running animation except `.motion-keep` (the rest ring).
- **G-6 URLs.** Every §3.7 row the stream owns: `goto(url)` shows the landing's heading and never "Something went wrong" or a 404.
- **G-7 Source greps** on the stream's owned files (`rg` from the repo root; each must print nothing):
  - `rg -n "components/ui/tag|<Tag\b|<Statue|<Laurel|<Meander|<Sundial|<Colonnade|<GildedBust|<AscentFrieze|<Ridge|<Terrace|<Coin\b|<RecordMark|<HoldButton|<SealKey|<Placard\b|<Meter\b" <owned>`
  - `rg -n "font-voice|font-monument|font-serif|t-eyebrow|t-monument|t-dial|t-verdict|t-film|t-plaque|italic|card-monument|leaf-btn|\bglass\b|\bgrain\b|spotlight|sheen|flash-gold" <owned>`
  - `rg -n --glob '*.tsx' "text-\[[0-9]|rounded-\[[0-9]|z-\[[0-9]|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b" <owned>`
  - `rg -n -i "volley" <owned>` (PROGRAM's repo-wide `no-volleyball.test.ts` follows in P2)
  - `rg -n "\"(Push|Pull|Legs) [AB]\"|\"push_[ab]\"|\"pull_[ab]\"|\"legs_[ab]\"|\"shoulders_arms_[ab]\"|\"chest_back_[ab]\"|\"legs_abs_[ab]\"|PROGRAM_BY_KEY|DEFAULT_SCHEDULE|TRAINING_RULES" <owned> --glob '!*.test.*'` (names and keys come from data)
- **G-8 Checks.** `npx tsc --noEmit -p .`, `npx eslint <owned files>`, `npx vitest run`: all green.
- **G-9 Budget.** `scripts/dev/budget.mjs <routes…>` passes §5.1 for each main and detail screen the stream owns, at 390×844 and 375×667.

### 5.3 How QA runs them

- **Servers.** Dev server `http://localhost:3400` with `AI_MOCK=1`, local Supabase. If either is down, run the environment's `up.sh`.
- **Users.** `demo@greekgod.local` / `ascent-test-123` (rich data; `setup-users.mjs` switches it to the Arnold split, `--ppl` leaves it as production looks before publication), `fresh@greekgod.local`, and PROGRAM's `qa-arnold@greekgod.local` (`scripts/dev/qa-arnold.mjs --setup`, then `--switch`).
- **Clock.** `page.clock.setFixedTime` in America/Toronto. The reference day is **Thursday 22 Oct 2026** (Shoulders, Biceps & Triceps B): 07:05 (morning), 14:41 (midday), 18:15 (after a finished workout), 21:40 (evening), 00:40 Friday (after midnight). Train checks also use each weekday of the week after the switch (PROGRAM U1).
- **Contexts.** 390×844 and 375×667 at device scale 2, plus `ax-shot.mjs`. Screenshots go to the stream's scratch folder and are compared by eye with the matching mockup (Appendix A).
- **Scripts** (FOUNDATION, F3): `scripts/dev/v3-gates.mjs` (G-1 to G-6 and G-9 over a route list; prints a table and exits 1 on any failure), `scripts/dev/budget.mjs`, `scripts/dev/ownership.mjs` (Appendix B). Streams keep their own flows in `src/__scratch/`.

### 5.4 Honesty without tags (law 5)

1. Every derived number carries `data-derived` and sits in a button whose accessible description says what it opens ("Shows how it is worked out"). For each `[data-derived]` on Today, Food, Progress, the recipe and the exercise detail: tapping it opens a dialog with a non-empty `[data-how]` sentence that names at least one input (weigh-ins, logged food, the plan, a goal).
2. **Projection.** On Progress › Weight with 4 or more weigh-ins the forward line has a `stroke-dasharray` and the visible label "If you keep this pace". With 3 weigh-ins (fixture) there is no dashed line and no pace chip.
3. **AI.** Sending "3 slices of pepperoni pizza" in the Add sheet (AI_MOCK) shows "AI estimate" and "Not saved yet"; today's `food_entries` count is unchanged (DB query) until the gold "Add as …" tap, then exactly +1, also on a double tap; the new row shows the AI mark on Today and on Food.
4. **Suggestions write nothing until applied.** Snapshot `profiles`, `day_plans`, `exercise_sets` and `program_templates`; open and close (✕) every suggestion sheet, Options for today and the workout tip: all unchanged. "Not now" changes only `prefs.lighterSnoozedUntil`.
5. **No invented numbers.** On the fresh user no text node matches `/NaN|undefined|null|Infinity/`, and every missing value shows "—" with a next step.

### 5.5 Acceptance per stream

**FOUNDATION** (routes: all, because F1 re-themes everything)
1. After F1 alone, every route renders at 390×844 for demo and fresh with no console errors; G-2 passes on every route (the old screens re-theme through the aliases; ornaments render nothing; no serif).
2. A vitest reads `globals.css` and asserts the `:root` values equal §1.1 exactly, and recomputes every pair in §1.1.1 at or above its stated ratio.
3. `layout.tsx` loads one Google font (Inter); `document.fonts` has no Cormorant, Bodoni or Inter Tight face on any route.
4. Tab bar: four tabs and a white +; active `--text`, inactive `--tab-off`; + opens the Add sheet on every tab; hidden on the five focus routes and while the keyboard is open; tapping the active tab scrolls to top.
5. Workout bar: appears on every non-workout route while a session is live; at 375 px with "Shoulders & Arms B" and "Rest 1:12 · Set 4 of 19" it drops the set count first; it steps aside for `[data-today-resume]`.
6. Kit: Button `primary` sets `data-gold="fill"`; CheckCircle VoiceOver names ("Eaten, undo" …); NumberCard and BigValue are `spinbutton`s whose arrow keys change the value and whose `aria-valuetext` includes the unit; DayStrip future days are `aria-disabled` where §1.4.6 says so; Ring turns gold only at its goal; HeroNumberCard is one button. Checked on the routes that use them (Playwright).
7. Night dimming: Settings › Profile › Display "Always" sets `html[data-night="on"]` and computed `--text` `#e2e2e6`; "Off" removes it. The stored transparency value is ignored.
8. `v3-gates.mjs`, `budget.mjs` and `ownership.mjs` exist and run; the ownership check passes (Appendix B).
9. F4 (integration, §6.7): `rg` finds no alias name, no neutralised component and no `data-phase` / `data-mode="gym"` / `data-transparency` in `src/`; G-1 to G-9 pass on every route.

**PROGRAM** (owned by PROGRAM-ARNOLD.md): its §8 in full (D1–D13, U0–U12, the unit tests, §8.6 regression), plus CR-1 to CR-4 (§6.4) landed in P1, and nothing under `src/components/**` changed except the P1 one-line import fixes and `training/hooks.ts`.

**TODAY** (routes `/`, `/?dawn=1`, `/recovery`, `/recovery?checkin=1`; mockups `today-*`, `checkin-sheet`, `weighin-sheet`, `recovery`)
1. 07:05, demo not checked in: header, strip, hero, trio, Up next "Check-in" with gold "Start", weight card; exactly one gold fill; no weight printed on Up next.
2. Check-in: three answers with one tap each (the prefilled sleep accepted with "Next") then "Done": toast "Checked in · Ready" or "Checked in · Go lighter today"; today's `recovery_logs` row has sleep, energy and soreness; an existing row whose `volleyball` is true keeps it; question 3 follows `sorenessFocus` (a leg day reads "How do your legs feel?"); no volleyball question.
3. Weigh-in from Up next: prefilled, one tap "Save" → `weight_entries` +1 with that value; toast with Undo; Undo deletes it.
4. 14:41: Up next title is the template name from data ("Shoulders, Biceps & Triceps B"); "Start" → `/workout/start?t=shoulders_arms_b` → set 1 visible.
5. With PROGRAM's overlap fixture (Friday after Thursday's arm day, soreness 4): the Up next subtitle ends "1 change suggested" and tapping the card body opens Options for today; "Start" still starts as planned.
6. 18:15 after a finished workout: Up next is the refuel meal with gold "Eaten"; a double tap logs one row; the "Workout done" card links to the summary.
7. 21:40: no gold fill; "Done for today" sets `localStorage pgg.sealed.2026-10-22`; the card becomes `none` and stays after reload.
8. 00:40 Friday: the strip selects Friday; "Close Thursday" sets `pgg.sealed.2026-10-22`.
9. The hero and each trio card open the same "Today in numbers" sheet with a `[data-how]` paragraph; the hero never changes what it shows.
10. Tapping a past strip day shows "Calories eaten" and a "Today" pill; future days are inert.
11. Fresh user: no NaN; weight card "—" with its next step; "Nothing yet today".
12. A rest day (Sunday fixture): Up next "Rest and recovery" with "Ideas" → all `SUNDAY_RECOVERY.items`.
13. `/recovery`: strip, the day card, "Edit" opens the check-in for that date; `#habits` and `#history` scroll; `/recovery?checkin=1` lands on `/?dawn=1` with the sheet open; no volleyball rows.
14. 375×667: Up next and its button sit above the tab bar; AX: trio in one column.
15. G-1 to G-9.

**WORKOUT** (routes `/workout/start`, `/workout/[id]` live and done; mockups `workout-*`)
1. From Train, "Start workout" shows set 1 of lift 1; the top bar shows the `short` name and "0 of 19 sets".
2. Logging a prefilled set is one tap: the `exercise_sets` row is completed with the shown values, its dot fills, rest starts at that set's `rest_sec`.
3. ± step by the lift's increment and by 1 rep; tapping a number opens the keypad; the plates card shows only for barbell, Smith and plate-loaded lifts (Incline Smith Machine Press shows it, Cable Lateral Raises does not).
4. Rest: "+15" then the DB shows the adjusted total in `rest_sec` of that lift's remaining unlogged working sets; a "Left in the tank" chip writes `rir` and tapping it again clears it; the gold button reads "Log set N", or "Log set 1 · {next lift}" when the next set is a new lift.
5. New best (fixture where 25 × 17 beats the best): the in-flow undo strip and the WinCard show; the main action is white; zero gold fills; Undo un-logs; after 8 s the card collapses and the set sheet shows "New best".
6. Swap: ⋯ › Swap exercise lists PROGRAM's substitutes with "Last time"; choosing one changes this session only (`program_templates` unchanged).
7. Lifts sheet: jump, reorder (drag and the "Move up" action), "Add exercise" (no retired jump in the list), "Notes for today" shows the day's notes, "Discard workout" with its confirm.
8. Finish: the sheet counts unlogged sets; gold "Finish workout" → `/workout/[id]` shows "Workout done", the WinCard or "Beat last time on N of M lifts", the trio, and per-lift verdicts; "next time 135 lb" only where `suggest()` says increase.
9. In-workout tip (PROGRAM U8 fixture): after set 2 of the watched press the tip shows; "Apply" reorders and drops one unlogged set, Undo restores; "Keep plan" hides it for the session; logged sets never change.
10. Optional Reverse Curls: standard mode with readiness "go" includes them; intro mode leaves them out (PROGRAM U5).
11. ⌄ returns to the previous route with the workout bar; tapping the bar returns. `/workout/start?t=push_a` with the Arnold split active starts today's workout without an error.
12. Offline: log two sets offline, see "Offline · sets sync when you're back", reconnect and reload: both sets exist once.
13. A PPL session left active across the switch (PROGRAM U0) shows its own lifts and stored name and finishes with `name` and `template_key` unchanged.
14. 375×667 screenshots of set, rest, new best, tip, keypad and finish: numbers 84 px, ± 56 px beside them, nothing overlaps.
15. G-1 to G-9.

**TRAIN** (routes `/training`, `?tab=program`, `?tab=volume`, `?tab=lifts`, `?day=…`, `/training/exercise/[slug]`, `/training/program/[key]`; mockups `train*`, `exercise-detail`, `template-editor`)
1. On each weekday of the week after the switch, the hero title equals PROGRAM U1; strip labels read Arms, Chest, Legs, Arms, Chest, Legs, Rest; Sunday shows "Rest and recovery", three ideas, "3 more ideas" and no Start button.
2. Hero counts exclude optional lifts and follow the training mode; a template with no history shows "about 45 min" from `estimateDurationMin`.
3. Today's lifts equal the active template's rows in order; Thursday ends with "Reverse Curls … · optional"; `unit: each` rows say "each side".
4. SuggestionRow priority: with fixtures for several kinds only the highest shows. Light week "Start light week" → `training_mode = 'deload'` and `prefs.modeSetAt = today`, toast Undo restores both; "Not now" → `prefs.lighterSnoozedUntil = today + 7` and the row hides.
5. Options for today: (a) Thursday with the next-arm-day fixture shows "1 change suggested · Options"; "Start with this" → Machine Shoulder Press has 1 set and `target_rir` "2–3" in `exercise_sets`; "Start as planned" → 2 sets. (b) PROGRAM U9's rest-today fixture: "Rest today, shift the week" writes the `shiftWeek` rows, "skip" writes one rest row, Undo works for both.
6. Program: Plan radios from `PROGRAMS`; the switch sheet lists the four facts; "Switch plan" → PROGRAM U7 (PPL week restored, toast with Undo); with the database function missing (before publication) the toast says it is available once published and nothing changes.
7. Change the order with ↑ and ↓ only (no drag): Save writes `weekly_schedule`; "Back to the usual order" restores `PROGRAMS[program].schedule`; done workouts unchanged.
8. How hard: each radio writes `training_mode` with Undo; offline shows the offline line and writes nothing.
9. "How the plan works" lists the eight rules verbatim.
10. Sets by muscle: 13 rows in `GROUPS` order with `GROUP_LABEL` labels; the current week shows "x of y planned" and no status word; the previous week shows status words; a row's sheet lists the lifts with "counts half" for secondary muscles.
11. Day sheet: a future day's "Do it today", "Move it" and "Make Friday a rest day" write `day_plans` as they do now; a done day shows "See workout".
12. New-plan notice: `qa-arnold` after `--switch` sees it once; closing writes `prefs.switchNoticeSeenAt`; after reload it is gone; the fresh user never sees it.
13. Carried swap (fixture with a PPL swap that the Arnold split shares): "Use it" substitutes in the Arnold rows with Undo; either button sets `prefs.swapsOffered`.
14. Lifts › History shows the PPL sessions as "Push A", "Pull B (Q)" inside `[data-history]`; the exercise detail lists sessions from both programs and its "Next time" line matches `suggest()`.
15. Editor: `/training/program/push_a` opens (PPL template), an unknown key is a 404, rests show as m:ss, "Notes for this day" is read-only, "Reset to the plan" confirms.
16. `/training?vb=1` lands without an error.
17. G-1 to G-9.

**FOOD** (routes `/nutrition` and every §3.7 `/nutrition*` row except the coach; mockups `food-*`, `recipe`, `cooking`, `grocery`, `meal-prefs`, `scanner`, `workout-bar`)
1. Food today: strip, "Today · Arms day" (`abbr` + " day"), plan and diary merged by time; the next planned meal has the only gold circle; tapping it logs once (`food_entries` +1, linked to the planned meal, also on a double tap); Undo removes it.
2. A future day lists planned meals with chevrons and its day total; a past day shows "Eaten" text and no gold.
3. "This week" has seven rows with `abbr` labels; tapping one selects that day.
4. An unplanned week shows the card and gold "Plan my week" (the existing generate flow); `?generate=1` opens its confirm.
5. Recipe: one servings stepper scales the ingredients; "Log as eaten" is idempotent; ⋯ holds Make it easier, Save, Like, Dislike and About.
6. Cooking mode: steps, a running timer chip, "Log as eaten" once on the last step; a wake lock is requested.
7. Grocery list: aisles, a ticked row sinks to the bottom of its aisle, ticking works offline and survives reconnect, "Copy list" copies the text.
8. Meal preferences: "Never use" chips add and remove; "Forget what was learned" confirms.
9. Scanner: Photo · Barcode; a photo (mock) opens the AI estimate with "Not saved yet"; a barcode opens the product card with its source chip and gold "Add".
10. With a live workout the workout bar shows over Food and never covers the last row when scrolled to the end.
11. G-1 to G-9.

**PROGRESS** (routes `/progress` with its three segments and legacy tabs, `/progress?log=1`, `/reviews`, `/reviews/[month]`, `?view=ledger`; mockups `progress-*`, `recap-*`)
1. Weight: the 7-day average, its chip, the bar with "Start 163.0" and "Goal 180–185" from the profile (never typed in a component); gold "Log weight" and `?log=1` open the weigh-in sheet.
2. Chart: 1M, 3M and All; the dashed "If you keep this pace" line only with 4 or more weigh-ins; a VoiceOver sentence and the hidden data table.
3. The pace sheet's numbers equal `pace()`; "Review" opens the existing goal-change confirm and only "Apply" writes `goal_changes`.
4. Strength: the latest-best WinCard and the Bests list; no athletic section; `?tab=athletic` and `?tab=hall` land on Strength without an error.
5. Body: photos 2-up, Compare and Add photos (upload path unchanged), measurements with the change since the first entry.
6. Monthly recap list and month: numbers equal `reviews/compute.ts`; no volleyball section; `?view=ledger` prints.
7. Fresh user: the guard states and no NaN.
8. G-1 to G-9.

**SHEETS** (routes `/coach`, `/nutrition/coach`, `/settings` and its eight `?section=` pages and `#hash` aliases, `/onboarding` as the fresh user, `/sign-in`, the Add sheet over `/`; mockups `add-*`, `coach`, `settings*`, `onboarding*`, `signin`)
1. Add sheet from every tab: the AI field with its camera button, six tiles, no gold fill; the Start workout tile shows today's `short` name ("Pick a workout" on a rest day, "Back to …" while live).
2. AI estimate (AI_MOCK): the chip and "Not saved yet"; "Replaces: …" when a planned meal is replaced; gold "Add as dinner" writes one row; the AI mark shows on the saved row; the AI-off and offline messages appear in their states.
3. Search, Recent, Saved and Manual panels work as before, including `?add=1&tab=…`.
4. Coach: answers carry the AI chip and their sources; a Suggested change card's "Review" opens the existing confirm and only "Apply" writes; the mock never mentions volleyball; the suggested questions are PROGRAM's two.
5. Settings: the index has eight entries; each `?section=` page holds its existing controls and saves as today (DB per control); `#hash` links land; Workout shows "Arnold split" from `PROGRAMS`; no volleyball row; no Reduce transparency; Night dimming has three options.
6. Export still downloads every table, including `volleyball_sessions` and `athletic_tests`; delete flows keep their typed confirms.
7. Onboarding (fresh): nine screens; step 6 shows the Arnold week and "Start lighter"; finishing gives `weekly_schedule = ARNOLD_SCHEDULE`, six Arnold rows, `training_mode = 'intro'` when the switch was on, and `volleyball_per_week` not written (PROGRAM U12); at 375×667 "Continue" never covers content.
8. Sign-in: the icon, fields, inline errors in `--danger`, the redirect unchanged.
9. Reminders settings behave as today.
10. G-1 to G-9.

---

## 6. Stream plan and ownership

### 6.0 Order and gates

```
P1  PROGRAM    lib, data, migration file, coach, CR-1…CR-4      ──┐
F1  FOUNDATION tokens + aliases + ornaments off + Tag + fonts    ──┤
F2  FOUNDATION ui kit (§1.4)                                     ──┤
F3  FOUNDATION shell, nav, error pages, dev scripts              ──┴─► G1 ─► TODAY · WORKOUT · TRAIN · FOOD · PROGRESS · SHEETS (parallel)
                                                                          ─► G2 (each stream) ─► P2 PROGRAM cleanup + F4 FOUNDATION integration ─► G3 ─► Quinton approves ─► publish
```

- **PROGRAM and FOUNDATION run first, in parallel.** They own disjoint files (PROGRAM: PROGRAM-ARNOLD.md §7.1; FOUNDATION: §6.2 below plus every `src/lib` file PROGRAM does not list). P1 also makes the one-line import fixes in `src/components/**` for the deleted `PROGRAM*` exports (PROGRAM §7.2); those land before any screen stream starts, so they never collide.
- **G1** (before screen streams start): F3 and P1 committed; `tsc`, `eslint` and `vitest` green; every route renders at 390×844 for demo and fresh with no console errors; the ownership check passes; PROGRAM's D1–D13.
- **Screen streams** start from the same commit after G1 and only touch their own files. Each finishes with its §5.5 list (**G2**) and a hand-off note (§6.5).
- **P2 and F4** run after every screen stream has passed G2: PROGRAM deletes its deprecated exports and turns on the no-volleyball gate; FOUNDATION removes the aliases and the neutralised files (§6.7).
- **G3:** §5.2 on every route, PROGRAM §8 in full (U0–U12, D1–D13, §8.6 regression), a side-by-side fidelity review of every screen against Appendix A, and the ownership check.
- **Publication** waits for Quinton's approval (Q§15.12). Preview deployments are safe: they skip migrations, so his saved program only switches when the production deploy runs PROGRAM's migration.

**Rules for everyone** (restate in every stream prompt): touch only owned files; reading any file is fine; a change needed in someone else's file is a change request (§6.4), never an edit; commit with explicit paths (`git add <paths>`, never `-A` or `.`), never stash, reset or revert another stream's files, never push; use the commit footer from the brief; delete what you replace once nothing imports it (inside your ownership); keep every §3.7 URL working; build from data, never from the example strings in this file.

### 6.1 FOUNDATION and PROGRAM deliverables

**FOUNDATION**
- **F1 — re-theme and compile.** `globals.css`: §1.1 tokens, §1.1.3 Tailwind names, §1.2.3 type classes, §1.3 spacing and radii, §1.6 motion aliases, §1.7.1–3 aliases. `layout.tsx`: one font (§1.2.1), `themeColor` `#000000`, root description (§2.2). Ornaments neutralised and the Tag rewired (§1.7.4–5). `src/lib/appearance.ts`: `NightPref` gains `"off"`, the night variant sets `html[data-night="on"]` instead of `data-phase="seal"`, transparency is ignored. FOUNDATION's lib copy edits (§2.3). After F1 every old screen compiles, re-themes and loses its ornaments.
- **F2 — kit.** §1.4 items 1–24 in `src/components/ui/*` (new files: `hero-card.tsx`, `stat-card.tsx`, `day-strip.tsx`, `up-next.tsx`, `list.tsx`, `check-circle.tsx`, `big-value.tsx`, `number-card.tsx`, `win-card.tsx`, `details-sheet.tsx`, `suggestion-row.tsx`, `ai-chip.tsx`), keeping every existing export and prop working; the budget and test attributes of §5.1, §5.2 and §5.4 (`data-budget-group`, `dataName` → `data-budget-name`, `data-derived`, `data-how`, `data-history` prop on `Row`, `data-gold`). Screen streams put `data-food`, `data-ai-answer`, `data-program-text` and `data-history` on their own text where §5.2 says.
- **F3 — shell and tools.** `shell/*`: TabBar, PlusButton, the workout bar container (`LiveSlot`, rendering WORKOUT's `LiveSlotContent`), PageHeader, BackHeader, `nav.ts` (§3.7), the restyled rail (§3.5), focus-route rules. `shared/Offline.tsx` (§4.12), `(app)/error.tsx`, `global-error.tsx`. `manifest.ts` names and shortcut labels in plain words. `scripts/dev/v3-gates.mjs`, `scripts/dev/budget.mjs`, `scripts/dev/ownership.mjs` (Appendix B).
- **F4 — integration** (after G2): §6.7.

**PROGRAM** — PROGRAM-ARNOLD.md in full: P1 (§7.2: new modules, hooks, migration file, Arnold data, coach, volleyball out of logic, deprecated exports kept for `tsc`) with CR-1 to CR-4 (§6.4), then P2 (delete deprecated exports, files and tests; the no-volleyball gate).

### 6.2 Ownership

Every `.tsx` (and `.ts`, `.css`) under `src/components` and `src/app` has exactly one owner, given by this block. `scripts/dev/ownership.mjs` reads it from this file (Appendix B). An exact path beats a glob; `**` is any depth, `*` stays inside one folder. A stream may create new files only where its rules already match (for example TRAIN's new `src/components/training/OptionsToday.tsx`); anything else needs a change to this block through FOUNDATION.

```ownership
# stream     pattern (exact path, or glob: ** = any depth, * = inside one folder). An exact path beats a glob.
FOUNDATION   src/app/globals.css
FOUNDATION   src/app/layout.tsx
FOUNDATION   src/app/global-error.tsx
FOUNDATION   src/app/manifest.ts
FOUNDATION   src/app/(app)/layout.tsx
FOUNDATION   src/app/(app)/error.tsx
FOUNDATION   src/app/api/**
FOUNDATION   src/app/auth/**
FOUNDATION   src/components/providers.tsx
FOUNDATION   src/components/ui/**
FOUNDATION   src/components/shell/**
FOUNDATION   src/components/art/**
FOUNDATION   src/components/signature/**
FOUNDATION   src/components/shared/Offline.tsx
PROGRAM      src/components/training/hooks.ts
TODAY        src/app/(app)/page.tsx
TODAY        src/app/(app)/recovery/**
TODAY        src/components/now/**
TODAY        src/components/recovery/**
TODAY        src/components/shared/WeightLogSheet.tsx
WORKOUT      src/app/(app)/workout/**
WORKOUT      src/components/workout/**
TRAIN        src/app/(app)/training/**
TRAIN        src/components/training/**
FOOD         src/app/(app)/nutrition/page.tsx
FOOD         src/app/(app)/nutrition/meals/**
FOOD         src/app/(app)/nutrition/scan/**
FOOD         src/components/nutrition/**
FOOD         src/components/meals/**
FOOD         src/components/food-ai/*
FOOD         src/components/food-ai/scanner/**
PROGRESS     src/app/(app)/progress/**
PROGRESS     src/app/(app)/reviews/**
PROGRESS     src/components/progress/**
PROGRESS     src/components/reviews/**
SHEETS       src/app/sign-in/**
SHEETS       src/app/(app)/coach/**
SHEETS       src/app/(app)/nutrition/coach/**
SHEETS       src/app/(app)/settings/**
SHEETS       src/app/(app)/onboarding/**
SHEETS       src/components/offering/**
SHEETS       src/components/oracle/**
SHEETS       src/components/coach/**
SHEETS       src/components/food-ai/coach/**
SHEETS       src/components/settings/**
SHEETS       src/components/onboarding/**
SHEETS       src/components/reminders/**
```

Outside `src/components` and `src/app`: **PROGRAM** owns the files in PROGRAM-ARNOLD.md §7.1 (its `src/lib/**` files, `supabase/migrations/20261021000000_arnold_program.sql`, `scripts/dev/{setup-users,qa-arnold,qa-arnold-ui}.mjs`, `scripts/dev/fixtures/**`). **FOUNDATION** owns every other `src/lib/**` file (changed only where this spec names a change), `public/**`, `next.config.ts`, the rest of `scripts/dev/**`, `CONVENTIONS.md` (one paragraph pointing here) and this file. `src/app/api/**` and `src/app/auth/**` are frozen: no stream changes them; a needed fix is a change request to FOUNDATION. Notes on the block: `signature/**` is FOUNDATION's because its three components are neutralised centrally in F1 and deleted in F4; `shared/WeightLogSheet.tsx` is TODAY's (the weigh-in is a Today flow; Progress and Add only open it); `food-ai/coach/**` is SHEETS' (one Coach screen for `/coach` and `/nutrition/coach`), while the rest of `food-ai` is FOOD's; `LiveSlotContent.tsx` (what the workout bar says) is WORKOUT's and `shell/LiveSlot.tsx` (where it sits) is FOUNDATION's.

| Stream | Builds | Removes (inside its files) | Reads (never edits) |
|---|---|---|---|
| **TODAY** | §4.1, §4.6, the check-in and weigh-in sheets | the statue hero, phase rail, climb rule, Dawn card, rites with AUTO tags, Later/Earlier lists; every volleyball read in `now/CheckIn.tsx`, `now/NowScreen.tsx`, `now/bodies.tsx`, `now/useDayInput.ts`, `now/useNowData.ts`, `recovery/DateStrip.tsx`, `recovery/GuidanceCard.tsx`, `recovery/LedgerCheckIn.tsx`, `recovery/WeeklyReviewCard.tsx`; deletes `recovery/VolleyballSheet.tsx` | day engine, recovery hooks and guidance, `pace()`, meal hooks, TRAIN's `OptionsToday` and `RestIdeas`, FOOD's `RecipeGlyph`, WORKOUT's start flow |
| **WORKOUT** | §4.2 incl. §4.2.15, `LiveSlotContent` | the frieze, sundial, tower, seal panel, hold-to-seal, Inscription styling; volleyball in `workout/inscription/data.ts` | progression, timing, overlap hooks, TRAIN's `ExerciseDetail` (History sheet) and `LibraryPicker` |
| **TRAIN** | §4.3, plus `training/OptionsToday.tsx` (sheet + `useTodayOptions()` hook) and `training/RestIdeas.tsx` for TODAY | temple, block strip, two-button deload card, readiness strip, Week/Program/Lifts segments; deletes `training/VolleyballList.tsx`, `training/VolleyballSheet.tsx`, `training/week/ReadinessStrip.tsx`, `training/week/Temple.tsx`; volleyball out of `DaySheet.tsx`, `ProgramTab.tsx`, `TrainingHub.tsx`, `week/TodaySession.tsx`, `week/WeekTab.tsx` | everything in §6.3 |
| **FOOD** | §4.4 | the coin mosaic (`meals/week/Mosaic.tsx`), Fuel segments, Market styling; volleyball in `meals/week/WeekPlanner.tsx` | meal planner engine, `planFor` labels, `openOffering` |
| **PROGRESS** | §4.5 | terraces, ridge, projection fan, Hall/Gallery styling, the Chronicle story viewer; deletes `progress/athletic/AthleticLogSheet.tsx`, `progress/hall/Athletic.tsx`, `progress/hall/TestSheet.tsx`; volleyball out of `progress/hall/HallTab.tsx`, `progress/context.tsx`, `progress/ProgressScreen.tsx`, `reviews/sections.tsx` | `pace()`, reviews compute, TODAY's `WeightLogSheet` |
| **SHEETS** | §4.7–§4.11 | Log/Ask segments, Oracle styling, the Oath; volleyball out of `onboarding/steps.tsx`, `onboarding/OathArt.tsx`, `onboarding/OathSummary.tsx`, `settings/SettingsView.tsx`, `settings/inputs.tsx`; `oracle/context.ts` suggested questions become PROGRAM's two | FOOD's log panels (mounted as-is), TODAY's `WeightLogSheet`, coach libs, PROGRAM's onboarding plan |

**Components one stream builds and another uses.** The owner lands the V3 version early (its first commit for that file), keeps existing props working (additive changes only), and treats its props as a contract. Consumers import, never edit:

| Component | Owner | Used by |
|---|---|---|
| `shared/WeightLogSheet.tsx` | TODAY | PROGRESS (Log weight), SHEETS (Add › Weigh in) |
| `training/OptionsToday.tsx` (+ `useTodayOptions`) | TRAIN | TODAY (Up next) |
| `training/RestIdeas.tsx` | TRAIN | TODAY (rest-day Up next) |
| `training/ExerciseDetail.tsx`, `training/LibraryPicker.tsx` | TRAIN | WORKOUT (History, Add exercise) |
| `offering/*` (the Add sheet) | SHEETS | FOUNDATION (+ button via the existing store), FOOD (`?add=1`) |
| `nutrition/*Panel.tsx` | FOOD | SHEETS (inside the Add sheet) |
| `meals/shared/RecipeGlyph.tsx` | FOOD | TODAY (Up next, Recently eaten) |
| `workout/LiveSlotContent.tsx` | WORKOUT | FOUNDATION (`shell/LiveSlot`) |
| every `ui/*` primitive | FOUNDATION | everyone |

### 6.3 PROGRAM's interface on screen

Screens read program data only through PROGRAM-ARNOLD.md §7.3. This table says where each piece shows.

| What | PROGRAM API | Where |
|---|---|---|
| Active program, its name | `useActiveProgram()` (`program`, `def.name`, `since`) | Program radios, Settings › Workout value, switch sheet, onboarding caption |
| Switch | `useSetProgram()` (`setProgram`, `pending`) and its toasts | §4.3.7, §4.3.8 |
| The week's templates; any key | `useTemplates()` (`templates`, `byKey`, `all`) | Train, Day sheet, editor, workout, carried swap |
| A date's plan | `planFor()` | every strip, Up next, Train hero, Food "Arms day" |
| Names | `templateLabels(t)`: **`name`** for hero, Up next title, Day sheet, editor title, Finish sheet, summary; **`short`** for the workout top bar, workout bar, Add tile, onboarding rows, "Tomorrow: …", rest-today subtitles; **`abbr`** for strip labels and Food's "Arms day" | everywhere a workout is named |
| Duration | median of the last 4 sessions, else `estimateDurationMin(t)` | hero, Day sheet, Up next |
| Day notes, warm-up | `templateDef(key).notes`, `visibleWarmup()` | editor, Lifts sheet, workout start |
| Rules | `PROGRAMS[program].rules` | "How the plan works" |
| Rest-day ideas | `SUNDAY_RECOVERY` | Train rest day, Today's Ideas sheet |
| Light week, fewer sets, back to normal | `useTrainingWeek().lighter`, `useSetTrainingMode()`, `useLighterSnooze()` | SuggestionRow + §4.3.4 |
| Ease-in after the switch | `useTrainingWeek().easeIn` (CR-4) | SuggestionRow + §4.3.4 |
| Rest today | `useTrainingWeek().restToday` + `useDayPlanWrites().apply()` | Options for today |
| Fatigue overlap | `useOverlapAdvice()` (`preStart`, `nextArmDay`, `inSession`) | Options for today, §4.2.15 |
| Start with changes | `start({ …, adjust, includeOptional })`, `includeOptionalByDefault()` | every Start, "Start with this" |
| Deep link | `startTarget(t, activeKeys)` | `/workout/start?t=` |
| Sets by muscle | `useWeekVolume(week)` (`rows`, `suggestions`, `plannedTotal`) | §4.3.9 |
| Carried swap | `carriedSwaps(all.ppl, all.arnold)`, `prefs.swapsOffered`, `useSaveTemplate` + `substituteExercise` | §4.3.4 |
| New-plan notice | `prefs.programSwitch`, `prefs.switchNoticeSeenAt` (CR-1) | §4.3.8 |
| Next-time weight | `suggest()` through the existing hooks | Today's lifts target, exercise detail, summary |
| Readiness | `computeGuidance()`, `readinessLine()`, `sorenessFocus()` | check-in question 3, Options for today |
| Effort | `t.rir` | "Aim 0–2 reps" (tank row), "Leave 1–3 reps in the tank" (How to) |
| Pickers | `pickableLibrary()` | swap search, Add exercise, editor |
| Lift titles | `exerciseDisplayName()` | exercise detail |

### 6.4 Change requests

A stream that needs something in a file it does not own:
1. writes `CR-<n> <OWNER> <file>: <what> — <why> — <needed by>` in its hand-off note and sends the same line to the owner through the orchestrator;
2. keeps working with what exists (a small adapter inside its own files that only renames or reshapes is fine; copying lib logic into a component is not);
3. the owner lands it in its next commit, additively, so no other consumer breaks, and replies with the commit hash.

A disagreement about program content goes to PROGRAM-ARNOLD.md; about looks or words, to this file. Filed with this spec (PROGRAM lands them in P1):

| CR | Owner | File | Change |
|---|---|---|---|
| CR-1 | PROGRAM | `src/lib/prefs.ts` | Add client-written `switchNoticeSeenAt?: string` (ISO timestamp) to `AppPrefs` and `PrefsPatch`, for §4.3.8. |
| CR-2 | PROGRAM | `src/lib/training/week.ts` | `programLabel(p)` returns `PROGRAMS[p].name` ("Arnold split" / "Push/Pull/Legs"), so every place shows one spelling. |
| CR-3 | PROGRAM | `now/day-engine.ts`, `today/now.ts`, `today/daily-line.ts`, `onboarding/plan.ts`, `recovery/guidance.ts` | The user-visible string changes listed in §2.3. |
| CR-4 | PROGRAM | `src/components/training/hooks.ts` | `useTrainingWeek()` also returns `easeIn: boolean`: PROGRAM §4.2's one-time ease-in condition (within 7 days of `programSince`, mode `standard`, no Arnold session done, not yet dismissed via `useLighterSnooze`). |

### 6.5 Commits and hand-off

- Commit per finished piece, with explicit paths and the footer from the brief. No model names in messages or code.
- A stream's first commit for a shared component (§6.2 table) is that component alone, so consumers can start.
- The hand-off note (in the final message to the orchestrator, not a file in the repo) lists: what was built, by § number; files deleted; the §5.5 and G-1 to G-9 output; change requests filed and their status; anything left for F4; the path of the screenshots taken at 390×844 and 375×667.

### 6.6 What a screen stream can rely on after G1

- Every §1.4 primitive exists in `src/components/ui/*` with the props named there; old class names and old components still compile (aliases, neutralised ornaments), so a stream can rebuild one screen at a time and the rest of its area keeps working.
- The tab bar, +, workout bar container, headers, offline banner and error pages are V3 already; a stream never restyles chrome.
- PROGRAM-ARNOLD.md §7.3 is exported and returns Arnold data for the demo user; the old volleyball fields still exist as deprecated optionals, so removing their UI never breaks `tsc`; the old `PROGRAM*` exports are gone and their importers already point at `programs.ts`.
- CR-1 to CR-4 have landed.
- `v3-gates.mjs`, `budget.mjs`, `ownership.mjs`, `shot.mjs` and `ax-shot.mjs` run against `http://localhost:3400`.

### 6.7 Integration (F4 with P2)

Once every screen stream has passed G2:
- delete every alias of §1.7.1–3 from `globals.css`, the old motion tokens (`gild`, `inscribe`, `count`, `lift`) and the `t-*` aliases;
- delete the neutralised components and their files: `art/**` except the icon wrapper used on sign-in, `signature/**`, `ui/tag.tsx`, `ui/coin.tsx`, `ui/seal-key.tsx`, `ui/hold-button.tsx`, `ui/meter.tsx`, `ui/placard.tsx`, `ui/record-mark.tsx`, `shell/Capsule.tsx`, `shell/OfferingButton.tsx`, `shell/TabHeader.tsx` (each only after `rg` finds no importer);
- delete the statue and texture files in `public/art/` (keep `CREDITS.md` only if a credited asset is still shown) and the `data-phase`, `data-mode="gym"` and `data-transparency` attributes;
- update the ownership block for deleted folders (a rule that matches nothing fails the check) and rerun it;
- PROGRAM P2 in the same window: deprecated exports and files deleted, `no-volleyball.test.ts` on;
- then G3.

---

## 7. Deferred (not in this build)

Not requested, so not designed: a light theme (the app is dark only); desktop-specific layouts (the phone column centred, §3.5); haptics (not possible in an iOS PWA); widgets, Live Activities or Apple Health; bundling SF Pro or any display font (the system font renders on the iPhone); share images of workouts; charts of reps in the tank or rest taken beyond the set times in History; building programs other than the Arnold split and Push/Pull/Legs.

---

## Appendix A. Mockups

Folder: `/tmp/claude-0/-home-user/8aec0eae-e96d-585e-8153-9de2b16d1dbb/scratchpad/simple/final/`. Each name has `name.html` (self-contained, 390 px, dark) and `name.png` (390×844 @2x), plus `name-full.png` when the page is taller and `small/name-375x667.png`. They are generated by `src/__scratch/v3/{kit,today,workout,train,food,progress,sheets}.mjs` (git-excluded): `node src/__scratch/v3/build.mjs && node src/__scratch/v3/render.mjs`, and counted by `node src/__scratch/v3/count.mjs <names>`. Where a mockup and the text disagree, the text wins.

| Section | Mockups |
|---|---|
| §4.1 Today | `today-morning`, `checkin-sheet`, `weighin-sheet` (§4.1.3) · `today-midday` (§4.1.4) · `today-after-workout` (§4.1.5) · `today-evening` (§4.1.6) · `today-night` (§4.1.7) · `today-details` (§4.1.8) |
| §4.6 Check-ins | `recovery` |
| §3.3 / §4.2.12 Workout bar | `workout-bar` (Food with a live workout) |
| §4.2 Workout | `workout-set` (§4.2.3) · `workout-rest` (§4.2.4) · `workout-record` (§4.2.5) · `workout-more`, `workout-swap` (§4.2.6) · `workout-keypad` (§4.2.7) · `workout-lifts` (§4.2.9) · `workout-finish` (§4.2.10) · `workout-summary` (§4.2.11) · `workout-tip` (§4.2.15) |
| §4.3 Train | `train` (§4.3.1) · `train-day` (§4.3.2) · `train-sunday` (§4.3.3) · `train-suggestion`, `train-rest-today`, `train-light-week`, `train-swap-carry` (§4.3.4) · `train-program`, `train-rules` (§4.3.5) · `train-rearrange` (§4.3.6) · `train-switch` (§4.3.7) · `train-new-plan` (§4.3.8) · `train-volume` (§4.3.9) · `train-lifts` (§4.3.10) · `exercise-detail` (§4.3.11) · `template-editor` (§4.3.12) |
| §4.4 Food | `food-today` (§4.4.1) · `food-week` (§4.4.2) · `recipe` (§4.4.3) · `cooking` (§4.4.4) · `grocery` (§4.4.5) · `meal-prefs` (§4.4.6) · `scanner` (§4.4.7) |
| §4.5 Progress | `progress-weight` (§4.5.1) · `progress-pace` (§4.5.2) · `progress-strength` (§4.5.3) · `progress-body` (§4.5.4) · `recap-list` (§4.5.5) · `recap-month` (§4.5.6) |
| §4.7–§4.11 Sheets | `add-sheet` (§4.7.1) · `add-estimate` (§4.7.2) · `coach` (§4.8) · `settings`, `settings-workout` (§4.9) · `onboarding`, `onboarding-program` (§4.10) · `signin` (§4.11) |

57 mockups. Program content in them (names, sets, reps, rests, rules, rest-day ideas, zones) follows PROGRAM-ARNOLD.md as committed in c5c6105. Thursday 22 Oct 2026 is the demo day; the workout tip shows Friday's Chest & Back B, the day it can fire.

## Appendix B. Ownership check

Run from the repo root (FOUNDATION copies the script to `scripts/dev/ownership.mjs` in F3; until then it lives at `src/__scratch/v3/ownership.mjs`):

```
node scripts/dev/ownership.mjs            # exit 0 = pass; --list prints every file with its owner
```

It reads the `ownership` block in §6.2 from this file, walks every `.tsx`, `.ts` and `.css` file under `src/components` and `src/app` (skipping `__scratch`), gives each file the stream of its exact-path rule or else of its glob rules, and fails on a file with no owner, a file two streams' globs both match, two exact rules for one file, or a rule that matches nothing. Result when this spec was committed:

```
files checked: 366 (274 .tsx)
.tsx per owner: {"SHEETS":47,"FOUNDATION":45,"FOOD":63,"TODAY":30,"PROGRESS":39,"TRAIN":28,"WORKOUT":22}
OK: every .tsx under src/components and src/app has exactly one owner; every rule matches a file.
```

It was also checked against a broken copy of the block (TODAY's `now/**` rule removed and FOOD's `food-ai/*` widened to `food-ai/**`): it reported 19 files with no owner (the 13 `now/*.tsx` and 6 `now/*.ts`) and 9 overlaps (every file in `food-ai/coach/`) and exited 1.

```js
// scripts/dev/ownership.mjs — checks docs/DESIGN-V3-SIMPLE.md §6.2 against the tree.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? process.cwd();
const spec = readFileSync(process.env.SPEC ?? join(root, "docs/DESIGN-V3-SIMPLE.md"), "utf8");
const m = spec.match(/```ownership\n([\s\S]*?)```/);
if (!m) { console.error("no ownership block in the spec"); process.exit(1); }

const rules = m[1].split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean).map((l) => {
  const [stream, pattern] = l.split(/\s+/);
  const exact = !pattern.includes("*");
  const rx = new RegExp("^" + pattern.split("**/").map((part) => part.split("**").map((p) => p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")).join(".*")).join("(?:.*/)?") + "$");
  return { stream, pattern, exact, rx, hits: 0 };
});

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== "__scratch" && f !== "node_modules") walk(p); }
    else if (/\.(tsx|ts|css)$/.test(f)) files.push(relative(root, p));
  }
};
walk(join(root, "src/components"));
walk(join(root, "src/app"));
files.sort();

const owner = new Map();
const problems = [];
for (const f of files) {
  const exact = rules.filter((r) => r.exact && r.pattern === f);
  const globs = rules.filter((r) => !r.exact && r.rx.test(f));
  const pick = exact.length ? exact : globs;
  const streams = [...new Set(pick.map((r) => r.stream))];
  pick.forEach((r) => r.hits++);
  if (exact.length > 1) problems.push(`two exact rules for ${f}: ${exact.map((r) => r.stream).join(", ")}`);
  else if (streams.length === 0) problems.push(`NO OWNER  ${f}`);
  else if (streams.length > 1) problems.push(`OVERLAP   ${f}: ${pick.map((r) => `${r.stream} ${r.pattern}`).join(" | ")}`);
  else owner.set(f, streams[0]);
}
for (const r of rules) if (!r.hits) problems.push(`rule matches nothing: ${r.stream} ${r.pattern}`);

const tsx = files.filter((f) => f.endsWith(".tsx"));
const count = {};
for (const f of tsx) { const s = owner.get(f) ?? "?"; count[s] = (count[s] ?? 0) + 1; }
console.log(`files checked: ${files.length} (${tsx.length} .tsx)`);
console.log(".tsx per owner:", JSON.stringify(count));
if (process.argv.includes("--list")) for (const f of files) console.log((owner.get(f) ?? "?").padEnd(11), f);
if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
console.log("OK: every .tsx under src/components and src/app has exactly one owner; every rule matches a file.");
```

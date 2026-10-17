# Project Greek God · The Ascent — DESIGN v2 "Olympus"

**Status:** the authoritative build spec for the UI v2 redesign (branch `ui-v2`). It replaces `DESIGN.md` ("Pantheon") for every screen it covers. `DESIGN.md` is kept unchanged as history. If this file and `DESIGN.md` disagree, this file wins. If this file and `CONVENTIONS.md` disagree on a *data* rule, `CONVENTIONS.md` wins; on a *visual or interaction* rule, this file wins.

**What was chosen.** Quinton picked the **Olympus** concept (statue, gold leaf earned only, the living Now, the Inscription) with **Apex's gym-mode controls** (a visible thumb deck with ±5 lb / ±1 rep steppers above a full-width seal key in the bottom third, a heavy tabular rest timer of 96 px or more, and a plate stack that highlights the plate that changed). Three judges then added binding grafts and must-fixes. All of them are folded in below. Where two of them conflicted, §0.3 records which way it went and why (the rule: more honest, more accessible, more usable one-handed at the gym).

**Design inputs** (scratchpad, not in the repo): `ui-v2/concepts/olympus/` (direction.md, mockups, `board.png`, `board-experience.png`, `lab/`), `ui-v2/concepts/apex/` (direction.md, `workout.html`, `screens/workout.png`), `ui-v2/concepts/ascent/direction.md`, and the audits and judge reports. The mockups show the mood. Where a mockup and this spec disagree, **this spec wins**. The mockups use demo data, a Saturday Push A, Bodoni for daily numbers, 9–10 px labels and blend modes. All of that is wrong for production.

Contents:
- §0 Laws, scope, conflict resolutions
- §1 Visual system: colour, type, spacing, radii, materials, textures, icons, the Tag, motion
- §2 Information architecture and routes
- §3 Screens
- §4 Shared logic contracts
- §5 Stream plan
- §6 Definition of done and verification recipes
- §7 Deferred items

---

## 0. Laws, scope, conflict resolutions

### 0.1 The laws (restate these in every implementation prompt)

1. **Never fabricate.** Every number comes from a log, the plan, a deterministic rule or arithmetic on logs. Missing data shows "—" plus the next step. Projections are labelled `PROJ` and drawn dashed. AI output is labelled `AI` and is never saved without an explicit confirm.
2. **Gold is earned.** Leaf colours mean "you did this" (logged sets, eaten meals, sealed sessions, records, reached terraces) or "the one primary action". Plans are ivory. Misses are quiet outlines, never red. There is **at most one gold-filled control per viewport**.
3. **Aegean is AI only. Cinnabar is errors, destructive actions and pain only.** There is no green and no red for adherence, pace or food.
4. **One number, one definition.** Trend weight, rate, projection, "plan followed" and "sessions sealed" each come from one function in `src/lib` (§4). Every screen calls that function. None of them recompute.
5. **The two daily questions get answers without a tap.** "What do I do now?" (the Now card) and "Am I on track?" (the verdict sentence plus `PROJ`) are both on the first viewport of Now at 390×844, at every hour.
6. **One thumb in a dim gym.** Gym controls are 56 px or taller and sit in the bottom third. Logging a prefilled set is one tap. No gesture is the only way to do anything.
7. **Accessible by construction.** Text meets WCAG AA (4.5:1, or 3:1 for 24 px and up). Non-text state marks meet 3:1. No text is smaller than 11 px. Type is in rem and follows the iPhone text-size setting. Every visual has a VoiceOver sentence. Every motion has a reduced-motion version.
8. **Motion never blocks.** UI feedback runs 150–250 ms on transform, opacity and stroke-dashoffset only. Signature moments may run longer, but content and the primary action are live from frame 0, and any tap skips to the end state.
9. **Keep everything that works.** The workout outbox, device copy and multi-device resync, idempotent food logging, the meal planner engine, reminders, export and account deletion keep their logic. This is a view-layer rebuild on top of `src/lib`. Migrations are additive only, and this spec needs **none** (§4.4).
10. **Cheap to render.** Blur (`backdrop-filter`) is allowed only on the floating capsule, the Offering button and the live slot. No live SVG turbulence or colour-matrix filters, and no `mix-blend-mode` on the statue. Textures are pre-rendered files.

### 0.2 Scope

In scope: every screen and sheet listed in §3, the shell, the visual system, the shared contracts in §4, an offline-first app shell (persisted query cache plus a cached shell), and the dev scripts named in §5.

Out of scope for this build: see §7. Share-card renderers, rest-end Web Push and sleep bands are among the items deferred or rejected.

### 0.3 Conflict resolutions (binding)

| Conflict | Decision | Why |
|---|---|---|
| Olympus vertical-drag load field vs Apex visible steppers | **Visible ±5 lb / ±1 rep steppers** in the thumb deck. Vertical drag is **not built**. A long-press or a tap on the value opens the existing NumberPad | Discoverable, VoiceOver-adjustable, no fight with page scroll |
| Olympus Inter Tight 300 78 px timer vs Apex 132 pt condensed | Instrument face, **weight 700, tabular, 96–120 px**, inside the Olympus sundial arc | Dim-gym legibility, measured by the user judge |
| Bodoni for the daily weight and protein (Olympus) vs "hairlines vanish" (design judge) | **Daily numbers use the Instrument face (600, tabular).** Bodoni Moda is only for monument numbers of **90 px and up**, on obsidian moment surfaces | Legibility at low brightness |
| Instrument face: Inter Tight (Olympus, eng judge) vs system SF Pro (design judge) | The stack is `-apple-system, BlinkMacSystemFont, "Inter Tight", system-ui, sans-serif`. SF Pro renders on the iPhone, with native Dynamic Type metrics and zero bytes. Inter Tight is self-hosted with `preload: false` as the fallback for desktop and Linux Chromium (dev screenshots) | Native metrics on the device he uses; deterministic fallback elsewhere |
| Sleep bands (Olympus) vs bed/up chips (Apex) vs 7-night median prefill (Ascent) | **Real hours, prefilled from the 7-night median, nudged in ±15 min steps, confirmed with one tap.** No bands, no new columns | No false precision; readiness logic unchanged |
| Amber "under" for muscle volume (Apex graft) vs gold-earned law | **No amber hue.** "Under" is a hatched bar, a ▽ glyph and the word "under", in stone | An amber next to leaf gold reads as "earned". Words are clearer than colour |
| Separate ✦ Oracle and + Offering (Olympus) vs one merged Ask & Log entry (design judge) | **One sheet with two modes.** `+` opens it in **Log** mode (natural-language field plus quick actions). `✦` opens it in **Ask** mode with the screen's context attached. One segmented control switches between them | One mental model, two fast doors |
| Statue "never falls" (Olympus) vs gold must track the real trend (design judge) | **The gold tracks the 7-day trend up and down.** A labelled high-water mark ("best trend 168.6") may show as text. Gold he no longer has is never shown | Honesty |
| Gilding after the first weigh-in vs the "needs 4 weigh-ins" guard | **No gilding, pace or projection until 4 weigh-ins exist.** Before that the statue is marble and Now says "3 more weigh-ins to begin the gilding" | One guard everywhere |
| The Chronicle opens itself on the 1st (Olympus) vs never block | **A card at the top of Now's Later list on days 1–3** until he opens it. It never auto-presents | Never block input |
| Hold-to-seal only (Olympus) vs accessibility | Hold 600 ms **and** an accessible path: VoiceOver, Switch Control and keyboard activation open a two-button confirm. The hold bar is a `button` with `aria-describedby` | Accessible finish |
| Ascent mountain: Season view (Olympus) vs a 6-week zoom (judges) | A **6W / 3M / Season** segmented zoom. The default is **3M while the programme is under 12 weeks old, then Season**. Season also shows a "Last 6 weeks" inset | Fixes the squeeze without losing the mountain |
| "Seal the day" writing data | It writes **nothing** to the database. It opens the day summary and stores `pgg.sealed.<date>` locally to collapse Now | No invented record type |

---

## 1. Visual system

### 1.1 Colour tokens

These are defined in `src/app/globals.css` `:root`. Dark is the only theme. The Seal phase (night) and Gym Mode are **variants** applied with attributes on `<html>` (§1.1.4).

#### 1.1.1 Neutrals and text

| Token | Hex | Use |
|---|---|---|
| `--obsidian` | `#050506` | Gym Mode, moments (Inscription, Record, Terrace, Chronicle), sign-in |
| `--night` | `#09090B` | App background |
| `--m1` | `#0F0F12` | Sheets, inset wells |
| `--m2` | `#16161A` | Slabs (the Now card, list groups) |
| `--m3` | `#1E1E23` | Controls, stepper buttons, chips |
| `--m4` | `#28282E` | Selected segment, pressed |
| `--m5` | `#303037` | Pressed on m4 |
| `--vein` | `rgb(236 226 206 / .07)` | Hairline rules |
| `--vein-2` | `rgb(236 226 206 / .11)` | Card edges, dividers |
| `--vein-3` | `rgb(236 226 206 / .18)` | Strong dividers, tag outlines |
| `--ui-line` | `#7A7366` | **Non-text state marks that must reach 3:1**: missed-coin outlines, inactive rail diamonds, control borders that carry meaning, chart axes (3.84:1 on m2, 3.12:1 on m4) |
| `--ivory` | `#F2EBDD` | Primary text (16.8:1 on night) |
| `--stone` | `#B9B1A2` | Secondary text (6.9:1 on m4) |
| `--ash` | `#A39B8D` | Tertiary text and eyebrows (5.3:1 on m4). Raised from Olympus's `#958E81`, which measured 4.5:1 on m4 |
| `--disabled` | `#5E584F` | Disabled controls and decoration only. Never meaningful text |
| `--ink` | `#1A1206` | Text on leaf (9.9:1 on leaf-300) |

#### 1.1.2 Gold leaf ("earned only")

| Token | Value | Use |
|---|---|---|
| `--leaf-100` | `#F8E6B4` | Highlights, the specular band |
| `--leaf-200` | `#EED08B` | Last-10-seconds rest digits, hover on leaf |
| `--leaf-300` | `#E0B866` | **Gold text and earned marks** (10.6:1 on night, 7.8:1 on m4) |
| `--leaf-400` | `#CC9D4C` | The minimum for gold text (5.9:1 on m4). Gold text is never darker than this |
| `--leaf-500` | `#AD7F35` | Leaf shadows, the outer rims of coins |
| `--leaf-600` | `#865F25` | Deep leaf, column flutes |
| `--leaf-700` | `#573D18` | Engraving shadows |
| `--leaf-tint` | `rgb(224 184 102 / .10)` | Earned-row background |
| `--leaf-line` | `rgb(224 184 102 / .38)` | Gold hairlines, the outline on the next set and the next coin |
| `--leaf` (material) | `linear-gradient(112deg, #A97A30 0%, #D9AA52 18%, #F3D791 34%, #FFF1C8 44%, #EBC671 56%, #C99640 72%, #EDCD84 86%, #B88A3A 100%)` | Gold-leaf surfaces: columns, the laurel, terrace contours |
| `--leaf-btn` | `linear-gradient(180deg, #FBE6AA 0%, #EDC97E 30%, #D9AA55 62%, #CC9A45 82%, #E6C075 100%)`, plus a `::after` specular band `linear-gradient(105deg, transparent 38%, rgb(255 255 255 / .35) 48%, transparent 58%)`, plus `inset 0 1px 0 rgb(255 250 230 / .6)` | **The one primary action** per viewport. Label: ink, 600, uppercase, +.12em |
| `--glow` | `0 14px 30px -14px rgb(214 166 80 / .65)` | Gold elements only |

**The gold rules:**
- **One gold-filled control per viewport.** "Gold-filled control" means anything with `--leaf-btn` or a solid leaf background that is interactive. `Button variant="primary"` sets `data-gold="fill"` so `scripts/dev/gold-audit.mjs` (§6) can count them.
- **Earned marks** (logged-set ticks, coin rims, raised columns, laurels, the statue) may be leaf. They must stay small (a coin is at most 44 px across) and use rims, glyphs or strokes rather than full leaf faces wherever several sit together. For example, a perfect week of coins must not become a gold wall.
- Pillars, rites and meters stay **ivory until earned**. Protein turns leaf only when the goal is hit. A rite turns leaf only when it is done.
- Gold text uses `--leaf-300` or `--leaf-400`. It is never used on leaf surfaces.

#### 1.1.3 Signal and series

| Token | Hex | Use |
|---|---|---|
| `--aegean` | `#8FB0E0` (tint `rgb(143 176 224 / .10)`, line `rgb(143 176 224 / .32)`) | **AI only**: the `AI` tag, the Oracle hairline, ESTIMATE card rims, the ✦ icon |
| `--cinnabar` | `#E58068` (tint `rgb(229 128 104 / .12)`) | Errors, destructive buttons, pain notes, failed sync. **Never** food, pace, adherence or misses |
| `--series-protein` | `= --leaf-300` | Protein. It is the lever, so it is the gold series |
| `--series-kcal` | `= --ivory` | Calories |
| `--series-carbs` | `#D08A5C` terracotta | Carbs |
| `--series-fat` | `#A895D0` porphyry | Fat |
| `--series-water` | `#7FBDB6` verdigris | Water |
| `--series-sleep` | `= --stone` | Sleep |
| Projection | `--ivory` at 70%, dashed 4/4 | Every `PROJ` line |
| Corridor | `rgb(242 235 221 / .06)` fill and `--ui-line` edges | Pace corridors and target zones |

#### 1.1.4 Variants

- **Seal (night).** `html[data-phase="seal"]` is set by the Now screen from the Day Engine (§4.2), and app-wide while the local time is 21:00–05:00. It is also set always when Settings → Appearance → Night is "Always". It changes `--ivory` to `#E4DCCB` and `--leaf-300` to `#CDA75C`, halves the spotlight opacity and removes sheen and glow. On Now only, it moves body text up one step (`.t-body` to 1.0625rem). Every pairing still passes AA.
- **Gym.** `[data-mode="gym"]` sits on the Gym Mode root. The background is `--obsidian`. There are no veins, no glass and no grain. The spotlight appears only behind the rest dial. All chrome is opaque.
- **Reduce transparency.** `html[data-transparency="reduce"]` is set from the Settings toggle. Safari has no media query for it. It replaces every glass surface with `#18181C` plus a `--vein-2` border.

#### 1.1.5 Compatibility aliases (so old screens keep working during the build)

Foundation keeps the variable names that the Tailwind `@theme inline` block maps today and points them at the new values. Existing classes (`bg-s3`, `text-fg-2`, `border-line`, `text-gold-300` …) then re-theme at once. Streams delete their uses of the aliases as they rebuild each screen.

| Old var | Points to |
|---|---|
| `--bg` / `--bg-deep` | `--night` / `--obsidian` |
| `--surface-1..5` | `--m1..--m5` |
| `--text-1/2/3`, `--text-disabled` | `--ivory`, `--stone`, `--ash`, `--disabled` |
| `--line-hair` / `--line` / `--line-strong` / `--line-field` / `--line-gold` | `--vein` / `--vein-2` / `--vein-3` / `--ui-line` / `--leaf-line` |
| `--gold-50..900` | 50 `#FBF1D6` · 100 `--leaf-100` · 200 `--leaf-200` · 300 `--leaf-300` · 400 `--leaf-400` · 500 `#BC8E40` · 600 `--leaf-500` · 700 `--leaf-600` · 800 `--leaf-700` · 900 `#2E2010` |
| `--success` (+tint) | `--leaf-300` (+`--leaf-tint`). Success meant "earned" |
| `--warning` (+tint) | `--stone` (+`rgb(185 177 162 / .10)`). A caution is a word, not a colour |
| `--danger` (+tint) | `--cinnabar` |
| `--lapis-text/tint/line`, `--info` | aegean values. Any non-AI use left in an old screen is a bug for the owning stream to remove |
| `--s-gold / s-marble / s-terracotta / s-porphyry / s-lapis / s-verdigris` | leaf-300 / ivory / carbs / fat / **water** (verdigris `#7FBDB6`) / water |

New Tailwind colours exposed through `@theme inline`: `obsidian, night, m1..m5, vein, vein-2, vein-3, ui-line, ivory, stone, ash, ink, leaf-100..700, leaf-tint, leaf-line, aegean, aegean-tint, aegean-line, cinnabar, cinnabar-tint, carbs, fat, water`.

**Charts and SVG never hard-code hex.** They read `var(--…)`. The 104 copied gold/background hexes in 16 files are removed by each file's owning stream (§5).

### 1.2 Typography

#### 1.2.1 Families (all loaded with `next/font/google` in `src/app/layout.tsx`, self-hosted, latin subset, `display: "swap"`, so the CSP is unchanged)

| Role | Google Fonts name | next/font import | Weights and styles | Preload | CSS var |
|---|---|---|---|---|---|
| **The voice**: titles, verdicts, film titles | **Cormorant Garamond** | `Cormorant_Garamond` | 500, 600; italic 500 | yes (600 only) | `--font-voice` |
| **The monument**: 90 px+ moment numbers only | **Bodoni Moda** | `Bodoni_Moda` | variable, `axes: ["opsz"]`; used at 500 with `font-variation-settings: "opsz" 28` (a sturdier optical cut) | no | `--font-monument` |
| **The instrument**: everything functional | system SF Pro first, then **Inter Tight** | `Inter_Tight` | 400, 500, 600, 700 | **no** (iPhone uses SF) | `--font-inter-tight` |

Tailwind mapping: `--font-sans: -apple-system, BlinkMacSystemFont, var(--font-inter-tight), system-ui, sans-serif` · `--font-voice: var(--font-cormorant), ui-serif, Georgia, serif` · `--font-monument: var(--font-bodoni), ui-serif, Georgia, serif`. The old `font-serif` and `font-num` utilities alias to `font-voice` and `font-sans` until every screen is migrated. **Cinzel, Manrope and Barlow Condensed are removed** from `layout.tsx` once no file references them (Foundation removes them at the end of its phase; it replaces `--font-cinzel`/`--font-manrope`/`--font-barlow` with aliases so nothing breaks before then).

Numerals: the Instrument face always uses `font-variant-numeric: tabular-nums lining-nums` for any number that changes (timers, weights, macros, set values). Cormorant numerals never appear in data.

Hairline rules:
- Cormorant is never smaller than **1.25rem** (20 px). The verdict italic is never smaller than 1.5rem.
- Bodoni Moda is never smaller than **90 px** and never used in Gym Mode. `scripts/dev/type-audit.mjs` (§6) fails if `.t-monument` resolves under 90 px.
- No weight under 400 anywhere. Gym Mode uses 600 or heavier for every value.

#### 1.2.2 Root and Dynamic Type

```css
html { font-size: 100%; }                       /* 16px on desktop and Chromium */
@supports (font: -apple-system-body) {
  html { font: -apple-system-body; }            /* iPhone: 17px by default, follows the text-size setting */
}
body { font-family: var(--font-sans); font-size: 1rem; line-height: 1.45; font-weight: 500; }
```

All type sizes are in rem. Sizes that must not drop below the floor use `max(11px, …)`. Giant numerals clamp so they never overflow at accessibility sizes. Layout switches for large text use **container queries in rem** (a rem in a container query follows the root size, so a 390 px phone at an AX size measures as a narrow container): `@container (width < 24rem)` switches to the AX layout. Every screen in §3 states what it does in that case.

#### 1.2.3 Scale (utility classes defined by Foundation in `globals.css`; streams use these, not `text-[Npx]`)

Sizes shown at 16 px root / iPhone default 17 px.

| Class | Face, weight | Size | Line height, tracking | Use |
|---|---|---|---|---|
| `t-monument` | Bodoni Moda 500, opsz 28, tnum | `clamp(5.625rem, 26vw, 7.5rem)`: 90–120 px | .9 / −.01em | Record number in the Inscription, Chronicle numbers, the Terrace title number, the Summit. Obsidian surfaces only |
| `t-timer` | Instrument 700, tnum | `max(96px, min(30vw, 7.5rem))`: 96–120 px | .9 / −.04em | The rest timer (Gym Mode and cooking timers) |
| `t-dial` | Instrument 600, tnum | `min(3.5rem, 16vw)`: 56 / 59.5 px | .95 / −.035em | Daily hero numbers: trend weight, protein, the scale stepper |
| `t-num-l` | Instrument 600, tnum | `min(2rem, 10vw)` | 1 / −.02em | Deck values, set tower values, pillar numbers |
| `t-num-m` | Instrument 600, tnum | 1.375rem | 1.1 | Stats and macros |
| `t-num-s` | Instrument 600, tnum | 1.0625rem | 1.2 | Inline numbers in rows |
| `t-title-1` | Cormorant 600 | 2.125rem | 1.05 / −.01em | Screen and session titles ("Push A", "Bench Press", "The week's table") |
| `t-verdict` | Cormorant italic 500 | 1.75rem | 1.12 | The verdict line ("On pace for Olympus.") and Oracle verdicts |
| `t-title-2` | Cormorant 600 | 1.375rem | 1.15 | Section titles |
| `t-film` | Cormorant 600, uppercase | ≥ 1.5rem as set per use | 1.1 / +.2em | Film titles: SEPTEMBER, OLYMPUS, TERRACE III |
| `t-title-3` | Instrument 600 | 1.0625rem | 1.3 | Row titles, card titles |
| `t-body` | Instrument 500 | 1rem | 1.45 | Body. Inputs are always at least 16 px |
| `t-callout` | Instrument 500 | .9375rem | 1.4 | Secondary body |
| `t-meta` | Instrument 500 | `max(12px, .8125rem)` | 1.35 | Captions (stone) |
| `t-eyebrow` | Instrument 600, uppercase | `max(11px, .6875rem)` | 1.2 / +.14em | Labels. Ash on night/m1/m2, **stone on m3/m4** |
| `t-tag` | Instrument 600, uppercase | `max(11px, .6875rem)` | 1 / +.1em | The provenance Tag only |
| `t-key` | Instrument 600, uppercase | 1rem | 1 / +.12em | Labels on gold keys |

**Retired:** `t-hero`, `t-plaque`, the Cinzel all-caps headers, Barlow condensed numbers and `num-*`. They stay as aliases until each owning stream removes its last use.

### 1.3 Spacing, layout, radii, z-order

- **Spacing** is a 4-pt grid: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56` (`--sp-1 … --sp-9`). Tailwind's default spacing is already 4-based, so use `p-4`, `gap-3` and so on, never arbitrary values.
- **Gutters:** `--gutter: 20px` for text columns (16 px below 360 px width). Card padding 16. Gap between sections 32. Gap between list rows 0, with rows separated by `--vein` hairlines.
- **Composition.** Use fewer, larger slabs. Most content sits on night as **museum placards** (hairline-ruled rows with an eyebrow). Only the Now card, sheets and grouped settings lists are slabs. The old stack of identical cards is gone.
- **Widths.** The phone column is the full width minus the gutters. From 768 px, content is centred at `max-width: 560px`. From 1024 px, the shell shows a 76 px rail (248 px from 1280 px) and content may use a 2-column grid up to `max-width: 1040px` (§2.4). The 15 ad-hoc `max-w-[Npx]` values are replaced by `max-w-col` (560) and `max-w-wide` (1040).
- **Radii** (inner radius = outer radius − padding): `--r-tag 5` · `--r-field 12` · `--r-btn 16` · `--r-card 22` · `--r-sheet 30` · `--r-capsule 32` · seals and coins `9999`. Tailwind: `rounded-tag/field/btn/card/sheet/capsule/full`. The 453 `rounded-[N]` uses are migrated by each owning stream.
- **Touch targets:** at least 44×44 everywhere (pad the hit area with an `::before` if the visual is smaller). **Gym Mode controls, the seal key and the deck steppers are at least 56 px tall.** Chips are 44 px tall. Capsule tabs are 52 px wide or more.
- **Z-order:** `--z-content 0 · --z-sticky 20 · --z-deck 40 (gym deck inside the focus route) · --z-chrome 50 (capsule, Offering, live slot) · --z-sheet 60 · --z-confirm 65 · --z-toast 70`. Arbitrary `z-[N]` values are banned.
- **Safe areas:** `--safe-top` and `--safe-bottom` from `env()`. The capsule sits at `bottom: calc(var(--safe-bottom) + 8px)`. Screens pad their bottom by `--chrome-clear` = capsule height 64 + 16 + safe bottom (+ 60 when the live slot shows). A 24 px scroll-edge fade sits under the chrome.

### 1.4 Materials, light, elevation

- **Marble darkness.** Night carries `/art/marble-veins.svg` (already pre-rendered) at **4% opacity, only on monument surfaces**: the Now hero, the Inscription, the Chronicle, the Terrace card and sign-in.
- **One light.** Each screen has one warm radial spotlight from about 10 o'clock: `--spot: radial-gradient(70% 50% at 18% 0%, rgb(236 200 140 / .10), transparent 65%)`. On Now it matches the statue's own lighting. In Gym Mode it sits only behind the rest dial.
- **Gold leaf.** Leaf surfaces use `--leaf`, a 1 px top highlight (`inset 0 1px 0 rgb(255 248 225 / .55)`) and `--glow`. Grain on leaf surfaces taller than 64 px is the pre-rendered `/art/grain.png` (§1.5) at 6% normal blend. Coins and seals use a vertical leaf and an inner beaded rim (`/art/coin-rim.svg`).
- **Glass.** Glass is used only on the floating capsule, the Offering button and the live slot: `background: rgb(24 24 28 / .86); backdrop-filter: blur(18px) saturate(150%)`, a `--vein-2` border and the e2 shadow. It falls back to opaque `#18181C` under reduce transparency and when `@supports not (backdrop-filter: blur(1px))`. Sticky headers are opaque night with a gradient fade, **never blurred**. No more than three blurred elements may be on screen, and each is at most 64 px tall.
- **Elevation:**

| Level | Spec | Used for |
|---|---|---|
| `e1` | `inset 0 0 0 1px var(--vein), inset 0 1px 0 rgb(255 244 220 / .05)` | Default surfaces and slabs |
| `e2` | e1 + `0 30px 60px -30px #000` | The Now card, floating chrome |
| `e3` | `inset 0 1px 0 rgb(255 244 220 / .08), 0 -30px 60px -20px #000` | Sheets, the gym deck |
| `glow` | `--glow` | Gold elements only |

### 1.5 Textures and imagery (all pre-rendered; Foundation owns `public/art/**`)

| Asset | Spec | Made by |
|---|---|---|
| `public/art/statue-marble.webp` | 900×1200 **RGBA** (alpha from `statue-mask.webp` upscaled), marble grade `#09090B → #F3EDE1`, ≤ 90 KB | `scripts/dev/grade-statue.mjs` (sharp, already in node_modules), deterministic |
| `public/art/statue-gold.webp` | 900×1200 RGBA, same alpha and identical blacks; gold-leaf grade (S-curve LUT `#120B04 → #CF9A3A → #FFF4D6`, local contrast, leaf grain baked in), ≤ 110 KB | same script |
| `public/art/grain.png` | 256×256 monochrome noise tile, ≤ 20 KB | same script |
| `public/art/ridge.svg` | The decorative mountain silhouette for Ascent. A smooth (non-jagged) path, no filters | Foundation |
| `public/art/coin-rim.svg` | The beaded coin rim, `currentColor` | Foundation |
| `public/art/marble-veins.svg` | Exists. Keep it | — |

Gilding composites the two WebPs as **two stacked images inside an overflow-clipped wrapper, counter-translated** (the technique `signature/GildedBust.tsx` already uses). There is no `mix-blend-mode`, no CSS mask on the photo and no SVG filter. The molten edge is a 3 px leaf-100 gradient bar at the gild line, masked by the statue alpha (`mask-image: url(statue-mask.webp)`, which is one static mask, not a filter), animated with opacity only.

**Statue budget:** the bust appears **only** on Now (hero and Unveiling), the Chronicle title chapter, the Oath and sign-in. Never on Dawn as a crop, never in Gym Mode and never more than once per screen. **Ornament budget:** one ornament family per screen (the statue, the temple, the mountain or the laurel).

### 1.6 Iconography

A custom 24-unit grid, 1.6 stroke, round caps and joins, drawn to sit beside Instrument text. Foundation adds them to `src/components/art/icons.tsx` as components that take `className` and are `aria-hidden` by default:

`NowSunrise` (tab Now) · `TrainColumn` (Doric column, tab Train) · `FuelAmphora` (tab Fuel) · `AscentPeak` (mountain with a summit star, tab Ascent) · `OfferingPlus` · `OracleSparkles` (twin sparkles, always aegean) · `LaurelSprig` · `Volleyball` · `PlateStack` · `TempleGlyph` · `SealTick` · `CoinMissed` · `Moon` (lights out).

Meal glyphs on coins come from the existing per-recipe `meals/shared/RecipeGlyph.tsx` (Fuel owns it), so coins show **per-meal** glyphs (bagel, bowl, salmon), not per-slot ones. Lucide stays for utility glyphs (chevrons, share, ellipsis) with `strokeWidth={1.6}`. Verify names in `lucide-react.d.ts` as CONVENTIONS.md requires.

### 1.7 The provenance Tag (one component, fixed vocabulary)

`src/components/ui/tag.tsx` (Foundation). Types live in `src/lib/provenance.ts`.

```ts
export type TagKind = "LOG" | "PLAN" | "RULE" | "CALC" | "PROJ" | "AI";
export const TAG_MEANING: Record<TagKind, string> = {
  LOG:  "You logged this",
  PLAN: "From your meal or training plan",
  RULE: "From a fixed rule in the app (progression, deload, pace call)",
  CALC: "Arithmetic on your logs",
  PROJ: "A projection from your current trend. Not a promise",
  AI:   "Written by AI. Check it. Nothing is saved until you confirm",
};
```

```tsx
<Tag kind="PROJ" />                       // renders "PROJ"
<Tag kind="AI" detail="estimate" />       // renders "AI · ESTIMATE"
<Tag kind="CALC" explain="2,140 eaten + 380 + 770 planned" />  // tappable: a 44 px hit area opens a small popover
```

| Kind | Look (20 px tall pill, `t-tag`, padding 0 6, `rounded-tag`) | VoiceOver label |
|---|---|---|
| LOG | ivory text, `--vein-3` solid outline | "logged" |
| PLAN | ivory text, `--ui-line` **dashed** outline | "planned" |
| RULE | stone text, `--ui-line` solid outline, a small ⌗ glyph | "app rule" |
| CALC | stone text, `--ui-line` dotted outline | "calculated from your logs" |
| PROJ | ivory text, `--ui-line` dashed outline, a ⤳ glyph | "projection" |
| AI | aegean text, `--aegean-line` outline, `--aegean-tint` fill | "AI, not saved" or "AI estimate" |

Rules:
- Tags go on **derived** numbers and calls (trend, rate, projections, totals of plans, suggestions, estimates), not on every raw value. A raw logged value needs no tag unless it sits beside derived ones.
- A tag is never gold and never the only carrier of meaning: the sentence around it says the same thing.
- **Mapping from old badges** (Foundation keeps `ui/badge.tsx` exports compiling as wrappers until no caller is left):
  - `LoggedBadge` → `Tag LOG`.
  - `PlanBadge` → `Tag PLAN`.
  - `EstimateBadge` → `Tag AI detail="estimate"` when the source is AI. Meal-planner and recipe macros computed from the ingredient database are `CALC`.
  - `SuggestedBadge` → `RULE` for rule engines (deload, progression, calorie rule). Coach suggestions are `AI`.
  - `SourceBadge` and `DatabaseBadge` stay as **source chips**, not tags (they cite a URL or database).
  - `PRBadge` → the laurel `RecordMark`. `FirstBenchmarkBadge` → the text mark "FIRST BENCHMARK" (ivory, `t-tag`).
- Dev mock AI responses add a second tag-styled chip "DEV MOCK" (unchanged behaviour).

### 1.8 Motion

#### 1.8.1 Tokens (`src/lib/motion.ts` plus CSS vars; Foundation)

| Token | CSS var | motion.ts | Value |
|---|---|---|---|
| press | `--dur-press` | `DURATION.press` | 90 ms |
| fast | `--dur-fast` | `DURATION.fast` | 160 ms |
| base | `--dur-base` | `DURATION.base` | 220 ms |
| route | `--dur-route` | `DURATION.route` | 200 ms |
| lift | `--dur-lift` | `DURATION.lift` | 320 ms |
| gild | `--dur-gild` | `DURATION.gild` | 900 ms (range 600–1400 by size) |
| inscribe | `--dur-inscribe` | `DURATION.inscribe` | 800 ms |
| count | `--dur-count` | `DURATION.count` | 700 ms |
| ease-out | `--ease-out` | `EASE.out` | `cubic-bezier(.22,1,.36,1)` |
| ease-gold | `--ease-gold` | `EASE.gold` | `cubic-bezier(.16,1,.3,1)` |
| ease-sheet | `--ease-sheet` | `EASE.sheet` | `cubic-bezier(.32,.72,0,1)` |
| ease-pop | `--ease-pop` | `EASE.pop` | `cubic-bezier(.34,1.56,.64,1)` |
| springs | `--ease-spring`, `--ease-bounce` | `SPRING.*` | keep the existing sampled `linear()` curves |

Existing tokens (`--dur-slow`, `--dur-sheet`, `--dur-ring`) remain as aliases (`slow` → lift, `sheet` → 400 for vaul, `ring` → gild).

Rules: animate only `transform`, `opacity` and `stroke-dashoffset`. UI feedback is 150–250 ms. Use `m.*` under LazyMotion, never `motion.*`. Reduced motion comes from `prefers-reduced-motion` **or** Settings → Appearance → Motion = Reduce. That setting writes `html[data-motion="reduce"]`, and `prefersReducedMotion()` in motion.ts reads both. `MotionConfig reducedMotion` follows the same signal. Route view transitions last 200 ms, are skipped when a second navigation starts within 400 ms, and keep `::view-transition { pointer-events: none }` short enough never to eat a gym tap. **Gym Mode never runs a route view transition between sets.**

#### 1.8.2 Named transitions

| Name | Where | Spec | Reduced motion |
|---|---|---|---|
| **Press** | Every pressable | `scale .97` in 90 ms ease-out, spring release (the existing `press`/`press-soft` utilities) | Opacity dip to .7 for 90 ms |
| **Tick** | Any number that changes in place (kcal, trend, timer seconds are excluded) | Per digit: old `translateY(-40%)` + fade out, new one rises from +40%, 180 ms ease-gold | Instant swap with a 120 ms crossfade |
| **Count** | A hero number arriving (Inscription record, trend after Inscribe) | Counts to its value over 700 ms ease-out (CountUp writes textContent) | Final value |
| **Seal** | A logged set; Eaten on a coin; a rite done | The mark goes from outline to leaf, `scale .6 → 1` in 160 ms ease-pop | Instant leaf |
| **Lift** | Sheets and push routes | `translateY 24 → 0` + fade, 320 ms ease-sheet (vaul keeps its own 400 ms curve) | 150 ms fade |
| **Turn** | The Now card changes phase | Crossfade + 8 px rise, 240 ms ease-out | 150 ms crossfade |
| **Gild** | Gold filling: statue, column `scaleY` from the base, meters `scaleX`, coins | 600–1400 ms ease-gold, scaled by distance | Final state |
| **Inscribe** | Stroke draws: laurel stems, terrace contours, chart lines on first show | `stroke-dashoffset` 700–900 ms ease-out | Drawn |
| **Sheen** | One highlight pass over gold (record, Inscription number, column bloom) | A masked `translateX` band, 900 ms, **once per event** | None |
| **Spotlight** | Moments, sign-in | Opacity 0 → 1, 600 ms | Static |
| **Capsule shrink** | The capsule on scroll down | Labels fade and the capsule narrows to icons (`scale` + `opacity` of labels), 220 ms. CSS `animation-timeline: scroll()` where supported, a rAF transform fallback | No shrink |
| **Route** | Tab-to-tab and push routes | 200 ms crossfade; push/pop is `translateX 24px` + fade (the existing `data-nav` system) | 150 ms fade |
| **Lights Out** | Begin on Now → Gym Mode | The session title ("Push A") is a named `<ViewTransition>` element that morphs into the Gym Mode header in ≤ 240 ms. The deck is live from frame 1 | 150 ms crossfade |
| **Sundial** | Rest arc | The arc drains linearly with `stroke-dashoffset` and `animation-delay = −elapsed` (the existing rest.tsx pattern). Bezel ticks every 15 s | **Still drains** (it carries information); no glow |
| **Final 10** | Last 10 s of rest | Digits turn leaf-200, the arc gains a 2 px leaf outer stroke, one edge flash at 0:00 (opacity 0 → .35 → 0, 400 ms), and one pulse of the seal key (`scale 1 → 1.03 → 1`, 300 ms) | Digits change colour only; "GO" replaces the flash |
| **The Gap** | After Inscribe on Dawn | The trend Ticks to its new value, the projection Ticks, and the `PROJ` line on the climb rule redraws (300 ms dashoffset). If the verdict changed it crossfades | Values swap; nothing moves |

#### 1.8.3 Signature moments (detailed in §3)

| Moment | Trigger | Length | Skippable | Blocks input |
|---|---|---|---|---|
| **The Unveiling** (§3.1.6) | First open of each local day, Now | ≤ 1.6 s | Any tap | **Never**: content is final at frame 0 |
| **Gold-Leaf Record** (§3.2.6) | A logged working set beats the all-time best e1RM by ≥ 1 lb | ≤ 1.0 s, then a compact banner up to 4 s | Any tap; "Keep lifting 2:41" is the dismiss | Never: the deck stays live |
| **The Inscription** (§3.3) | Session sealed | ~5.5 s | Any tap skips to the end; Done is live from frame 0 | Never |
| **The Terrace** (§3.6.3) | First Ascent visit after the trend crosses a terrace | ~3 s, then the title card stays until tapped | Any tap | Never |
| **Day seal** | Seal the day on Now | 600 ms: the day's mark gilds | — | Never |
| **Week pediment** | All planned sessions of the week sealed (one volleyball swap counts) | 800 ms on Train → Week | — | Never |
| **The Chronicle** (§3.8) | Opened from Now's card or Ascent | Self-paced story | Swipe down or ✕ | — |
| **The Summit** | Trend inside the band (180–185) for the first time | Once: fully gilded statue + laurel + OLYMPUS film title | Any tap | Never |

There is no confetti, no Lottie or Rive, no idle loops and no tilt parallax. Signature moments never repeat on a revisit (guards live in `localStorage` keys listed per moment).

---

## 2. Information architecture

### 2.1 The shell

```
 ┌──────────── floating capsule (glass, 64 px, r32) ────────────┐   ┌────┐
 │  Now    │   Train   │   Fuel   │   Ascent                   │   │ +  │  ← Offering (Ask & Log, 56 px, glass)
 └───────────────────────────────────────────────────────────────┘   └────┘
   ▲ Live slot (52 px, above the capsule, only while a session is live)
   ✦ Oracle (44 px) and avatar initial (44 px): top-right of each tab's header row
```

- **Capsule** (`src/components/shell/Capsule.tsx`): a `<nav aria-label="Primary">` with 4 tabs (icon + label, 52 px+ wide each). The active tab has an m4 pill (spring indicator, translate only) and leaf-300 icon and label. **Gold is not used for inactive tabs.** Tapping the active tab scrolls to top. On scroll down the labels hide (Capsule shrink). Hidden on focus routes and while the keyboard is open.
- **Offering button** (`OfferingButton.tsx`): a 56 px glass circle to the right of the capsule with `OfferingPlus` in ivory, labelled "Log or ask". It opens the Offering sheet in Log mode (§3.9).
- **Live slot** (`LiveSlot.tsx`): only while a session is `active` and the route is not the workout itself. It is a 52 px glass pill above the capsule with full capsule width. Content (`LiveSlotContent`, owned by Gym): `PUSH A · 1:12 rest · Set 3 · 190 × 5`, with the rest seconds ticking (tabular). The last 10 s brighten. When rest has ended: "Rest ended 0:42 ago". A tap returns to Gym Mode. It has **no** log button (prevents misfires). This replaces the old LiveDock and the FAB. The bottom edge never stacks more than capsule + slot.
- **Header row** of each tab: an eyebrow (date or section) on the left. On the right, ✦ (aegean, 44 px, label "Ask the Oracle", opens the Offering sheet in Ask mode with this screen's context) and the **avatar** (44 px circle, the initial of `profile.display_name`, falling back to "·" and **never** the email initial; links to `/settings`). The large page title is the first heading. The sticky top bar shows the title once it scrolls under (the existing `useScrolledPageTitle`, on an opaque bar).
- **Desktop ≥ 1024 px:** a left rail replaces the capsule (Now, Train, Fuel, Ascent, then a divider, then Oracle, Chronicle, Settings). The Offering is a 48 px button at the top of the rail. The live slot becomes a card at the bottom of the rail.
- **Offline banner** (`shared/Offline.tsx`, Foundation): a 36 px opaque strip under the header saying "Offline · showing saved data · changes sync when you're back". Never a toast.

### 2.2 Where everything lives

| Area | Home | How you get there |
|---|---|---|
| Now (Day Engine, statue, check-in, weigh-in, rites, later/earlier) | `/` | Tab |
| Train (week temple, block strip, readiness + volleyball, volume vs zones, Program, Lifts) | `/training` with `?tab=week\|program\|lifts` | Tab |
| Gym Mode (live workout) and the Inscription | `/workout/[id]` (focus route, no chrome) | Begin on Now or Train, Offering → Start workout, the live slot |
| Fuel (Today timeline, Week mosaic, Market) | `/nutrition` with `?tab=today\|week\|market` | Tab |
| Recipe, cooking mode, meal preferences | `/nutrition/meals/recipe/[key]`, `/nutrition/meals/cook/[key]`, `/nutrition/meals/preferences` | From any meal, from Week's ☰ |
| Scanner | `/nutrition/scan` (focus-like: the capsule hides) | Offering → Scan |
| Ascent (Mountain, Hall, Gallery) | `/progress` with `?tab=mountain\|hall\|gallery` | Tab |
| **The Oracle** (AI coach, including the Food Coach) | A sheet over any screen (`OfferingSheet` in Ask mode). The full-page form is `/coach` | ✦ in every header; Offering → Ask |
| **The Chronicle** (monthly reviews) | `/reviews` (index of Books) and `/reviews/[month]` (story viewer; `?view=ledger` for the full printable document) | Ascent → Mountain → Chronicles; Now's card on days 1–3 |
| **Recovery ledger** (readiness history, sleep, habits/rites editor, water history, weekly review) | `/recovery` | Train's readiness strip, Now's rites "Edit", Settings |
| Morning check-in | Inline on Now (Dawn) | Now; Offering → Check-in (`/?dawn=1`) |
| Weigh-in | Inline on Now (Dawn); a sheet anywhere | Offering → Weigh-in |
| Settings | `/settings` | Avatar |
| Onboarding (the Oath) | `/onboarding` | First sign-in |
| Sign-in | `/sign-in` | Signed out |

### 2.3 Every existing URL keeps working

Each owning stream implements these in its page component (no Next.js redirects, so query strings survive and nothing changes server-side):

| Existing URL | Behaviour in v2 | Owner |
|---|---|---|
| `/` | Now | Now |
| `/training`, `?tab=program`, `?tab=history`, `?tab=exercises`, `?day=YYYY-MM-DD` | Train. `program` → Program, `history` and `exercises` → Lifts (with the history or library sub-view), `?day=` opens that day's sheet. Default tab is **week** (the old default was program) | Train |
| `/training/exercise/[slug]`, `/training/program/[key]` | Unchanged routes, restyled | Train |
| `/workout/[id]`, `/workout/start?t=` | Gym Mode; start flow unchanged | Gym |
| `/nutrition`, `?date=`, `?add=1`, `?tab=search\|recent\|saved\|manual`, `?meal=` | Fuel → Today for that date. `?add=1` opens the Offering sheet in Log mode with the slot from `?meal=` and the old log tab preselected (the existing LogSheet panels are reused inside it) | Fuel (the opener calls the Offering API, §3.9.4) |
| `/nutrition/meals` (+ `?week=next`, `?day=`, `?generate=1`) | Fuel → Week with the same params | Fuel |
| `/nutrition/meals/grocery` (+ `?week=`) | Fuel → Market | Fuel |
| `/nutrition/meals/recipe/[key]`, `/cook/[key]`, `/preferences` | Unchanged routes, restyled | Fuel |
| `/nutrition/scan` | Scanner | Fuel |
| `/nutrition/coach` (+ `?c=`) | The Oracle page with Fuel context (thread `c` opened) | Sheets |
| `/coach` (+ `?c=`, `?q=`) | The Oracle page | Sheets |
| `/progress`, `?tab=weight\|roadmap` → Mountain; `?tab=strength\|athletic` → Hall; `?tab=body\|photos` → Gallery (with that section scrolled to); `?log=1` → opens the weigh-in sheet | Ascent |
| `/recovery`, `?date=` | Recovery ledger | Now |
| `/recovery?checkin=1` | Navigates to `/?dawn=1`, which opens the check-in on Now | Now |
| `/reviews`, `/reviews/[month]` | Chronicle index and story | Ascent |
| `/settings`, `?reset=1` | Settings | Sheets |
| `/onboarding`, `/sign-in`, `/auth/*` | Unchanged routes | Sheets (auth routes untouched) |
| Manifest shortcuts and reminder URLs (`/nutrition?add=1`, `/progress?tab=weight&log=1`, `/progress?tab=photos`, `/recovery`, `/reviews/YYYY-MM`) | All covered above | — |

`src/components/shell/nav.ts` (Foundation): `PRIMARY_NAV` = Now `/`, Train `/training`, Fuel `/nutrition`, Ascent `/progress`. `SECONDARY_NAV` (rail and Settings links) = Oracle `/coach`, Chronicle `/reviews`, Recovery `/recovery`, Settings `/settings`. `isFocusRoute` adds `/nutrition/scan`. `navDirection`'s `SECTIONS` order in `motion.ts` becomes `["/", "/training", "/nutrition", "/progress", "/coach", "/reviews", "/recovery", "/settings"]`, and its tests are updated.

### 2.4 Duplication removed (one home per fact)

- **Habits / mission** exist once, as **Rites** on Now (edited in the Recovery ledger).
- **Water** has one meter (Fuel → Today) and one quick control (the water rite on Now and Offering → Water). The Recovery water card becomes history only.
- **The weekly schedule and training mode** are edited only in Train → Program. Settings links there.
- **The temple (colonnade)** appears in Train → Week and in the Inscription only.
- **Macros** use one visual language: a meter with a hatched "planned" extension. There are no rings and no coloured dot chips.
- The old Progress triple "+ Log" becomes one add button per section (measurements, photos, athletic tests). Weigh-ins go through the Offering or Dawn.
- **Session length** is the median of the last 4 sessions of that template (`useTypicalDurations`, existing), shown as "~68 min" everywhere.

---

## 3. Screens

Every screen section lists: layout (top to bottom at 390×844), states (fresh, empty, missing data, offline, error), AX behaviour (container `< 24rem`) and VoiceOver. Demo numbers below are examples. Build from real data. The real schedule is the profile's `weekly_schedule` (Push A is **Monday** by default) plus `day_plans` overrides, resolved with `planFor()`.

### 3.1 Now (`/`)

Owner: **Now stream**. Data: `useTodayModel` (existing) + `pace()` + `dayState()` + `useReadiness` + habits + planned meals.

#### 3.1.1 First viewport (Fuel, Train, Dusk phases)

1. **Header row** (safe top + 8): eyebrow `SAT 17 OCT · DAY 41` · ✦ · avatar.
2. **Statue hero** (≈ 300 px tall; 220 px when the viewport is under 700 px tall):
   - Right 60%: the `Statue` art component gilded to `gildFraction()` (§4.1.4), under the spotlight.
   - Left column:
     - Eyebrow `WEEK 6 OF 47`.
     - **The trend** in `t-dial`: `168.4` with the meta `lb · 7-day trend` and `Tag CALC`.
     - The scale line (`t-meta`, stone): `Scale 168.6 · 7:04 am` (LOG), or `No weigh-in today · last 168.2 Fri`.
     - **The verdict** in `t-verdict`: "On pace for Olympus." (the copy table in §4.1.3).
     - The pace line (`t-callout`): `+0.40 lb a week · ~184.9 lb by 1 Aug` + `Tag PROJ`.
3. **Climb rule** (full width, 44 px): a hairline from start to band with a leaf diamond at the trend. Below it, `t-meta`: `163 · 27% of the climb · Terrace III ≈ 14 Nov` + `PROJ` · `288 days · 180–185`. A tap opens Ascent → Mountain.
4. **The Now card** (m2 slab, r22, e2, padding 16):
   - **Phase rail** (§3.1.3).
   - Eyebrow: `NEXT · 4:30 PM`.
   - Title in `t-title-1`: `Push A`.
   - Detail line: `6 lifts · 17 sets · ~70 min`.
   - Key-lift row: `Bench press  190 × 5  from 185 × 6` + `Tag RULE` (progression).
   - Readiness chip: `Ready to push · check-in 7:12`.
   - **The one gold control**: `Begin Push A` (56 px, full width, `data-gold="fill"`).
   - At 390×844 the gold button's bottom edge sits **above the fold and above the capsule** (y ≤ 844 − chrome-clear). Verify at 375×812 as well.
5. Below the fold:
   - **Today's three** (three placard columns, ivory until earned): Train `4/6` this week · Protein `121/185 g` · Sleep `7 h 30` last night.
   - **Rites**: up to 6 habit seals (44 px). The water rite carries two chips, `+250` and `+500`. Tapping a seal toggles that habit log. "Edit" links to `/recovery#habits`.
   - **Later today** (a time-ordered list from `dayState().later`): planned meals with an `Eaten` 44 px button (outline), the session with ▶ `Begin`, pending rites and a "Chronicle · Book I · September is ready" card on days 1–3 of a month until it's opened.
   - **Earlier** (one collapsed row): `Earlier · weigh-in · check-in · 4 meals logged` → expands to the list.
   - **Latest record** (one laurel plaque, from `latestRecords`).
6. Bottom padding is `--chrome-clear`. A 24 px scroll-edge fade makes sure **no row with a control ever sits under the capsule or the Offering button** when scrolling stops. Verify at 375 width and at AX sizes.

#### 3.1.2 The phases (from `dayState()`, §4.2)

| Phase | Hero | Now card content | The one gold control |
|---|---|---|---|
| **Dawn** | Statue dimmed (opacity .55) under a rose spotlight `rgb(236 160 150 / .10)`; the trend and verdict still show | "Morning, Quinton. Three questions, then the scale." (`t-verdict`), the check-in (§3.1.4), then the scale stepper (§3.1.5) | `Inscribe 168.4` |
| **Fuel** | Normal | The next uneaten planned meal: time, name, `380 kcal · 30 g` (PLAN), and the consequence line `If you eat it: 2,520 kcal · 151 g` (CALC). Secondary: `Swap`, which opens the meal menu | `Eaten` |
| **Train** | Normal | The session (§3.1.1 item 4) + the pre-workout meal row if one is planned within 90 min before | `Begin {session}` |
| **Live** | Normal | Mirrors the live set: `Bench press · Set 3 · 190 × 5 · rest 1:12` | `Return to Push A` |
| **Refuel** | Normal | The **Inscription chip** (records count + laurel, links to the session summary) + the post-workout meal (first uneaten planned meal after the session ended): `Salmon bowl at 6:30 closes 35 of 64 g` (CALC) | `Eaten` |
| **Dusk** | Normal | Gaps: `64 g protein to go · 2 planned meals close it` (CALC), rites left, tomorrow's session | The next gap's action (`Eaten`, or `Log food`, which opens Offering) |
| **Seal** | Night variant (§1.1.4); statue at .8 | Day summary: kcal and protein vs target, sessions sealed, rites. Carry-overs read "moved to tomorrow" (never "failed"). Tomorrow's session | `Seal the day` (opens the summary card and gilds the day mark; writes nothing to the database) |
| **Rest day / volleyball day** | Normal | The Train phase is replaced by "Rest day · walk, stretch, sleep 8 h" or "Volleyball day · fuel both" (from `restDayRecommendations`) | The next meal's `Eaten`, or none |

Rules:
- A skipped phase collapses into one quiet chip in Earlier: "Dawn · 2 left". Never a red badge and never a count of failures.
- Missing data shows "—" plus the next step. The card is never blank.
- **Turn** animates a phase change only when the user is looking (`document.visibilityState === "visible"`). The engine re-evaluates every minute (`useNowMinute`) and on focus.
- `Eaten` writes through the existing idempotent `useLogPlannedMeal` (one client id per row instance) with a 5 s Undo toast. A long-press or the ⋯ button means "Eaten, but changed" and opens the existing `LogMealSheet` with servings editable. ⋯ is the visible, non-gesture path.

#### 3.1.3 Phase rail with time marks

A 44 px band at the top of the Now card. It is not interactive (`aria-hidden`; the lists below carry the same facts).
- A time axis runs from 06:00 to 23:00.
- Six phase labels in `t-eyebrow` (Dawn, Fuel, Train, Refuel, Dusk, Seal) sit at each phase's start time for today. On rest days the label "Rest" replaces Train.
- The current phase label is leaf-300. The others are ash. Inactive diamonds use `--ui-line` (3:1).
- **Event marks** (from `dayState().marks`) sit on the axis:
  - meals: 8 px coin dots, solid leaf rim = eaten, hollow ivory = planned;
  - the session: a 12 px column glyph;
  - lights out: `Moon` at `reminders.sleep.time`, or 22:30 when unset.
- A leaf diamond marks now.

#### 3.1.4 Dawn check-in (3 questions, saved as he taps)

The data model is unchanged (`recovery_logs`: `sleep_hours numeric(4,2)`, `sleep_quality`, `energy`, `soreness`, `fatigue`, `stress` 1–5, `pain_notes`, `volleyball`).

| Q | Prompt | Control | Writes |
|---|---|---|---|
| 1 | "How long did you sleep?" | A stepper prefilled from `sleepPrefill()` (§4.5): `7 h 30` with ∓15 min (44 px) and a `Confirm` chip. With no history the value is "—" with the hint "Goal 8 h", and the first ± tap starts from the goal | `sleep_hours` |
| 2 | "How do your legs feel?" | 5 chips: None · Light · Some · Sore · Very sore | `soreness` 1–5 |
| 3 | "Energy right now?" | 5 chips: Drained · Low · Okay · Good · Fresh | `energy` 1–5 |

- **Each answer saves immediately** with `useSaveCheckin`. It **merges** with any existing row for the day, so a field answered on `/recovery` is never cleared. The answered question then collapses into a chip line (`7 h 30 ✓ · Legs: Light ✓`). A half-finished morning is never lost.
- "Add detail ›" opens the optional fields: sleep quality, fatigue, stress, pain note (cinnabar label), volleyball yesterday.
- When the last question is answered, the readiness line from `readinessLine()` (existing) replaces the questions: "Ready: train Push A as planned" with `Tag RULE`.
- Tap count: **3 taps** with a sleep prefill (Confirm, a legs chip, an energy chip).

#### 3.1.5 The scale stepper ("Inscribe")

- `t-dial` number. Its starting value is the **last logged weigh-in**, shown in grey with the caption `Friday was 168.0`.
- ∓0.2 lb buttons (56 px). Tapping the number opens a decimal keypad.
- **Nothing is saved until `Inscribe 168.4`** (the gold control). The write goes through `useWeightMutations` (existing, with Undo).
- After Inscribe comes **The Gap** (§1.8.2): the trend and projection Tick to their new values.
- With no weigh-ins ever, the stepper starts empty: "Enter today's weight". The button reads `Inscribe` and is disabled until there is a value.
- Before / after hint: "Before food · after the bathroom" (t-meta).

#### 3.1.6 The Unveiling

- **When:** the first Now render of each local day (`localStorage pgg.unveil = YYYY-MM-DD`), but only once the hero data has loaded. It never plays in Dawn while the check-in has focus, and never under reduced motion (then: a 150 ms fade).
- **What is final at frame 0:** all text, numbers, the Now card and the gold control. **They render in their end state from the first frame.**
- **What animates:**
  1. Spotlight up, 0–600 ms.
  2. The gold line rises from yesterday's gild fraction (`localStorage pgg.gild.last`) to today's (Gild, 300–1200 ms).
  3. The molten edge brightens and settles (opacity only).
- If the fraction did not change, only the spotlight plays.
- Any tap anywhere jumps to the end and is passed through to its target.

#### 3.1.7 States

- **Fresh** (onboarded, no logs):
  - The statue is pure marble.
  - The trend is "—" with "Weigh in to begin the gilding".
  - The verdict line is "Your pace appears after 4 weigh-ins." (no `PROJ`).
  - The climb rule shows start → band only.
  - The Now card runs the normal phases. With no meal plan: "No meals planned · Plan this week" (a link to Fuel → Week; not gold if Begin is visible).
  - The rail shows no meal marks.
  - Today's three show "—" with next steps.
- **1–3 weigh-ins:** the trend shows (CALC). The scale line shows. The statue is still marble with "3 more weigh-ins to begin the gilding". The verdict is "Your pace appears after 4 weigh-ins."
- **Weigh-in older than 7 days:** the trend is computed at the last weigh-in (existing rule), with the caption `trend as of 9 Oct · weigh in to update`.
- **Offline:** everything renders from the persisted cache (§5, Foundation). Writes queue where an outbox exists (workout). Other writes show "Offline · try again when you're back" inline (existing behaviour).
- **Error:** `ErrorNote` with Retry inside the affected block only. The rest of Now still renders.

#### 3.1.8 AX (container `< 24rem`)

- The statue becomes a 120 px thumbnail **beside the climb rule**. The trend, verdict and pace line take the full width.
- The Now card stacks: the title wraps and the key-lift row moves under it. The gold control stays full width.
- The rail hides its labels and keeps the marks. The phase name moves into the eyebrow.
- Today's three becomes a vertical list. Rites wrap to 3 per row.
- The 5-chip check-in rows become a vertical list of 44 px rows.

#### 3.1.9 VoiceOver

- **Statue:** "Your statue, gilded to 27 percent of the climb. Trend 168.4 pounds."
- **Verdict region:** one sentence from `pace().ariaLabel`. For example: "Trend 168.4 pounds, gaining 0.4 pounds a week, projected 184.9 on 1 August, on pace."
- **Now card:** `role="region"` + `aria-labelledby` its title.
- **Phase rail:** hidden. The eyebrow states the phase.
- **Eaten:** "Mark rice cakes, honey and whey as eaten, 380 calories, 30 grams protein".
- **Check-in chips:** a radio group per question.

### 3.2 Gym Mode (`/workout/[id]`, live)

Owner: **Gym stream**.

The **view layer** of `LiveWorkout.tsx` (1,420 lines) is split into presentational components. **Data, outbox, device copy, resync and finish logic stay exactly as they are** (`lib/workout/*`, `components/workout/stores.ts`, `data.ts`, the existing state hooks). Extracting hooks from LiveWorkout is allowed. Changing what they do is not.

#### 3.2.1 Layout at 390×844 (root `[data-mode="gym"]`, obsidian, opaque, no capsule)

| Zone | Height | Content |
|---|---|---|
| **Top bar** | 52 + safe top | ⌄ minimise (44, returns to the previous route; the live slot appears there) · centre `PUSH A` (`t-eyebrow` ivory) over the elapsed time `21:05` (`t-num-s`, tabular) + a small "screen awake" dot (Wake Lock state, re-requested on `visibilitychange`) · `Finish` (outline 44, top-right) |
| **Set frieze** | 24 | 17 segments grouped by lift (filled leaf = logged, ivory outline = this set, `--ui-line` = later), and `2 / 17 sets · ends ~17:38` (CALC from the typical duration) |
| **Lift header** | ~120 | Eyebrow `LIFT 1 OF 6 · CHEST · TRICEPS`. `t-title-1` `Bench Press` + swap ⇄ and ⓘ (44 each). Target line: `190 × 5–8 · up 5 from 185 × 6` + `Tag RULE`. Warm-up as **one line**: `Ramp-up 45×10 · 95×5 · 135×3 ✓` (tap to expand). **The record carrot**, when computable (§3.2.5) |
| **Sundial rest** | ~210 | A 180° arc (stroke 6) with bezel ticks every 15 s, labelled for VoiceOver as remaining rest. Above the digits: `REST · ends 4:53` (t-eyebrow). **Digits: `t-timer` (96–120 px, 700, tabular)**. While idle the digits show the planned rest (`2:00`) in ash with "Rest starts when you seal" |
| **Rest controls** | 56 | `−15` · `Skip` · `+15` (each ≥ 56 px tall, m3, r16) |
| **Set tower** | 76 | Up to 3 cells across: previous, current and next set of this lift. Each cell shows `SET 2`, `190 × 5` (t-num-l) and its **timing mark** (§3.2.4). The current cell has a leaf-line outline |
| **Plate stack** | 64 | `Per side 45 · 25 · 2.5 + 45 bar` (t-callout) and a drawing of one sleeve, plates to scale, **48 px tall**, labelled per side. **The plate that changed since last session is leaf** with the caption `2.5 = today's +5 lb` (CALC). Hidden for non-barbell equipment |
| **Thumb deck** (sticky, e3, m1) | 64 + 12 + 64 + safe | Two steppers side by side: **load** `− 190 lb +` (±5 lb, or ±2.5 kg) and **reps** `− 5 reps +` (±1; seconds ±5 for timed sets). Each stepper is 64 px tall with 56×64 − and + buttons. The value is `t-num-l`. Tapping or long-pressing the value opens the existing `NumberPad`. Below: **the seal key**, full width, 64 px, `--leaf-btn`: `SEAL SET 3 · 190 × 5 ✓` |

- The deck, the key and the rest controls take ≈ 250 px, which is the **bottom 30–35%**.
- The middle (lift header → plates) scrolls if needed. **Its padding-bottom equals the deck height, and a change of current set scrolls that set's cell into view.** The deck never hides the active set row at any text size.
- With no rest running, the sundial zone keeps its height (no layout shift).

#### 3.2.2 Logging

- **One tap** on the seal key logs the shown values. This is the existing `tapLogsGhost` behaviour: prefilled suggested or previous values.
- **Change the load, then log: 2 taps** (`+`, then seal).
- The steppers change the *current set's draft*, which uses the existing draft/ghost model (`ghostFor`, `resolveLog`). Validation messages appear inline above the deck (existing `validateCell`).
- After a seal:
  1. The cell's mark Seals (160 ms).
  2. The rest timer starts on its own (existing `startRest`).
  3. The deck advances to the next set (existing `upNextSet`).
  4. The key label updates.
- When every set of the session is logged, the key becomes **`HOLD TO SEAL PUSH A`** (§3.2.7).
- Exercise menu, notes, swap, add or remove set, warm-up toggle and reorder keep their existing sheets (`sheets.tsx`), restyled. They are reached from ⓘ / ⇄ / ⋯ in the lift header, never from the deck.
- Lift navigation: the frieze is tappable (44 px rows in an expanded "All lifts" sheet). Swiping is not required.

#### 3.2.3 Rest

- Seconds come from `useClockSec` and `RestState` (existing). Only the timer re-renders.
- −15 / +15 / Skip call the existing `adjustRest` / skip.
- **Final 10** (§1.8.2), and the optional chime (existing `restChime` pref) at 0.
- Away and back: "Rest ended 0:42 ago" is recomputed from `endAt` (existing `endedWhileAway`).
- **No rest-end Web Push** (§7).
- `role="timer"` with polite announcements at 60 / 30 / 10 / 0 s (existing `announcement()`).

#### 3.2.4 Set timing marks (from `setTiming()`, §4.3)

| Timing | Glyph | Word | Colour |
|---|---|---|---|
| `record` | `LaurelSprig` | "record" | leaf-300 glyph and word, leaf-tint cell |
| `beat` | `SealTick` in a leaf circle | "beat last" | leaf-300 |
| `matched` | `=` | "matched" | ivory |
| `below` | `–` | "below last" | stone |
| `first` | — | "first benchmark" | ivory, `t-tag` |
| `null` (no prior) | — | "logged" | stone |

**Never red.** Every mark is glyph + word. VoiceOver reads "Set 2, 190 pounds for 5, beat last time".

In deload sessions the comparison uses only prior deload sets of the same index. When none exist the timing is `null` (§4.3).

#### 3.2.5 The record carrot

- When the exercise has prior history (`prior.sets > 0`), with load W on the deck, compute the smallest reps r ≤ 12 with `beatsRecord(e1rm(W, r), best)`. Show it in `t-meta` + `Tag CALC`: `6 reps sets a record · e1RM 228, best 222`.
- If no r ≤ 12 qualifies, show nothing.
- **With no history: `FIRST BENCHMARK` and no carrot.**

#### 3.2.6 Gold-Leaf Record

**Trigger:** `classifyLog()` returns `pr` for the sealed set (the one record rule, unchanged). The moment runs in place:
1. 0–160 ms: the cell Seals with a laurel.
2. 120–820 ms: a laurel Inscribes around the value in the set tower.
3. 300–1000 ms: one Sheen over the cell.

At the same time a **compact banner** slides over the lift header (never over the deck):
- `NEW RECORD · Bench Press · e1RM 228 (+6)`;
- a single button **`Keep lifting · 2:41`**, whose label is the live rest countdown;
- any tap dismisses it, and it fades after 4 s.

The deck stays live the whole time. The VoiceOver announcement is assertive once: "New record. Bench press 190 for 6, estimated max 228, up 6."

The guard is the existing `markMoment(sessionId, slug)`: once per exercise per session.

**Reduced motion:** the laurel and the banner appear without travel or sheen.

For a first log: no moment. The cell shows `first benchmark` and the banner reads `FIRST BENCHMARK · Bench Press` for 2 s, with no laurel.

#### 3.2.7 Finishing (2 actions: Finish → hold Seal)

- `Finish` (top-right), or the key once everything is logged, opens the **Seal panel** (a sheet, not bookkeeping). It shows:
  - `14 of 17 sets logged`;
  - if any are unlogged, **one inline row**: `3 sets not logged · they're dropped when you seal` with a secondary `Log them first`, which closes the panel;
  - the hold bar `HOLD TO SEAL` (64 px, leaf-btn; a fill grows over 600 ms).
- Releasing early cancels.
- **Accessible path:** a VoiceOver double-tap, Switch Control or the keyboard (Enter/Space) on the hold bar opens a two-button confirm, `Seal session` / `Not yet`.
- With 0 sets logged, the panel offers `Keep training` / `Discard` (the existing rules).
- The seal calls the existing `finish()` path **unchanged**, including multi-device "finished elsewhere" handling and errors shown inline in the panel.
- On success, navigate within the route to the Inscription.

#### 3.2.8 Lights Out entry and the minimised slot

- Begin (Now or Train) calls `useStartWorkout()` (existing), with Lights Out (§1.8.2) as the view transition. **Set 1 is visible and loggable with no scroll** because the warm-up is collapsed.
- ⌄ minimises: the user returns to the previous tab, and the live slot (§2.1) shows the session. **Gym Mode auto** (Settings, default on): when the app opens or comes back to the foreground with a session active, it lands in Gym Mode instead of Now.

#### 3.2.9 States

- **Fresh user:** no prior history. Every first log shows `first benchmark`. There are no carrots, and the set tower's previous cell reads "—".
- **Offline:** sets queue in the device copy (existing). A small "Offline · 3 sets waiting to sync" line sits under the frieze (stone). Seal works offline exactly as today (existing reconcile).
- **Stale session** from a previous day: the existing stale banner, restyled. Finish or discard.
- **Edit mode** (`mode="edit"`, editing a past session): the same layout without rest. The key reads `SAVE SET`, and Finish becomes `Done`.

#### 3.2.10 AX (container `< 24rem`)

- The sundial becomes a **linear bar** (6 px) above the digits. The digits stay at 96 px minimum.
- The set tower becomes a vertical list of the 3 cells.
- The plate drawing hides. The plate text line stays.
- The deck steppers stack (load above reps), each still 64 px. The seal key stays at the bottom.
- The middle region scrolls.

### 3.3 The Inscription (session sealed)

Owner: **Gym**. Rendered by `/workout/[id]` when the session status is `done` (replaces `SessionSummary.tsx`; keep its data hooks). Obsidian, marble veins, spotlight.

**Frame 0 shows:** the title row (`SESSION SEALED · Push A · Mon 19 Oct · 5:41 pm`), the stats row, the per-lift rows, the refuel card, the next-time rule, `Done` (the gold control, bottom, 56 px) and, behind ⋯, `Edit sets`. The animated layers are the laurel, the record number count, the sheen and the temple column. **Any tap skips to the end.**

| Time | Animated layer |
|---|---|
| 0–600 ms | Spotlight cone opens |
| 100–1000 ms | Laurel stems Inscribe; leaves grow from their bases (70 ms stagger) |
| 750 ms | `NEW RECORD` eyebrow rises |
| 950–1650 ms | The record e1RM in **`t-monument`** counts from the prior best (222) to the new best (228) |
| 1850 ms | One Sheen over the number |
| 2050 ms | `Bench Press · 190 × 6 · you planned 5 · +6 over 222` |
| 3500 ms | Today's column in the week temple Gilds from the base (`scaleY`, 800 ms) with one bloom |

Content order:
1. **Records first.** With several records, the largest gain is the monument and the others are plaques below it. With none, there is no laurel: the title is `t-title-1` "Push A, sealed." and the first stat leads.
2. **Stats:** duration · sets `17/17` · volume moved (`sessionTotals`) + `volumeDeltaPct` vs the last same template (CALC, words, never red).
3. **Per-lift rows** (the Classification): each lift shows its best set, then the delta vs last time as a word and number (`+6 e1RM`, `= last`, `+2 reps`, `−1 rep`) with its timing mark (§3.2.4). Rows that are below last are stone, never red.
4. **Refuel card:** the first uneaten planned meal after the session, e.g. `Salmon bowl at 6:30 closes 35 of 64 g` (CALC). It has a secondary `Eaten` (outline, because Done holds the gold). With no plan: `64 g protein to go today · Log food` (opens Offering).
5. **Next-time rule:** `Next Push A: bench 190 × 5–8, hold` + `Tag RULE`, from `suggest()` on the updated history for each main lift (at most 3 lines).
6. **The temple** (Colonnade) with today's column, and `Next · Sun · Legs B`.
7. `Done` returns to Now (Refuel phase).

Unlogged sets were already handled at the seal (§3.2.7). The Inscription shows `14 of 17 planned sets` as a plain stat with no guilt copy.

**Share** is **not shown** until the share-card renderer exists (§7). **Past sessions** (`/workout/[id]` for an old session from history) show the same layout with no animation.

**Reduced motion:** the final composition after a 150 ms fade.

**AX:** the monument number clamps (`t-monument` has its own clamp). Rows wrap. The temple scrolls horizontally inside its own container, never the page.

**VoiceOver:** a heading "Session sealed", then "New record: bench press, estimated max 228 pounds, up 6", then the rows in order.

### 3.4 Train (`/training`)

Owner: **Train stream**. Segments: **Week · Program · Lifts** (`Segmented`, 44 px). The default is Week.

#### 3.4.1 Week

1. **Header:** eyebrow `TRAIN` · ✦ · avatar. `t-title-1` `Week 6`, meta `19–25 Oct · push, pull, legs`, and on the right `4/6` (t-num-m) with `RAISED`.
2. **Block strip** (near the top, 44 px):
   - One segment per week since the last deload (`sessions.mode === "deload"`), or since the programme start.
   - The current week is outlined. Each completed hard week is ivory filled.
   - A marker sits at **hard week 5** labelled `Deload window` + `Tag RULE` (the threshold `deloadAdvice` uses).
   - If `training_mode === "deload"`: `Deload week` fills the current segment.
   - This is the honest version of a "block": the app has no fixed mesocycle, so the strip shows the rule, not an invented plan.
3. **Deload advice** (only when `deloadAdvice().suggest`), placed directly under the strip:
   - Title `A lighter week is due`, the reasons (existing copy), `Tag RULE`.
   - Buttons: `Not yet` and `Plan a light week`. The latter goes through the existing mode change with a confirm.
4. **The temple** (Colonnade, Foundation art; data from `weekDays()`):
   - sealed = gold columns;
   - volleyball = `Volleyball` glyph;
   - today = dashed leaf outline;
   - future = `--ui-line` outlines;
   - missed = a quiet short outline (no red).
   - Labels under each column: `MON / Push A` (t-eyebrow, stone).
   - A tap opens the day sheet (existing `DaySheet`: move, swap, volleyball).
   - Pediment: gilds when `weekComplete()` (once per week, existing guard).
5. **Today's session** row: `TODAY · 4:30 PM` (from the day schedule), `Push A`, `6 lifts · 17 sets · bench 190 × 5`, and `Begin` (the gold control of this viewport). On rest days: `Rest day` + tomorrow's session.
6. **Readiness + volleyball strip** (2 placards, 72 px):
   - `Readiness: Ready to push · check-in 7:12` (from `useReadiness`; "—" plus "Check in on Now" before a check-in);
   - `Volleyball: 1 this week · Thu` (from `volleyballSessions7d` + `volleyballAdvice`).
   - Each links to `/recovery#history`.
7. **Hard sets per muscle vs target zone:**
   - One row per muscle group (from `weeklySetsByMuscle`, this week so far).
   - Each row has a bar from 0 to 24 sets with the zone band (e.g. 10–20 sets; `RULE`, constants in §4.7).
   - The fill is ivory. Inside the zone: a ✓ glyph + "in zone". Under: a hatched remainder up to the zone, ▽ + "under". Above: △ + "above".
   - **No amber, no red.**
   - Copy above the bars: "Planned sessions left this week add ~X sets" (CALC from the remaining templates).
8. **Missed workout** prompts (existing `missedWorkouts` / `rescheduleOptions`): one quiet row, "Pull B wasn't logged · Move it", never a warning colour.

#### 3.4.2 Program

- The split and its templates: rows linking to `/training/program/[key]`, which is the **template editor**. The existing `TemplateEditor` is restyled: Cormorant title, exercise rows with targets, add, substitute and reorder with visible ↑ ↓ buttons, validation.
- **Weekly schedule** (the only editor): 7 rows `Mon · Push A ▾` (existing `useSaveSchedule` + `scheduleIssues`).
- **Training mode** (Standard / Intro volume / Deload).
- **Usual training time** (new, §4.4): a time picker writing `prefs.day.trainAt`, with the hint "Now uses this to know when to get you ready".
- Volleyball sessions per week.

#### 3.4.3 Lifts

- **Library** (`?tab=exercises` → Lifts/Library): search, muscle filters, rows with the best e1RM and a 28-day sparkline (stroke only, leaf for the trend).
- **History** (`?tab=history` → Lifts/History): sessions newest first, each with its timing summary (`3 records · 8 beat last`).
- **Exercise detail** (`/training/exercise/[slug]`):
  - the e1RM chart (SVG or Recharts reading CSS vars, laurel diamonds on record points);
  - the set table with timing marks from `setTiming` against the previous session;
  - the how-to;
  - substitutions.

#### 3.4.4 States, AX, VoiceOver

- **Fresh:** the temple shows planned columns only. The block strip has one segment. The volume bars are empty with "Bars fill as you log sets". The readiness placard reads "Check in on Now".
- **AX:** the temple shrinks to 7 compact columns with labels below; at very narrow sizes it becomes a 7-row list ("Mon · Push A · sealed"). Volume bars stack the label above the bar.
- **VoiceOver:**
  - temple: "Week 6: 4 of 6 sessions sealed. Monday Push A sealed. Thursday volleyball…";
  - each volume row: "Chest, 8 hard sets, target 10 to 20, under".

### 3.5 Fuel (`/nutrition`)

Owner: **Fuel stream**. Segments: **Today · Week · Market**. Recipe, cooking mode and preferences push from here.

#### 3.5.1 Today: plan and diary as one timeline

1. **Header:** eyebrow `FUEL` · date switcher (existing `DateSwitcher`; today by default) · ✦ · avatar.
2. **Protein hero:** `t-dial` `121` + `/ 185 g` (meta). The leaf meter shows eaten, and a **hatched extension shows the planned remainder** (PLAN). On the right: kcal `2,140 / 3,300` (t-num-m).
3. **Compact meters:** carbs, fat and water (the series colours). The water row has `+250` and `+500` chips (44 px, existing `useWaterMutations`, Undo).
4. **The day line** (CALC): `Log the rest as planned and today lands at 3,485 kcal · 219 g` + `Tag CALC` (`explain` lists the addends). With no remaining plan: `64 g to go · nothing else planned today`.
5. **Timeline** (time column 56 px, rows ≥ 56 px):
   - **Eaten rows** (solid): coin with a leaf rim and the per-meal glyph, name, `857 kcal · 70 g`, and `as planned` (when linked to a planned meal) or `added` (unplanned). Tag LOG when the macros came from his own entry, or the source chip for database foods.
   - **NOW line:** a leaf diamond + `NOW · 3:47 PM` hairline.
   - **Planned rows** (hollow): time from the day schedule (§4.4), name, `380 kcal · 30 g` + `Tag PLAN`, and **`Eaten`** (min 72×44, outline). **The due row's `Eaten` is the one gold fill** when no other gold is in view. ⋯ opens Swap / Edit servings / Cook / Remove from plan (the existing meal menu). Long-press `Eaten` means "Eaten, but changed" (the same as ⋯ → Edit servings).
   - **Session block:** `4:30 · Push A · ~70 min` with the column glyph. The pre-workout meal sits above it.
   - **Missed planned meals** (time passed by more than 2 h, not eaten) stay hollow with `not logged` (stone) and still offer `Eaten`.
   - Unplanned logged entries sit at their `eaten_at` time.
   - Meal groups from the scanner or AI logging show as one row with an item count, expandable (existing grouping).
6. **Add** is always through the Offering. Fuel shows no extra FAB or "Add manually" card.

**The consequence line.** On the due planned row (and in every confirm sheet) a `t-meta` line reads `If you eat it: 2,520 kcal · 151 g` + `Tag CALC`.

Edit and delete of logged rows keep the existing `EditFoodSheet` / `useDeleteFood` with Undo. Swipe actions may stay **only** if ⋯ offers the same actions.

**States:**
- No plan this week: the timeline shows logged rows only, plus a placard `No meals planned · Plan this week` (button, Week tab with `?generate=1`).
- Nothing logged and no plan: "Nothing logged yet. Tap + to log food, or plan your week".
- A past date: no NOW line, and planned-but-uneaten rows read `not logged`.

**AX:** the time column moves above each row as an eyebrow. Meters stack. Buttons stay 44 px+.

#### 3.5.2 Week: the week's table (coin mosaic)

1. **Header:** `t-title-1` "The week's table", meta `19–25 Oct · 35 meals`, ☰ (preferences), and the next-week toggle (existing `?week=next`).
2. **Summary line:** `PLAN avg 3,290 kcal · 186 g a day` + `Tag PLAN`, then `Plan followed 24 of 28` + `Tag CALC` (`planFollowed()`, §4.6).
3. **Mosaic:**
   - 7 day columns (Mon–Sun).
   - Rows in time order: Breakfast, snack 1, Lunch, snack 2, Dinner, snack 3. Only rows that exist in the plan are shown.
   - Each cell is 44×44 with a **36 px coin** showing the recipe glyph (`RecipeGlyph`).
   - The today column has a leaf-line outline.
   - Day labels show the session (`Push A`) or the `Volleyball` glyph.
   - Under each column: a 4 px plan-kcal-vs-target bar (ivory) with `96%` (`t-meta`, 11 px minimum).
4. **Coin states** (the glyph keeps every state distinguishable without colour):

| State | Look | VoiceOver |
|---|---|---|
| Eaten (linked food entry exists) | **leaf rim** (beaded) + leaf-300 glyph on m2. Not a full leaf face. Past days at 70% rim opacity | "Monday breakfast, peameal sandwich, eaten" |
| Eaten, changed (linked entry's servings differ) | as eaten + a small `≈` notch | "… eaten, portion changed" |
| Planned | ivory glyph in relief, `--vein-3` rim | "… planned" |
| Missed (date or time passed, not eaten) | `--ui-line` **dashed** rim (3:1) + `CoinMissed` glyph overlay (–) | "… not logged" |
| Next due | leaf-line dashed ring around a planned coin | "… next" |

5. **Selected day list** (tap a column label or a coin; default today): rows with `Eaten` / `Cook` / ⋯ (the existing planned-meal card actions: regenerate, lock, move, repeat, like, not-for-me, favourite, why this meal).
6. **Tiles:** `Market` (items count, links to the Market tab) and `Cook ahead` (existing make-ahead flag).
7. **Generate / regenerate** (existing logic and `RegenStrip`). With no plan: the empty mosaic (outlines only) + `Plan 19–25 Oct` (gold).

Interactions: a tap on a coin opens the recipe (`/nutrition/meals/recipe/[key]?meal=`). A long-press shows a preview popover (name, kcal, protein, time). The same preview is available from the selected day list, so long-press is never required.

**AX:** the mosaic becomes a **list fallback**: day sections, each with its meal rows (glyph, name, state word, actions).

**VoiceOver:** the mosaic container's label is "28 of 35 planned meals eaten this week; Saturday pre-workout is next".

#### 3.5.3 Market (grocery)

- The existing `GroceryScreen` logic, restyled.
- The header shows `18 items · 4 days covered` and the estimated cost `~$84` + `Tag CALC` (built-in Canadian price data, not AI).
- Items are grouped by aisle, in 56 px rows with a 44 px check. **Checked items strike through in ivory** (shopping is not an achievement, so no gold) and move to the bottom of their aisle.
- `Have it` (pantry), shopper units, pack sizes, `Share list` (text), custom items: all unchanged.

#### 3.5.4 Recipe and cooking mode

- **Recipe:**
  - a `t-title-1` name over a large `RecipeGlyph` coin;
  - time · difficulty pips;
  - servings stepper (−/+, 44 px);
  - macro meter row + `Tag CALC` (`Tag AI` for AI-origin recipes);
  - ingredients, steps, "Why this meal?", Make easier (existing);
  - one gold `Start cooking`, and a secondary `Eaten · log 1 serving`.
- **Cooking mode** (focus route, obsidian, Wake Lock):
  - step text at 1.75rem Instrument 500, with a step counter in t-num-l;
  - inline timers as small sundials (the shared `Sundial` art component) with digits in `t-num-l` (the timer face is reserved for rest);
  - swipe **or** `Next` (64 px, bottom);
  - read-aloud (existing);
  - Health Canada temperature callouts (existing);
  - the last step offers `Eaten · log 1½ servings` (gold, one tap, Undo).

#### 3.5.5 Scanner (`/nutrition/scan`)

- The camera is full-bleed (existing `FoodScanner` capture logic) with a leaf corner frame and a 64 px shutter. "Use a photo" is a secondary option.
- **Analysing:** the frozen photo with one slow Sheen pass and "Reading your plate…". Cancel stays available.
- **Result:** an `EstimateCard` (Foundation primitive, §3.9.3) in a sheet:
  - items with portion and macros, every value under `Tag AI detail="estimate"`, confidence pips (existing);
  - 0–2 quick questions as chips;
  - the consequence line `If you add it: 2,520 kcal · 151 g` (CALC);
  - slot picker defaulted from the time;
  - **`Confirm & add`** (gold).
- **Nothing is saved before Confirm.** The existing idempotent confirm and photo handling stay unchanged.
- Errors (not configured, 429, offline) show the existing plain messages.

#### 3.5.6 States and VoiceOver for Fuel overall

- **Fresh:** Today empty (as above), Week the empty mosaic + Plan, Market "Plan a week to build your list".
- **Offline:** cached data renders, and writes show the existing offline messages. `Eaten` offline shows "Offline · try again when you're back" inline (no queued food writes; unchanged).
- **VoiceOver:** the timeline is a list. Each row is one sentence: "4:00 PM, rice cakes, honey and whey, planned, 380 calories, 30 grams protein, button Eaten".

### 3.6 Ascent (`/progress`)

Owner: **Ascent stream**. Segments: **Mountain · Hall · Gallery**.

#### 3.6.1 Mountain

1. **Header:** eyebrow `ASCENT` · ✦ · avatar. The verdict in `t-verdict` ("On pace, at the top of your corridor."). The explanation in `t-callout`: "You gain +0.40 lb a week. Anything from 0.28 to 0.40 lands you in 180–185 by 1 Aug." + `Tag PROJ`.
2. **Scale vs trend:** `Trend 168.4 lb` (t-num-m, CALC) · `Scale 168.6 · today 7:04` (LOG).
3. **Zoom:** `6W · 3M · Season` (Segmented). The default follows §0.3.
4. **The mountain chart** (SVG, `MountainChart.tsx`; no Recharts needed):
   - **Axes:**
     - a left **lb axis** with ticks every 5 lb (every 1 lb in 6W);
     - labels `t-meta` stone, at 11 px minimum;
     - axis line `--ui-line`;
     - the x axis has month (Season, 3M) or week (6W) labels in stone.
   - **History:**
     - raw weigh-ins as 3 px ash dots (LOG);
     - the trend line (`trendSeries`) leaf-300 at 1.75 px.
   - **Corridor:** from today, a cone from the trend to the band at the target date, filled `rgb(242 235 221 / .06)` with `--ui-line` edges.
   - **Band:** a horizontal band 180–185 at the target date labelled `OLYMPUS · 180–185` (left-aligned inside the band).
   - **Projection:**
     - a dashed ivory line from today's trend to `projectAt(target date)`;
     - the label **on the line's end**: `~184.9 · 1 Aug` + `PROJ`;
     - placed so it **never collides** with the band label (it goes above the line end if the band label is to the left, otherwise below);
     - collision is checked in code with simple bounding boxes.
   - **Terraces:** a hairline contour at each terrace lb with a Roman numeral at the right edge (stone text, 4.5:1). Reached terraces get a leaf contour.
   - **Climber:** a leaf diamond at today's trend.
   - **Summit:** the `TempleGlyph` at the band's right end.
   - **Decorative ridge:** `public/art/ridge.svg` drawn **behind** the plot at **4% opacity**, smooth (not jagged), confined to the **bottom 30%** of the plot. It never crosses or runs alongside a data line. It is `aria-hidden`, and a `t-meta` note under the chart reads "The ridge is decoration. The line is your trend."
   - **Season inset:** a 120×56 box at the plot's lower left, `LAST 6 WEEKS`, showing the trend only.
   - **Screen readers:** the chart is `role="img"` with the full sentence from `pace().ariaLabel`, plus the existing `SrTable` (dates and weights) visually hidden below.
5. **Pace gauge:**
   - A horizontal scale from 0 to 0.8 lb/wk (or to max(0.8, rate × 1.25)).
   - The corridor window [minRate, maxRate] is an outlined segment.
   - A leaf diamond marks the current rate, labelled `+0.40` (CALC).
   - The **RULE call** below, from the calorie rule (`calorieSuggestion`, refactored to take `rateAt()`, §4.1): e.g. "Top of the window. Hold 3,300 kcal." + `Tag RULE`.
   - Changes to targets are never applied from here. A suggested change links to Settings → Nutrition targets, which confirms through `useSaveProfile` (goal_changes recorded).
6. **Terraces:** tiles I–VII.
   - Reached: Roman numeral, lb and `reached 22 Sep` (from the trend series).
   - Next: `≈ 14 Nov` + `PROJ`, or "—" with "needs 4 weigh-ins".
   - The last tile is `OLYMPUS · 180`.
7. **Start · Now · Summit:** `163.0 · 7 Sep` | `168.4 · +5.4 trend` | `180–185 · by 1 Aug 2027`.
8. **Chronicles:** a list of Books (`BOOK I · SEPTEMBER`) linking to `/reviews/[month]`. The current month reads "being written".
9. **High-water mark** (when the trend is below its best): `best trend 168.6 · 12 Oct` (t-meta). Text only.

#### 3.6.2 Hall

- **Records** as plaques (laurel `RecordMark`, lift, `190 × 6`, e1RM, date), from `useStrengthSets` / `summarizeLift` / PR events.
- **Strength:** the main lifts (`TRACKED_LIFTS`) with e1RM first → latest and a sparkline. The existing StrengthChart is restyled to CSS vars.
- **Athletic (first-class):** approach vert `32.0 in` (record laurel when it is a PR), standing vert, broad jump, each with a trend and a 44 px `+ Log test` (existing sheet).

#### 3.6.3 Gallery

- **Photos:** museum-framed pairs (`PhotoCompare` restyled: thin leaf-line frame, date placards), upload (existing), viewer.
- **Measurements:** rows with first → latest and change (CALC), `+ Add` (existing sheet).
- Images stay private (signed URLs, existing).

#### 3.6.4 The Terrace moment

On the first Ascent visit after the trend crosses a terrace not yet celebrated (`localStorage pgg.terrace.<lb>`):
1. The climber diamond travels up to the terrace (800 ms).
2. The contour Inscribes in leaf (700 ms).
3. A title card fades over the chart: `TERRACE III` (t-film) / `170 LB` (`t-monument`) / `REACHED 14 NOV`.
4. The card stays until tapped.

**Reduced motion:** the card only.

#### 3.6.5 States, AX, VoiceOver

- **Fresh:** the mountain shows the corridor from start to band with no history, and the verdict "Your pace appears after 4 weigh-ins." The gauge shows only the window, with the diamond absent and "—". Terrace ETAs are "—". Hall shows "Records appear after your second session of a lift" and athletic shows `+ Log test`. Gallery shows empty frames with `+ Add`.
- **AX:** the chart keeps full width with a 240 px height. Axis labels thin to every 10 lb. Terraces become a list. The gauge label moves under the gauge.
- **VoiceOver:** each terrace is "Terrace three, 170 pounds, projected 14 November". The gauge is "Rate 0.4 pounds a week; window 0.28 to 0.40; at the top of your window".

### 3.7 Recovery ledger (`/recovery`) and Dawn data

Owner: **Now stream**. This page holds the history and editing that left Now:
- **Readiness history** (14 nights): sleep bars (stone), energy and soreness lines, from the existing `HistoryCard` / heatmap logic.
- **Check-in for any date** (`?date=`): the same 3+detail controls as Dawn, saving and merging per tap.
- **Rites / habits editor** (existing `CustomiseSheet` restyled; `#habits` anchor).
- **Water history** (meter by day).
- **Weekly review** (existing `WeeklyReviewCard`, restyled as a placard section "Week's end").
- `/recovery?checkin=1` → navigates to `/?dawn=1`.
- Fresh: "Your first check-in starts this page" + a link to Now.

### 3.8 The Chronicle (`/reviews`, `/reviews/[month]`)

Owner: **Ascent stream**. Logic: `lib/reviews/compute.ts` (existing, unchanged numbers).

- **Index:** Books I…N as a vertical list of film-title rows (`BOOK I · SEPTEMBER · in which the climb began`). The current month reads "being written".
- **Story viewer:** full-screen on obsidian. Tap the right 2/3 to advance, the left 1/3 to go back. Hold to pause (only matters for the title's Gild). Swipe down **or** `✕` (44 px) to close. A visible `Next ›` button gives an alternative to tapping zones.

| Chapter | Content |
|---|---|
| **I. Title** | `BOOK I` (t-eyebrow) / `SEPTEMBER` (t-film) / *in which the climb began* (t-verdict) over the statue gilded to **that month's end trend** (`gildFraction` at the month's last day). Stats: `+4.0 lb (trend)` · `19 sessions of 20` · `4 records` |
| **II. Strength** | Records as plaques, e1RM first → last for the main lifts |
| **III. The mountain** | The month's trend line on a mini mountain, the terrace(s) reached, and the month change as `Trend +4.0 lb (1 → 30 Sep)` + `Tag CALC`. If the month includes the first 14 days of the programme: the note "Includes early water and glycogen. The weekly pace uses the last 4 weeks." This resolves the "+4.0 lb vs +0.4 a week" contradiction |
| **IV. Fuel and rites** | Calories and protein averages on logged days, `Plan followed 94 of 100` (CALC, `planFollowed`), sleep average, rites kept |
| **V. Next month's line** | The existing priorities (`computePriorities`) as 2–3 lines with their evidence chips, and the plan weight for next month |

- `Read the full ledger` opens `?view=ledger`, the existing `MonthlyReview` document restyled, with print/PDF unchanged and the AI summary only on request, never saved without "Keep" (existing).
- **Share** is deferred (§7). Reduced motion: chapters crossfade.
- AX: chapter text reflows, and the stats grid becomes a list.

### 3.9 The Offering sheet: Ask & Log, and the Oracle

Owner: **Sheets stream**. One vaul sheet (`src/components/offering/OfferingSheet.tsx`) at 92% height with segments **Log · Ask**.

#### 3.9.1 Log mode (the `+` button)

1. **"Suggested now"** row: one chip from `dayState().next`, e.g. `Eat as planned: rice cakes` (one tap logs, Undo) or `Begin Push A`.
2. **The natural-language field:** "What did you eat?" (16 px+, mic via keyboard dictation, send 44 px).
   - The text goes to the existing `/api/ai/food-chat` (`sendFoodChat`), with today's slot inferred from the time and the planned meal it may replace.
   - The reply renders as an **EstimateCard**: `Tag AI detail="estimate"`, "Not saved yet", the items with portions and macros, and the consequence line `If you add it: 3,435 kcal · 190 g` + `Tag CALC` ("From your log").
   - Actions:
     - `Add as dinner` (gold), which logs through the existing `useLogDraft` idempotent path;
     - `Adjust` (edits items inline);
     - `Discard`.
   - If the text names a replacement ("pizza instead of the salmon"), the card says `Replaces: Honey-garlic salmon (planned)`. On confirm the food is logged, and the planned meal stays in the plan as `not logged` (the plan is never silently edited).
   - Not configured or offline: the field is disabled with the plain existing message, and Search still works.
3. **Quick actions** (a 3×2 grid, tiles 88 px tall):
   - `Weigh-in` opens the `WeightLogSheet` (restyled scale stepper with Inscribe).
   - `Water +250` / `+500` (two chips in one tile).
   - `Scan` goes to `/nutrition/scan`.
   - `Search food` opens the existing log panels (Search · Recent · Saved · Manual) inside the sheet, targeting the current slot.
   - `Start workout` (`useStartWorkout`, or `Return to Push A` when live).
   - `Check-in` goes to `/?dawn=1`.

#### 3.9.2 Ask mode: the Oracle (✦)

- An aegean hairline across the sheet top.
- A **context chip**: `About: Push A today · 41 days of logs`, built from the route (Now / Train / Fuel / Ascent / Gym / a recipe) and removable.
- Suggestion chips change per context. For example Fuel: "What should dinner be to hit 185 g?". Ascent: "Am I gaining too fast?".
- Answers: the first line is a verdict in `t-verdict` (ivory; aegean is only the hairline, the tag and the ✦), then body text in Instrument. Each answer carries `Tag AI` and **source chips** ("Based on: weigh-ins 7 Sep–17 Oct · 6 sessions", existing `FactChips`).
- **Any proposed change** (calorie target, protein, a session swap) arrives as a **"Proposed · not saved" card**:
  - aegean rim;
  - the exact before → after (`Calories 3,300 → 3,450 kcal/day`);
  - `Not now` / `Apply…`.
  - `Apply…` opens a confirm showing the diff and writes through the existing `useApplyProfileChange` (goal_changes recorded, Revert available).
- **Nothing is saved silently.**
- Fuel context uses the Food Coach backend (`/api/ai/food-chat`), and its meal drafts render as EstimateCards. Every other context uses `/api/ai/coach`. Threads and history are reached from a `History` button in the sheet header (existing conversation lists).
- `/coach` and `/nutrition/coach` render the same Ask content as a full page (for deep links and desktop).

#### 3.9.3 Shared primitives Foundation provides for this

- `ui/estimate-card.tsx`: a presentational card. Props: `{ title, tag?: ReactNode, status: "unsaved" | "saving" | "saved" | "error", items: ReactNode, consequence?: ReactNode, actions: ReactNode, note?: ReactNode }`. It has the aegean rim and the header `AI · ESTIMATE · Not saved yet`.
- `ui/proposal-card.tsx`: "Proposed · not saved". Props: `{ title, rows: { label, before, after }[], onDismiss, onApply, applying }`.

#### 3.9.4 Opening API (Foundation creates the host and store; Sheets fills the content)

`src/components/offering/store.ts` (seeded by Foundation, then owned by Sheets):

```ts
export type OfferingOpen =
  | { mode: "log"; slot?: "breakfast" | "lunch" | "dinner" | "snacks"; panel?: "search" | "recent" | "saved" | "manual"; date?: ISODate }
  | { mode: "ask"; context?: OracleContext; prompt?: string; conversationId?: string };
export function openOffering(o: OfferingOpen): void;   // usable from any component
export function useOffering(): { open: OfferingOpen | null; close(): void };
export interface OracleContext { kind: "now" | "train" | "fuel" | "ascent" | "gym" | "recipe"; label: string; facts?: string[] }
```

`AppShell` mounts `<OfferingHost />` once. The Fuel screen calls `openOffering({ mode: "log", … })` for `?add=1`.

### 3.10 Settings (`/settings`)

Owner: **Sheets stream**. A single page of plain grouped rows on m2 groups. No ornament. The header shows the avatar initial "Q" (from `display_name`) and the name.

Groups:
1. **Profile:** name, height, units, time zone.
2. **Goal:** start, goal and band, target date (`useSaveProfile`, goal_changes).
3. **Program:** links to Train → Program (the schedule is edited there only); training mode is shown read-only with that link.
4. **Day schedule** (new): usual training time and meal times (breakfast, lunch, dinner, snack 1–3), with the hint "Now and Fuel place your planned meals at these times" (§4.4).
5. **Nutrition targets:** kcal, protein, carbs, fat, water, sleep goal (existing sheets).
6. **Reminders:** the existing `ReminderSettings` (Web Push), restyled.
7. **Workout:** tap ✓ logs shown values, system keyboard, rest chime.
8. **Appearance** (per device, `localStorage pgg.appearance`, applied to `<html>` attributes by Foundation's `lib/appearance.ts`):
   - **Motion:** System / Reduce;
   - **Reduce transparency:** on/off;
   - **Night:** Follows the day / Always;
   - **Gym Mode auto:** on/off. Unlike the others, this one is stored in `prefs.gymAuto` because it changes routing across devices.
9. **Oracle** (coach data access toggles, existing).
10. **Data:** export (existing), meal-prep data, about/credits.
11. **Account:** sign out, delete account (existing flows, unchanged).

**Removed:** the Haptics row. iOS PWAs have no Vibration API, and the hidden-switch trick is banned (`lib/haptics.ts` becomes a no-op for now). **Fixed:** `prefsOf()` currently drops non-boolean keys when saving. All prefs writes move to `useSavePrefs()` (§4.4).

### 3.11 Onboarding: the Oath (`/onboarding`)

Owner: **Sheets stream**. The existing `OnboardingFlow` logic, validation and `profileUpdateFromAnswers` stay. The 7 steps become 5 full-screen steps, each with one Cormorant question and the art building as he answers. Progress is a 5-segment line (not the meander).

1. **Who is climbing?** Name, starting weight (+ today's weigh-in optional), height, units, time zone (detected). The statue appears in marble.
2. **Where is the summit?** Goal weight and band (180–185), target date. A mini mountain draws with the corridor and the required pace `~0.36 lb a week` + `Tag CALC` and a sanity line ("achievable" / "fast for a lean gain").
3. **How do you train?** Experience, the weekly schedule (PPL default), volleyball per week, intro volume, **usual training time** (new; writes `prefs.day.trainAt`). The temple builds column by column.
4. **How do you eat?** kcal, protein, carbs, fat with the arithmetic shown (CALC), water, sleep goal. The default meal times are listed and editable later in Settings.
5. **The Oath:** "Hold to begin the ascent" (600 ms, same accessible alternative as §3.2.7). On completion the profile is saved, and Now opens with the first **Unveiling** (statue in marble).

Fresh-user draft persistence (existing) stays. Errors show inline ("Couldn't save your plan. Your answers are kept.").

### 3.12 Sign-in (`/sign-in`)

Owner: **Sheets stream**. The museum entrance:
- obsidian, the statue (marble, no gild) in near-darkness, Spotlight brightening over 1.2 s (static under reduced motion);
- the `PROJECT GREEK GOD` wordmark in `t-film`;
- email + password fields (the existing `SignInForm` logic and its auth routes, unchanged; 16 px inputs);
- one gold `Enter`;
- the existing error and confirm states, restyled. No new auth methods in this build.

### 3.13 Global states

- **Loading:** skeletons match the final layout (shapes in m2 with a slow opacity pulse; reduced motion: static). No spinners on first paint except inside buttons.
- **Offline cold start:** the app shell is served from the SW cache and data from the persisted query cache (Foundation). Screens render the last known data with the Offline banner.
- **Errors:** `ErrorNote` per block with Retry. Cinnabar text only for the error line itself.
- **Toasts:** top-centre, under the header. Undo for every add or delete (existing pattern). There are never more than 2.

---

## 4. Shared logic contracts

All of these are pure TypeScript with vitest tests, owned by **Foundation** and delivered **first** (phase F-A, §5). Streams import them and **must not** reimplement them. Signatures are binding. Internals may differ if the tests in each section pass.

### 4.1 `src/lib/progress/pace.ts`: one trend, one rate, one projection

```ts
import type { WeighIn } from "@/lib/bodyweight";
import type { ISODate } from "@/lib/dates";

export const TREND_DAYS = 7;          // trend = mean of weigh-ins in the 7 days ending at ref
export const RATE_WINDOW_DAYS = 28;   // THE rate window, used everywhere
export const MIN_WEIGHINS = 4;        // in the rate window; also the lifetime guard for gilding
export const MIN_SPAN_DAYS = 10;      // first→last weigh-in inside the window
export const EARLY_WATER_DAYS = 14;   // programme days flagged as water + glycogen
export const TOP_OF_WINDOW = 0.15;    // top 15% of the corridor counts as "top"

export interface TrendReading {
  lb: number | null;          // avg of weigh-ins in [end-6, end]; null if none ever
  n: number;                  // weigh-ins in that window
  end: ISODate;               // ref, or the last weigh-in date if that is > 7 days before ref
  latest: { lb: number; date: ISODate } | null; // the scale reading (latest weigh-in ≤ ref)
}
export function trendAt(w: WeighIn[], ref: ISODate): TrendReading;

/** One point per weigh-in date: the 7-day trend ending that day. Sorted ascending. */
export function trendSeries(w: WeighIn[], from?: ISODate, to?: ISODate): { date: ISODate; lb: number }[];

export interface RateReading {
  lbPerWeek: number | null;   // OLS slope of raw weigh-ins (lb vs day) in [ref-27, ref] × 7, rounded to 0.01
  n: number;
  spanDays: number;
  from: ISODate; to: ISODate;
  status: "ok" | "needs_weighins" | "needs_span";
  includesEarlyWater: boolean; // window overlaps [programStart, programStart+13]
}
export function rateAt(w: WeighIn[], ref: ISODate, programStart?: ISODate): RateReading;

/** trend + rate × weeks(from→to), rounded to 0.1. */
export function projectAt(trendLb: number, lbPerWeek: number, from: ISODate, to: ISODate): number;

export interface Corridor { minRate: number; maxRate: number; weeksLeft: number; bandMin: number; bandMax: number }
/** Rates that land the trend inside [bandMin, bandMax] at targetDate. Null when weeksLeft ≤ 0. Rounded to 0.01. */
export function paceCorridor(trendLb: number, today: ISODate, targetDate: ISODate, bandMin: number, bandMax: number): Corridor | null;

export type PaceVerdict = "needs_data" | "below" | "on_pace" | "top" | "above" | "arrived";
export function verdictFor(rate: RateReading, corridor: Corridor | null, trendLb: number | null): PaceVerdict;

export interface ProfileForPace {
  start_weight_lb: number | string | null; goal_weight_lb: number | string | null;
  goal_range_min_lb: number | string | null; goal_range_max_lb: number | string | null;
  start_date: ISODate | null; target_date: ISODate | null;
}
export interface Pace {
  trend: TrendReading;
  rate: RateReading;
  corridor: Corridor | null;
  projection: { lb: number; date: ISODate } | null;   // null unless rate.status === "ok"
  verdict: PaceVerdict;
  sentence: string;     // the verdict copy (§4.1.3)
  detail: string;       // "+0.40 lb a week · ~184.9 lb by 1 Aug" or the next step
  ariaLabel: string;    // one full sentence for VoiceOver
}
export function pace(input: { weighIns: WeighIn[]; today: ISODate; profile: ProfileForPace | null | undefined }): Pace;

export interface Terrace {
  index: number; numeral: string;   // 1, "I"
  lb: number; final: boolean;       // final = bandMin ("Olympus")
  reachedOn: ISODate | null;        // first trendSeries date with lb ≥ terrace
  eta: ISODate | null;              // PROJ: only when rate ok and > 0 and not reached
}
export function terraces(p: Pace, series: { date: ISODate; lb: number }[], startLb: number, bandMin: number, step?: number /* 2.5 */): Terrace[];

/** 0–1 statue gild. 0 when weighInCount < MIN_WEIGHINS or trend null. clamp((trend − start)/(goal − start)). */
export function gildFraction(trendLb: number | null, startLb: number, goalLb: number, weighInCount: number): number;

/** Highest trend so far (for the labelled "best trend" text only). */
export function highWater(series: { date: ISODate; lb: number }[]): { lb: number; date: ISODate } | null;
```

#### 4.1.1 Semantics

- **The trend** keeps today's definition (the `ascentProgress` / `weightStats` 7-day average with the "older than a week" anchor), so the hero number does not change meaning. `ascentProgress()` in `lib/today/ascent.ts` is reimplemented on top of `trendAt` (Foundation) and keeps its exported shape for existing callers.
- **The rate** is the **only** "lb per week" number shown anywhere: Now, Ascent, the Oracle's snapshot, the pace gauge and the calorie rule.
  - `calorieSuggestion()` in `lib/bodyweight.ts` gains an overload taking a `RateReading` (Foundation). Its current "7-day vs previous 7-day" comparison is removed from all UI.
  - `lib/coach/snapshot.ts` (Sheets) switches its `bw.rate` fact to `rateAt`.
  - The Chronicle's month figure is labelled a **change**, never a "rate".
  - `trendTone`, `rateTone` and the old "+0.66 weekly" copy are deleted by their owning streams once their screens stop using them.
- **Terraces:** multiples of `step` strictly above `startLb` and below `bandMin`, then `bandMin` itself as the final terrace. Start 163, band 180 gives 165, 167.5, 170, 172.5, 175, 177.5, 180, i.e. seven terraces I–VII.
- **Verdict:**
  - `rate.status !== "ok"` → `needs_data`.
  - `trend ≥ bandMin` → `arrived`.
  - With a null corridor (target date passed) and status ok → `on_pace` if the trend is inside the band, else `below` or `above`.
  - Otherwise: rate < minRate → `below`; rate > maxRate → `above`; rate ≥ maxRate − TOP_OF_WINDOW × (maxRate − minRate) → `top`; else `on_pace`.
- **Units:** everything is computed in lb. Display converts with `lib/units.ts`.

#### 4.1.2 Tests (`pace.test.ts`) must cover

1. The mock day: trend 168.4, rate 0.40, today 2026-10-17, target 2027-08-01 → `projectAt` = 184.9 (168.4 + 0.4 × 41.14 weeks); corridor min 0.28, max 0.40; verdict `top`.
2. Three weigh-ins in the window → `needs_weighins`, projection null, verdict `needs_data`.
3. Four weigh-ins spanning 6 days → `needs_span`.
4. A window overlapping the first 14 programme days → `includesEarlyWater` true.
5. OLS on a perfect line of +0.5 lb/wk gives 0.50. On noisy data within ±0.05 of the true slope.
6. Terraces for start 163 / band 180 → 7 terraces with the right lbs. `reachedOn` is the first crossing date. ETA = today + (lb − trend)/rate weeks, rounded to a day.
7. `gildFraction`: 0 below 4 weigh-ins; 0.27 for trend 168.4, start 163, goal 183; it decreases when the trend decreases (no ratchet); clamps at 0 and 1.
8. A trend older than 7 days anchors at the last weigh-in.
9. kg users get identical lb math.

#### 4.1.3 Verdict copy (no exclamation marks, no guilt)

| Verdict | `sentence` | `detail` |
|---|---|---|
| needs_data | "Your pace appears after 4 weigh-ins." | "{n} of 4 weigh-ins in the last 4 weeks" |
| below | "A little under your corridor." | "+{rate} lb a week · {min}–{max} lands you in {band}" |
| on_pace | "On pace for Olympus." | "+{rate} lb a week · ~{proj} lb by {date}" |
| top | "On pace, at the top of your corridor." | same as on_pace |
| above | "Climbing faster than your corridor." | "+{rate} lb a week · {min}–{max} is the lean-gain window" |
| arrived | "You're inside {band}." | "Trend {trend} lb · hold here" |

#### 4.1.4 Statue gilding

The rendered gild line is `bustFillLine(gildFraction(...))`. The existing `bustFillLine()` maps p onto the figure (FIGURE_BASE .08 → FIGURE_TOP .95) and stays in `lib/today/ascent.ts`. Now, the Unveiling and the Chronicle (at month end) use exactly this. The goal is `profile.goal_weight_lb` (the preferred 183) and the start is `profile.start_weight_lb`.

### 4.2 `src/lib/now/day-engine.ts`: the Day Engine

```ts
export type Phase = "dawn" | "fuel" | "train" | "live" | "refuel" | "dusk" | "seal";
export type Min = number;   // minutes since local midnight, 0–1439

export interface PlannedMealSlot {
  id: string; slot: "breakfast" | "lunch" | "dinner" | "snack"; position: number;
  name: string; kcal: number; protein: number;
  at: Min;                  // from plannedTime() (§4.4)
  role: "breakfast" | "lunch" | "dinner" | "snack" | "pre" | "post";
  eaten: boolean;           // a linked food entry exists today
}
export interface DayInput {
  date: ISODate; now: Min;
  plan: { kind: "train"; key: string; name: string; at: Min | null; durationMin: number | null }
      | { kind: "rest" } | { kind: "volleyball"; train?: { key: string; name: string; at: Min | null; durationMin: number | null } };
  session: { status: "none" } | { status: "active"; startedAt: Min } | { status: "done"; endedAt: Min };
  meals: PlannedMealSlot[];
  checkInDone: boolean;     // the 3 Dawn questions answered (sleep, soreness, energy non-null)
  weighInDone: boolean;     // a weigh-in exists for date
  dawnDismissed: boolean;   // "Later" tapped on Dawn
  sealed: boolean;          // localStorage pgg.sealed.<date>
  lightsOut: Min | null;    // reminders.sleep.time, else null (rail uses 22:30)
}
export interface DayItem { at: Min | null; kind: "meal" | "session" | "checkin" | "weighin" | "rite" | "chronicle"; id: string; label: string; done: boolean }
export type NextAction =
  | { kind: "checkin" } | { kind: "weighin" }
  | { kind: "eat"; mealId: string } | { kind: "begin"; key: string } | { kind: "return" }
  | { kind: "log_food" } | { kind: "seal" } | { kind: "none" };
export interface DayState {
  phase: Phase;
  rail: { phase: Exclude<Phase, "live">; startsAt: Min; state: "done" | "now" | "later" | "skipped" }[];
  marks: { at: Min; kind: "meal" | "session" | "lights"; done: boolean }[];
  next: NextAction;
  later: DayItem[];          // at ≥ now or untimed-and-not-done, time order
  earlier: DayItem[];        // done or past
  skippedChip: string | null; // e.g. "Dawn · 2 left"
}
export const DAWN_UNTIL: Min = 10 * 60 + 30;
export const TRAIN_LEAD: Min = 90;
export const REFUEL_FOR: Min = 120;
export const DUSK_FROM: Min = 18 * 60;
export const SEAL_FROM: Min = 21 * 60;
export function dayPhase(i: DayInput): Phase;
export function dayState(i: DayInput): DayState;
```

**Phase rules, in order (first match wins):**
1. `session.status === "active"` → `live`.
2. `session.status === "done"` and `now − endedAt ≤ REFUEL_FOR` → `refuel`.
3. `now ≥ SEAL_FROM` or `now < 5:00` → `seal`.
4. `!(checkInDone && weighInDone) && !dawnDismissed && now < DAWN_UNTIL` → `dawn`.
5. A training plan (including volleyball days with a training session), session `none`, and:
   - with `at`: `at − TRAIN_LEAD ≤ now < at + 180` → `train`;
   - with `at === null`: `now < DUSK_FROM` → `train` (Begin is the action once Dawn is done).
6. `now ≥ DUSK_FROM` → `dusk`.
7. Otherwise → `fuel`.

**Next action:**
- dawn: `checkin` first, then `weighin`.
- train: `begin`. live: `return`. seal: `seal`, or `none` when `sealed`.
- refuel: the first uneaten meal with `at ≥ endedAt − 30`, else `log_food`.
- fuel / dusk: the earliest uneaten meal with `at ≥ now − 60`, else the earliest uneaten meal of the day, else `log_food`.

**Rail:** each phase's `startsAt` is fixed for the day:
- Dawn 05:00.
- Fuel = DAWN_UNTIL, or the time Dawn completed.
- Train = `at − 90` (or after Dawn when `at` is null; omitted on rest days).
- Refuel = the session's end, else `at + duration`.
- Dusk 18:00. Seal 21:00.

Phases with a start before the current phase are `done` if their action happened, else `skipped`.

**Tests (`day-engine.test.ts`):**
1. The real default schedule: **Monday 2026-10-19 Push A** at 16:30, with meals from default times. Check phases at 07:00 (dawn), 11:00 (fuel), 15:10 (train), 17:00 with the session active (live), 18:10 after ending at 17:45 (refuel), 19:30 (dusk), 21:30 (seal).
2. A rest day (Sunday) has no train phase.
3. Dawn done by 07:20 → fuel at 07:21.
4. Dawn not done at 10:31 → fuel, with skippedChip "Dawn · 2 left".
5. `at` null → train after Dawn until 18:00.
6. A missed session at 20:00 → dusk, and the session appears in `later` as not started.
7. Next-meal selection, including the post-session meal.
8. Midnight and 04:59 → seal.

### 4.3 `src/lib/workout/timing.ts`: set timing

```ts
import type { WSet } from "./types";
import type { PriorBest } from "./pr";
export type SetTiming = "record" | "beat" | "matched" | "below" | "first" | null;
export interface TimingResult { timing: SetTiming; e1rm: number | null; delta: { e1rm?: number; reps?: number; weightLb?: number; durationSec?: number } | null }
/**
 * set: the logged set. priorSameIndex: the same set_index of the most recent previous session of this
 * exercise in the same mode family (null if none). priorBest: best e1RM BEFORE this set (prior history
 * plus sets logged earlier this session; the caller folds those in, as prSetIds does).
 */
export function setTiming(
  set: Pick<WSet, "kind" | "completed" | "weight_lb" | "reps" | "duration_sec">,
  priorSameIndex: { weight_lb: number | null; reps: number | null; duration_sec: number | null } | null,
  priorBest: PriorBest | undefined,
): TimingResult;
```

**Rules:**
- Not working or not completed → `null`.
- `priorBest?.sets === 0` → `first`.
- `e1rm` exists and `beatsRecord(e1rm, priorBest.e1rm)` → `record`. **This must agree with `prSetIds` / `classifyLog`; a test asserts it on shared fixtures.**
- Else compare with `priorSameIndex`:
  - With both e1RMs (reps 1–12): diff ≥ +1 → `beat`, |diff| < 1 → `matched`, ≤ −1 → `below`.
  - Otherwise (high reps or bodyweight): compare weight, then reps, then duration lexicographically → beat / matched / below.
  - No prior → `null`.
- The caller passes `priorSameIndex = null` when the modes differ (deload vs standard).

**Tests:** record vs beat precedence, the 1 lb margin (185×7 over 180×8 is not a record), first, high-rep fallback, timed sets, deload null.

### 4.4 Per-slot meal times and training time: stored in `profiles.prefs` (no migration)

`profiles.prefs` is already `jsonb not null`, and nothing constrains its keys. Foundation adds:

`src/lib/prefs.ts`:

```ts
export interface DaySchedule {
  trainAt: string | null;                       // "HH:MM" local; null = not set
  meals: { breakfast: string; lunch: string; dinner: string; snacks: [string, string, string] };
  preWorkoutMin: number;                        // default 60
}
export const DEFAULT_DAY_SCHEDULE: DaySchedule = {
  trainAt: null,
  meals: { breakfast: "07:40", lunch: "12:30", dinner: "18:30", snacks: ["10:30", "15:00", "21:30"] },
  preWorkoutMin: 60,
};
export interface AppPrefs extends WorkoutPrefs { day: DaySchedule; gymAuto: boolean; coachNoteSeen?: boolean; [k: string]: unknown }
export function parseAppPrefs(json: unknown): AppPrefs;                 // tolerant; invalid times fall back per field
export function mergePrefs(current: unknown, patch: Partial<AppPrefs>): Record<string, unknown>; // deep-merges day.*, keeps unknown keys
export function toMinutes(hhmm: string): number;
```

- `trainAt` falls back to `reminders.workout.time` when that reminder is on, else stays null (the engine handles null).
- `src/lib/data/profile.ts` gains `useSavePrefs()`. It reads the stored `prefs` fresh (`select prefs`), applies `mergePrefs`, writes, and updates the cache optimistically with rollback.
- **Every prefs writer** (SettingsView, CoachScreen's `coachNoteSeen`, onboarding) switches to it. This fixes the current boolean-only `prefsOf()` dropping keys.
- `parsePrefs()` in `lib/workout/prefs.ts` stays for workout booleans.

`src/lib/now/meal-times.ts`:

```ts
export function plannedTime(
  m: { slot: Slot; position: number },
  ctx: { schedule: DaySchedule; snacksPerDay: number; train: { at: Min | null } | null },
): { at: Min; role: "breakfast" | "lunch" | "dinner" | "snack" | "pre" | "post" };
```

- Mains use their meal time.
- Snack positions map by count: 1 snack → `[snacks[1]]`, 2 → `[snacks[1], snacks[2]]`, 3 → all three.
- **Session-relative:** on a training day with `at`, the snack whose default time is closest to `at − preWorkoutMin` (within 180 min) moves to exactly `at − preWorkoutMin` with role `pre`.
- The first main meal at or after `at + durationMin` (75 when unknown) gets role `post`. Its time is not moved.
- Tests: defaults, 1/2/3 snacks, pre-snack move, no move when no snack is within 180 min, rest day.
- Fuel also passes the schedule into `defaultEatenAt()` (an additive optional parameter in `meals-model.ts`, Fuel) so meals logged for another day are stamped at his times.

### 4.5 `src/lib/recovery/prefill.ts`: check-in prefill

```ts
export function sleepPrefill(rows: { local_date: ISODate; sleep_hours: number | string | null }[], today: ISODate):
  { hours: number | null; nights: number };   // median of nights in [today-7, today-1] with values; null if fewer than 3; snapped to 0.25
export function mergeCheckin(existing: CheckinRowLite | null, patch: Partial<CheckinDraft>): CheckinDraft; // never clears a field the patch omits
```

**Tests:** odd and even counts, fewer than 3 → null, ignores today and nulls, snaps 7.1 → 7.0, merge keeps unrelated fields.

### 4.6 `src/lib/adherence.ts`: one definition per adherence word

```ts
/** Planned meals with a linked food entry ÷ planned meals that were due (date < today, or today and at + 120 ≤ now). */
export function planFollowed(planned: { id: string; local_date: ISODate; at: Min }[], loggedIds: Set<string>, today: ISODate, now: Min): { done: number; due: number };
/** Sealed sessions ÷ planned training days so far this week (Mon–Sun); one volleyball swap per week counts as sealed. */
export function sessionsSealed(days: { date: ISODate; kind: "train" | "rest" | "volleyball"; done: boolean }[], today: ISODate): { done: number; planned: number };
```

The labels are always "Plan followed X of Y" and "X of Y sessions". **No percentages of a different base.** The old "missions 60%" streak copy ("STREAK 0 days") is removed by its owners. Tests cover both functions.

### 4.7 Volume target zones (Train-owned; a constant contract)

`src/lib/training/volume-zones.ts` (Train): `export const SET_ZONES: Record<MuscleKey, [number, number]>`. Defaults: chest, back, quads, hamstrings and shoulders 10–20; biceps, triceps, glutes and calves 8–16; core 6–12; other none. Plus `zoneStatus(sets, zone): "under" | "in" | "above"`. Tagged RULE in the UI with the explanation "A common range for hard sets per muscle per week".

### 4.8 The Tag vocabulary

`src/lib/provenance.ts`, defined in §1.7, plus `explainTag(kind)` for the popover copy.

---

## 5. Stream plan

### 5.0 Order and hand-offs

```
F-A  contracts (lib only, tests)  ──┐
F-B  visual system + shell + art ───┼──►  S1 Now · S2 Gym · S3 Train · S4 Fuel · S5 Ascent · S6 Sheets   (parallel)
                                    │                                                   │
                                    └──────────────────────────────►  Integration pass (Foundation + all) ─► done
```

- **Foundation** runs first, as two commits: F-A (contracts, ~1 day) then F-B (tokens, fonts, shell, ui kit, art, offline; ~2 days). After F-B the whole app is re-themed through the aliases and still works. **No stream starts before F-B is committed.** Streams may read F-A contracts as soon as F-A is committed.
- **Seed files.** Foundation creates a few files inside stream-owned folders so the shell compiles. Ownership passes to the stream at the F-B commit:
  - `src/components/offering/{OfferingHost.tsx, OfferingSheet.tsx, store.ts}` → S6. The host wraps the old QuickLog content until S6 replaces it.
  - `src/components/workout/LiveSlotContent.tsx` → S2. It wraps the existing `LiveDockBar` until S2 restyles it.
- **Rules for everyone:**
  - Only touch owned files.
  - Read-only use of any other module is fine.
  - If you need a change in a file you don't own, write the request in your hand-off note (and wait for the owner, or the integration pass). Do not edit it.
  - Additive edits to shared `src/lib/data/*` are allowed **only** where this table grants them.
  - Commit with explicit paths (`git add <paths>`), never `-A`. Never stash, reset or revert others' files. Never push.
  - Use the commit footer from the brief.
- **Every stream:**
  - migrates its own files off `text-[Npx]`, `rounded-[N]`, `z-[N]`, hex literals and the retired type utilities;
  - deletes components it replaces once nothing imports them (inside its ownership);
  - keeps every existing URL in §2.3 working.

### 5.1 Ownership table

| Stream | OWNS (edit, create, delete) | May only READ (notable) |
|---|---|---|
| **F · Foundation** | `src/app/globals.css` · `src/app/layout.tsx` · `src/app/manifest.ts` · `src/app/global-error.tsx` · `src/components/ui/**` · `src/components/shell/**` · `src/components/art/**` · `src/components/signature/**` · `src/components/shared/Offline.tsx` · `src/components/providers.tsx` · `public/**` (incl. `sw.js`, `art/`, `icons/`) · `src/lib/motion.ts` (+test) · `src/lib/haptics.ts` · `src/lib/appearance.ts` (new) · `src/lib/offline/**` (new) · `src/lib/prefs.ts` (new) · `src/lib/provenance.ts` (new) · `src/lib/adherence.ts` (new) · `src/lib/progress/pace.ts` (new) · `src/lib/now/**` (new) · `src/lib/workout/timing.ts` (new) · `src/lib/recovery/prefill.ts` (new) · `src/lib/today/ascent.ts` · `src/lib/bodyweight.ts` (calorieSuggestion overload only) · `src/lib/data/profile.ts` (`useSavePrefs` only) · `scripts/dev/grade-statue.mjs`, `scripts/dev/gold-audit.mjs`, `scripts/dev/type-audit.mjs`, `scripts/dev/ax-shot.mjs` (new) · seed files (§5.0) until hand-off | everything else |
| **S1 · Now** | `src/app/(app)/page.tsx` · `src/components/now/**` (new) · `src/components/today/**` (retire or reuse) · `src/app/(app)/recovery/**` · `src/components/recovery/**` · `src/lib/today/**` **except** `ascent.ts` · `src/lib/recovery/**` **except** `prefill.ts` · `src/lib/habits.ts` · `src/lib/data/recovery.ts` · `src/lib/data/daily.ts` | pace, day-engine, meal-times, prefill, adherence, workout stores, meals hooks, `useLogPlannedMeal`, `shared/WeightLogSheet` |
| **S2 · Gym** | `src/app/(app)/workout/**` · `src/components/workout/**` (incl. `LiveSlotContent.tsx`, the Inscription under `workout/inscription/`) · `src/lib/workout/**` **except** `timing.ts` · `src/lib/data/workout.ts` | timing.ts, progression.ts, schedule.ts, Colonnade art, meals hooks (refuel card) |
| **S3 · Train** | `src/app/(app)/training/**` · `src/components/training/**` · `src/lib/training/**` (additive, behaviour-preserving for exports Gym uses: `progression`, `library`, `program`) · `src/lib/data/training.ts` | timing.ts, recovery hooks (readiness), prefs |
| **S4 · Fuel** | `src/app/(app)/nutrition/**` **except** `nutrition/coach/**` · `src/components/nutrition/**` · `src/components/meals/**` · `src/components/food-ai/scanner/**` · `src/components/food-ai/{api.ts,hooks.ts,image.ts,parts.tsx,AddItemSheet.tsx}` · `src/lib/nutrition-ui/**` · `src/lib/nutrition.ts` · `src/lib/fuel/**` (new) · `src/lib/food/**` · `src/lib/meals/**` (engine logic unchanged; additive only) · `src/lib/ai/food-*.ts` · `src/lib/data/nutrition.ts` · `src/lib/data/meals.ts` · `src/lib/data/meals-model.ts` (additive) | meal-times, day-engine, adherence, `openOffering` |
| **S5 · Ascent** | `src/app/(app)/progress/**` · `src/app/(app)/reviews/**` · `src/components/progress/**` · `src/components/reviews/**` · `src/lib/progress/**` **except** `pace.ts` · `src/lib/reviews/**` · `src/lib/data/body.ts` | pace.ts, adherence, Statue art, strength/pr libs |
| **S6 · Sheets + secondary** | `src/components/offering/**` (after hand-off) · `src/components/oracle/**` (new) · `src/components/coach/**` · `src/components/food-ai/coach/**` · `src/app/(app)/coach/**` · `src/app/(app)/nutrition/coach/**` · `src/components/settings/**` · `src/app/(app)/settings/**` · `src/components/onboarding/**` · `src/app/(app)/onboarding/**` · `src/app/sign-in/**` · `src/components/reminders/**` · `src/components/shared/WeightLogSheet.tsx` · `src/lib/coach/**` · `src/lib/onboarding/**` · `src/lib/reminders/**` (UI-facing; dispatch semantics unchanged) | food-ai api/hooks (Fuel), nutrition log panels (Fuel; mounted inside the Offering sheet as-is), pace, day-engine, prefs |

**Untouched by all streams** (read-only): `src/app/api/**` (server routes; except a stream may fix a bug in a route its feature owns, noted in its hand-off), `src/lib/supabase/**`, `src/lib/ai/gemini.ts`, `src/lib/export/**`, `src/lib/dates.ts`, `src/lib/units.ts`, `src/lib/data/core.ts`, `src/lib/data/outbox.ts`, `src/lib/live-clock.ts`, `supabase/migrations/**` (no migration in this build), `next.config.ts` (the CSP stays), `src/proxy.ts`, `DESIGN.md`, `SPEC.md`, `CONVENTIONS.md` (Foundation may append one paragraph pointing at this file).

### 5.2 Foundation (F) deliverables and acceptance

**F-A (contracts):** §4.1–§4.6 and §4.8 with tests. `ascentProgress` is reimplemented on `trendAt` with its existing tests green. The `calorieSuggestion` overload. `useSavePrefs`.

**F-B (system and shell):**
1. `globals.css`: §1.1 tokens and aliases, §1.2 root + type classes, §1.3 spacing, radius and z tokens, §1.4 materials (glass with fallbacks, elevations, spotlight), §1.8 motion vars. Remove the old Pantheon-only utilities once their last use is gone (or keep them as aliases).
2. `layout.tsx`: fonts per §1.2.1. `themeColor` becomes `#09090B`.
3. `ui/**`:
   - `Button` (primary = leaf-btn with `data-gold="fill"`; secondary; outline; ghost; destructive; sizes 44 / 56 / 64);
   - `Tag`;
   - `EstimateCard`;
   - `ProposalCard`;
   - `Stepper` (56/64 variants, VoiceOver adjustable: `role="spinbutton"` with `aria-valuenow`, increment and decrement on swipe);
   - `HoldButton` (600 ms hold + accessible confirm path);
   - `Meter` (with a hatched planned extension);
   - `Segmented` (44 px);
   - `Sheet` (vaul, restyled; keep `clearStickyFooter`, `keepOpenForToasts`);
   - `Placard` (eyebrow + rows);
   - `Coin` (states §3.5.2, glyph slot);
   - `RecordMark`;
   - `Skeleton`, `Empty`, `ErrorNote` restyled.
   - Old badge exports become wrappers.
4. `shell/**`: `AppShell` with Capsule, OfferingButton, LiveSlot (renders `LiveSlotContent`), the header row helper `TabHeader` (eyebrow, ✦, avatar), the desktop rail, `--chrome-clear`, the scroll-edge fade, `useScrolledPageTitle` on an opaque bar, nav.ts §2.3, FAB and LiveDock stacking removed, QuickLog retired into the seeded OfferingHost. The Appearance attributes are applied before first paint from `lib/appearance.ts`.
5. `art/**` + `signature/**`:
   - `Statue` (two-image gild, molten edge, modes `now | dawn | unveil | chronicle | oath`, `fromP` for the Unveiling);
   - `Temple` (Colonnade restyled to tokens; keep its guards);
   - `Laurel` (procedural, stroke-dashoffset Inscribe);
   - `Sundial` (arc + bezel; takes `RestState`-like `{startedAt, endAt}` and `idle`);
   - `PlateStack` (per-side drawing, a `changed` plate highlight);
   - `Ridge`;
   - icons §1.6.
   - `GildedBust`, `AscentFrieze` and `Motifs` are rewritten or retired (no hard-coded hexes).
6. Offline:
   - `src/lib/offline/persist.ts`: an IndexedDB persister using `dehydrate` / `hydrate` from `@tanstack/react-query` (no new package). It persists queries with keys in an allow-list (profile, weights, today's food, planned meals for this week, the active session, templates, recovery for 14 days), throttled to 1 write per 2 s, max age 7 days, and cleared on sign-out or user change.
   - `providers.tsx` restores the cache before rendering the shell.
   - `public/sw.js`: an app-shell cache (the root HTML, `/_next/static/*` and `/art/*`; cache-first for hashed static, network-first for HTML with a cached fallback). Keep push handling. Bump the cache version on each deploy (build-id query).
7. Assets per §1.5 via `scripts/dev/grade-statue.mjs`. Credits are appended to `public/art/CREDITS.md`.
8. Dev scripts (§6): `gold-audit.mjs`, `type-audit.mjs`, `ax-shot.mjs`.

**Acceptance (F):**
- `tsc`, `eslint`, `vitest` green, with the new tests listed in §4.
- Every existing route renders at 390×844 for demo and fresh users with **no console errors and no horizontal overflow** (shot.mjs over all routes in §2.3).
- The capsule shows 4 tabs + Offering. The live slot appears on non-workout routes while a session is active. The FAB and the header heart are gone.
- `type-audit.mjs` reports no computed font size under 11 px on any route (old screens included, via the alias floor) and no `.t-monument` under 90 px.
- On a 390 px iPhone emulation with `-apple-system-body` unavailable, the root is 16 px. A forced `html{font-size:28px}` (`ax-shot.mjs`) renders the shell without overlap: the capsule labels hide and its icons stay 44 px.
- Offline cold start (Playwright: load once, go offline, reload) renders Now from cache, with the Offline banner and no "—" where data was cached.
- Statue assets are RGBA. The page uses no `mix-blend-mode` (grep) and has no `feTurbulence` / `feColorMatrix` in `src/` or `public/` (grep).
- At most 3 `backdrop-filter` elements per route (gold-audit also counts these).

### 5.3 S1 · Now

**Builds:** §3.1 (all phases, rail, check-in, scale stepper, Unveiling, rites, Later/Earlier, today's three, fresh/AX/VO), §3.7 Recovery ledger, the `/?dawn=1` and `/recovery?checkin=1` deep links, and `useDayInput()` (in `components/now/`), which assembles `DayInput` from the existing hooks (`useTodayModel`, `planFor`, `useActiveSession`, planned meals of today with `loggedByPlannedMeal`, prefs, recovery day, weights).

**Acceptance:**
- At 390×844 (demo user) the verdict sentence + `PROJ` and the gold primary control are above the fold **and** above the capsule, in every phase. Verify by mocking the clock with Playwright `page.clock.setFixedTime` at 07:00, 11:00, 15:10, 18:10 (after a finished session), 19:30 and 21:30 on a **Monday** (Push A per the real schedule). Also check 375×812.
- **Taps:** check-in 3 (with a prefill), weigh-in 1 (Inscribe), planned meal 1 (`Eaten`), start workout 1 (Begin → Gym Mode with set 1 visible).
- Check-in answers persist per tap. A reload mid-check-in keeps the answered fields (DB-verified), and answering on Now never clears a field set on `/recovery` (test the merge with a fixture).
- Fresh user (qa onboarded with no logs): marble statue, "—", "Weigh in to begin the gilding", no projection; no NaN or "undefined" anywhere.
- With 3 weigh-ins: no gilding and no projection. With 4: both appear.
- The Unveiling plays once per day, never hides content (screenshot at t = 0 ms equals the final layout minus the gild), and any tap skips. Reduced motion: no motion.
- AX (`ax-shot.mjs`): no overlap, the Begin/Inscribe control reachable without horizontal scroll, the statue thumbnail beside the climb rule.
- `gold-audit`: at most 1 gold fill per viewport at each scroll stop.
- `rg "text-\[\d|rounded-\[\d|z-\[\d|#[0-9a-fA-F]{6}" src/components/now src/components/recovery src/components/today` returns nothing (or only documented exceptions).

### 5.4 S2 · Gym

**Builds:** §3.2 (layout, deck, sundial, tower with `setTiming`, plate stack with the changed plate, record carrot, Gold-Leaf Record with "Keep lifting", seal panel with hold-to-seal + accessible confirm, Lights Out target, Gym Mode auto, AX layout), §3.3 Inscription (replaces `SessionSummary`), and `LiveSlotContent` (§2.1).

**Hard constraints:**
- `LiveWorkout` is split into view components (e.g. `gym/GymLayout`, `gym/LiftHeader`, `gym/RestDial`, `gym/SetTower`, `gym/Plates`, `gym/ThumbDeck`, `gym/SealPanel`) with state hooks extracted unchanged.
- **No change** to `stores.ts` semantics, `sync.ts`, `data.ts` write paths, the finish/discard queries or the outbox/journal.

**Acceptance:**
- Existing `src/lib/workout/*.test.ts` stay green, plus the new timing tests.
- **Playwright scratch flow** (demo user):
  1. start Push A;
  2. log set 1 with one tap;
  3. +5 lb then seal (2 taps);
  4. let rest run;
  5. go offline, log 2 sets, back online → the DB has the sets exactly once;
  6. open the same session on a second browser context, log there, return → no lost or duplicated sets;
  7. minimise → the live slot shows the rest ticking, tap → back;
  8. seal with 3 unlogged → the inline row; hold 600 ms → the Inscription; DB status done; unlogged sets removed as today.
- The Gold-Leaf Record fires only on a real record (fixture with history) and never on a first log (`first benchmark`).
- At 390×844: the seal key and both steppers lie entirely within the bottom 35% of the viewport; every gym control is ≥ 56 px tall (measured in the DOM); the timer's computed font-size is ≥ 96 px with weight ≥ 700.
- Dim-gym check: a screenshot with CSS `filter: brightness(.45) blur(.6px)` keeps the timer digits, the key label and the deck values legible (look at it).
- AX: deck stacked, the active set never under the deck.
- Reduced motion: sundial drains, no sheen or flash.
- VoiceOver: steppers adjustable, hold-to-seal reachable via confirm.
- The Inscription: Done is tappable at t = 0. Any tap skips. Records, rows, refuel and RULE lines show real data. No Share button.

### 5.5 S3 · Train

**Builds:** §3.4 (Week with block strip, deload card, temple, today's session, readiness + volleyball strip, volume vs zones; Program incl. schedule, mode and the usual training time via `useSavePrefs`; Lifts library, history, exercise detail with timing marks; template editor restyle), §4.7, and the URL mapping for `?tab=` and `?day=`.

**Acceptance:**
- The deload card appears at the top of Week when `deloadAdvice().suggest` (fixture) and is visible without scrolling at 390×844.
- The block strip is honest: it shows the rule marker and never an invented future block.
- The volume bars match `weeklySetsByMuscle` for the fixture week, with word labels and no amber or red (grep for `amber|warning` in owned files).
- The schedule is editable only in Program. Settings links there.
- `?tab=history` / `?tab=exercises` / `?day=` deep links work.
- Fresh-user Week renders with planned columns and no NaN. AX list fallback for the temple.
- Exercise detail timing marks agree with Gym (same `setTiming`).
- The px/hex grep is clean for owned folders.

### 5.6 S4 · Fuel

**Builds:** §3.5 (Today timeline with plan ∪ diary, consequence lines, day line, water; Week mosaic with per-meal glyph coins, states, list fallback; Market; recipe and cooking-mode restyle; scanner result as EstimateCard), `src/lib/fuel/timeline.ts` (merge planned + logged rows by time using `plannedTime`, pure + tests), `src/lib/fuel/consequence.ts` (`ifYouAdd(totals, addition, goals)` → the strings, pure + tests), and the `/nutrition` param mapping incl. `?add=1` → `openOffering`.

**Acceptance:**
- `Eaten` logs exactly one entry linked to the planned meal, even on a double tap or a retry (DB-verified; existing idempotency). Undo removes it.
- Plan + diary for the demo user's Monday: every planned meal appears once at its scheduled time, every logged entry once, and linked pairs merge into one eaten row (fixture test in `timeline.test.ts`).
- The day line arithmetic equals the sum of eaten + remaining planned (test).
- The mosaic missed outline measures ≥ 3:1 (`--ui-line`), every state has a glyph or notch, and a perfect week shows rims, not full gold faces (screenshot).
- `gold-audit`: ≤ 1 gold fill per viewport on Today and Week.
- Every control ≥ 44 px (DOM measurement; `Eaten` ≥ 72×44).
- The scanner saves nothing before Confirm (DB check while the result sheet is open).
- The meal planner engine tests stay green (`src/lib/meals/**`). Grocery and recipe behaviour unchanged (existing tests).
- AX list fallback for the mosaic; the timeline time column stacks.
- The px/hex grep is clean for owned folders, including `RecipeGlyph` and `PhotoFrame` hexes moved to vars.

### 5.7 S5 · Ascent

**Builds:** §3.6 (Mountain with MountainChart, zoom, inset, gauge, terraces, chronicles list, high-water text; Hall; Gallery; Terrace moment), §3.8 Chronicle (index, story viewer, ledger view keeping print), and the `?tab=` mapping incl. `?log=1`.

**Acceptance:**
- The chart reads only `pace()` / `trendSeries()` / `terraces()`. **No other rate is computed in owned code** (grep for `ratePerWeek` and `weeklyChange` in owned UI files returns only label uses of `pace` fields).
- The decorative ridge stays inside the bottom 30% and never intersects the trend or projection paths (a geometric test on the generated SVG paths in the mountain component's unit test).
- The projection label never overlaps the band label (bounding-box test across 3 fixtures).
- The lb axis is visible. 6W / 3M / Season switch with `useSwapIn`.
- The Chronicle month figure says "change", and the early-water note appears for months overlapping programme days 1–14.
- Fresh-user Mountain renders the corridor only, with "—" ETAs.
- AX: terraces list, chart 240 px.
- VoiceOver sentence present plus the SrTable.
- Print view of a review unchanged in content.
- The px/hex grep is clean (`WeightChart`, `StrengthChart`, `TrendChart`, `reviews/PrintStyles` hexes to vars; print may keep a light palette as vars).

### 5.8 S6 · Sheets + secondary

**Builds:** §3.9 (OfferingSheet Log/Ask, NL field → EstimateCard via `/api/ai/food-chat`, quick actions, Oracle with context chips, ProposalCards, history; `/coach` and `/nutrition/coach` pages), §3.10 Settings incl. Day schedule and Appearance (via `lib/appearance.ts` and `useSavePrefs`), §3.11 Oath, §3.12 Sign-in, `WeightLogSheet` restyle, and the coach snapshot switch to `rateAt`.

**Acceptance:**
- **Log by NL** (AI_MOCK=1): "3 slices of pepperoni pizza instead of the salmon" → an EstimateCard with `AI · ESTIMATE · Not saved yet`, `Replaces: … (planned)` and the consequence line; nothing is in `food_entries` until `Add`; one row after `Add`, even on a double tap.
- `Not configured` and offline states are plain.
- **Oracle:** a proposal shows the exact before → after; `Apply…` → confirm → profile updated + `goal_changes` row; `Not now` writes nothing.
- Settings: saving a meal time keeps `tapLogsGhost` etc. intact (DB check of the `prefs` json). The Appearance toggles apply instantly and survive reload. Reduce transparency makes the capsule opaque.
- Oath: a fresh user completes 5 steps; profile values equal the old 7-step flow's for the same answers (unit test on `profileUpdateFromAnswers` + e2e); hold-to-begin has the accessible confirm.
- Sign-in: errors and redirect unchanged.
- Export and account deletion flows still work (click-through with a qa user).
- AX and reduced-motion screenshots for the sheet, Settings and the Oath.
- The px/hex grep is clean for owned folders.

### 5.9 Integration pass (after all streams)

Foundation leads, and every stream fixes its own findings:
- the full route sweep (§2.3 table) for demo, fresh and a qa-onboarded user at 390, 375 and 1440;
- `gold-audit`, `type-audit` and `ax-shot` on all routes;
- remove the alias tokens and retired utilities with no remaining users;
- remove Cinzel, Manrope and Barlow from `layout.tsx`;
- update `CONVENTIONS.md` (one paragraph pointing here);
- run `tsc`, `eslint src scripts` and `vitest run`.

---

## 6. Definition of done and verification recipes

**Done means:**
- Every screen in §3 is built to its states.
- Every acceptance check in §5 passes.
- No law in §0.1 is broken on any route.
- `tsc`, `eslint src scripts` and `vitest run` are green.
- The demo and fresh users have walked every top daily job at the tap counts in this table:

| Job | Taps |
|---|---|
| Start today's workout (set 1 visible) | 1 |
| Log a prefilled set | 1 |
| Change the load, then log | 2 |
| Finish a workout | 2 (Finish, hold) + Done |
| Log a planned meal | 1 |
| Log food by search | 2 + typing |
| Scan a meal | 3–4 |
| Am I on track? | 0 |
| Log bodyweight | 1 at Dawn (Inscribe), 2 via Offering |
| Morning check-in | 3 |
| Water +250 | 1 (rite or Fuel chip) |
| Ask the Oracle | 1 (✦) |

**Recipes** (dev server `http://localhost:3300`, `AI_MOCK=1`; scratch scripts go in `src/__scratch/`, which is git-excluded):
- **Screenshots:** `node scripts/dev/shot.mjs --base http://localhost:3300 --user demo --out <dir> /` (look at every PNG).
- **AX:** `node scripts/dev/ax-shot.mjs --base http://localhost:3300 --user demo --size 28 --out <dir> /` injects `html{font-size:28px!important}` (≈ AX3) and screenshots.
- **Gold:** `node scripts/dev/gold-audit.mjs --base … --user demo /` scrolls each route in viewport steps and fails if more than one `[data-gold="fill"]` is visible, or more than three elements have a computed `backdrop-filter`.
- **Type:** `node scripts/dev/type-audit.mjs …` fails on any visible text node under 11 px or any `.t-monument` under 90 px.
- **Reduced motion:** Playwright `page.emulateMedia({ reducedMotion: "reduce" })`.
- **Clock:** `page.clock.setFixedTime(new Date("2026-10-19T15:10:00"))` (a Monday, Push A by default).
- **Dim gym:** add `body{filter:brightness(.45) blur(.6px)}` and screenshot Gym Mode.
- **Offline:** `context.setOffline(true)` after the first load, then reload.
- **Contrast:** every new token pairing is listed in §1.1 with ratios. Any new pairing must be computed and must meet AA (text) or 3:1 (non-text) before use.

---

## 7. Deferred, rejected and later

| Item | Status | Note |
|---|---|---|
| Share cards (Inscription, Chronicle, 1080×1920) | **Deferred** | Needs a real renderer (canvas or a `next/og` route) plus a download fallback when `navigator.canShare({files})` is false. Until then, **no Share buttons** |
| Rest-end Web Push | **Rejected for now** | The reminder dispatcher runs every 15 minutes, so it cannot fire at the rest end. Rely on the recomputed "Rest ended 0:42 ago", the optional chime and Wake Lock |
| Sleep bands | **Rejected** | Real hours only (§0.3) |
| Vertical-drag load gesture | **Rejected** | Steppers (§0.3) |
| Haptics | **Removed** | No Vibration API on iOS PWAs. The hidden-switch trick is banned |
| Live Activities and widgets | Not possible | iOS PWA limits. The live slot replaces them in-app |
| Passkeys and magic link on sign-in | Later | Not in this build |
| Living-sky palettes (Ascent concept) | Not adopted | Olympus's single light. Night is the only time variant |
| Muscle map figure | Later | The volume bars cover the job now |
| Drag-the-+ to a timeline time | Later | The Offering sheet's slot picker covers it |

---

## 8. How to use the foundation (for screen engineers)

Foundation's F-B layer is in place: the tokens, the type scale, the materials, the shell, the ui kit and the art. Old screens re-theme through the aliases and keep working. This section lists what to reach for when you rebuild a screen. The spec above still wins on behaviour.

### 8.1 Tokens (`src/app/globals.css`)

- **Colours** (Tailwind names, from the `@theme inline` block): `obsidian night m1 m2 m3 m4 m5`, `vein vein-2 vein-3`, `ui-line`, `ivory stone ash disabled ink`, `leaf-50…leaf-700 leaf-tint leaf-line`, `aegean aegean-tint aegean-line` (AI only), `cinnabar cinnabar-tint cinnabar-line` (errors and pain only), `carbs fat water`. Charts and SVG read the same CSS variables (`var(--leaf-300)`, `var(--ui-line)`). Set SVG colours through `style={{ stroke: "var(--…)" }}`; a presentation attribute does not take `var()`. Never hard-code hex.
- **Aliases** (`bg-s1…s5`, `text-fg/fg-2/fg-3`, `border-line*`, `gold-*`, `success/warning/danger`, `lapis*`, `marble/terracotta/porphyry/lapis/verdigris`, `--grad-*`, `--glow-cta`) point at the new values (§1.1.5). Delete your uses of them as you rebuild.
- **Radii:** `rounded-tag` 5 · `rounded-field` 12 · `rounded-btn` 16 · `rounded-card` 22 · `rounded-sheet` 30 · `rounded-capsule` 32.
- **Z:** `z-(--z-sticky)` 20 · `z-(--z-deck)` 40 · `z-(--z-chrome)` 50 · `z-(--z-sheet)` 60 · `z-(--z-confirm)` 65 · `z-(--z-toast)` 70.
- **Layout:** `px-gutter` (20 px, 16 under 360 px), `max-w-col` (560) and `max-w-wide` (1040), `--topbar-h` (52), `--capsule-h` (64), `--slot-h` (52), `--safe-top` / `--safe-bottom`. The shell already pads `<main>` with `pb-chrome`, which is `--chrome-clear` + 24 px; `--chrome-clear` grows by the live slot while one shows. A fixed bottom bar of your own sits at `bottom: calc(var(--tabbar-h) + var(--safe-bottom))`, just above the capsule.
- **Spacing** is Tailwind's 4-pt scale (`p-4`, `gap-3`), in rem, so it follows the text size. Size things in px only where they must stay fixed at AX sizes (floating chrome, gym hit areas).

### 8.2 Type (`t-*` utilities; never `text-[Npx]`)

| Class | Use |
|---|---|
| `t-monument` | 90 px+ moment numbers (Bodoni Moda, opsz 28), obsidian surfaces only |
| `t-timer` | the rest timer (700, tabular, 96–120 px) |
| `t-dial` | daily hero numbers: trend, protein, the scale stepper |
| `t-num-l` / `t-num-m` / `t-num-s` | deck and tower values / stats / inline numbers |
| `t-title-1` / `t-title-2` | screen and session titles / section titles (Cormorant 600) |
| `t-verdict` | the verdict line (Cormorant italic 500) |
| `t-film` | film titles (SEPTEMBER, OLYMPUS) |
| `t-title-3` · `t-body` · `t-callout` · `t-meta` | row titles · body · secondary · captions |
| `t-eyebrow` · `t-tag` · `t-key` | labels (ash; use `text-stone` on m3/m4) · the Tag · labels on gold keys |
| `tnum` | tabular lining figures on any element |

Font families: `font-sans` (the instrument: SF Pro on the iPhone, Inter Tight elsewhere), `font-voice` (Cormorant), `font-monument` (Bodoni). The retired `t-hero t-title t-card t-h1 t-h2 t-h3 t-plaque t-button eyebrow num num-* unit font-serif font-num` are aliases that render in the new faces. Arbitrary `text-[8px]`…`text-[10.5px]` classes are floored to 11 px.

### 8.3 Materials and variants

- `card` (the m2 slab for old screens) · `slab` (the Now card: m2 + e2) · `card-monument` / `monument` (the spotlight and marble veins: monument surfaces only) · `card-instrument` · `card-inset`.
- `glass` is only for the capsule, the Offering button and the live slot (at most three per screen). `chrome` is now opaque night, never blurred.
- `leaf-btn` (gold key material; prefer `<Button variant="primary">`, which also sets `data-gold="fill"`), `leaf` (non-interactive gold leaf surface), `hatch` (the planned or "under" pattern), `grain` (6% grain over leaf surfaces taller than 64 px), `spotlight`, `hit-44` (pads a small visual to a 44 px target).
- **Gym Mode:** put `data-mode="gym"` on the Gym Mode root. It gives true black, no glass and no spotlight.
- **Night (Seal):** `<html data-phase="seal">` is applied by `src/lib/appearance.ts`: always, or from 21:00 to 05:00. While Now is mounted it may call `setDayPhase(phase)` with the Day Engine's phase.
- **Reduce transparency / Motion** come from Settings → Appearance through `saveAppearance({ transparency, motion, night })` and `useAppearance()` in `lib/appearance.ts`. They are applied before first paint by the boot script in `layout.tsx`.

### 8.4 Motion

- JS: `DURATION` (`press fast base route lift gild inscribe count`), `EASE` / `EASE_CSS` (`out gold sheet in pop`), `SPRING`, `prefersReducedMotion()` (system setting or `data-motion`), `useReducedMotionPref()` (hook), `useSwapIn(key)`. Use `m.*` under LazyMotion. `MotionConfig` already follows the Motion setting.
- CSS: `--dur-*` and `--ease-*`, plus the utilities `press`, `press-soft`, `seal-in` (Seal), `turn-in` (Turn), `spot-in` (Spotlight), `sheen` (one pass), `rise`, `swap-in`, `skeleton`. Under reduced motion every animation collapses except elements marked `motion-keep` (information that moves, like the rest arc).
- Route transitions are automatic (`data-nav`). A second navigation within 400 ms is instant.

### 8.5 The ui kit (`src/components/ui/*`)

- `Button`: `variant` `primary` (gold, `data-gold="fill"`, at most one per viewport) · `secondary` · `outline` · `outline-gold` · `ghost` · `destructive` · `destructive-solid` · `link`; `size` `sm` 44 · `md` 48 · `lg` 56 · `xl` 64 · `icon` · `icon-sm`; `block`, `loading`, `shine` (one Sheen), `asChild`.
- `Tag` (`ui/tag.tsx`): `<Tag kind="LOG|PLAN|RULE|CALC|PROJ|AI" detail? explain? />`. With `explain` it becomes a 44 px button that opens the arithmetic. Spoken text comes from `spokenTag()` in `lib/provenance.ts`. Old badges are wrappers: `LoggedBadge`→LOG, `PlanBadge`→PLAN, `EstimateBadge` (AI with a `confidence`, otherwise a neutral "≈ Estimate", so CALC callers must switch), `SuggestedBadge` (RULE, or `kind="AI"` for the coach), `PRBadge`→`RecordMark`. `SourceBadge` and `DatabaseBadge` stay source chips.
- `RecordMark` (`compact?`, `label?`): the laurel sprig and "record".
- `Meter`: `{ value, target, planned?, tone: "earned"|"kcal"|"carbs"|"fat"|"water"|"ivory", label, size: sm|md|lg }`. `earned` stays ivory until the target is hit; `planned` draws the hatched extension. It replaces rings. `Ring` and `Bar` remain as legacy.
- `Stepper`: `{ value, onChange, step, min, max, label, valueText?, format?, size: "sm"|"md"|"lg" (44/56/64), onValueClick?, children? }`. The value is a VoiceOver spinbutton that responds to the arrow keys; − and + repeat while held. When two sit side by side in the gym deck, give each about 170 px or more.
- `SealKey`: `{ label, detail?, pulse? (bump to play the Final-10 pulse), noTick?, …button props }`. A 64 px gold key.
- `HoldButton`: `{ label, onConfirm, confirmTitle, confirmLabel, confirmBody?, cancelLabel = "Not yet", holdMs = 600, busy?, disabled? }`. Hold for 600 ms, or tap / VoiceOver / Switch Control / Enter for the two-button confirm.
- `Coin`: `{ state: eaten|changed|planned|missed|next, glyph (the RecipeGlyph), size ≤ 44, past?, label? }`.
- `Placard` (`eyebrow`, `action`) with `PlacardRow` (`title`, `detail`, `value`, `lead`, `href` | `onClick`): hairline-ruled rows on night.
- `EstimateCard`: `{ title, status: unsaved|saving|saved|error, items, consequence?, actions, tag?, note? }`. `ProposalCard`: `{ title, rows: {label, before, after}[], onDismiss, onApply, applying? }`.
- Restyled with unchanged APIs: `Card` / `CardHeader` / `CardAction` / `LinkCard`, `Chip` (44 px; selected = ivory edge, never gold), `Segmented` (44 px), `Switch` (on = ivory), `Scale`, `Field` / `Input` / `NumberInput` / `Textarea` / `Select`, `Sheet` / `SheetFooterBar` / `Confirm` (new `cancelLabel`), `CountUp`, `PageHeader`, `Stat`, `Skeleton`, `Empty`, `ErrorNote`, `Collapse`, `Divider`.

### 8.6 The shell (`src/components/shell/*`)

- Put `<TabHeader eyebrow="SAT 17 OCT · DAY 41" oracle={{ kind: "now", label: "Push A today" }} />` at the top of a tab page, before its `<h1>`. On phones the shell's header row shows that eyebrow, ✦ and the avatar, and swaps in the `<h1>` text when it scrolls under the bar. From 768 px the row renders in the page. Without a TabHeader, ✦ and the avatar still show.
- `openOffering({ mode: "log", slot?, panel?, date? })` and `openOffering({ mode: "ask", context?, prompt?, conversationId? })` live in `components/offering/store.ts`. The seeded host opens the old quick-log actions for Log mode and routes Ask mode to `/coach` until Sheets ships the real sheet. Do not map `?add=1` to `openOffering` before Sheets replaces the seed: the seed's "Search food" tile goes to `/nutrition?add=1`, so the two would bounce.
- The live slot shows `components/workout/LiveSlotContent.tsx` (the Gym stream's seed) and steps aside while an element with `[data-today-resume]` is on screen (Now's Return control).
- `isFocusRoute` gives no chrome at all. `hidesCapsule` also covers the scanner and the Food coach (`/nutrition/coach`): on phones both are full-screen layers with their own back button and a control on the bottom edge (shutter, composer) that the capsule would cover. Toasts sit under the 52 px header row (`mobileOffset` in `providers.tsx`).
- `PRBadge` renders `<RecordMark compact label="PR" />` so old inline callers keep their footprint; new screens use `RecordMark` (the word "record") directly.
- Deviation from §1.3: the rail still starts at 768 px (76 px wide, 248 px from 1024 px), because existing screens pin their fixed bars to `md:left-[76px]` / `lg:left-[248px]`. Revisit this in the integration pass.

### 8.7 Art (`src/components/art/*`, `signature/*`)

- `Statue`: `{ p (gildFraction), fromP?, mode: now|dawn|unveil|chronicle|oath, height?, label, skip?, spotlight?, priority?, onSettled? }`. Two alpha-cut WebPs, a transform-only Gild of 600–1400 ms by distance, and the molten edge. `GildedBust` is now a wrapper around it.
- `Laurel` (`size`, `inscribe`, `delay`, `leaves`, `tone`), `Sundial` (`rest: { total, elapsed, paused?, key? } | null`, `final`, `variant: "arc"|"bar"`, `width?`, `label`, children = the digits), `PlateStack` (`plates` per side, `unit`, `changed` index), `Ridge` (decoration, 4%), `Terrace` (`numeral`, `state: reached|next|ahead`, `final`, `label?`). The Temple is `signature/Colonnade` (same API, now on tokens).
- Icons (`art/icons.tsx`): `NowSunrise TrainColumn FuelAmphora AscentPeak OfferingPlus OracleSparkles LaurelSprig Volleyball PlateStackIcon TempleGlyph SealTick CoinMissed Moon`. They are `aria-hidden` unless given a `title`.
- Assets: `public/art/statue-marble.webp`, `statue-gold.webp` and `grain.png` come from `node scripts/dev/grade-statue.mjs`, which is deterministic. `ridge.svg` and `coin-rim.svg` are drawn by hand.

### 8.8 Offline

`Providers` restores the persisted query cache (`lib/offline`) before the app shell renders: `useQueryCacheReady()`, at most about 400 ms. `public/sw.js` keeps each page's HTML (network first), the hashed `/_next/static/*` files (cache first) and `/art/*` (stale-while-revalidate). The cache is versioned by `/sw.js?v=<commit>`, and the worker only registers in production builds.

### 8.9 Checks (`scripts/dev/`)

- `type-audit.mjs`: fails on visible text under 11 px or a `t-monument` under 90 px.
- `gold-audit.mjs`: fails on more than one `[data-gold="fill"]` per viewport at any scroll stop, or more than three `backdrop-filter`s.
- `ax-shot.mjs --size 28`: AX screenshots and chrome checks.

All three take `--base --user` like `shot.mjs`.

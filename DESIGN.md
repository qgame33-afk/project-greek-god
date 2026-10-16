# PROJECT GREEK GOD · THE ASCENT
## Final Design System v1.0: the authoritative implementation spec

**Concept.** A dark museum gallery lit by one warm spotlight. Your progress is the exhibit, and it is gilded only as you earn it. Logging controls stay fast, plain and thumb-sized.

The system evolves the current build rather than replacing it. It keeps the shadcn variable names, the fonts and `statue-line.png`, so every existing screen picks up the new look as soon as the tokens land.

---

## 1. The Laws (restate in every implementation prompt)

1. **Monument vs Instrument.** Monuments get the serif, the classical motifs and the choreography. They are: the Today hero, Session Summary, PRs, Roadmap, Monthly Review header, onboarding welcome and finale, sign-in exhibit, and photo placards. Everything else is an Instrument: Barlow and Manrope, flat cards, no ornament, and motion only as feedback. Any screen where the user enters data is an Instrument.
2. **One light, one gold fill.** The spotlight appears only on Monument cards. Each viewport has at most one gold-filled control, the primary action. Gold data marks (rings, meters, bust, columns) are allowed. Gold gradient text appears at most once per screen.
3. **Gold is earned; misses are quiet.** A missed day stays an empty outline. Red is reserved for errors, destructive actions and pain notes. It never marks under-eating, over-eating or skipped sessions. Suggestions are lapis, never gold.
4. **Provenance is visible.** Every value is LOGGED, ESTIMATE, SOURCE, SUGGESTED or PLAN. Missing data shows "—" plus guidance, never a plausible fake.
5. **Arm's length, one thumb.** The deciding number on a card is at least 40px. Workout controls are at least 52px. Primary actions sit in the bottom 45% of the screen.
6. **Speed is the luxury.** Press feedback within 90ms. Optimistic writes with rollback. No spinner for waits under 300ms. Nothing moves while a field is being edited.
7. **Motion explains change.** Animate only `transform`, `opacity` and `stroke-dashoffset`. No idle loops except a running timer. Choreography plays once per session.
8. **Ornament budget.** At most one meander or laurel per screen. The statue appears at most once per screen. Cinzel never appears on an Instrument.

---

## 2. Tokens (`src/styles.css`)

Replace `:root`. Keep the `@theme inline` block and the legacy utilities (`bg-gradient-gold`, `text-gradient-gold`, `bg-gradient-card`, `bg-gradient-hero`, `shadow-glow`, `shadow-card`, `num`, `eyebrow`). Re-point them through the aliases below so every current screen updates at once.

```css
:root {
  --bg:#08090C; --bg-deep:#050608;
  --surface-1:#0F1115; --surface-2:#15181D; --surface-3:#1C2026; --surface-4:#252A31; --surface-5:#2A2F37;
  --line-hair:rgb(255 255 255/.06); --line:rgb(255 255 255/.09); --line-strong:rgb(255 255 255/.14);
  --line-field:#686C73; --line-gold:rgb(213 172 103/.38); --track:rgb(255 255 255/.07);
  --text-1:#F2EFE8; --text-2:#A3A9B4; --text-3:#8A919C; --text-disabled:#545B66; --ink:#17120A;

  --gold-50:#FBF4E4; --gold-100:#F3DDA8; --gold-200:#EACB8E; --gold-300:#E2C185; --gold-400:#D5AC67;
  --gold-500:#C49A55; --gold-600:#A97E40; --gold-700:#7D5C2E; --gold-800:#4A3720; --gold-900:#2A2014;
  --gold-tint:rgb(213 172 103/.10);
  --grad-leaf:linear-gradient(135deg,#F3DDA8 0%,#D5AC67 34%,#A97E40 68%,#E2C185 100%);
  --grad-progress:linear-gradient(90deg,#A97E40 0%,#D5AC67 55%,#F3DDA8 100%);
  --grad-card:linear-gradient(180deg,#13151A 0%,#0F1115 100%);
  --grad-spotlight:radial-gradient(90% 60% at 82% -8%,rgb(213 172 103/.16),transparent 62%);
  --grad-monument-border:linear-gradient(180deg,rgb(213 172 103/.45),rgb(255 255 255/.06) 45%);

  --success:#6CC08E; --success-tint:rgb(108 192 142/.12);
  --danger:#E5675C;  --danger-tint:rgb(229 103 92/.12);
  --warning:#E8857A; --warning-tint:rgb(232 133 122/.12);
  --lapis:#6FA3EC; --lapis-text:#8FB8F0; --lapis-tint:rgb(111 163 236/.10); --lapis-line:rgb(111 163 236/.35);
  --info:var(--lapis);

  --s-gold:#D5AC67; --s-marble:#E6E1D6; --s-terracotta:#CF8C5E;
  --s-porphyry:#A592C9; --s-lapis:#6FA3EC; --s-verdigris:#5DB5A4;

  --radius:.875rem;
  --e1:inset 0 1px 0 rgb(255 255 255/.04),0 1px 2px rgb(0 0 0/.5);
  --e2:inset 0 1px 0 rgb(255 255 255/.05),0 10px 28px -14px rgb(0 0 0/.85);
  --e3:inset 0 1px 0 rgb(255 255 255/.06),0 -16px 48px -12px rgb(0 0 0/.9);
  --glow-cta:0 10px 30px -12px rgb(213 172 103/.55);
  --chrome-bg:rgb(8 9 12/.80); --chrome-solid:rgb(10 11 14/.97);
  --blur-chrome:blur(20px) saturate(140%); --scrim:rgb(5 6 8/.72);

  --gutter:16px; --card-pad:16px; --gap:12px; --section:28px;
  --topbar-h:52px; --tabbar-h:56px; --dock-h:52px;
  --safe-t:env(safe-area-inset-top); --safe-b:env(safe-area-inset-bottom);

  --dur-press:90ms; --dur-fast:160ms; --dur-base:240ms; --dur-slow:420ms; --dur-ring:900ms; --dur-epic:1400ms;
  --ease-out:cubic-bezier(.22,1,.36,1); --ease-gold:cubic-bezier(.16,1,.3,1);
  --ease-sheet:cubic-bezier(.32,.72,0,1); --ease-in:cubic-bezier(.55,0,1,.45); --ease-pop:cubic-bezier(.34,1.56,.64,1);

  /* shadcn + legacy aliases */
  --background:var(--bg); --foreground:var(--text-1); --card:var(--surface-1); --card-foreground:var(--text-1);
  --popover:var(--surface-3); --popover-foreground:var(--text-1); --primary:var(--gold-400); --primary-foreground:var(--ink);
  --secondary:var(--surface-3); --secondary-foreground:var(--text-1); --muted:var(--surface-3); --muted-foreground:var(--text-2);
  --accent:var(--surface-4); --accent-foreground:var(--text-1); --destructive:var(--danger); --destructive-foreground:var(--ink);
  --border:var(--line); --input:var(--line-field); --ring:var(--gold-400); --surface:var(--surface-3); --bronze:var(--gold-600);
  --chart-1:var(--s-gold); --chart-2:var(--s-lapis); --chart-3:var(--success); --chart-4:var(--s-terracotta); --chart-5:var(--s-marble);
  --sidebar:#0B0C10; --sidebar-foreground:var(--text-1); --sidebar-primary:var(--gold-400); --sidebar-primary-foreground:var(--ink);
  --sidebar-accent:var(--surface-2); --sidebar-accent-foreground:var(--text-1); --sidebar-border:var(--line-hair); --sidebar-ring:var(--gold-400);
  --gradient-gold:var(--grad-leaf); --gradient-card:var(--grad-card); --gradient-hero:var(--grad-spotlight),var(--grad-card);
  --shadow-glow:var(--glow-cta); --shadow-card:var(--e1);
}
@media (min-width:768px){:root{--gutter:24px;--card-pad:20px}}
@media (min-width:1024px){:root{--gutter:32px;--card-pad:24px;--gap:16px}}
@media (prefers-reduced-transparency:reduce){:root{--chrome-bg:var(--chrome-solid);--blur-chrome:none}}
@supports not (backdrop-filter:blur(1px)){:root{--chrome-bg:var(--chrome-solid)}}
```

**`@theme inline` additions**
- **Fonts:** `--font-sans` Manrope, `--font-display` Barlow Condensed, `--font-brand` Cinzel.
- **Colours:** add a `--color-*` entry for every new name: `bg`, `surface-1…5`, `text-1…3`, `line*`, `gold-50…900`, the `*-tint` set, `lapis*` and `s-*`.
- **Radii:** `--radius-xs:6px; --radius-sm:10px; --radius-md:12px; --radius-lg:14px; --radius-xl:20px; --radius-2xl:28px`.

  | Radius | Used for |
  |---|---|
  | `sm` | set cells |
  | `md` | inputs |
  | `lg` | buttons |
  | `xl` | cards |
  | `2xl` | Monuments and sheets |

**Spacing.** Use a 4px grid with only these steps: 4, 6, 8, 12, 16, 20, 24, 28, 32, 40 and 56.

`<main>` bottom padding is `calc(var(--tabbar-h) + 76px + var(--safe-b))`. Add `var(--dock-h) + 8px` while the Live Session Dock is showing.

**Z-index:** top bar 20 · tab bar 30 · FAB and Live Dock 35 · keypad and rest dock 40 · scrim 50 · sheet 51 · toast 60.

**Contrast (computed, WCAG 2.x)**

| Foreground | Ratio on bg | Ratio on surface-4 (worst case) |
|---|---|---|
| text-1 | 17.3 | 12.6 |
| text-2 | 8.4 | 6.1 |
| text-3 | 6.3 | 4.55 |
| gold-400 | 9.4 | 6.8 |
| danger | 6.1 | 4.4 (large text only) |
| every `s-*` series | ≥7.2 | ≥5.2 |

Ink on gold-400 is 8.8. `--line-field` on surface-3 is 3.10, which passes WCAG 1.4.11. gold-600 is for non-text only.

Two rules follow:
- Inactive segments use text-2, because text-3 fails on surface-5.
- Terracotta and warning never share a component, because they differ only in hue.

---

## 3. Typography

Font URL for `__root.tsx`:

`https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Cinzel:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap`

**Families**

| Family | Role | Rules |
|---|---|---|
| **Barlow Condensed** | numerals, page titles, workout and template names, primary buttons | Titles in uppercase. Always `font-variant-numeric: tabular-nums lining-nums`. |
| **Manrope** | body, labels, exercise and food names, chat | Inputs at 16px or larger. |
| **Cinzel** | wordmark, Monument titles, plaques, placards, roadmap months | Caps, 12px or larger. Never for numerals, because it has no tabular figures. Never on Instruments. At most 2 per viewport. |

**Type scale** (mobile → ≥1024px)

| Utility | Spec |
|---|---|
| `num-hero` | Barlow 600, 96/.88 (rest focus) |
| `num-xl` | Barlow 600, 56/.9 → 64 (countdown, weight, rest dock) |
| `num-lg` · `num-md` · `num-sm` · `num-xs` | Barlow 600 at 40 · 28 · 22; Barlow 500 at 15 |
| `t-hero` | Cinzel 600, 26/1.08 → 40, .04em, 2 lines allowed |
| `t-title` | Barlow 700 caps, 32 → 40 (page titles, "WELCOME BACK") |
| `t-card` | Barlow 700 caps, 30 ("PUSH A") |
| `t-h2` | Barlow 700 caps, 20, .02em (sheet titles; 17 in the live top bar) |
| `t-h3` | Manrope 700, 17/1.3 (exercise names; 18 in the workout) |
| `t-body` · `t-small` · `t-caption` | Manrope 500 at 15/1.5 · 13 · 12 (caption in text-3) |
| `eyebrow` | Manrope 700 caps, 11px, .18em, text-3 (gold-300 on Monuments) |
| `t-button` | Barlow 700 caps, 17px, .08em (.06em for labels over 24 characters) |
| `t-plaque` | Cinzel 600 caps, 13px, .2em, gold-300 |
| `wordmark` | Cinzel 600 15px, .12em, gold gradient, over "THE ASCENT" in Manrope 600 10px, .35em |

`h1`–`h3` stay Barlow uppercase.

**Numerals**
- **Units:** Manrope 500 at 40% of the value's size (12px minimum), text-2, baseline-aligned.
- **Formatting:** `3,300` · `185 × 6` · `−0.3` (true minus) · `m:ss`.
- **Precision:** weight to 1 decimal; kcal and grams as integers; water to 0.1 L; sleep to 0.25 h.

---

## 4. Motion

Everything here is CSS or WAAPI, so no animation library is required. If you do use `motion`, use it only through `LazyMotion` + `domAnimation` + `m.*` under `<MotionConfig reducedMotion="user">`.

| Moment | Spec |
|---|---|
| Press | `active:scale-[.97]` over 90ms (cards and rows `.985`); `touch-action:manipulation` |
| Set check | `scale(.9→1)` over 240ms with `--ease-pop` |
| Route mount | Opacity plus an 8px rise, 320ms, 40ms stagger (max 6). **Only on the first visit to each tab per session** (`sessionStorage`) |
| Tabs / push routes | View Transition slide by direction (automatic, `navDirection` in `src/lib/motion.ts`): deeper / into the workout = push (new in from +48px, 240ms), back out = pop, across sections = 14–22px in tab order (220ms), anything else a 220ms crossfade. Chrome (bars, FAB, dock, toasts) never moves |
| Rings | Render at 0, set the value on the next rAF, then animate 900ms `--ease-gold` with an 80ms stagger. Data changes animate from old to new |
| Meters | `translateX`, 600ms |
| Count-up | Monuments only. A 700ms rAF loop writes `ref.textContent`, never React state |
| Sheets | vaul, 380ms `--ease-sheet` |

Router: set `defaultViewTransition: true` in `createRouter`. Push routes call `navigate({to, viewTransition:{types:['push']}})`.

```css
::view-transition-old(root),::view-transition-new(root){animation-duration:180ms;animation-timing-function:var(--ease-out)}
html:active-view-transition-type(push)::view-transition-new(root){animation:vt-in 280ms var(--ease-out)}
@keyframes vt-in{from{opacity:0;transform:translateX(24px)}}
.app-topbar{view-transition-name:topbar}.app-tabbar{view-transition-name:tabbar}
```

**Workout clock (`src/lib/live-clock.ts`).** This replaces the per-second `setNow` that currently re-renders the whole workout page.

```ts
let now = Date.now(); const subs = new Set<() => void>(); let id: number | undefined;
const tick = () => { const n = Date.now(); const ch = Math.floor(n/1000) !== Math.floor(now/1000); now = n; if (ch) subs.forEach(f => f()); };
const start = () => { if (!id && !document.hidden) id = window.setInterval(tick, 250); };
const stop = () => { clearInterval(id); id = undefined; };
document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else { tick(); if (subs.size) start(); } });
export const subscribe = (cb: () => void) => { subs.add(cb); start(); return () => { subs.delete(cb); if (!subs.size) stop(); }; };
export const useNowSec = () => useSyncExternalStore(subscribe, () => Math.floor(now/1000), () => 0);
```

- **Subscribers:** only `<Elapsed/>`, `<RestTime/>` and the Live Session Dock.
- **Rest store:** holds `{endAt, total, pausedRemaining, exercise, setIndex}` and persists it in `localStorage["pgg.rest."+sessionId]`.

**Reduced motion**
- Everything renders in its final state. Only opacity fades of 150ms or less remain.
- Sheens, Dawn and view transitions are off.
- The rest ring keeps draining, because it carries information.

**Performance**
- Animate only `transform`, `opacity` and `stroke-dashoffset`.
- Never animate width, height, box-shadow, filter or backdrop-filter. Glows are pseudo-elements that fade in opacity.
- **Delete the `drop-shadow` filter on `Ring`.**
- Use `will-change` only while an animation runs.
- At most 2 blurred layers.
- Recharts animates on first render only, and never above 120 points.

---

## 5. Components

### 5.1 App shell (`AppShell.tsx`)

**Mobile (<768px)**

**Top bar.** Sticky, `52px + safe-t`, with chrome blur. A `line-hair` border appears after scrolling, detected with a sentinel and IntersectionObserver.
- **Left:** the wordmark on Today. On other screens, the page title in Barlow 17px caps, which fades in once the `t-title` scrolls away.
- **Right:** a 44px `HeartPulse` Recovery button on Today, then a 32px avatar ringed in `line-gold` that opens Settings.

**Tab bar.** Fixed, `56px + safe-b`, with chrome blur. Five tabs, each with the spec name as its `aria-label`:

| Tab | Icon |
|---|---|
| Today | `LayoutDashboard` |
| Train | `Dumbbell` |
| Fuel | `UtensilsCrossed` |
| Progress | `TrendingUp` |
| Coach | `MessagesSquare` |

- Icons are 22px: text-3 at stroke 1.75 when inactive, gold-400 at stroke 2 when active.
- Labels are Manrope 600 10.5px.
- The active tab has a 20×2px gold top bar that slides with `translateX` over 240ms.
- Recovery leaves the tabs. Reach it from the Today top bar, the Mission card, the Quick Log tile, Settings and the sidebar.
- Hidden on the workout, onboarding, the scanner and the chats.

**Quick Log FAB.** A 52px circle at `right:16px`, sitting 12px above the tab bar.
- surface-3, a `line-gold` border, a gold-300 `Plus`. **Never gold-filled.**
- **Tap:** opens a sheet with a 3×2 grid of 96px tiles: Start workout, Log weight, Scan meal, Log food, Water (+250/+500), Check-in.
- **Long-press, 450ms:** starts or resumes today's workout, with a radial hold ring.
- Hides with the tab bar, and while the keyboard is open (`visualViewport.height < innerHeight − 150`).

**Live Session Dock.** Shows while a workout is active and the user is on another screen.
- A 52px bar at `left:12px; right:80px`, on the FAB's row. surface-2, radius 16, with a 2px gold left edge.
- Content: "PUSH A · 32:14 · 9/19 sets", with the time in gold-300.
- While resting it shows "REST 1:12". At zero it shows "REST DONE · SET 3".
- Tap to resume the workout.

**Tablet (768–1023px):** a 76px icon rail.

**Desktop (≥1024px):** a 248px sidebar. It holds the wordmark, then 44px nav items (active: surface-2 with a 2px gold inset bar), a meander, Recovery, Settings, the Live Session card and a Quick log button. Content is capped at 1180px.

### 5.2 Headers and cards

- **`PageHeader`:** eyebrow, then `t-title`, then an optional 44px action.
- **`PanelTitle`:** no icons. An eyebrow, plus an optional gold-300 text action with a 44px hit area.

| `Panel` variant | Spec |
|---|---|
| `card` | `--grad-card`, 1px `--line`, radius 20, `--e1`, `--card-pad` |
| `monument` | radius 28, `background:var(--grad-spotlight) padding-box,linear-gradient(#0F1115,#0F1115) padding-box,var(--grad-monument-border) border-box;border:1px solid transparent`, plus a `::before` showing `/marble-veins.svg` at 5%. The SVG is a 400×400 tile of 6 white cubic paths at 3.5–6%. **Only for:** the Today hero, Session Summary, Monthly Review header, onboarding finale. |
| `instrument` | flat surface-1, 1px line, radius 16 |
| `inset` | surface-3, radius 14, padding 12 |
| `link` | `card` + `active:scale-[.985]` + a text-3 chevron |
| `accent` | `card` + a 1px `line-gold` top border |

### 5.3 Stat tile (`Stat`)

**Layout:** eyebrow → `num-lg` value with its unit (`num-md` in compact grids) → delta (Manrope 600, 12px) → optional 24px SVG sparkline.

**Delta colour follows the goal, not the sign.** The plan rate is r = (target − start) ÷ programme weeks ≈ 0.48 lb/wk.

- A weekly gain between 0.5r and 1.6r is success.
- A gain above 2r is warning, captioned "Faster than plan".
- Everything else is text-2.

Waist growth is never shown as success. When there is no value, show "—" and a caption.

### 5.4 Progress ring (rewrite `Ring`)

**Sizes (diameter/stroke):** XL 240/14 · L 136/11 · M 72/7 · S 52/5 · XS 28/3.5. Use the computed circumference, because older Safari mis-scales `pathLength` on `<circle>`.

**Track and arc**
- **Track:** `--track`. XL and L also get fluting: 60 radial ticks, 1×3px, drawn as **one** `<path>`. Ticks are `line-hair`, with every 15th in gold-800.
- **Arc:** a `linearGradient` with an id from `useId()` and `userSpaceOnUse` coordinates, running bottom-left → top-right. Gold stops: #A97E40, #D5AC67 at 55%, #F3DDA8. Other series run from 80% to 100% of their colour. Round caps, rotated −90°.
- **End cap:** a `<g>` set to `rotate(p×360deg)` with `transform-box:view-box`, using the arc's transition. It holds a radial halo (r = stroke×1.5) and a gold-50 dot (r = stroke×.42). No filters. Hidden at 0%, at 100%, and on rings smaller than 52px.

**Over target**
- The ring stays full.
- An inner arc (stroke×.5, gold-200 at 60%) shows the overflow.
- The caption reads "+120 over" in text-2. **Never red.**

**Labels**
- Centre value in Barlow at `size×.26`.
- Below the ring: "142 / 185 g". The label turns gold-300 once the goal is met.
- `role="img"` with an `aria-label` such as "Protein 142 of 185 grams, 77 percent".

### 5.5 Meter, segmented control, chips

**Meter**
- Build it as a full-width fill inside an `overflow:hidden` track, offset by `transform:translateX(calc((p − 1)×100%))`. Never use `scaleX`, which distorts the gradient.
- Variants:

| Variant | Height | Fill |
|---|---|---|
| Instrument | 6px | series colour |
| Fluted (bodyweight) | 10px | `--grad-progress`, a 7px-period `repeating-linear-gradient` flute overlay, and a gold-50 leading edge |
| Water | — | 12 lapis cells |

**Segmented control**
- 44px tall, on surface-3.
- The thumb is surface-5 and slides with `translateX` over 240ms.
- Labels are text-2; the active label is text-1.

**Chips**
- 36px visible, with a 44px hit area.
- Selected state: `--gold-tint` fill, `line-gold` border, gold-300 text.
- Water chips use the lapis tint.

### 5.6 Buttons (`button.tsx`)

| Variant | Spec |
|---|---|
| `primary` (alias `hero`) | `--grad-leaf`, ink `t-button`, radius 14, `inset 0 1px 0 rgb(255 255 255/.45), inset 0 -1px 0 rgb(0 0 0/.25), var(--glow-cta)`. Disabled: surface-3 with text-disabled. |
| `secondary` | surface-3, 1px `line-strong`, text-1, Manrope 700 15px |
| `outline-gold` | `line-gold` border, gold-300 text, `t-button` at 15px |
| `ghost` | text-2 |
| `destructive` | danger-tint fill, danger text. Solid red only inside confirm sheets. |
| `icon` | 44×44, radius 12 |

- **Sizes:** sm 36px (desktop only), md 48px, lg 56px. **Map the current `xl` (h-16) to lg.**
- **Loading:** a spinner replaces the icon, and the button keeps its width.
- **Sheen:** only on START WORKOUT, SCAN MY MEAL and BEGIN THE ASCENT. A 35% white band sweeps `translateX(-120%→220%)` over 1100ms, once, on the first visit per session.

### 5.7 Inputs and steppers

**Fields**
- 52px tall, radius 12, surface-3, a 1px `--line-field` border, 16px text.
- Focus: gold-400 border plus a static 3px gold ring at 18%.
- Errors: danger border plus helper text.
- Always set `inputMode`, `enterKeyHint` and `autoComplete`.

**Steppers**
- A 52×52 `[−]` and `[+]` around a `num-md` value. Tapping the value opens the NumberPad.
- Steps: barbell 5 lb, other loads 2.5 lb or 2.5 kg, reps 1, bodyweight 0.2 lb, sleep 0.25 h, measurements 0.25 in.
- Holding a button repeats after 400ms, speeding up from 120ms to 60ms.

### 5.8 Set grid and NumberPad dock (the core Instrument)

**Grid**
- **Columns:**
  - below 400px: `[32 set][1fr weight][1fr reps][52 RIR][52 ✓]`;
  - at 400px and up, a `[76 PREVIOUS]` column is added.
- **Spacing:** 6px gaps, 60px rows, 52px cells.
- **Fit:** workout cards use a 12px gutter and 12px padding. At 390pt that leaves 342px, so the weight and reps cells are 91px wide (84px at 375pt).
- **Cells:** each is a `<button>` on surface-3, radius 10, `num-sm`, with a full label such as "Set 2 weight, 185 pounds, suggested".

| State | Rendering |
|---|---|
| Ghost value | The previous value for this set, or the suggested load. **text-3, 1px dotted underline.** Never counts as data |
| Keypad target | Static `inset 0 0 0 2px var(--gold-400)` |
| UP NEXT row | 6% gold tint, `line-gold` outline, gold-300 set number. **Never auto-focused** |
| LOGGED row | success-tint; values solid text-1; ✓ filled success. Still editable, and saving shows the toast "Set 2 updated" |
| PR row | ✓ in `--grad-leaf`, plus a PR badge |
| Warm-up | "W" in gold-600; excluded from volume and PRs |

**✓ (52×52)**
- **Tap:** logs the typed values, or the ghost values where nothing was typed. Toast: **"Set 2 logged · 185 × 6 · UNDO"** (6s). Rest starts.
- **No reps and no ghost:** the keypad opens on REPS.
- **Tap a logged ✓:** unlogs the set, with Undo.
- The setting "Tap ✓ logs shown values" defaults to on.

**Previous sets**
- The history line "LAST · OCT 9" shows each previous set as a chip (`180×8`).
- Tapping a chip copies it into its row with a 180ms gold-tint flash.
- PREVIOUS cells, where shown, behave the same way.

**NumberPad dock.** On touch screens under 768px, cells are `readOnly` with `inputMode="none"`, so the iOS keyboard never shoves the layout.
- **Container:** surface-2, top radius 20, `role="dialog"`, `aria-modal="false"`.
- **Scrolling:** the scroller's `scroll-padding-bottom` equals the dock height plus 16px, which keeps the active row visible.
- **Layout, top to bottom:**
  1. A 52px header: "WEIGHT · SET 2 · BENCH PRESS", the live value, and a close button.
  2. Chips: `−5` / `+5` (2.5 for kg and dumbbells), `= Last`, and `Plates`. Plates appears for barbell lifts only and shows "45 bar + 45 · 25 · 5 per side".
  3. A 3×4 grid of 56px keys (`1–9 . 0 ⌫`).
  4. A 96px right column with **Next** (weight → reps → RIR → next set) and primary **Log set**, each two rows tall.
- **Input rules:** the first key replaces the value. RIR is a single digit and advances on its own.
- **Log set:** closes the keypad and opens the rest dock. **The two never overlap.**
- **Escape:** returns focus to the cell.
- **Inline inputs instead:** when "Use system keyboard" is on, or on screens 768px and wider with a fine pointer.

### 5.9 Sheets, toasts, badges

**Sheets** (vaul `Drawer` as `ResponsiveSheet`)
- surface-2, top radius 28, `--e3`, over `--scrim`, with a 36×5 grabber.
- 56px header with a close button; sticky footer padded `16px + safe-b`.
- Max height 92dvh. Logging sheets snap to `[0.55, 0.92]`.
- At ≥1024px: a centred 560px dialog.
- **Replace the workout's `Dialog` and `window.confirm()` with sheets.**

**Toasts** (sonner, without `richColors`)
- Top-centre on solid surface-3, radius 14.
- A tinted icon disc (laurel for PRs) and a gold-300 "UNDO".
- 4s, or 6s with Undo. At most 2 at a time.
- **Every add and delete offers Undo.**

**Provenance badges**: 20px tall, radius 6, Manrope 700 10.5px caps.

| Badge | Style |
|---|---|
| LOGGED | white 8% fill, text-1, marble dot |
| ESTIMATE | **dashed** `rgb(163 169 180/.5)` border, text-2, "≈", 3 pips from `FoodItem.confidence` |
| SOURCE | gold-tint, `line-gold`, gold-300, `BadgeCheck`, "SOURCE · DOMINO'S US ↗". **Only when `item.reference?.url` exists.** |
| SUGGESTED | lapis-tint, `lapis-line`, lapis-text, `ArrowUpRight` |
| PLAN | dashed `line-strong`, text-3 |
| PR | `--grad-leaf`, ink text, laurel |
| FIRST BENCHMARK | marble outline and text, never gold |
| AUTO / OPTIONAL | text-3 |

### 5.10 Empty states, glyphs, skeletons

**Empty states**
- A `card-inset` containing:
  - a 56px glyph: 1.25px gold-600 stroke, one gold-300 accent, at most 6 primitives;
  - a 15px/700 title;
  - a 13px text-2 line;
  - one secondary action.
- Glyph per section:

| Glyph | Sections |
|---|---|
| Column stub | training |
| Plinth | weight, charts |
| Kylix cup | food |
| 3:4 frame | photos |
| Laurel | PRs |
| Temple mark | coach |

**Crude art fallback:** if a glyph comes out crude, use the laurel or the temple mark.

**Temple mark** (24×24, stroke 1.5)
- Paths: `M2 9 12 3l10 6`, `M3 11h18`, `M2 21h20`.
- Columns at x = 6, 12 and 18, from y = 13 to y = 19.
- Used for the icon, the coach avatar and the loader. In the loader the columns animate `scaleY .3→1`, staggered 90ms.

**Skeletons**
- surface-3 blocks shaped like the content, with a 4% white sweep every 1.4s.
- Shown only after 150ms.

### 5.11 Charts, heatmap, chat

**Charts** (Recharts, lazy-loaded)

- **Size:** 220px tall on mobile, 300px on desktop.
- **Grid and axes:** a horizontal dashed grid only, at 5% white. No axis lines. The Y axis sits on the right. Ticks use Barlow 11px in text-3 (`OCT 12`).
- **Weight series:**
  - weigh-ins as marble scatter dots at 55%;
  - the 7-day average as a gold-400 2px line over an area fading from 22% to 0;
  - **PLAN** as a gold-700 dashed `4 6` line. It is toggleable and must never look like data.
- **Strength:** an e1RM line over volume bars, with gold PR diamonds.
- **Scrubbing, Stocks-style:**
  - tooltip `content={() => null}`, with a 1px gold cursor;
  - `onMouseMove` and `onTouchMove` write the card's **hero number and date eyebrow through refs**;
  - on release, the latest value comes back;
  - desktop also shows a tooltip.
- **Screen readers:** each chart carries an sr-only table of its last 7 values.

**Heatmap**
- 7 columns of square cells, 6px gap, radius 8.

| Cell | Rendering |
|---|---|
| Future | `line-hair` outline |
| Empty day | surface-3, **never red** |
| Habits at ⅓ / ⅔ / under 100% | Gold at 18% / 35% / 55% |
| 100% | `--grad-leaf` |
| Workout | Marble dot |
| Today | Gold outline |

- Tapping a cell opens that day.

**Chat**
- **User messages:** right-aligned, at most 82% wide, on surface-4, radius 18.
- **Assistant messages:** no bubble. 15/1.55 markdown, max 640px, with a 24px temple-mark avatar.
- **Embedded `inset` cards:**
  - food tables with a badge on every row, "Add to Dinner" and "Adjust";
  - LOGGED data chips;
  - suggestion cards (current → proposed) with **Apply**, which opens a confirm sheet.
- **Composer:** a 52px pill that grows up to 5 lines, with a photo button and a gold-leaf send disc. It stays pinned above the keyboard.

---

## 6. Signature moments

### 6.1 The Gilded Bust (bodyweight progress)

The statue gilds from the plinth up as the 7-day average climbs toward the target.

**Asset.** `statue-line.png` is verified as 768×1024 RGBA, and it already renders without a box on sign-in. The alpha mask works as it is.

**One source of truth.** `ascentProgress(profile, weights)` in `calc.ts` returns `{current, avg7, p}`.
- `current` is the latest logged weight, or the start weight if nothing is logged.
- `p = clamp(((avg7 ?? current) − start)/(target − start), 0, 1)`.
- The hero TARGET %, the bust, the fluted meter and the Ascent Scale all read this `p`.

**Build.** A 3:4 box, 168px tall (240px on desktop), with two layers:

| Layer | Spec |
|---|---|
| A | The statue `<img>` at 18% opacity |
| B | A wrapper with `inset:0; overflow:hidden; transform:translateY(calc((1−p)×100%))`. Inside it, a gold child with `background:var(--grad-leaf); mask:url(statue) center bottom/contain no-repeat` (plus the `-webkit-` prefix), counter-translated by `translateY(calc((p−1)×100%))` |

**Motion**
- Both transforms run over 1400ms with `--ease-gold`.
- They start 300ms after the bust enters the viewport and stay in sync with the count-up.
- The bust itself never moves; only the gold rises. Everything runs on the compositor.

**Molten edge** (plays once, never loops). After the fill settles:
1. Render a 3px #F3DDA8 band at the fill line, masked by the statue (its `mask-position` is offset once).
2. Fade it 0 → 1 → .5 over 600ms.
3. Sweep one highlight across it over 900ms.
4. Leave it static.

**States**

| State | Behaviour |
|---|---|
| No weigh-ins | p = 0, with the caption "Begins with your first weigh-in." |
| p = 1 | Full gilding plus a laurel seal reading "ASCENDED" |
| New weigh-in | Animates from the old p to the new p over 900ms |
| No mask support | Hide layer B; the meter still shows p |

### 6.2 The Colonnade (the training week as a temple)

**Size.** SVG `viewBox 0 0 320 96`. 88px tall on Today, 112px on Training.

**Construction**
- A 1px `line-strong` pediment (`M8 20 160 4 312 20`) sits over seven 44px day slots.
- Training days are 18×52 fluted columns; rest days are 24×8 plinths.
- Day letters are Barlow 11px. Today's column is outlined in gold-400, and volleyball days get a lapis dot.

**States**
- **Done:** a gold-leaf rect fills the column with `scaleY(0→1)` from the base (`transform-box:fill-box`). 600ms, 60ms stagger.
- **Missed and future:** outlines only, in `line` and `line-hair`. **Never red.**
- **All sessions done:** the pediment gilds at 35% and a meander draws beneath it. Plays once per week.

**Interaction.** Tap a column to open its day sheet: reschedule, swap the template, or mark volleyball.

### 6.3 The Ascent Frieze and Dawn

**Frieze**
- **Shape:** a 14px meander built from 12×8 units (`M0 7.5H12M3 7.5V.5h7.5V5h-4V3`).
- **Layers:** a `line-strong` base, plus a gold-400 copy using `pathLength=1` and `strokeDashoffset = 1 − elapsed`, where elapsed is the fraction of the programme already passed.
- **Markers:** a 7px gold-300 diamond marks today. "OCT 2026" and "AUG 2027" sit at the ends, with the caption "7% of timeline".
- **Motion:** draws in over 1400ms on the day's first open.

**Dawn** (the first Today visit of each session)
1. The hero fades in.
2. The countdown counts **down** from the total programme days to the days left.
3. The frieze draws.
4. The cards stagger in, and the rings and bust fill as they come into view.

Later visits render instantly.

### 6.4 Gold-Leaf PR and the Hall of Records

**Trigger**
- A logged working set whose e1RM (using the existing `e1rm`) beats every prior completed set of that exercise.
- **Prior history is required.** A first-ever log shows FIRST BENCHMARK instead.
- Fires once per exercise per session.

**In the row**
1. The ✓ turns gold leaf.
2. One sheen sweeps the row (700ms).
3. A PR badge pops (`--ease-pop`, 240ms).
4. Haptic.

**Toast:** "New record · Bench Press · 205 × 5 · e1RM 239 lb", with a laurel. No confetti.

**Session Summary:** PRs are collected as laurel plaques. Each shows the exercise name in Cinzel, the set, and the e1RM gain ("+6").

### 6.5 Spotlight Rest Timer

**Compact dock (default)**
- **Container:** fixed to the bottom, `104px + safe-b` tall, surface-2, top radius 20. Slides up 320ms after a set is logged.
- **Meter:** a 3px top-edge meter drains through a `transform` keyframe. It is marble, turning gold for the final 10 seconds.
- **Left:** `<RestTime/>` in `num-xl` over "REST · then Set 3 · 185 × 6".
- **Right:** **−15**, **+15** and **Skip**, each 52×52.
- **Tap the digits** to open focus mode.

**Focus mode** (opt-in; can be made the default in Settings)
- Full screen on `--bg-deep` with one top spotlight.
- The XL fluted ring around `num-hero` digits, with "NEXT · BENCH PRESS · SET 3 · 185 × 6".
- 64px Pause, −15, +15 and Skip in the bottom 35% of the screen.
- A `ChevronDown` returns to the dock.

**Mechanics**
- **Ring:** one keyframe animates `stroke-dashoffset` from 0 to C. `animation-duration` is the total rest time; `animation-delay` is −elapsed.
- **Pause:** sets `animation-play-state:paused`.
- **±15:** updates `endAt` and re-keys the element.
- **Digits:** always derived from `endAt`.
- **Last 10 seconds:** the digits turn gold-200.

**At zero**
1. The digits read "GO".
2. A glow pseudo-element flashes for 500ms.
3. Haptic, plus an optional chime: 660/990 Hz, off by default, with audio unlocked on the first ✓.
4. **After 1.2s the dock dismisses itself.** The UP NEXT row scrolls to centre and pulses its gold outline once.

**Backgrounding:** iOS PWAs can't alert from the background, so recompute on `visibilitychange` and show "Rest ended 0:42 ago" if needed.

**Announcements:** a polite live region speaks at 60, 30, 10 and 0 seconds.

**Haptics (`haptics.ts`):** use `navigator.vibrate` where available. On iOS 18+, fall back to clicking the label of a hidden `<input type="checkbox" switch>`. Haptics can be switched off and never carry information on their own.

### 6.6 Begin the Ascent (onboarding finale)

1. The bust gilds.
2. The 11 roadmap months rise like a staircase.
3. The CTA plays one sheen.
4. Tapping it fades to `--bg-deep` and opens Today, where Dawn plays.

---

## 7. Screens

### 7.1 Today (`/`)

**Rule:** at 390×844, START WORKOUT is fully visible without scrolling.

**1. Hero** (`monument`)
- Gold-300 eyebrow: "FRIDAY · OCTOBER 16".
- `t-hero` "GOOD MORNING, QUINTON", switching to afternoon or evening by time of day.
- A rule-based daily line, at most 2 lines: "Push A today. Protein is the lever: 185 g." It replaces the italic quote.
- Countdown row:
  - left: gold-gradient `num-xl` "297" over "DAYS TO AUG 1, 2027", computed from `goal_date`;
  - right: "WEEK 3 / 42".
- The Ascent Frieze.
- A hairline strip in `num-md`: CURRENT `166.4 lb`, GOAL `183 lb` (180–185 range), TARGET `17%` ("of the climb").
- No statue here.

**2. Today's workout** (`accent`)
- "TODAY · MONDAY", then `t-card` "PUSH A", then "Upper body strength · 6 exercises · ~70 min".
- **Then primary lg START WORKOUT.**
- Then 3 exercise rows and "+3 more".

| State | Card shows |
|---|---|
| Active | "RESUME · 24:12" |
| Done | Success row "Completed · 68 min · 14,250 lb" and "View summary" |
| Rest day | "RECOVERY DAY", 3 recommendations, "Recovery check-in", and the next session |
| Volleyball day | Neutral chip "Volleyball today · jumps optional" |

**3. Transformation** (`card`, no spotlight)
- **Left:** `t-plaque` "163 → 183 LB", weight in `num-xl`, "Logged today 7:12 AM" (or "Last confirmed Oct 12"), then 7-DAY AVG, TREND and TO GO.
- **Right:** the Gilded Bust.
- **Footer:** the fluted meter, "17%" and "Log weight".

**4. Fuel**
- L kcal ring: "1,460 KCAL LEFT · Eaten 1,840 · Target 3,300".
- "Scan meal" (secondary).
- M rings for Protein, Carbs, Fat and Water.
- +250 and +500 chips.

**5. Mission**
- Header: "4 / 7".
- 56px rows, each with an XS ring that turns into a gold check, a caption like "142 of 185 g", and AUTO badges.
- The workout row reads "Completes when you finish the session."
- When every row is done: laurel and "MISSION COMPLETE".

**6. This week**
- The Colonnade.
- 2×4 tiles: Workouts 3/6, Adherence, Avg kcal, Avg protein, Weight trend, Sleep, PRs, Streak.

**7. Records:** 3 laurel rows.

**8. Recovery:** a `link` row, "Sleep 7.5 h · Energy 4/5".

**Desktop (12 columns)**

| Row | Columns |
|---|---|
| 1 | Hero 7, Workout 5 |
| 2 | Transformation 5, Fuel 4, Mission 3 |
| 3 | Week 8, Records/Recovery 4 |

### 7.2 Training (`/train`)

**Top:** `t-title` "TRAINING", a 112px interactive Colonnade, then the next-workout card.

**Program | History | Exercises** (segmented)
- **Program:** 6 `link` cards ("6 exercises · 17 sets · ~70 min", plus the date last done), Intro volume and Deload toggles, and an editor with drag handles.
- **History:** sessions grouped by week. Each row shows "68 min · 14,250 lb · 17 sets" and its PRs as laurels.
- **Exercises:** search, then a detail view with e1RM, best sets and history.

**Log volleyball** (secondary): Practice/Game, intensity and duration.

### 7.3 Live workout (`/workout/$sessionId`): Instrument only, no tab bar or FAB

**Top bar** (blurred)
- **Left:** `ChevronDown` minimises the workout to the Live Session Dock.
- **Centre:** the name in Barlow 17px caps, over `<Elapsed/>` in gold-300.
- **Right:** outline-gold "FINISH".
- **Bottom edge:** a 3px strip with one segment per exercise. A segment turns gold when its exercise is done.
- The warm-up card collapses after the first logged set.

**Accordion**
- Only the current exercise is open.
- **Finished exercises** collapse to a 64px row: "✓ Bench Press · 3/3 · 185×8 · 185×7 · 185×6". A PR adds a laurel.
- **Upcoming exercises** collapse to a 56px row in text-2.
- **Tap** any collapsed row to open it.
- **After finishing** an exercise, the next one opens and scrolls into view, 72px from the top.
- The swap is a 160ms fade. Height never animates.

**Open exercise** (`instrument`)
- **Header:**
  - name in Manrope 700 18px;
  - muscles caption;
  - a 44px `⋯` sheet replacing the four inline icons: Instructions & form tips, Replace, Move, Skip, Add warm-up set, Note, History.
- **Target chips:** `3 × 5–8` · `RIR 1–2` · `Rest 2:30`.
- **SUGGESTED line:** "185 lb × 6–8. You hit 8, 8, 8 last time." If the target was missed: "Stay at 180 lb and add a rep where you can."
- **Then:** history chips, the cues sheet, the set grid, and "+ Add set".

**Page end:** notes, then "Discard workout", which asks for confirmation in a sheet.

**Finish sheet:** "17 sets logged. 1 unlogged set will be discarded.", then **SAVE SESSION**.

**Session Summary** (`monument`)
- "SESSION COMPLETE" and the `t-hero` name.
- Duration, Volume, Sets and Exercises, counting up.
- A meander.
- Hall of Records. With no PRs it shows "Volume +4% vs last Push A".
- "Next · Tuesday · Pull A".
- **DONE**.

**Desktop:** a 720px list, with a sticky 320px column for the L rest ring, stats and notes.

### 7.4 Nutrition (`/nutrition`)

**Header.** `t-title` "FUEL" (eyebrow "NUTRITION"), with a date switcher.

**Rings card**
- An L kcal ring: "1,460 KCAL LEFT · Eaten 1,840 · Target 3,300".
- Macro meter rows, e.g. "142 / 185 g · 43 left".
- The water meter.

**Actions**
- Primary lg **SCAN MY MEAL**, the screen's only gold fill.
- Secondary buttons: "Ask Food Coach", "Add manually".
- A "Recent" chip rail.

**Meal cards** (Breakfast, Lunch, Dinner, Snacks)
- 60px rows showing "2 eggs · 140 g · 8:14 AM", the kcal over P·C·F, and an ESTIMATE or SOURCE badge on AI-logged items.
- **Tap:** edit. **Long-press:** menu. **Swipe left:** Edit and Delete. Every one of these actions is also in the edit sheet.
- An empty meal shows "Nothing logged · Add".

**Log sheet**
- **Tabs:** Search | Saved | Recent | Manual.
- **Inputs:** amount stepper and unit, meal chips preset by time of day, time, favourite.
- **Feedback:** a live macro grid, plus a soft check: "Macros add to 612 kcal; you entered 540."
- **Footer:** a sticky "ADD TO LUNCH".

**After saving:** the rings animate from the old values to the new ones, the new row flashes gold-tint, and a toast reads "Added to Lunch · UNDO".

### 7.5 Food scanner (`/nutrition/scan`, wrapping `FoodScanner`/`FoodReview`)

1. **Capture**
   - A 4:3 frame with gold corner brackets and the line "Centre the plate. Include sauces and drinks."
   - **TAKE PHOTO** (`capture="environment"`) and a secondary "Upload from library".
   - Photos are downscaled to 2,000px or less on the client.
2. **Analysing**
   - A gold scan line sweeps the photo every 1.6s.
   - **"Analyzing your meal" with elapsed seconds. No fake stages.**
   - Cancel.
3. **Review**
   - **Header:** thumbnail, "3 items found", ESTIMATE.
   - **Caveat:** "Photos can't show oils, sauces or exact weights. Adjust anything that looks off."
   - **Follow-up cards:** when `questions[]` or `needs_portion_info` is set, lapis-bordered cards ask questions like "Was the chicken fried or grilled?". The answer chips recalculate.
   - **Item cards:** editable name, portion stepper (±0.25× or grams), prep chip, kcal and P/C/F, confidence pips, delete. SOURCE appears only when `reference.url` exists.
   - **Sticky footer:**
     - "MEAL TOTAL 812 kcal · P 58 · C 74 · F 28";
     - a meal selector;
     - **CONFIRM & ADD TO DAILY NUTRITION** at .06em tracking, which fits 343px.
   - **Nothing is saved before this confirm.**
4. **Success:** a gold check draws in, with "Added to Lunch" and UNDO, then the screen returns to Nutrition.

**Failure:** "Analysis failed. Your photo is still here.", with Retry and "Log manually". If the AI key is missing, say so plainly.

### 7.6 Ask Food Coach (`/nutrition/coach`, wrapping `FoodCoach`)

**Header:** `t-title` "FOOD COACH".

**No live lookup:** show the banner "Live restaurant lookup is off. Answers use labelled estimates."

**Empty state:** a kylix, "Describe what you ate.", and 4 example chips.

**Answers**
- Every row carries SOURCE or ESTIMATE.
- Correction chips such as "6 slices" or "No sauce".

**Adding to the log**
- Requires a confirmation card ("4 items · 1,920 kcal → Dinner") and **Confirm & add**.
- After adding, the card collapses to "LOGGED · Undo".

### 7.7 AI Coach (`/coach`, new route)

**Header:** `t-title` "COACH".

**Context chip:** "Using: Training · Nutrition · Recovery · Weight", with toggles.

**Footnote (shown once):** "Coaching, not medical advice. Stop and get checked if something hurts."

**Empty state:** the 6 spec prompts as 64px tiles.

**Answers**
- Facts about the account cite LOGGED chips.
- Projections use SUGGESTED or PLAN.
- **Target changes arrive only as suggestion cards: Apply → confirm sheet.**

**No AI key:** "Coach isn't connected yet. It needs an AI key on the server."

### 7.8 Progress (`/progress`)

**Header:** `t-title` "PROGRESS", a "Log" chooser, and sticky chips: **Weight · Body · Photos · Strength · Athletic · Roadmap**.

**Weight**
- **Hero:** `166.4 lb` in `num-xl`, driven by the chart scrubber, with "+3.4 since Oct 1".
- **Ascent Scale:** a 64px SVG ruler running from the start weight to the target.
  - Ticks: 6px for every lb, 12px and labelled every 5 lb.
  - A laurel marks the target.
  - A 4px gold track fills up to the 7-day average, where a text-1 needle sits.
  - A dashed PLAN needle marks the monthly checkpoint.
  - Motion: the needle glides in with `translateX`. A new weigh-in moves it and adds a "+0.4" chip.
- **Data:** range filter, chart, six stat tiles, and an editable weigh-in list with Undo.
- **Suggestion:** after 14 or more days of data, a SUGGESTED card such as "Trend +0.1 lb/wk vs +0.45 planned. Consider +150 kcal/day." **Review change** opens a confirm sheet. Never applied automatically.
- **Weigh-in sheet:**
  - a `num-hero` value with ±0.2 steppers and the NumberPad;
  - date and note;
  - on save, every view updates and an Undo toast appears.

**Body:** tiles show the latest value, the change since the first entry, and a sparkline. Includes an in/cm toggle and a stepper sheet for logging.

**Photos**
- **Compare:** two 3:4 frames with a gold-800 inner border, each over a museum placard showing a Cinzel date ("OCTOBER 2026") and the weight.
- **Wipe:** a `clip-path:inset()` divider.
- **Browsing:** pose chips and a monthly gallery.
- **Privacy:** "Private to your account. Never shared."
- **Delete:** asks for confirmation.

**Strength:** rows show e1RM, best set and a sparkline. The detail view has the e1RM chart, volume bars and a laurel timeline.

**Athletic:** tiles for jump, reach, sprint and squat/BW, each with its PR and "Log test". Tip: "Test fresh, same time, surface and footwear."

**Roadmap** (Monument)
- **Rail:** gold up to today, dashed after.
- **Nodes:** past nodes filled; the current one a static gold ring.
- **Months:** Cinzel month names, each with its milestone, the PLAN (dashed) and the LOGGED average. Editable.
- **Monthly Review:** each past month opens one, with:
  - a `monument` header and placard;
  - Physical, Training, Nutrition and Recovery cards built from real aggregates;
  - 2–3 SUGGESTED priorities;
  - "Export PDF" through print CSS.

### 7.9 Recovery & Habits (`/habits`)

**Check-in (Instrument)**
- Sleep stepper.
- Five 5-segment selectors (44px): Quality, Energy, Soreness, Fatigue, Stress. End captions such as "Drained ↔ Fresh".
- Volleyball switch.
- Pain note. Once filled, it shows a danger-tint message: "Coach will avoid loading this area. Sharp or lasting pain: get it checked."
- **SAVE CHECK-IN**.

**Guidance:** a SUGGESTED line with its reason, plus "Not a medical assessment."

**Water:** an L lapis ring, with +250 / +500 / +750 / Custom and Undo.

**Habits:** customisable rows with AUTO badges.

**History:** a monthly heatmap (Streak, Adherence) and a weekly review with sleep bars and one recommendation.

### 7.10 Settings (`/settings`)

**Profile:** a Cinzel monogram and "Day 12 of the ascent".

**Layout:** inset grouped lists with 52px rows and gold-500 switches.

**Groups**
- **Goals**
- **Nutrition targets**, with a live line: "Macros = 3,301 kcal ✓". If the macros don't add up, show it in warning red: "Macros total 3,520 kcal, 220 above target".
- **Training:** schedule, intro volume, deload, rest defaults, "Tap ✓ logs shown values", "Use system keyboard", "Open rest in focus mode"
- **Haptics & sound**, **Units**, **Coach data access**
- **Reminders**, with an honest note that iPhone push needs a push service and the Home Screen app
- **Data:** export, delete (type DELETE)
- **Sign out**

### 7.11 Onboarding (`/onboarding`)

**Every step:** a 7-segment meander progress bar, "STEP 3 OF 7", a `t-title` question, a sticky **CONTINUE** and Back.

**Steps**
1. **Welcome:** the bust and "THE ASCENT BEGINS".
2. **Body:** weight and height.
3. **Goal:** weight (180–185 band) and date, with "≈ 0.5 lb per week". Above 1 lb/week, show "Faster than this mostly adds fat."
4. **Training:** experience, schedule, volleyball.
5. **Nutrition:** prefilled SUGGESTED values and the consistency line.
6. **Units.**
7. **Finale (`monument`):**
   - placard "163 → 183 LB · 42 WEEKS · 6 DAYS · 3,300 KCAL · 185 G";
   - roadmap;
   - **BEGIN THE ASCENT**.

### 7.12 Sign-in (`/auth`)

**Mobile**
- **Background:** the bust at the top right (60vh, 16% opacity, faded at the bottom), over marble veins and a spotlight.
- **Form** (lower 60%): wordmark, Barlow "WELCOME BACK", "Private by default. Only you can see your logs and photos.", 52px fields, **SIGN IN**, "Continue with Google", and a gold-300 "Create an account".
- **Errors** appear inline.

**Desktop:** a split layout. The left 55% is the exhibit: the bust at 80vh under a spotlight, with the placard "THE ASCENT · MMXXVI – MMXXVII". The form sits in a 400px column on the right.

---

## 8. Copy voice

Write short, declarative sentences in the second person, with numbers first. No emojis, exclamation marks, guilt, hype or physique promises. Buttons are 3 words or fewer, except labels the spec mandates.

| Avoid | Use |
|---|---|
| "You missed your workout!" | "Move Pull A to tomorrow?" |
| "Great job!!!" | "Session saved. 68 min · 14,250 lb." |
| "You're over your calories" | "+120 kcal over target." |
| "Something went wrong" | "Couldn't save. Your entry is kept. Retry." |
| "AI found your meal!" | "3 items found. Estimates, so check portions." |
| "Verified" (for a guess) | "Estimate. No published nutrition found." |

**Daily line:** focus plus one number. "Legs A today. Jumps first, while you're fresh."

---

## 9. Accessibility and performance

**Accessibility**
- **Contrast:** AA for text (§2). Fields and data series reach 3:1.
- **Colour is never the only signal:** badges carry text, and sets carry a check.
- **Targets:** 44px or more; 52px or more in the workout; at least 8px apart.
- **Gestures:** each one has a visible equivalent (swipe → edit sheet, long-press → `⋯`, FAB hold → Quick Log tile).
- **Focus:** `:focus-visible{outline:2px solid var(--gold-400);outline-offset:2px}`. Sheets trap focus, close on Escape and return focus.
- **Screen readers:**
  - rings and charts get `role="img"` plus an sr-only table;
  - count-ups expose only their final value;
  - the rest timer is `role="timer"`.
- **Layout:** rem units, intact at 130% text. Safe-area padding on bars, docks, the keypad and sheet footers.
- **PWA:** keep `viewport-fit=cover`, `black-translucent` and `theme-color #08090C`.

**Performance**
- **Loading:** code-split routes; lazy-load Recharts.
- **Statue:** re-encode to WebP (≤80 kB, alpha intact) if possible. Otherwise keep the PNG with `decoding="async"` and explicit dimensions.
- **Lists:** `content-visibility:auto` on long lists.
- **Writes:** optimistic TanStack Query mutations with rollback for sets, water, missions, food and weigh-ins.
- **Targets (iPhone 12):** Lighthouse ≥90, LCP <2.0s, CLS <0.05, INP <150ms, 60fps.

---

## 10. Implementation order and acceptance checklist

### Phases (each ships independently and leaves the app working)

1. **Foundation.** This phase transforms the whole app at once.
   - `styles.css`: tokens, `@theme`, utilities and aliases.
   - The font URL.
   - `button.tsx`.
   - `kit.tsx`: `Panel`, `PanelTitle`, `PageHeader`, `Stat`, `Ring` (filter-free), `Meter`, `Badge`, `Empty`, `Skeleton`.
   - Sonner.
   - Focus and reduced-motion CSS.
2. **Shell.** Tab bar, `/coach` route, FAB, Live Session Dock, sidebar, view transitions, `ResponsiveSheet`.
3. **Live workout.**
   - Clock and rest stores.
   - Grid states and ghost logging with Undo.
   - NumberPad, accordion, rest dock, sheets.
   - PR moment and summary.
4. **Today.** Hero strip and frieze, workout card second, bust, fuel, mission, colonnade, Dawn.
5. **Nutrition.** Rings, meals, log sheet, scanner and coach routes, badges.
6. **The rest:** Progress, Recovery, Settings, Onboarding, Sign-in.
7. **Audit:** Safari timeline, gold-fill count, Cinzel check, glyphs.

### Checklist

Run every check at **390×844** (safe areas on) and at **1440×900**.

**Global**
- [ ] Background is #08090C. No neon or emojis. No button taller than 56px. Every target is at least 44px (52px in the workout).
- [ ] At most one gold fill per viewport. Spotlight only on Monuments. No Cinzel on Instruments.
- [ ] Timer digits never shift.
- [ ] Reduced motion shows final values.
- [ ] No red for nutrition misses or missed days.
- [ ] Missing data shows "—" and guidance.

**Today**
- [ ] START WORKOUT sits fully above y = 754 at 390.
- [ ] The hero shows date, countdown, week, current weight, goal and %.
- [ ] Dawn plays once.
- [ ] Bust and hero share one `p`; the molten edge plays once.

**Live workout**
- [ ] No horizontal scroll. Cells are at least 84px wide.
- [ ] Ghost values are dotted text-3. ✓ turns them solid and offers Undo.
- [ ] Rows stay editable.
- [ ] The keypad never shifts the page or overlaps the rest dock.
- [ ] Rest controls are 52px. The sequence is GO → auto-dismiss → UP NEXT.
- [ ] Rest survives a refresh. The Dock appears when the workout is minimised.
- [ ] Only the timers re-render each second.
- [ ] A PR plays one sheen. A first log shows FIRST BENCHMARK.
- [ ] No `confirm()`.

**Nutrition**
- [ ] SCAN MY MEAL is the only gold fill.
- [ ] No fake analysis stages.
- [ ] SOURCE appears only when a URL is present.
- [ ] CONFIRM fits on one line, and nothing saves before it.
- [ ] Rings animate. Undo works.

**Progress**
- [ ] Scrubbing drives the hero number.
- [ ] PLAN is dashed.
- [ ] The scale needle sits at the 7-day average.
- [ ] Wipe works.

**1440×900 specifics**
- [ ] Today puts Hero and Workout in row 1.
- [ ] The workout uses inline inputs, with the rest timer in a sticky column.
- [ ] Sheets open as 560px dialogs.
- [ ] Charts are 300px tall.
- [ ] Sign-in shows the exhibit on the left.

**Other screens**
- [ ] The pain note shows guidance.
- [ ] The macro check is live.
- [ ] BEGIN THE ASCENT leads to Dawn.

**Performance**
- [ ] 60fps through the bust fill, rings, sheets and rest timer.
- [ ] No `filter`, `box-shadow` or `width` animation.
- [ ] At most 2 blur layers.
- [ ] LCP under 2.0s on 4G.
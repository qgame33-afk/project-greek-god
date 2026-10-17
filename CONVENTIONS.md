# Project Greek God — engineering conventions

Read this, `DESIGN.md` (the authoritative visual/interaction spec) and the relevant parts of
`SPEC.md` before writing code. These rules exist so many contributors produce one coherent app.

## Stack
- Next.js 16 App Router (**read `node_modules/next/dist/docs/` for anything you're unsure of** —
  `middleware` is now `src/proxy.ts`, request APIs (`params`, `cookies()`) are async, Turbopack is
  default. `cacheComponents` and partial prefetching are OFF: every app screen is private and
  renders on the client after mount (the AppShell gates on mount so dates follow the user's
  timezone) — feature pages are client components that fetch with TanStack Query).
- React 19.3 (`<ViewTransition>` available from "react"), TypeScript strict, Tailwind v4 (tokens in
  `src/app/globals.css`), `motion` (`motion/react`, always `m.*` under the app's `LazyMotion` —
  never `motion.*`), `radix-ui` unified package (`import { Dialog } from "radix-ui"`), `vaul`,
  `sonner`, `recharts` 3, `lucide-react` 1.57 (**verify icon names** in
  `node_modules/lucide-react/dist/lucide-react.d.ts`: use `Ellipsis` not MoreHorizontal, `Trash` not
  Trash2, `Clock`/`RotateCcw` not History), `zod` 4, `date-fns` (prefer `src/lib/dates.ts`).
- Supabase: Postgres + RLS + Auth + private Storage. Schema: `supabase/migrations/*.sql`;
  generated types `src/lib/supabase/database.types.ts`.

## Data rules (non-negotiable)
- **Never fabricate data.** No seeded logs in app code, no placeholder numbers that look real,
  no fake AI. Missing data renders "—" plus guidance (`<Empty>`).
- All reads/writes go through `src/lib/data/*` hooks (TanStack Query + the browser Supabase
  client under RLS). Add feature-specific hooks in your own files; don't fork the shared ones.
  Use `fetchAll()` for anything that can exceed 1000 rows. Use `must()` to unwrap responses.
- Dates: every user-owned row has an explicit `local_date` (YYYY-MM-DD in the user's timezone).
  Use `useToday()` (rolls over at midnight) and `src/lib/dates.ts`. Never `.slice(0,10)` a
  timestamptz.
- Units: store lb / inches / mL. Convert only at display/input via `src/lib/units.ts` using
  `profile.weight_unit` and `profile.length_unit`.
- Mutations are optimistic with rollback + a toast on error, and every add/delete offers Undo
  (see `useAddFood`, `useDeleteFood`, `useWaterMutations`, `useWeightMutations` for the pattern).
  Guard double-submits (disable while pending or use a ref).
- Goal changes go through `useSaveProfile()` (it records `goal_changes`). Nothing changes a goal
  without an explicit user confirmation.
- AI: server-only (`src/lib/ai/gemini.ts`, `generateJSON`). Validate AI output with zod before it
  is shown; nothing an AI returns is written to the database until the user confirms. Only show
  a SOURCE badge when a real URL from an actual lookup exists. If `GEMINI_API_KEY` is missing the
  route returns `{code:"not_configured"}` and the UI says so plainly.

## UI rules (summary — DESIGN.md wins on details)
- Shared kit: `src/components/ui/*` (Button, Card/CardHeader/CardAction/LinkCard, Ring, Bar,
  badges (Logged/Estimate/Source/Database/Suggested/PR/Optional/Auto), Chip, Segmented, Switch,
  Stepper, Scale, Field/Input/NumberInput/Textarea/Select, Sheet/Confirm, CountUp, PageHeader,
  Stat, Skeleton, Empty, ErrorNote). Art: `src/components/art/Mark.tsx`, `Motifs.tsx`
  (Meander, Laurel, LaurelBullet, ColumnFluted, Plinth, Pediment, EmptyArt). Statue images in
  `public/art/` (statue-hero.webp photo, statue-mask.webp alpha mask, statue-portrait.webp).
- Typography utilities: `t-title` (page titles), `t-card`, `t-h2`, `t-h3`, `t-hero` + `t-plaque`
  (Cinzel — Monument surfaces only), `eyebrow`, `num`, `num-hero/xl/lg/md/sm/xs`, `unit`.
  Surfaces: `card`, `card-accent`, `card-monument` (hero/summary/finale only), `card-instrument`,
  `card-inset`. Colors: `bg-s1..s5`, `text-fg/fg-2/fg-3`, `border-line/line-gold`, `gold-50..900`,
  `success`, `danger`, `warning`, `lapis*`, series `marble/terracotta/porphyry/lapis/verdigris`.
- One gold-filled control per viewport. Red only for errors/destructive/pain. Suggestions are
  lapis. Misses are quiet. ≥44px targets (≥52px in the workout). Inputs ≥16px font.
- Mobile first at 390×844; must also look great at 1440×900. No horizontal overflow.
- No `window.confirm/alert` — use `<Confirm>` / `<Sheet>`.
- Copy: short, declarative, numbers first, no emojis, no exclamation marks, no guilt.
- Motion: tokens live in `src/lib/motion.ts` (`DURATION`, `EASE`/`EASE_CSS`, `SPRING` for
  motion/react) and as CSS vars (`--dur-press|fast|base|slow|sheet|ring`, `--ease-out|gold|sheet|
  spring|bounce`; Tailwind `duration-(--dur-base) ease-spring`). Pressables: `press` (buttons,
  chips, icons) or `press-soft` (cards, rows); anything else dims on touch automatically
  (`press-none` opts out). Disclosures: `<Collapse open>` from `ui/misc`. In-place swaps (a
  day, a range, a tab): `useSwapIn(key)`. Route slides are automatic (push/pop by depth,
  forward/back by tab order) — don't animate whole pages in yourself. Transform/opacity
  only; reduced motion is handled globally.

## Routes
`/` Today · `/training` (+ `/training/exercise/[slug]`, `/training/program/[key]`) ·
`/workout/[id]` (focus, no shell chrome) · `/nutrition` (+ `/nutrition/scan`, `/nutrition/coach`) ·
`/progress?tab=weight|body|photos|strength|athletic|roadmap` · `/coach` · `/recovery` ·
`/reviews` (+ `/reviews/[month]`) · `/settings` · `/onboarding` · `/sign-in`.
All app pages live under `src/app/(app)/`. Deep links used across features:
`/nutrition?add=1` (open log sheet), `/progress?tab=weight&log=1`, `/recovery?checkin=1`.

## Local testing
- Local Supabase is running (`npx supabase status`). Dev server: `http://localhost:3000`.
- Test accounts (local only): `demo@greekgod.local` (onboarded, ~5 weeks of sample data) and
  `fresh@greekgod.local` (not onboarded, empty). Password `ascent-test-123`.
  Reset/reseed: `node scripts/dev/setup-users.mjs` (add `--reset` to recreate users).
- Screenshots: `node scripts/dev/shot.mjs --user demo --out /tmp/shots/<you> /path [/path2]`
  (`--desktop`, `--full`, `--click "<selector>"`, `--wait ms`, `--scroll px`). It prints console
  errors, failed requests and horizontal-overflow detection. **Look at your screenshots (Read the
  PNG) and iterate until the screen is genuinely premium.**
- Checks before you finish: `npx tsc --noEmit -p .`, `npx eslint <your files>`, `npx vitest run`.
- Don't run `npm install` (ask the lead), don't run `next build` (it fights the dev server), don't
  commit, don't touch files outside your ownership list.

## UI v2 ("Olympus")
On branch `ui-v2`, `docs/DESIGN-V2.md` is the authoritative visual and interaction spec and replaces `DESIGN.md` wherever they differ; its §8 lists the foundation's tokens, `t-*` type classes, ui kit (Tag, Meter, Stepper, SealKey, HoldButton, Coin, Placard, EstimateCard, ProposalCard), shell APIs (`TabHeader`, `openOffering`) and art (Statue, Laurel, Sundial, PlateStack). The UI summary above describes the old Pantheon kit, whose class names still work as aliases until each screen is rebuilt; data rules here are unchanged.

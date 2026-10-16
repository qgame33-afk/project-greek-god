# Project Greek God — The Ascent

A private fitness app for one goal: 163 → 180–185 lb of athletic muscle by August 2027.
It covers six-day Push/Pull/Legs training with progression, nutrition logging with AI meal
scanning, bodyweight and physique tracking, recovery, habits, monthly reviews and reminders.
It installs on an iPhone as a home-screen app (PWA).

**To put it online, follow [`docs/GO-LIVE.md`](docs/GO-LIVE.md)** (about 15 minutes, all free).

## What's inside

| Area | Route | Highlights |
|---|---|---|
| Today | `/` | Hero countdown, today's workout, fuel, mission (auto-checked habits), week colonnade, PRs, recovery |
| Training | `/training` | Six-day program, week plan (move / swap / rest), exercise library and history, template editor, volleyball log |
| Workout | `/workout/[id]` | Set logging built for the gym floor, offline-safe outbox, progression suggestions, rest timer, plate math, PRs |
| Nutrition | `/nutrition` | Diary, USDA + Open Food Facts search, saved foods and meals, water |
| Meal scanner | `/nutrition/scan` | Photo → Gemini estimate → database match → you confirm before anything is saved |
| Food coach | `/nutrition/coach` | Describe a meal or a restaurant order, refine portions, then log it |
| Progress | `/progress` | Weight trend and roadmap, measurements, private progress photos and compare, strength charts, athletic tests |
| Coach | `/coach` | AI coach that answers from your own logs |
| Recovery | `/recovery` | Daily check-in, readiness guidance (shared with Today and Training), habits, weekly review |
| Reviews | `/reviews` | Monthly reviews built from your data, with an optional AI summary |
| Settings | `/settings` | Goals (with history), units, program, reminders, export (JSON / CSV / photos), account deletion |

Rules the code follows:
- Data is never invented. Missing data shows "—" with a next step.
- AI output is labelled and is never saved without your confirmation.
- A source badge appears only when a real lookup returned a URL.

## Stack

- **Front end:** Next.js 16 (App Router), React 19, Tailwind v4, Motion, Radix, TanStack Query.
- **Back end:** Supabase (Postgres with row-level security, Auth, private Storage, pg_cron).
- **AI:** Google Gemini on the free tier, called only from the server.
- **Food data:** USDA FoodData Central and Open Food Facts.
- **Reminders:** Web Push with VAPID.

Read these before changing anything:
- `DESIGN.md`: the visual and interaction spec ("Pantheon").
- `CONVENTIONS.md`: engineering rules.
- `SPEC.md`: the product requirements.

## Develop locally

```bash
npm install
npx supabase start                 # local Postgres/Auth/Storage (Docker); applies supabase/migrations
npm run seed:dev                   # demo@greekgod.local / fresh@greekgod.local (password ascent-test-123)
npm run dev
```

`.env.local` needs these values, printed by `npx supabase status`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `GEMINI_API_KEY`
- `USDA_API_KEY`
- `AI_MOCK=1`: canned AI responses in development only.

Checks:

```bash
npm run typecheck && npm run lint && npm test
node scripts/dev/shot.mjs --user demo --out /tmp/shots / /training   # screenshots + overflow/console checks
```

## Deploy

On Vercel, `vercel-build` runs `scripts/migrate.mjs` before `next build`. The migration step:
1. Applies the files in `supabase/migrations/` that haven't run yet. It records them in a ledger, so they never run twice.
2. Stores the reminder secrets.
3. Schedules the 15-minute reminder job.

Step-by-step: [`docs/GO-LIVE.md`](docs/GO-LIVE.md).

# Go live — Project Greek God

About 15 minutes, all free. You'll create two accounts (Vercel for hosting, Supabase for the
database), connect them, and paste your Google Gemini key last.

---

## 1. Put the app on Vercel

1. Go to **https://vercel.com/signup** → **Continue with GitHub**.
2. **Add New… → Project** → find **project-greek-god** → **Import**.
3. Leave every setting as it is → **Deploy**.
   The first deploy may finish with a sign-in page that can't log in yet — that's expected until
   the database is connected in step 2.

## 2. Connect the database (Supabase)

**Easiest — through Vercel:**

1. In your Vercel project open the **Storage** tab → **Create Database** → **Supabase** →
   follow the prompts (Free plan; pick the region closest to you) → connect it to
   **project-greek-god** for all environments.
   Vercel fills in the database settings for you (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL_NON_POOLING`, …).
2. **Deployments** tab → the ⋯ menu on the latest deployment → **Redeploy**.
   During the build the app creates all of its tables, privacy rules and photo storage
   automatically (you'll see `[migrate] applied …` in the build log).

**If Supabase isn't listed in Vercel's Storage tab:**

1. Create a free project at **https://supabase.com/dashboard** (save the database password).
2. In Supabase: **Project Settings → API**: copy the **Project URL**, the **anon / publishable**
   key and the **service_role / secret** key. **Connect** (top bar) → **Session pooler**: copy the
   connection string and put your password in it.
3. In Vercel: **Settings → Environment Variables**, add:
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
   | `POSTGRES_URL_NON_POOLING` | the session pooler connection string |
4. **Redeploy** (as above).

## 3. Tell Supabase your app's address (so sign-up emails work)

Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://<your-project>.vercel.app`
- **Redirect URLs** → Add: `https://<your-project>.vercel.app/**`

(Optional: **Authentication → Sign In / Providers → Email** → turn off **Confirm email** if you
don't want a confirmation email for your own account.)

## 4. Install it on your iPhone

1. Open `https://<your-project>.vercel.app` in **Safari**.
2. **Create an account** → you'll go straight into onboarding → **Begin the Ascent**.
3. Share button → **Add to Home Screen**. Open it from the Home Screen from now on (full screen,
   and it's required for iPhone reminders).
4. Optional: **Settings → Reminders → Enable on this device** (only works from the Home Screen app).
5. **Lock the door.** Now that your account exists, stop anyone else from creating one:
   Supabase dashboard → **Authentication → Sign In / Providers** → turn off
   **Allow new users to sign up** → **Save**. (Your data is private either way; this just keeps
   strangers who find the link from using your free AI allowance.)

## 5. Last step — turn on the AI (free)

1. Vercel → **Settings → Environment Variables** → add `GEMINI_API_KEY` = your key from
   https://aistudio.google.com/apikey (keep that Google project on the **Free tier** — never add
   billing, so it can't charge you).
2. Optional but recommended: a free food-database key from **https://api.data.gov/signup** →
   add it as `USDA_API_KEY` (without it the app uses USDA's shared demo key, which is rate-limited).
3. **Redeploy**. The meal scanner, Ask Food Coach, the AI Coach and monthly review summaries now work.

---

### What each piece does
- **Vercel** hosts the app (free Hobby plan).
- **Supabase** stores your data with per-account privacy rules, keeps progress photos in private
  storage, and handles sign-in (free plan). Its scheduler sends reminders every 15 minutes.
- **Google Gemini (free tier)** powers photo scanning and the two coaches. Free-tier inputs may
  be used by Google to improve its products — only food photos/descriptions and coaching
  questions are sent; progress photos are never sent to any AI.
- **USDA FoodData Central + Open Food Facts** supply real nutrition data so macros come from
  databases, not guesses.

-- PROJECT GREEK GOD — initial schema
-- Every user-owned table carries user_id (defaults to auth.uid()) and is locked down with
-- row-level security so a signed-in user can only ever read or write their own rows.
-- Day attribution uses explicit local_date columns written by the client in the user's
-- own timezone, so evening sessions never land on the wrong calendar day.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles & goals
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  height_cm numeric(5,1) check (height_cm between 100 and 250) default 189.2,
  start_weight_lb numeric(5,1) check (start_weight_lb between 60 and 600) default 163,
  goal_weight_lb numeric(5,1) check (goal_weight_lb between 60 and 600) default 183,
  goal_range_min_lb numeric(5,1) default 180,
  goal_range_max_lb numeric(5,1) default 185,
  start_date date not null default current_date,
  target_date date not null default '2027-08-01',
  experience text not null default 'intermediate' check (experience in ('beginner','intermediate','advanced')),
  weight_unit text not null default 'lb' check (weight_unit in ('lb','kg')),
  length_unit text not null default 'in' check (length_unit in ('in','cm')),
  calorie_goal int not null default 3300 check (calorie_goal between 1000 and 8000),
  protein_goal int not null default 185 check (protein_goal between 0 and 500),
  carb_goal int not null default 449 check (carb_goal between 0 and 1200),
  fat_goal int not null default 85 check (fat_goal between 0 and 400),
  water_goal_ml int not null default 3000 check (water_goal_ml between 500 and 10000),
  sleep_goal_h numeric(3,1) not null default 8 check (sleep_goal_h between 4 and 12),
  steps_goal int not null default 8000 check (steps_goal between 0 and 100000),
  weekly_schedule jsonb not null default '{"1":"push_a","2":"pull_a","3":"legs_a","4":"push_b","5":"pull_b","6":"legs_b","0":"rest"}',
  training_mode text not null default 'standard' check (training_mode in ('standard','intro','deload')),
  volleyball_per_week int not null default 2 check (volleyball_per_week between 0 and 14),
  coach_access jsonb not null default '{"profile":true,"training":true,"nutrition":true,"bodyweight":true,"recovery":true,"measurements":true}',
  reminders jsonb not null default '{}',
  timezone text not null default 'America/Toronto',
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- create the profile row automatically when someone signs up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- audit trail of goal changes (calorie/macro/weight). Lets suggestions avoid re-firing on the
-- same data and shows the user exactly when and why a target moved.
create table public.goal_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  changed_at timestamptz not null default now(),
  field text not null,
  old_value numeric,
  new_value numeric,
  reason text,
  source text not null default 'user' check (source in ('user','suggestion','onboarding'))
);
create index goal_changes_user_idx on public.goal_changes (user_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- training
-- ---------------------------------------------------------------------------
-- user's own exercises (the built-in library ships with the app code)
create table public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null,
  name text not null check (char_length(name) between 1 and 80),
  primary_muscles text[] not null default '{}',
  category text not null default 'isolation' check (category in ('compound','isolation','explosive','carry','core','cardio')),
  tracking text not null default 'weight_reps' check (tracking in ('weight_reps','reps','time','weight_time')),
  default_rest_sec int not null default 90 check (default_rest_sec between 0 and 900),
  instructions text,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- editable copies of the six day templates (seeded from the app's program on onboarding)
create table public.program_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  name text not null,
  focus text,
  sort int not null default 0,
  warmup jsonb not null default '[]',
  exercises jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);
create trigger program_templates_touch before update on public.program_templates for each row execute function public.touch_updated_at();

-- per-date overrides: rescheduled / swapped / extra rest days
create table public.day_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_date date not null,
  template_key text not null, -- a template key or 'rest'
  reason text check (reason in ('rescheduled','swap','rest','custom')),
  moved_from date,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table public.volleyball_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  kind text not null default 'practice' check (kind in ('practice','game','tournament','open_gym')),
  duration_min int check (duration_min between 0 and 600),
  intensity int check (intensity between 1 and 5),
  notes text,
  created_at timestamptz not null default now()
);
create index volleyball_user_date_idx on public.volleyball_sessions (user_id, local_date desc);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_key text,
  name text not null,
  local_date date not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_sec int check (duration_sec >= 0),
  status text not null default 'active' check (status in ('active','done','discarded')),
  mode text not null default 'standard' check (mode in ('standard','intro','deload')),
  notes text,
  total_volume_lb numeric(10,1) not null default 0,
  sets_completed int not null default 0,
  pr_count int not null default 0,
  session_rpe int check (session_rpe between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workout_sessions_user_date_idx on public.workout_sessions (user_id, local_date desc);
create index workout_sessions_user_status_idx on public.workout_sessions (user_id, status);
create trigger workout_sessions_touch before update on public.workout_sessions for each row execute function public.touch_updated_at();

create table public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  local_date date not null,
  exercise_slug text not null,
  exercise_name text not null,
  exercise_order int not null default 0,
  set_index int not null default 0,
  kind text not null default 'working' check (kind in ('warmup','working')),
  weight_lb numeric(6,1) check (weight_lb between 0 and 2000),
  reps int check (reps between 0 and 500),
  duration_sec int check (duration_sec between 0 and 7200),
  rir numeric(3,1) check (rir between 0 and 10),
  completed boolean not null default false,
  completed_at timestamptz,
  notes text,
  target_rep_low int,
  target_rep_high int,
  target_unit text not null default 'reps' check (target_unit in ('reps','sec','each')),
  target_rir text,
  rest_sec int,
  suggested_weight_lb numeric(6,1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index exercise_sets_session_idx on public.exercise_sets (session_id, exercise_order, set_index);
create index exercise_sets_user_ex_idx on public.exercise_sets (user_id, exercise_slug, local_date desc);
create trigger exercise_sets_touch before update on public.exercise_sets for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- nutrition
-- ---------------------------------------------------------------------------
create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  eaten_at timestamptz not null default now(),
  meal text not null check (meal in ('breakfast','lunch','dinner','snacks')),
  name text not null check (char_length(name) between 1 and 120),
  brand text check (char_length(brand) <= 80),
  amount numeric(8,2) not null default 1 check (amount > 0 and amount <= 100000),
  unit text not null default 'serving' check (char_length(unit) <= 24),
  grams numeric(8,1) check (grams >= 0 and grams <= 20000),
  calories numeric(7,1) not null check (calories between 0 and 20000),
  protein_g numeric(6,1) not null default 0 check (protein_g between 0 and 2000),
  carbs_g numeric(6,1) not null default 0 check (carbs_g between 0 and 3000),
  fat_g numeric(6,1) not null default 0 check (fat_g between 0 and 2000),
  -- macros for exactly base_amount × unit — editing the amount rescales from here
  base_amount numeric(8,2) not null default 1 check (base_amount > 0),
  base_calories numeric(7,1) not null default 0,
  base_protein_g numeric(6,1) not null default 0,
  base_carbs_g numeric(6,1) not null default 0,
  base_fat_g numeric(6,1) not null default 0,
  source text not null default 'manual' check (source in ('manual','saved_food','saved_meal','photo_ai','chat_ai','usda','off','assistant_handoff','quick')),
  confidence text not null default 'logged' check (confidence in ('logged','verified','database','estimate')),
  source_name text,
  source_url text check (source_url is null or source_url ~ '^https?://'),
  meal_group_id uuid,
  saved_food_id uuid,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index food_entries_user_date_idx on public.food_entries (user_id, local_date desc);
create index food_entries_group_idx on public.food_entries (user_id, meal_group_id);
create trigger food_entries_touch before update on public.food_entries for each row execute function public.touch_updated_at();

create table public.saved_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  brand text,
  serving_amount numeric(8,2) not null default 1 check (serving_amount > 0),
  serving_unit text not null default 'serving',
  grams numeric(8,1),
  calories numeric(7,1) not null check (calories >= 0),
  protein_g numeric(6,1) not null default 0,
  carbs_g numeric(6,1) not null default 0,
  fat_g numeric(6,1) not null default 0,
  is_favorite boolean not null default false,
  use_count int not null default 0,
  last_used_at timestamptz,
  source text not null default 'manual',
  source_name text,
  source_url text,
  created_at timestamptz not null default now()
);
create index saved_foods_user_idx on public.saved_foods (user_id, is_favorite desc, last_used_at desc nulls last);

create table public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  items jsonb not null default '[]',
  is_favorite boolean not null default false,
  use_count int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- one row per tap: concurrent quick-adds can never overwrite each other
create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  amount_ml int not null check (amount_ml between 1 and 5000),
  logged_at timestamptz not null default now()
);
create index water_logs_user_date_idx on public.water_logs (user_id, local_date desc);

-- ---------------------------------------------------------------------------
-- AI conversations (food coach + personal coach)
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('food','coach')),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, kind, updated_at desc);
create trigger ai_conversations_touch before update on public.ai_conversations for each row execute function public.touch_updated_at();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null default '',
  payload jsonb,
  image_path text,
  logged_group_id uuid, -- set once this estimate was added to the food log (prevents double logging)
  created_at timestamptz not null default now()
);
create index ai_messages_conv_idx on public.ai_messages (conversation_id, created_at);

-- per-user daily AI usage, enforced server-side to protect the free quota
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  feature text not null,
  count int not null default 0,
  primary key (user_id, day, feature)
);

-- ---------------------------------------------------------------------------
-- body & progress
-- ---------------------------------------------------------------------------
create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  measured_at timestamptz not null default now(),
  weight_lb numeric(5,1) not null check (weight_lb between 60 and 600),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  -- stored in inches; converted for display
  biceps_flexed_in numeric(4,2) check (biceps_flexed_in between 5 and 40),
  forearm_in numeric(4,2) check (forearm_in between 5 and 30),
  chest_in numeric(5,2) check (chest_in between 20 and 80),
  shoulders_in numeric(5,2) check (shoulders_in between 25 and 90),
  waist_in numeric(5,2) check (waist_in between 15 and 80),
  hips_in numeric(5,2) check (hips_in between 20 and 80),
  thigh_in numeric(4,2) check (thigh_in between 10 and 45),
  calf_in numeric(4,2) check (calf_in between 8 and 30),
  body_fat_pct numeric(4,1) check (body_fat_pct between 2 and 60),
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  pose text not null check (pose in ('front','side','back','flex_front','flex_back','other')),
  storage_path text not null,
  width int,
  height int,
  notes text,
  created_at timestamptz not null default now()
);
create index progress_photos_user_idx on public.progress_photos (user_id, local_date desc);

create table public.athletic_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  test_type text not null check (test_type in ('standing_vertical','approach_vertical','standing_reach','broad_jump','sprint')),
  value numeric(7,2) not null check (value > 0),
  -- inches for heights/distances, seconds for sprints
  sprint_distance_m numeric(5,1),
  conditions text,
  notes text,
  created_at timestamptz not null default now()
);
create index athletic_tests_user_idx on public.athletic_tests (user_id, test_type, local_date);

-- ---------------------------------------------------------------------------
-- recovery & habits
-- ---------------------------------------------------------------------------
create table public.recovery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 24),
  sleep_quality int check (sleep_quality between 1 and 5),
  energy int check (energy between 1 and 5),
  soreness int check (soreness between 1 and 5),
  fatigue int check (fatigue between 1 and 5),
  stress int check (stress between 1 and 5),
  pain_notes text check (char_length(pain_notes) <= 500),
  volleyball boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);
create trigger recovery_logs_touch before update on public.recovery_logs for each row execute function public.touch_updated_at();

create table public.habit_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  label text not null check (char_length(label) between 1 and 60),
  kind text not null check (kind in ('auto','value','check')),
  target numeric,
  unit text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_key text not null,
  local_date date not null,
  done boolean not null default false,
  value numeric,
  updated_at timestamptz not null default now(),
  unique (user_id, habit_key, local_date)
);
create trigger habit_logs_touch before update on public.habit_logs for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- reviews & reminders
-- ---------------------------------------------------------------------------
create table public.monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  stats jsonb not null,
  priorities jsonb not null default '[]',
  summary text,
  generated_at timestamptz not null default now(),
  unique (user_id, month)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.reminder_deliveries (
  user_id uuid not null references auth.users (id) on delete cascade,
  reminder text not null,
  due_key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, reminder, due_key)
);

-- server-only key/value store (VAPID keys etc). RLS on with no policies = no client access.
create table public.app_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array[
    'goal_changes','custom_exercises','program_templates','day_plans','volleyball_sessions',
    'workout_sessions','exercise_sets','food_entries','saved_foods','saved_meals','water_logs',
    'ai_conversations','ai_messages','weight_entries','body_measurements','progress_photos',
    'athletic_tests','recovery_logs','habit_definitions','habit_logs','monthly_reviews','push_subscriptions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- usage counters and delivery logs are written by the server only; users may read their own usage
alter table public.ai_usage enable row level security;
create policy "own usage select" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
alter table public.reminder_deliveries enable row level security;
alter table public.app_secrets enable row level security;

-- a set must belong to a session owned by the same user
create or replace function public.check_set_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.workout_sessions s where s.id = new.session_id and s.user_id = new.user_id) then
    raise exception 'session not found';
  end if;
  return new;
end $$;
create trigger exercise_sets_owner before insert or update of session_id, user_id on public.exercise_sets
  for each row execute function public.check_set_owner();

create or replace function public.check_message_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.ai_conversations c where c.id = new.conversation_id and c.user_id = new.user_id) then
    raise exception 'conversation not found';
  end if;
  return new;
end $$;
create trigger ai_messages_owner before insert or update of conversation_id, user_id on public.ai_messages
  for each row execute function public.check_message_owner();

-- atomic AI usage counter (server calls this with the user's session)
create or replace function public.bump_ai_usage(p_feature text, p_day date, p_limit int) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.ai_usage (user_id, day, feature, count) values (auth.uid(), p_day, p_feature, 1)
  on conflict (user_id, day, feature) do update set count = public.ai_usage.count + 1
  returning count into n;
  if n > p_limit then
    update public.ai_usage set count = count - 1 where user_id = auth.uid() and day = p_day and feature = p_feature;
    return -1;
  end if;
  return n;
end $$;
revoke all on function public.bump_ai_usage(text, date, int) from public, anon;
grant execute on function public.bump_ai_usage(text, date, int) to authenticated;

-- ---------------------------------------------------------------------------
-- aggregate views (security_invoker: RLS of the caller applies)
-- ---------------------------------------------------------------------------
create view public.daily_nutrition with (security_invoker = true) as
  select user_id, local_date,
         round(sum(calories))::int as calories,
         round(sum(protein_g), 1) as protein_g,
         round(sum(carbs_g), 1) as carbs_g,
         round(sum(fat_g), 1) as fat_g,
         count(*)::int as entries
  from public.food_entries group by user_id, local_date;

create view public.daily_water with (security_invoker = true) as
  select user_id, local_date, sum(amount_ml)::int as total_ml, count(*)::int as taps
  from public.water_logs group by user_id, local_date;

-- completed working sets with an Epley e1RM (only for 1–12 rep weighted sets, where the
-- estimate is meaningful) plus whether the set beat every earlier set of that exercise.
create view public.set_history with (security_invoker = true) as
  with s as (
    select es.*, ws.status as session_status,
      case when es.weight_lb > 0 and es.reps between 1 and 12
           then round(es.weight_lb * (1 + es.reps / 30.0), 1) end as e1rm_lb
    from public.exercise_sets es
    join public.workout_sessions ws on ws.id = es.session_id
    where es.completed and es.kind = 'working' and ws.status <> 'discarded'
  )
  select s.*,
    max(e1rm_lb) over w as prior_best_e1rm,
    max(weight_lb) over w as prior_best_weight
  from s
  window w as (partition by user_id, exercise_slug order by local_date, completed_at, set_index
               rows between unbounded preceding and 1 preceding);

create view public.exercise_bests with (security_invoker = true) as
  select user_id, exercise_slug,
         max(exercise_name) as exercise_name,
         max(e1rm_lb) as best_e1rm_lb,
         max(weight_lb) as best_weight_lb,
         max(reps) as best_reps,
         max(duration_sec) as best_duration_sec,
         count(*)::int as total_sets,
         count(distinct session_id)::int as sessions,
         round(sum(coalesce(weight_lb, 0) * coalesce(reps, 0)), 1) as total_volume_lb,
         max(local_date) as last_date
  from public.set_history group by user_id, exercise_slug;

create view public.exercise_daily with (security_invoker = true) as
  select user_id, exercise_slug, local_date,
         max(e1rm_lb) as best_e1rm_lb,
         max(weight_lb) as top_weight_lb,
         max(reps) as max_reps,
         round(sum(coalesce(weight_lb, 0) * coalesce(reps, 0)), 1) as volume_lb,
         count(*)::int as sets,
         bool_or(e1rm_lb > coalesce(prior_best_e1rm, 0) and prior_best_e1rm is not null) as had_pr
  from public.set_history group by user_id, exercise_slug, local_date;

create view public.pr_events with (security_invoker = true) as
  select id as set_id, user_id, session_id, exercise_slug, exercise_name, local_date,
         weight_lb, reps, e1rm_lb, prior_best_e1rm
  from public.set_history
  where e1rm_lb is not null and prior_best_e1rm is not null and e1rm_lb > prior_best_e1rm;

grant select on public.daily_nutrition, public.daily_water, public.set_history,
  public.exercise_bests, public.exercise_daily, public.pr_events to authenticated;

-- ---------------------------------------------------------------------------
-- private storage for progress + meal photos. Objects live under <user_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('progress-photos', 'progress-photos', false, 15728640, array['image/jpeg','image/png','image/webp','image/heic']),
  ('meal-photos', 'meal-photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy "own photos read" on storage.objects for select to authenticated
  using (bucket_id in ('progress-photos','meal-photos') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('progress-photos','meal-photos') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos update" on storage.objects for update to authenticated
  using (bucket_id in ('progress-photos','meal-photos') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos delete" on storage.objects for delete to authenticated
  using (bucket_id in ('progress-photos','meal-photos') and (storage.foldername(name))[1] = (select auth.uid())::text);

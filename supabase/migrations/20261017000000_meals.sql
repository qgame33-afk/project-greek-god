-- Meal planner ("MEALS — YOUR WEEK, FUELLED"). See docs/MEALS.md §3.
--
-- Every new table is user-owned and locked down with row-level security (user_id = auth.uid()
-- for select/insert/update/delete). Planning never writes to food_entries: the only link is
-- food_entries.planned_meal_id, set by the explicit "Add to today's food log" confirm.

-- ---------------------------------------------------------------------------
-- preferences (one row per user; defaults = DEFAULT_PREFS in src/lib/meals/types.ts)
-- ---------------------------------------------------------------------------
create table public.meal_prefs (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  difficulty text not null default 'super_easy' check (difficulty in ('super_easy','everyday','i_like_cooking')),
  budget text not null default 'normal' check (budget in ('tight','normal','flexible')),
  weekly_budget_cad numeric(7,2) check (weekly_budget_cad is null or weekly_budget_cad between 0 and 5000),
  max_minutes int check (max_minutes is null or max_minutes between 5 and 240),
  allergies text[] not null default '{}'
    check (allergies <@ array['dairy','egg','gluten','peanut','tree_nut','soy','fish','shellfish','sesame']::text[]),
  diets text[] not null default '{}'
    check (diets <@ array['vegetarian','pescatarian','no_pork','no_beef','halal','lactose_free','gluten_free','dairy_free']::text[]),
  disliked_ingredients text[] not null default '{}' check (cardinality(disliked_ingredients) <= 300),
  liked_ingredients text[] not null default '{}' check (cardinality(liked_ingredients) <= 300),
  liked_cuisines text[] not null default '{}' check (cardinality(liked_cuisines) <= 50),
  disliked_cuisines text[] not null default '{}' check (cardinality(disliked_cuisines) <= 50),
  equipment text[] not null default '{stovetop,oven,microwave,air_fryer,toaster,blender,kettle}'
    check (equipment <@ array['stovetop','oven','microwave','air_fryer','toaster','blender','grill','kettle']::text[]),
  pantry text[] not null default '{}' check (cardinality(pantry) <= 300),
  snacks_per_day int not null default 2 check (snacks_per_day between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger meal_prefs_touch before update on public.meal_prefs for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- user-owned recipes (AI, simplified, custom). Key in the app = 'usr:<id>'.
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  origin text not null check (origin in ('ai','simplified','custom')),
  base_key text check (char_length(base_key) <= 80),
  name text not null check (char_length(name) between 1 and 80),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 100000),
  created_at timestamptz not null default now()
);
create index recipes_user_idx on public.recipes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- weekly plans and their meals
-- ---------------------------------------------------------------------------
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1), -- always a Monday
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  grocery_budget_cad numeric(7,2) check (grocery_budget_cad is null or grocery_budget_cad between 0 and 5000),
  grocery_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create trigger meal_plans_touch before update on public.meal_plans for each row execute function public.touch_updated_at();

create table public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  local_date date not null,
  slot text not null check (slot in ('breakfast','lunch','dinner','snack')),
  position int not null default 0 check (position between 0 and 20),
  recipe_key text not null check (char_length(recipe_key) between 1 and 80),
  servings numeric(4,2) not null default 1 check (servings between 0.25 and 6),
  locked boolean not null default false,
  reason jsonb check (reason is null or jsonb_typeof(reason) = 'array'),
  history jsonb not null default '[]' check (jsonb_typeof(history) = 'array' and jsonb_array_length(history) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index planned_meals_plan_idx on public.planned_meals (plan_id);
create index planned_meals_user_date_idx on public.planned_meals (user_id, local_date);
create trigger planned_meals_touch before update on public.planned_meals for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- learning signals (docs/MEALS.md §4) and favourites
-- ---------------------------------------------------------------------------
create table public.meal_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_key text not null check (char_length(recipe_key) between 1 and 80),
  event text not null check (event in ('thumbs_up','thumbs_down','saved','unsaved','regenerated','kept','logged','cooked','repeated','made_easier','viewed')),
  reason text check (reason is null or reason in ('dont_like','too_complicated','too_long','too_expensive','ate_recently','dislike_ingredient')),
  ingredient text check (char_length(ingredient) <= 80),
  features text[] not null default '{}' check (cardinality(features) <= 200),
  created_at timestamptz not null default now()
);
create index meal_feedback_user_idx on public.meal_feedback (user_id, created_at desc);

create table public.favourite_recipes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_key text not null check (char_length(recipe_key) between 1 and 80),
  repeat_ok boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_key)
);

-- ---------------------------------------------------------------------------
-- grocery list (one per plan). key = ingredient key, or 'custom:<uuid>' for added items.
-- ---------------------------------------------------------------------------
create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 120),
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'other' check (category in ('meat','dairy_eggs','bread_grains','fruit','vegetables','frozen','pantry','other')),
  qty numeric(10,2) check (qty is null or qty >= 0),
  unit text check (char_length(unit) <= 24),
  label text check (char_length(label) <= 160),
  checked boolean not null default false,
  have boolean not null default false,
  removed boolean not null default false,
  custom boolean not null default false,
  est_cost_cad numeric(8,2) check (est_cost_cad is null or est_cost_cad >= 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, key)
);
create trigger grocery_items_touch before update on public.grocery_items for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- food log link: which planned meal a logged entry came from
-- ---------------------------------------------------------------------------
alter table public.food_entries add column planned_meal_id uuid references public.planned_meals (id) on delete set null;
create index food_entries_planned_idx on public.food_entries (planned_meal_id) where planned_meal_id is not null;
alter table public.food_entries drop constraint food_entries_source_check;
alter table public.food_entries add constraint food_entries_source_check
  check (source in ('manual','saved_food','saved_meal','photo_ai','chat_ai','usda','off','assistant_handoff','quick','meal_plan'));

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['meal_prefs','recipes','meal_plans','planned_meals','meal_feedback','favourite_recipes','grocery_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Foreign keys are checked without RLS, so a row could otherwise point at another user's
-- plan or planned meal. These triggers require the parent to belong to the same user.

-- a planned meal belongs to its owner's plan and falls inside that plan's week
create or replace function public.check_planned_meal_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ws date;
begin
  select p.week_start into ws from public.meal_plans p where p.id = new.plan_id and p.user_id = new.user_id;
  if ws is null then
    raise exception 'meal plan not found';
  end if;
  if new.local_date < ws or new.local_date > ws + 6 then
    raise exception 'planned meal date % is outside the plan week starting %', new.local_date, ws using errcode = '23514';
  end if;
  return new;
end $$;
create trigger planned_meals_owner before insert or update of plan_id, user_id, local_date on public.planned_meals
  for each row execute function public.check_planned_meal_owner();

create or replace function public.check_grocery_item_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.meal_plans p where p.id = new.plan_id and p.user_id = new.user_id) then
    raise exception 'meal plan not found';
  end if;
  return new;
end $$;
create trigger grocery_items_owner before insert or update of plan_id, user_id on public.grocery_items
  for each row execute function public.check_grocery_item_owner();

create or replace function public.check_food_planned_meal_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.planned_meals m where m.id = new.planned_meal_id and m.user_id = new.user_id) then
    raise exception 'planned meal not found';
  end if;
  return new;
end $$;
create trigger food_entries_planned_owner before insert or update of planned_meal_id, user_id on public.food_entries
  for each row when (new.planned_meal_id is not null) execute function public.check_food_planned_meal_owner();

-- ---------------------------------------------------------------------------
-- atomic writes (SECURITY INVOKER: the caller's RLS applies to every statement)
-- ---------------------------------------------------------------------------

-- Create or replace a week in one transaction. Locked meals (and, by default, meals already
-- added to the food log) are kept as they are; incoming meals that would sit in a kept meal's
-- place (same id, or same day + slot + position) are dropped. Returns the plan id.
create or replace function public.replace_meal_plan(
  p_week_start date,
  p_meals jsonb,
  p_settings jsonb default null,
  p_keep_locked boolean default true,
  p_keep_logged boolean default true
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(coalesce(p_meals, '[]'::jsonb)) <> 'array' then raise exception 'meals must be a list'; end if;

  insert into public.meal_plans (user_id, week_start, settings)
  values (uid, p_week_start, coalesce(p_settings, '{}'::jsonb))
  on conflict (user_id, week_start) do update set settings = coalesce(p_settings, public.meal_plans.settings)
  returning id into pid;

  delete from public.planned_meals pm
  where pm.plan_id = pid
    and not (p_keep_locked and pm.locked)
    and not (p_keep_logged and exists (select 1 from public.food_entries f where f.planned_meal_id = pm.id));

  insert into public.planned_meals (id, user_id, plan_id, local_date, slot, position, recipe_key, servings, locked, reason, history)
  select coalesce(m.id, gen_random_uuid()), uid, pid, m.local_date, m.slot, coalesce(m.position, 0), m.recipe_key,
         coalesce(m.servings, 1), coalesce(m.locked, false), m.reason, coalesce(m.history, '[]'::jsonb)
  from jsonb_to_recordset(coalesce(p_meals, '[]'::jsonb))
    as m(id uuid, local_date date, slot text, position int, recipe_key text, servings numeric, locked boolean, reason jsonb, history jsonb)
  where not exists (
    select 1 from public.planned_meals k
    where k.plan_id = pid
      and (k.id = m.id or (k.local_date = m.local_date and k.slot = m.slot and k.position = coalesce(m.position, 0)))
  );

  return pid;
end $$;
revoke all on function public.replace_meal_plan(date, jsonb, jsonb, boolean, boolean) from public, anon;
grant execute on function public.replace_meal_plan(date, jsonb, jsonb, boolean, boolean) to authenticated;

-- Write a freshly generated grocery list for a plan in one transaction: upsert the generated
-- items (keeping each one's checked / have / removed state), drop generated items that are no
-- longer needed, keep every custom item, and stamp grocery_generated_at. Returns the item count.
create or replace function public.sync_grocery_items(p_plan_id uuid, p_items jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.meal_plans p where p.id = p_plan_id and p.user_id = uid) then
    raise exception 'meal plan not found';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'items must be a list'; end if;

  insert into public.grocery_items (user_id, plan_id, key, name, category, qty, unit, label, est_cost_cad, position, have, custom)
  select distinct on (i.key)
         uid, p_plan_id, i.key, i.name, coalesce(i.category, 'other'), i.qty, i.unit, i.label, i.est_cost_cad,
         coalesce(i.position, 0), coalesce(i.have, false), false
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as i(key text, name text, category text, qty numeric, unit text, label text, est_cost_cad numeric, position int, have boolean)
  where i.key is not null and i.key not like 'custom:%'
  order by i.key
  on conflict (plan_id, key) do update
    set name = excluded.name, category = excluded.category, qty = excluded.qty, unit = excluded.unit,
        label = excluded.label, est_cost_cad = excluded.est_cost_cad, position = excluded.position
    where not public.grocery_items.custom;

  delete from public.grocery_items g
  where g.plan_id = p_plan_id
    and not g.custom
    and not exists (
      select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(key text) where i.key = g.key
    );

  update public.meal_plans set grocery_generated_at = now() where id = p_plan_id;

  select count(*)::int into n from public.grocery_items where plan_id = p_plan_id;
  return n;
end $$;
revoke all on function public.sync_grocery_items(uuid, jsonb) from public, anon;
grant execute on function public.sync_grocery_items(uuid, jsonb) to authenticated;

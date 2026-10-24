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

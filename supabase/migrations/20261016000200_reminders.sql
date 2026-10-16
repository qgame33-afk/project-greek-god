-- migrate:idempotent
-- Reminders: delivery bookkeeping and the 15-minute database scheduler.
--
-- Every statement here is safe to run more than once (scripts/migrate.mjs relies on the
-- "migrate:idempotent" marker above when it adopts a database whose schema was created
-- without migration history).
--
-- The scheduler is pg_cron + pg_net: every 15 minutes the database POSTs to the app's
-- /api/reminders/dispatch with the shared secret from public.app_secrets. The secret is read
-- when the job runs, so it never appears in cron.job. Nothing here is callable by app users:
-- the helper functions are SECURITY DEFINER and revoked from public, anon and authenticated.

-- lookups used by the dispatcher
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists reminder_deliveries_day_idx on public.reminder_deliveries (user_id, due_key);

-- the shared secret the scheduler sends as x-cron-secret (random, generated once)
insert into public.app_secrets (key, value)
values ('cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- (re)create the 'pgg-reminders' job for the deployed app URL. Returns a status line.
create or replace function public.pgg_schedule_reminders(app_url text)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  base text;
  cmd text;
begin
  if app_url is null or btrim(app_url) = '' then
    raise exception 'app_url is required';
  end if;
  base := rtrim(case when app_url ~* '^https?://' then btrim(app_url) else 'https://' || btrim(app_url) end, '/');
  if base !~* '^https?://[a-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'app_url must be a bare origin like https://example.com, got %', app_url;
  end if;

  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    return 'unavailable: pg_cron or pg_net is not installed on this database';
  end if;

  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'create extension if not exists pg_net with schema extensions';
  else
    execute 'create extension if not exists pg_net';
  end if;
  execute 'create extension if not exists pg_cron';

  cmd := format(
    $cmd$select net.http_post(
  url := %L,
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')),
  body := jsonb_build_object('source', 'pg_cron'),
  timeout_milliseconds := 30000
);$cmd$,
    base || '/api/reminders/dispatch'
  );

  -- cron.schedule upserts by job name, so redeploys just repoint the job
  execute 'select cron.schedule($1, $2, $3)' using 'pgg-reminders', '*/15 * * * *', cmd;
  return 'scheduled: every 15 minutes → ' || base || '/api/reminders/dispatch';
end;
$$;

create or replace function public.pgg_unschedule_reminders()
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if to_regclass('cron.job') is null then
    return 'pg_cron is not installed';
  end if;
  execute 'select cron.unschedule(jobid) from cron.job where jobname = $1' using 'pgg-reminders';
  return 'unscheduled';
end;
$$;

-- what the Settings screen shows: is the schedule set up, and when did it last fire
create or replace function public.pgg_reminders_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  out jsonb := jsonb_build_object(
    'cron_available', exists (select 1 from pg_available_extensions where name = 'pg_cron'),
    'net_available', exists (select 1 from pg_available_extensions where name = 'pg_net'),
    'scheduled', false
  );
  job record;
  last_run timestamptz;
  last_status text;
begin
  if to_regclass('cron.job') is null then
    return out;
  end if;
  execute 'select jobid, schedule, active, command from cron.job where jobname = $1 limit 1' into job using 'pgg-reminders';
  if job.jobid is null then
    return out;
  end if;
  if to_regclass('cron.job_run_details') is not null then
    execute 'select start_time, status from cron.job_run_details where jobid = $1 order by start_time desc limit 1'
      into last_run, last_status using job.jobid;
  end if;
  return out || jsonb_build_object(
    'scheduled', job.active,
    'schedule', job.schedule,
    'url', substring(job.command from 'https?://[^'' ]+'),
    'last_run', last_run,
    'last_status', last_status
  );
end;
$$;

revoke all on function public.pgg_schedule_reminders(text) from public, anon, authenticated;
revoke all on function public.pgg_unschedule_reminders() from public, anon, authenticated;
revoke all on function public.pgg_reminders_status() from public, anon, authenticated;
grant execute on function public.pgg_reminders_status() to service_role;

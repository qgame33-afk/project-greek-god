-- Per-user UI preferences (synced across devices) and a customisable monthly roadmap.
alter table public.profiles
  add column if not exists prefs jsonb not null default '{"tapLogsGhost":true,"systemKeyboard":false,"restFocus":false,"haptics":true,"restChime":false}',
  add column if not exists roadmap jsonb not null default '[]';

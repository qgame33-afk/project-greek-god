-- Sleep is entered in 0.25 h steps (7.25, 7.75) — keep two decimals.
alter table public.recovery_logs alter column sleep_hours type numeric(4,2);
alter table public.profiles alter column sleep_goal_h type numeric(4,2);

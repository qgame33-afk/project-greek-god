-- migrate:idempotent
-- One record rule everywhere. A set is a personal record only when its e1RM beats the best
-- before it by at least 1 lb — the rule the live workout and the session summary use
-- (PR_MIN_GAIN_LB in src/lib/workout/pr.ts). 185×7 (e1RM 228.2) over 180×8 (228.0) is
-- formula noise: the workout said "no record" while the exercise history, Progress ›
-- Strength, Today and the reviews (which read these views) called it a PR.
-- Same columns as before, so `create or replace` keeps every grant and reader working.

create or replace view public.exercise_daily with (security_invoker = true) as
  select user_id, exercise_slug, local_date,
         max(e1rm_lb) as best_e1rm_lb,
         max(weight_lb) as top_weight_lb,
         max(reps) as max_reps,
         round(sum(coalesce(weight_lb, 0) * coalesce(reps, 0)), 1) as volume_lb,
         count(*)::int as sets,
         bool_or(prior_best_e1rm is not null and e1rm_lb >= prior_best_e1rm + 1) as had_pr
  from public.set_history group by user_id, exercise_slug, local_date;

create or replace view public.pr_events with (security_invoker = true) as
  select id as set_id, user_id, session_id, exercise_slug, exercise_name, local_date,
         weight_lb, reps, e1rm_lb, prior_best_e1rm
  from public.set_history
  where e1rm_lb is not null and prior_best_e1rm is not null and e1rm_lb >= prior_best_e1rm + 1;

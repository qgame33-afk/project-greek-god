-- migrate:idempotent
-- Arnold Split 2.0, step 4 (docs/PROGRAM-ARNOLD.md §3.1a): every account that never chose a
-- program follows Arnold from today. Needs 20261021000000_arnold_program.sql. Safe to run again:
-- an account already on Arnold only gets prefs.program written.
do $$
begin
  perform public.set_training_program('arnold', null, p.id)
     from public.profiles p
    where not (coalesce(p.prefs, '{}'::jsonb) ? 'program');
end $$;

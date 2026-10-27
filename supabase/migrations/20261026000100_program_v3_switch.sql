-- migrate:idempotent
-- The two-set split and metric units, step 4 (docs/PROGRAM-V3.md §3): every account that never
-- chose a program follows the two-set split from today, and every account shows kilograms and
-- centimetres once. Needs 20261026000000_program_v3.sql. Safe to run again:
--   - an account already on the two-set split only gets prefs.program written; one that chose
--     Push/Pull/Legs (prefs.program) keeps it;
--   - the units change once per account (prefs.unitsSwitch records when and from what), so a
--     re-run never undoes a unit he picks later. Stored pounds and inches are not touched.
do $$
begin
  perform public.set_training_program('twoset', null, p.id)
     from public.profiles p
    where not (coalesce(p.prefs, '{}'::jsonb) ? 'program');

  update public.profiles
     set weight_unit = 'kg',
         length_unit = 'cm',
         prefs = coalesce(prefs, '{}'::jsonb) || jsonb_build_object('unitsSwitch',
           jsonb_build_object('at', now(), 'from', jsonb_build_object('weight', weight_unit, 'length', length_unit)))
   where not (coalesce(prefs, '{}'::jsonb) ? 'unitsSwitch');
end $$;

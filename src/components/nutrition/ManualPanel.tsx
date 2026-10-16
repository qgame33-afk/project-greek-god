"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { newId } from "@/lib/data/core";
import { useSavedFoodMutations } from "@/lib/data/nutrition";
import { composeEatenAt, formatAmount, macroLine } from "@/lib/nutrition-ui/format";
import { formatInt } from "@/lib/units";
import { manualEntry } from "@/lib/nutrition-ui/portion";
import { parseFoodNumber } from "@/lib/nutrition-ui/number";
import { emptyForm, previewMacros, validateFoodForm, type FoodForm } from "@/lib/nutrition-ui/validate";
import { focusFirstInvalid, SheetError, StickyFooter } from "./bits";
import { mealLabel, useFuel } from "./context";
import { FoodFields } from "./FoodFields";
import { SaveToFoods, WhenFields, type When } from "./log-shared";

/** Type a food in by hand. Nothing here is guessed; the typed numbers are what's saved. */
export function ManualPanel({ seed, when, setWhen, onDone }: { seed: { name: string; nonce: number }; when: When; setWhen: (w: When) => void; onDone: () => void }) {
  const { log, today } = useFuel();
  const saved = useSavedFoodMutations();
  const [form, setForm] = useState<FoodForm>(() => emptyForm({ name: seed.name }));
  const [seenSeed, setSeenSeed] = useState(seed.nonce);
  const [touched, setTouched] = useState(false);
  const [saveFood, setSaveFood] = useState(false);
  const [fav, setFav] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // "Add manually" from Search carries the typed name over
  if (seed.nonce !== seenSeed) {
    setSeenSeed(seed.nonce);
    if (seed.name) setForm((f) => ({ ...f, name: seed.name }));
  }

  const result = validateFoodForm(form);
  const errors = touched && !result.ok ? result.errors : {};
  // What will be added, live (so a mistyped "1,200" or a stray digit is visible before saving)
  const pv = previewMacros(form);
  const amountNow = parseFoodNumber(form.amount);
  const hasNumbers = pv.macros.calories > 0 || pv.macros.protein > 0 || pv.macros.carbs > 0 || pv.macros.fat > 0;

  const submit = async () => {
    setTouched(true);
    if (!result.ok) focusFirstInvalid(formRef.current);
    if (busy || !result.ok) return;
    const v = result.value;
    setBusy(true);
    setErr(null);
    // The saved food is written only once the entry is in, so a failed add (or its
    // Retry) never leaves an orphan or a duplicate in Saved.
    const savedId = saveFood ? newId() : null;
    const row = manualEntry(v, { id: newId(), meal: when.meal, date: when.date, eatenAt: composeEatenAt(when.date, when.time), savedFoodId: savedId });
    const ok = await log([row], { meal: when.meal });
    setBusy(false);
    if (ok && savedId) {
      saved.create.mutate({
        id: savedId,
        name: v.name,
        brand: v.brand,
        serving_amount: v.amount,
        serving_unit: v.unit,
        grams: row.grams ?? null,
        calories: v.macros.calories,
        protein_g: v.macros.protein,
        carbs_g: v.macros.carbs,
        fat_g: v.macros.fat,
        is_favorite: fav,
        source: "manual",
      });
    }
    if (ok) {
      setForm(emptyForm());
      setTouched(false);
      setSaveFood(false);
      setFav(false);
      onDone();
    } else setErr("Couldn't save. Your entry is kept. Retry.");
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FoodFields form={form} set={(p) => setForm((f) => ({ ...f, ...p }))} errors={errors} />
      <WhenFields className="mt-6" when={when} setWhen={setWhen} today={today} />
      <SaveToFoods className="mt-5" save={saveFood} setSave={setSaveFood} fav={fav} setFav={setFav} />
      {touched && !result.ok && <p className="mt-4 text-[13px] font-medium text-danger">Check the highlighted fields.</p>}
      {err && (
        <SheetError className="mt-4" onRetry={submit}>
          {err}
        </SheetError>
      )}
      <StickyFooter>
        {hasNumbers && (
          <p className="mb-2.5 flex items-baseline justify-between gap-3 text-[13px] text-fg-3" aria-live="polite">
            <span className="min-w-0 truncate font-medium">{amountNow != null && amountNow > 0 ? formatAmount(amountNow, form.unit) : "Amount"}</span>
            <span className="num shrink-0">
              <span className="text-[17px] font-semibold text-fg">{formatInt(pv.macros.calories)}</span> kcal · {macroLine(pv.macros)}
            </span>
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Add to {mealLabel(when.meal)}
        </Button>
      </StickyFooter>
    </form>
  );
}

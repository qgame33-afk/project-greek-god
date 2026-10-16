"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { newId } from "@/lib/data/core";
import { useSavedFoodMutations } from "@/lib/data/nutrition";
import { composeEatenAt } from "@/lib/nutrition-ui/format";
import { manualEntry } from "@/lib/nutrition-ui/portion";
import { emptyForm, validateFoodForm, type FoodForm } from "@/lib/nutrition-ui/validate";
import { StickyFooter } from "./bits";
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

  // "Add manually" from Search carries the typed name over
  if (seed.nonce !== seenSeed) {
    setSeenSeed(seed.nonce);
    if (seed.name) setForm((f) => ({ ...f, name: seed.name }));
  }

  const result = validateFoodForm(form);
  const errors = touched && !result.ok ? result.errors : {};

  const submit = async () => {
    setTouched(true);
    if (busy || !result.ok) return;
    const v = result.value;
    setBusy(true);
    setErr(null);
    let savedId: string | null = null;
    if (saveFood) {
      savedId = newId();
      saved.create.mutate({
        id: savedId,
        name: v.name,
        brand: v.brand,
        serving_amount: v.amount,
        serving_unit: v.unit,
        grams: v.unit === "g" ? v.amount : null,
        calories: v.macros.calories,
        protein_g: v.macros.protein,
        carbs_g: v.macros.carbs,
        fat_g: v.macros.fat,
        is_favorite: fav,
        source: "manual",
      });
    }
    const row = manualEntry(v, { id: newId(), meal: when.meal, date: when.date, eatenAt: composeEatenAt(when.date, when.time), savedFoodId: savedId });
    const ok = await log([row], { meal: when.meal });
    setBusy(false);
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
        <ErrorNote className="mt-4" onRetry={submit}>
          {err}
        </ErrorNote>
      )}
      <StickyFooter>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Add to {mealLabel(when.meal)}
        </Button>
      </StickyFooter>
    </form>
  );
}

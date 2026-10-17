"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { newId, useUser } from "@/lib/data/core";
import { useSavedFoodMutations, useSavedMealMutations, type SavedFood, type SavedMeal } from "@/lib/data/nutrition";
import { composeEatenAt, formatAmount } from "@/lib/nutrition-ui/format";
import { normalizeUnit } from "@/lib/nutrition-ui/portion";
import { entriesFromSavedMeal, parseSavedMealItems, savedMealTotals } from "@/lib/nutrition-ui/savedMeal";
import { fieldText, validateFoodForm, type FoodForm } from "@/lib/nutrition-ui/validate";
import { formatInt } from "@/lib/units";
import { focusFirstInvalid, MacroGrid, SheetError, StarButton, StickyFooter } from "./bits";
import { saveFailure } from "@/lib/nutrition-ui/errors";
import { mealLabel, useFuel } from "./context";
import { FoodFields } from "./FoodFields";
import { BackButton, WhenFields, type When } from "./log-shared";

/** Preview a saved meal and log all of it as one group. */
export function SavedMealPanel({ meal, when, setWhen, onBack, onDone }: { meal: SavedMeal; when: When; setWhen: (w: When) => void; onBack: () => void; onDone: () => void }) {
  const { log, today } = useFuel();
  const m = useSavedMealMutations();
  const items = parseSavedMealItems(meal.items);
  const totals = savedMealTotals(items);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // kept across a Retry, so a meal whose answer was lost can't land twice
  const attempt = useRef<{ groupId: string; ids: string[] } | null>(null);
  const [err, setErr] = useState<{ text: string; retry: boolean } | null>(null);

  const submit = async () => {
    if (busyRef.current || !items.length) return;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    attempt.current ??= { groupId: newId(), ids: items.map(() => newId()) };
    const rows = entriesFromSavedMeal(items, {
      meal: when.meal,
      date: when.date,
      eatenAt: composeEatenAt(when.date, when.time),
      groupId: attempt.current.groupId,
      ids: attempt.current.ids,
    });
    const n = items.length;
    const res = await log(rows, { meal: when.meal, name: meal.name, detail: `${n} ${n === 1 ? "item" : "items"} · ${formatInt(totals.calories)} kcal`, quiet: true });
    busyRef.current = false;
    setBusy(false);
    if (res.ok || res.kind === "invalid") attempt.current = null;
    if (res.ok) {
      m.update.mutate({ id: meal.id, values: { use_count: meal.use_count + 1, last_used_at: new Date().toISOString() } });
      onDone();
    } else setErr(saveFailure(res, "meal"));
  };

  return (
    <div className="pt-1">
      <BackButton onClick={onBack} />
      <h3 className="mt-1 text-[20px] font-bold leading-snug text-fg">{meal.name}</h3>
      <p className="mt-1 text-[13px] font-medium text-fg-3">
        Saved meal · {items.length} {items.length === 1 ? "item" : "items"}
      </p>
      {items.length ? (
        <ul className="mt-4 rounded-[14px] bg-s3 px-3.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-3 border-b border-line-hair py-2.5 last:border-b-0">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-fg">{it.name}</span>
                <span className="block truncate text-[12px] text-fg-3">{formatAmount(it.amount, it.unit)}</span>
              </span>
              <span className="num shrink-0 text-[15px] text-fg-2">{formatInt(it.calories)} kcal</span>
            </li>
          ))}
        </ul>
      ) : (
        <ErrorNote className="mt-4">This saved meal has no readable items.</ErrorNote>
      )}
      <MacroGrid className="mt-4" macros={totals} />
      <WhenFields className="mt-6" when={when} setWhen={setWhen} today={today} />
      {err && (
        <SheetError className="mt-4" onRetry={err.retry ? submit : undefined}>
          {err.text}
        </SheetError>
      )}
      <StickyFooter>
        <Button variant="primary" size="lg" block onClick={submit} loading={busy} disabled={!items.length}>
          Add to {mealLabel(when.meal)}
        </Button>
      </StickyFooter>
    </div>
  );
}

/** Edit a saved food's serving and macros. */
export function SavedFoodEditor({ food, onBack }: { food: SavedFood; onBack: () => void }) {
  const m = useSavedFoodMutations();
  const qc = useQueryClient();
  const { userId } = useUser();
  const [form, setForm] = useState<FoodForm>(() => ({
    name: food.name,
    brand: food.brand ?? "",
    amount: fieldText(Number(food.serving_amount)),
    unit: normalizeUnit(food.serving_unit) ?? food.serving_unit,
    calories: fieldText(Number(food.calories)),
    protein: fieldText(Number(food.protein_g)),
    carbs: fieldText(Number(food.carbs_g)),
    fat: fieldText(Number(food.fat_g)),
  }));
  const [fav, setFav] = useState(food.is_favorite);
  const [touched, setTouched] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const result = validateFoodForm(form);
  const errors = touched && !result.ok ? result.errors : {};

  const save = () => {
    setTouched(true);
    if (!result.ok) focusFirstInvalid(root.current);
    if (!result.ok || m.update.isPending) return;
    const v = result.value;
    const macrosChanged =
      v.macros.calories !== Number(food.calories) || v.macros.protein !== Number(food.protein_g) || v.macros.carbs !== Number(food.carbs_g) || v.macros.fat !== Number(food.fat_g);
    const values = {
      name: v.name,
      brand: v.brand,
      serving_amount: v.amount,
      serving_unit: v.unit,
      grams: v.unit === "g" ? v.amount : v.unit === food.serving_unit && food.grams != null ? (Number(food.grams) * v.amount) / Number(food.serving_amount) : null,
      calories: v.macros.calories,
      protein_g: v.macros.protein,
      carbs_g: v.macros.carbs,
      fat_g: v.macros.fat,
      is_favorite: fav,
      // typed numbers are the user's own; a database citation no longer backs them
      ...(macrosChanged ? { source: "manual", source_name: null, source_url: null } : {}),
    };
    const key = ["saved-foods", userId];
    const prev = qc.getQueryData<SavedFood[]>(key);
    qc.setQueryData<SavedFood[]>(key, (l) => l?.map((x) => (x.id === food.id ? { ...x, ...values } : x)));
    m.update.mutate(
      { id: food.id, values },
      {
        onSuccess: () => {
          toast(`Saved ${v.name}`);
          onBack();
        },
        onError: () => qc.setQueryData(key, prev),
      },
    );
  };

  return (
    <div className="pt-1" ref={root}>
      <div className="flex items-center justify-between">
        <BackButton onClick={onBack} />
        <StarButton on={fav} onToggle={() => setFav(!fav)} label={fav ? "Remove from favourites" : "Mark as favourite"} className="-mr-2" />
      </div>
      <h3 className="mb-4 mt-1 text-[20px] font-bold text-fg">Edit saved food</h3>
      <FoodFields form={form} set={(p) => setForm((f) => ({ ...f, ...p }))} errors={errors} amountLabel="Serving" />
      <StickyFooter>
        <Button variant="primary" size="lg" block onClick={save} loading={m.update.isPending}>
          Save food
        </Button>
      </StickyFooter>
    </div>
  );
}

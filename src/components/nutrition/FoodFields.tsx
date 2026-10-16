"use client";

import { Field, Input, NumberInput, Select } from "@/components/ui/field";
import { UNITS } from "@/lib/nutrition";
import { formatAmount } from "@/lib/nutrition-ui/format";
import { normalizeUnit } from "@/lib/nutrition-ui/portion";
import { consistencyNote, previewMacros, weightNote, type FoodErrors, type FoodForm } from "@/lib/nutrition-ui/validate";
import { formatInt } from "@/lib/units";
import { parseFoodNumber } from "@/lib/nutrition-ui/number";
import { SoftNote, SubLabel } from "./bits";

const UNIT_LABEL: Record<string, string> = { g: "g (grams)", oz: "oz", ml: "mL", serving: "serving", cup: "cup", tbsp: "tbsp", tsp: "tsp", piece: "piece", slice: "slice", scoop: "scoop", bowl: "bowl", plate: "plate" };

/**
 * Name / brand / amount + unit / calories + macros, with live soft checks.
 * Shared by Manual logging, "edit macros directly" and the saved-food editor.
 */
export function FoodFields({
  form,
  set,
  errors,
  showName = true,
  amountLabel = "Amount",
}: {
  form: FoodForm;
  set: (patch: Partial<FoodForm>) => void;
  errors: FoodErrors;
  showName?: boolean;
  amountLabel?: string;
}) {
  const preview = previewMacros(form);
  const amount = parseFoodNumber(form.amount);
  const unit = normalizeUnit(form.unit) ?? form.unit;
  const note = preview.caloriesBlank ? null : consistencyNote(preview.macros);
  const wNote = weightNote(amount, unit, preview.macros);
  const units: string[] = UNITS.includes(unit as (typeof UNITS)[number]) ? [...UNITS] : [unit, ...UNITS];
  const per = amount != null && amount > 0 ? formatAmount(amount, unit) : null;

  return (
    <div className="grid gap-4">
      {showName && (
        <>
          <Field label="Food" error={errors.name}>
            {(id) => (
              <Input
                id={id}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Chicken burrito bowl"
                autoComplete="off"
                autoCapitalize="sentences"
                enterKeyHint="next"
                maxLength={120}
                aria-invalid={!!errors.name}
              />
            )}
          </Field>
          <Field label="Brand or restaurant" hint="Optional" error={errors.brand}>
            {(id) => (
              <Input id={id} value={form.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="e.g. Chipotle" autoComplete="off" enterKeyHint="next" maxLength={80} aria-invalid={!!errors.brand} />
            )}
          </Field>
        </>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <Field label={amountLabel} error={errors.amount}>
          {(id) => <NumberInput id={id} value={form.amount} onChange={(e) => set({ amount: e.target.value })} enterKeyHint="next" aria-invalid={!!errors.amount} />}
        </Field>
        <Field label="Unit" error={errors.unit}>
          {(id) => (
            <Select id={id} value={unit} onChange={(e) => set({ unit: e.target.value })} aria-invalid={!!errors.unit}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u] ?? u}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div>
        <SubLabel action={<span className="text-[12px] font-medium text-fg-3">{per ? `For ${per}` : "For the amount above"}</span>}>Nutrition</SubLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories" error={errors.calories}>
            {(id) => (
              <NumberInput
                id={id}
                value={form.calories}
                onChange={(e) => set({ calories: e.target.value })}
                suffix="kcal"
                decimal={false}
                placeholder={preview.caloriesBlank && preview.derived > 0 ? String(preview.derived) : "0"}
                enterKeyHint="next"
                aria-invalid={!!errors.calories}
              />
            )}
          </Field>
          <Field label="Protein" error={errors.protein}>
            {(id) => <NumberInput id={id} value={form.protein} onChange={(e) => set({ protein: e.target.value })} suffix="g" placeholder="0" enterKeyHint="next" aria-invalid={!!errors.protein} />}
          </Field>
          <Field label="Carbs" error={errors.carbs}>
            {(id) => <NumberInput id={id} value={form.carbs} onChange={(e) => set({ carbs: e.target.value })} suffix="g" placeholder="0" enterKeyHint="next" aria-invalid={!!errors.carbs} />}
          </Field>
          <Field label="Fat" error={errors.fat}>
            {(id) => <NumberInput id={id} value={form.fat} onChange={(e) => set({ fat: e.target.value })} suffix="g" placeholder="0" enterKeyHint="done" aria-invalid={!!errors.fat} />}
          </Field>
        </div>
      </div>

      {(note || wNote || (preview.caloriesBlank && preview.derived > 0)) && (
        <div className="grid gap-2" aria-live="polite">
          {preview.caloriesBlank && preview.derived > 0 && <SoftNote>Calories will be {formatInt(preview.derived)} kcal, from your macros.</SoftNote>}
          {note && (
            <SoftNote className="flex items-center justify-between gap-3">
              <span>{note}</span>
              <button type="button" onClick={() => set({ calories: String(preview.derived) })} className="-my-2 -mr-1 inline-flex h-11 shrink-0 items-center px-2 text-[13px] font-bold text-gold-300">
                Use {formatInt(preview.derived)}
              </button>
            </SoftNote>
          )}
          {wNote && <SoftNote>{wNote}</SoftNote>}
        </div>
      )}
    </div>
  );
}

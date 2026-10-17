"use client";

import { BookmarkPlus, Layers, Trash } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented, Stepper } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { isOffline, newId, saveErrorKind } from "@/lib/data/core";
import { useDeleteFood, useSavedFoodMutations, useSavedFoods, useUpdateFood, type FoodEntry } from "@/lib/data/nutrition";
import { composeEatenAt, dayLabel, formatAmount, formatClock, timeValue, unitLabel } from "@/lib/nutrition-ui/format";
import { asMeal, groupMates } from "@/lib/nutrition-ui/group";
import { amountBounds, directEdit, entryBase, macrosEqual, normalizeUnit, rescaleEntry, savedFoodFromEntry, stepFor, type FoodUpdate } from "@/lib/nutrition-ui/portion";
import { groupLabel } from "@/lib/nutrition-ui/provenance";
import { fieldText, limitError, sizeNote, validateFoodForm, type FoodForm } from "@/lib/nutrition-ui/validate";
import { formatInt } from "@/lib/units";
import { parseFoodNumber } from "@/lib/nutrition-ui/number";
import { MacroGrid, ProvenanceBadge, SheetError, SoftNote, StickyFooter } from "./bits";
import { saveFailure } from "@/lib/nutrition-ui/errors";
import { ToastMark, useFuel } from "./context";
import { FoodFields } from "./FoodFields";
import { useFocusIntoSheet } from "./hooks";
import { WhenFields, type When } from "./log-shared";

export interface EditState {
  open: boolean;
  nonce: number;
  entry: FoodEntry | null;
}

export function EditFoodSheet({ state, onOpenChange }: { state: EditState; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={state.open} onOpenChange={onOpenChange} title="Edit entry">
      {state.entry && <EditBody key={state.nonce} entry={state.entry} close={() => onOpenChange(false)} />}
    </Sheet>
  );
}

type Mode = "amount" | "macros";

const SNAPSHOT_KEYS = [
  "name",
  "meal",
  "local_date",
  "eaten_at",
  "amount",
  "unit",
  "grams",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "base_amount",
  "base_calories",
  "base_protein_g",
  "base_carbs_g",
  "base_fat_g",
  "source",
  "confidence",
  "source_name",
  "source_url",
] as const;

function EditBody({ entry, close }: { entry: FoodEntry; close: () => void }) {
  const { today, entries } = useFuel();
  const update = useUpdateFood();
  const del = useDeleteFood();
  const savedFoods = useSavedFoods();
  const savedM = useSavedFoodMutations();
  const root = useRef<HTMLDivElement>(null);
  useFocusIntoSheet(root);

  const [mode, setMode] = useState<Mode>("amount");
  const [name, setName] = useState(entry.name);
  const [amount, setAmount] = useState(Number(entry.amount));
  const [amountText, setAmountText] = useState(fieldText(Number(entry.amount)));
  const [when, setWhen] = useState<When>(() => ({ meal: asMeal(entry.meal), date: entry.local_date, time: timeValue(entry.eaten_at) }));
  const [form, setForm] = useState<FoodForm>(() => ({
    name: entry.name,
    brand: entry.brand ?? "",
    amount: fieldText(Number(entry.amount)),
    unit: normalizeUnit(entry.unit) ?? entry.unit,
    calories: fieldText(Number(entry.calories)),
    protein: fieldText(Number(entry.protein_g)),
    carbs: fieldText(Number(entry.carbs_g)),
    fat: fieldText(Number(entry.fat_g)),
  }));
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<{ text: string; retry: boolean } | null>(null);
  const removed = useRef(false);

  const mates = useMemo(() => groupMates(entries, entry), [entries, entry]);
  const { baseAmount, base } = entryBase(entry);
  const bounds = amountBounds(entry.unit);
  const min = bounds.min;
  // an entry logged above the stepper's range (typed by hand) can still be moved or renamed
  const max = Math.max(bounds.max, Number(entry.amount) || 0);
  const parsedAmount = parseFoodNumber(amountText);
  const amountOutOfRange = parsedAmount == null || parsedAmount <= 0 || parsedAmount > max;
  const amountChanged = Math.abs(amount - Number(entry.amount)) > 1e-9;
  const current = { calories: Number(entry.calories), protein: Number(entry.protein_g), carbs: Number(entry.carbs_g), fat: Number(entry.fat_g) };
  // What the entry becomes at the typed amount; an unchanged amount keeps the stored numbers.
  const scaled = useMemo(() => {
    if (amountOutOfRange || !amountChanged) return null;
    const r = rescaleEntry(entry, amount);
    return { calories: Number(r.calories), protein: Number(r.protein_g), carbs: Number(r.carbs_g), fat: Number(r.fat_g) };
  }, [amountOutOfRange, amountChanged, entry, amount]);
  // the rescaled entry must still fit the database's per-entry limits (20,000 kcal …)
  const overLimit = scaled ? limitError(scaled) : null;
  const amountInvalid = amountOutOfRange || !!overLimit;
  const formResult = validateFoodForm({ ...form, name: name || "x" });
  const nameTrim = name.trim();
  const nameInvalid = !nameTrim || nameTrim.length > 120;
  // shown as soon as the name is cleared, so a disabled Save always has a visible reason
  const nameError = nameInvalid && (touched || name !== entry.name) ? "Enter a food name." : null;

  // Only fields that really changed are written (untouched rows never drift by a rounding kcal).
  const values: FoodUpdate | null = useMemo(() => {
    const patch: FoodUpdate = {};
    if (nameTrim && nameTrim !== entry.name) patch.name = nameTrim;
    if (when.meal !== entry.meal) patch.meal = when.meal;
    if (when.date !== entry.local_date) patch.local_date = when.date;
    if (when.date !== entry.local_date || when.time !== timeValue(entry.eaten_at)) patch.eaten_at = composeEatenAt(when.date, when.time);
    if (mode === "amount") {
      if (amountInvalid) return null;
      if (amountChanged) Object.assign(patch, rescaleEntry(entry, amount));
    } else {
      if (!formResult.ok) return null;
      const v = formResult.value;
      const cur = { calories: Number(entry.calories), protein: Number(entry.protein_g), carbs: Number(entry.carbs_g), fat: Number(entry.fat_g) };
      if (v.amount !== Number(entry.amount) || v.unit !== entry.unit || !macrosEqual(v.macros, cur)) {
        Object.assign(patch, directEdit(entry, { amount: v.amount, unit: v.unit, macros: v.macros }));
      }
    }
    return patch;
  }, [mode, amount, amountChanged, amountInvalid, formResult, entry, nameTrim, when]);

  const preview = mode === "amount" ? (scaled ?? current) : null;
  const dirty = !!values && Object.keys(values).length > 0;
  const big = scaled && !overLimit ? sizeNote(scaled) : null;

  // The amount carries across modes, so a change made in one is never silently dropped.
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "macros" && scaled) {
      const r = scaled;
      setForm((f) => ({
        ...f,
        amount: fieldText(amount),
        unit: normalizeUnit(entry.unit) ?? entry.unit,
        calories: fieldText(Math.round(r.calories)),
        protein: fieldText(r.protein),
        carbs: fieldText(r.carbs),
        fat: fieldText(r.fat),
      }));
    }
    if (next === "amount") {
      const a = parseFoodNumber(form.amount);
      const sameUnit = (normalizeUnit(form.unit) ?? form.unit) === (normalizeUnit(entry.unit) ?? entry.unit);
      if (a != null && a > 0 && a <= max && sameUnit && Math.abs(a - amount) > 1e-9) {
        setAmount(a);
        setAmountText(fieldText(a));
      }
    }
    setMode(next);
  };

  const save = async () => {
    setTouched(true);
    if (!values || nameInvalid || update.isPending) return;
    if (!dirty) {
      close();
      return;
    }
    setErr(null);
    if (isOffline()) {
      setErr(saveFailure({ kind: "offline", message: "" }, "changes"));
      return;
    }
    const snapshot = Object.fromEntries(SNAPSHOT_KEYS.filter((k) => k in values).map((k) => [k, entry[k]])) as FoodUpdate;
    try {
      await update.mutateAsync({ id: entry.id, date: entry.local_date, values });
    } catch (e) {
      setErr(saveFailure({ kind: saveErrorKind(e), message: (e as Error).message }, "changes"));
      return;
    }
    const moved = values.local_date != null && values.local_date !== entry.local_date;
    toast(moved ? `Moved to ${dayLabel(when.date, today)}` : <span className="line-clamp-2 break-words">Saved {nameTrim}</span>, {
      description: `${formatAmount(Number(values.amount ?? entry.amount), String(values.unit ?? entry.unit))} · ${formatInt(Number(values.calories ?? entry.calories))} kcal`,
      icon: <ToastMark />,
      duration: 6000,
      action: { label: "Undo", onClick: () => update.mutate({ id: entry.id, date: String(values.local_date ?? entry.local_date), values: snapshot }) },
    });
    close();
  };

  // the sheet stays tappable while it closes: a double tap must not delete (and toast) twice
  const remove = (rows: FoodEntry[], label?: string) => {
    if (removed.current) return;
    removed.current = true;
    del.mutate({ ids: rows.map((r) => r.id), date: entry.local_date, rows, label });
    close();
  };

  const saveToFoods = () => {
    const existing = (savedFoods.data ?? []).find((f) => f.name.trim().toLowerCase() === nameTrim.toLowerCase() && f.serving_unit === entry.unit);
    if (existing) {
      toast(`${existing.name} is already in your foods.`);
      return;
    }
    const id = newId();
    savedM.create.mutate(
      { ...savedFoodFromEntry({ ...entry, name: nameTrim || entry.name }), id },
      {
        onSuccess: () =>
          toast("Saved to your foods", {
            description: nameTrim,
            icon: <ToastMark />,
            duration: 6000,
            action: { label: "Undo", onClick: () => savedM.remove.mutate(id) },
          }),
      },
    );
  };

  const grouped = mates.length > 1;
  const gLabel = groupLabel(entry.source).toLowerCase();

  return (
    <div className="pt-2" ref={root}>
      <Field label="Food" error={nameError}>
        {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" enterKeyHint="done" aria-invalid={!!nameError} />}
      </Field>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 t-meta font-medium text-ash">
        <ProvenanceBadge item={entry} full />
        {entry.brand && <span className="text-stone">{entry.brand}</span>}
        <span>
          Logged {formatAmount(Number(entry.amount), entry.unit)} · {formatClock(entry.eaten_at)}
        </span>
      </div>

      <Segmented
        className="mt-5"
        ariaLabel="What to change"
        value={mode}
        onChange={switchMode}
        options={[
          { value: "amount", label: "Adjust amount" },
          { value: "macros", label: "Edit macros" },
        ]}
      />

      {mode === "amount" ? (
        <div className="mt-5">
          <Stepper
            label="Amount"
            value={amount}
            step={stepFor(entry.unit)}
            min={min}
            max={max}
            onChange={(v) => {
              setAmount(v);
              setAmountText(fieldText(v));
            }}
          >
            <label className="block">
              <span className="sr-only">Amount in {unitLabel(entry.unit)}</span>
              <input
                value={amountText}
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                aria-invalid={amountInvalid}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  setAmountText(e.target.value);
                  const n = parseFoodNumber(e.target.value);
                  if (n != null) setAmount(n);
                }}
                className="t-num-l w-full bg-transparent text-center text-ivory outline-none"
              />
              <span className="mt-1 block t-meta font-semibold tracking-[0.04em] text-ash">{unitLabel(entry.unit, amount)}</span>
            </label>
          </Stepper>
          {amountOutOfRange ? (
            <p className="mt-2 text-center t-meta font-medium text-cinnabar">Enter an amount above 0 and up to {formatInt(max)}.</p>
          ) : overLimit ? (
            <p className="mt-2 text-center t-meta font-medium text-cinnabar" role="alert">
              {overLimit}
            </p>
          ) : (
            <p className="mt-2 text-center t-meta font-medium text-ash">
              Rescaled from {formatInt(base.calories)} kcal per {formatAmount(baseAmount, entry.unit)}
            </p>
          )}
          {preview && <MacroGrid className="mt-4" macros={preview} dim={amountOutOfRange} />}
          {big && <SoftNote className="mt-3">{big}</SoftNote>}
        </div>
      ) : (
        <div className="mt-5">
          {/* errors show as soon as a number goes bad, so a disabled Save always has a visible reason */}
          <FoodFields form={form} set={(p) => setForm((f) => ({ ...f, ...p }))} errors={formResult.ok ? {} : formResult.errors} showName={false} />
          <p className="mt-3 t-meta leading-snug text-ash">These numbers become the new base, so later amount changes scale from them.</p>
        </div>
      )}

      <WhenFields className="mt-6" when={when} setWhen={setWhen} today={today} />

      <div className="mt-6 grid gap-2 border-t border-vein pt-5">
        <Button variant="secondary" block onClick={saveToFoods} disabled={savedM.create.isPending}>
          <BookmarkPlus className="size-[1.125rem]" /> Save to my foods
        </Button>
        <Button variant="destructive" block onClick={() => remove([entry])} disabled={del.isPending}>
          <Trash className="size-[1.125rem]" /> Delete entry
        </Button>
        {grouped && (
          <Button variant="destructive" block onClick={() => remove(mates, `Removed ${gLabel} · ${mates.length} items`)}>
            <Layers className="size-[1.125rem]" /> Delete all {mates.length} from this {gLabel}
          </Button>
        )}
      </div>

      {err && (
        <SheetError className="mt-4" onRetry={err.retry ? save : undefined}>
          {err.text}
        </SheetError>
      )}

      <StickyFooter>
        <Button variant="primary" size="lg" block onClick={save} loading={update.isPending} disabled={!values || nameInvalid}>
          {dirty || !values ? "Save changes" : "Done"}
        </Button>
      </StickyFooter>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Segmented, Stepper } from "@/components/ui/controls";
import { newId, useUser } from "@/lib/data/core";
import { useSavedFoodMutations, type SavedFood } from "@/lib/data/nutrition";
import { composeEatenAt, formatAmount, unitLabel } from "@/lib/nutrition-ui/format";
import { amountBounds, buildEntry, portion, savedFoodFromPortion, stepFor, type FoodCandidate } from "@/lib/nutrition-ui/portion";
import { fieldText, limitError, sizeNote } from "@/lib/nutrition-ui/validate";
import { formatInt, round } from "@/lib/units";
import { parseFoodNumber } from "@/lib/nutrition-ui/number";
import { MacroGrid, ProvenanceBadge, SheetError, SoftNote, StarButton, StickyFooter } from "./bits";
import { saveFailure } from "@/lib/nutrition-ui/errors";
import { mealLabel, useFuel } from "./context";
import { BackButton, SaveToFoods, WhenFields, type When } from "./log-shared";

/** Amount stepper + unit + live macros for a picked food, then "ADD TO LUNCH". */
export function PortionPanel({
  c,
  savedFood,
  when,
  setWhen,
  onBack,
  onDone,
}: {
  c: FoodCandidate;
  savedFood?: SavedFood | null;
  when: When;
  setWhen: (w: When) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const { log, today } = useFuel();
  const saved = useSavedFoodMutations();
  const qc = useQueryClient();
  const { userId } = useUser();
  const [unitIdx, setUnitIdx] = useState(c.defaultUnit);
  const [amount, setAmount] = useState(c.defaultAmount);
  const [text, setText] = useState(fieldText(c.defaultAmount));
  const [saveFood, setSaveFood] = useState(false);
  const [fav, setFav] = useState(false);
  const [starred, setStarred] = useState(!!savedFood?.is_favorite);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // kept across a Retry, so an add whose answer was lost can't land twice
  const attemptId = useRef<string | null>(null);
  const [err, setErr] = useState<{ text: string; retry: boolean } | null>(null);

  const u = c.units[unitIdx] ?? c.units[0];
  const { min, max } = amountBounds(u.unit);
  const parsed = parseFoodNumber(text);
  const amountInvalid = parsed == null || parsed <= 0 || parsed > max;
  const p = portion(u, amountInvalid ? 0 : amount);
  // the database caps one entry (20,000 kcal, 2,000 g protein …): say so before Add, not after
  const overLimit = amountInvalid ? null : limitError(p.macros);
  const invalid = amountInvalid || !!overLimit;
  const big = invalid ? null : sizeNote(p.macros);

  const setBoth = (v: number) => {
    setAmount(v);
    setText(fieldText(v));
  };

  const switchUnit = (i: number) => {
    const next = c.units[i];
    const grams = portion(u, amount).grams;
    let v = next.baseAmount;
    if (grams && next.gramsPerBase) {
      const step = stepFor(next.unit);
      v = Math.max(step, Math.round(((grams / next.gramsPerBase) * next.baseAmount) / step) * step);
    }
    setUnitIdx(i);
    setBoth(round(v, 2));
  };

  const toggleStar = () => {
    if (!savedFood) return;
    const next = !starred;
    setStarred(next);
    qc.setQueryData<SavedFood[]>(["saved-foods", userId], (list) => list?.map((f) => (f.id === savedFood.id ? { ...f, is_favorite: next } : f)));
    saved.update.mutate({ id: savedFood.id, values: { is_favorite: next } }, { onError: () => setStarred(!next) });
  };

  const submit = async () => {
    if (busyRef.current || invalid) return;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    // Saved food is created only after the entry lands (no orphans or duplicates on Retry).
    const newSaved = saveFood && c.source !== "saved_food" ? newId() : null;
    attemptId.current ??= newId();
    const row = buildEntry({ ...c, savedFoodId: newSaved ?? c.savedFoodId }, { id: attemptId.current, unitIndex: unitIdx, amount, meal: when.meal, date: when.date, eatenAt: composeEatenAt(when.date, when.time) });
    const res = await log([row], { meal: when.meal, name: c.name, detail: `${formatAmount(amount, u.unit)} · ${formatInt(row.calories)} kcal`, quiet: true });
    busyRef.current = false;
    setBusy(false);
    if (res.ok || res.kind === "invalid") attemptId.current = null;
    if (res.ok) {
      if (newSaved) saved.create.mutate({ ...savedFoodFromPortion(c, unitIdx, amount, fav), id: newSaved });
      if (savedFood) saved.touch(savedFood);
      onDone();
    } else setErr(saveFailure(res));
  };

  return (
    <div className="pt-1">
      <BackButton onClick={onBack} />
      <div className="mt-1 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[20px] font-bold leading-snug tracking-[-0.01em] text-fg">{c.name}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <ProvenanceBadge item={{ source: c.source, confidence: c.confidence, source_name: c.sourceName, source_url: c.sourceUrl }} full />
            {c.brand && <span className="text-[13px] font-medium text-fg-2">{c.brand}</span>}
          </div>
        </div>
        {savedFood && <StarButton on={starred} onToggle={toggleStar} label={starred ? "Remove from favourites" : "Mark as favourite"} className="-mr-2 -mt-1" />}
      </div>

      {c.units.length > 1 && (
        <Segmented
          className="mt-5"
          ariaLabel="Unit"
          value={String(unitIdx)}
          onChange={(v) => switchUnit(Number(v))}
          options={c.units.map((x, i) => ({ value: String(i), label: x.unit === "serving" ? "Servings" : unitLabel(x.unit) }))}
        />
      )}

      <div className="mt-5">
        <Stepper
          label="Amount"
          value={amount}
          step={stepFor(u.unit)}
          min={min}
          max={max}
          onChange={(v) => setBoth(v)}
        >
          <label className="block">
            <span className="sr-only">Amount in {unitLabel(u.unit)}</span>
            <input
              value={text}
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              aria-invalid={invalid}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                setText(e.target.value);
                const n = parseFoodNumber(e.target.value);
                if (n != null) setAmount(n);
              }}
              className="num-xl w-full bg-transparent text-center text-fg outline-none"
            />
            <span className="mt-1 block text-[13px] font-semibold tracking-[0.04em] text-fg-3">{unitLabel(u.unit, amount)}</span>
          </label>
        </Stepper>
        {amountInvalid ? (
          <p className="mt-2 text-center text-[13px] font-medium text-danger">Enter an amount above 0{max ? ` and up to ${formatInt(max)}` : ""}.</p>
        ) : overLimit ? (
          <p className="mt-2 text-center text-[13px] font-medium text-danger" role="alert">
            {overLimit}
          </p>
        ) : (
          (u.hint || (p.grams != null && u.unit !== "g")) && (
            <p className="mt-2 text-center text-[12.5px] font-medium text-fg-3">
              {[u.hint, p.grams != null && u.unit !== "g" && (!u.hint || amount !== u.baseAmount) ? `≈ ${formatInt(p.grams)} g` : null].filter(Boolean).join(" · ")}
            </p>
          )
        )}
      </div>

      <MacroGrid className="mt-5" macros={p.macros} dim={amountInvalid} />
      {big && <SoftNote className="mt-3">{big}</SoftNote>}

      <WhenFields className="mt-6" when={when} setWhen={setWhen} today={today} />

      {c.source !== "saved_food" && <SaveToFoods className="mt-5" save={saveFood} setSave={setSaveFood} fav={fav} setFav={setFav} />}

      {err && (
        <SheetError className="mt-4" onRetry={err.retry ? submit : undefined}>
          {err.text}
        </SheetError>
      )}

      <StickyFooter>
        <Button variant="primary" size="lg" block onClick={submit} loading={busy} disabled={invalid}>
          Add to {mealLabel(when.meal)}
        </Button>
      </StickyFooter>
    </div>
  );
}

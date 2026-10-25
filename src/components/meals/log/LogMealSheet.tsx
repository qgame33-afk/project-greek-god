"use client";

import { useMemo, useRef, useState } from "react";
import { ConsequenceLine, focusFirstInvalid, MealChips, SubLabel } from "@/components/nutrition/bits";
import { useFocusIntoSheet } from "@/components/nutrition/hooks";
import { ConflictNote, useRecipeConflicts } from "@/components/meals/shared";
import { Button } from "@/components/ui/button";
import { Chip, Switch } from "@/components/ui/controls";
import { Field, Input, NumberInput } from "@/components/ui/field";
import { Collapse } from "@/components/ui/misc";
import { Sheet, SheetFooterBar } from "@/components/ui/sheet";
import { InfoButton } from "@/components/ui/details-sheet";
import { cn } from "@/lib/cn";
import { newId, useToday } from "@/lib/data/core";
import { slotToMeal, useLogPlannedMeal, type LogPlannedMealResult } from "@/lib/data/meals";
import { addDays, dayName, shortDate, type ISODate } from "@/lib/dates";
import { recipeFeatures, recipeMacrosExact } from "@/lib/meals/recipe";
import type { Recipe, Slot } from "@/lib/meals/types";
import { mealForTime, MEALS, type Meal } from "@/lib/nutrition";
import { clampDay } from "@/lib/nutrition-ui/format";
import { ServingsStepper } from "../recipe/ServingsStepper";
import { draftMacros, editField, macroMismatch, newDraft, resetDraft, withServings, type LogDraft, type MacroField } from "./draft";

export interface LogMealTarget {
  recipe: Recipe;
  servings: number;
  /** The planned meal this is eaten from (links the entry; presets the meal category). */
  plannedMeal?: { id: string; slot: Slot; local_date: ISODate } | null;
}

/**
 * "Add to today's food log": the ONE place the planner writes to the food diary, and only on
 * this confirm. Servings, date, meal and the estimated kcal / P / C / F are editable. The entry
 * id is fixed when the sheet opens, so a double tap (or a retry after an error) logs once.
 */
export function LogMealSheet({
  open,
  onOpenChange,
  target,
  onLogged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LogMealTarget | null;
  onLogged?: (res: LogPlannedMealResult, servings: number) => void;
}) {
  // a fresh form (and a fresh entry id) every time the sheet opens
  const [nonce, setNonce] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setNonce((n) => n + 1);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add to food log" description={target ? target.recipe.name : undefined}>
      {target && <LogForm key={nonce} target={target} onDone={(res, s) => (onLogged?.(res, s), onOpenChange(false))} />}
    </Sheet>
  );
}

const FIELDS: { k: MacroField; label: string; suffix: string; dot?: string }[] = [
  { k: "kcal", label: "Calories", suffix: "kcal" },
  { k: "protein", label: "Protein", suffix: "g", dot: "bg-fg" },
  { k: "carbs", label: "Carbs", suffix: "g", dot: "bg-carbs" },
  { k: "fat", label: "Fat", suffix: "g", dot: "bg-fat" },
];

function LogForm({ target, onDone }: { target: LogMealTarget; onDone: (res: LogPlannedMealResult, servings: number) => void }) {
  const today = useToday();
  const ref = useRef<HTMLDivElement>(null);
  useFocusIntoSheet(ref);
  const { recipe, plannedMeal } = target;
  // unrounded per serving: the draft scales first and rounds once, so it matches the cards
  const per = useMemo(() => recipeMacrosExact(recipe, 1), [recipe]);
  const [id] = useState(() => newId());
  const [draft, setDraft] = useState<LogDraft>(() => newDraft(per, target.servings));
  const [meal, setMeal] = useState<Meal>(() => (plannedMeal ? slotToMeal(plannedMeal.slot) : mealForTime()));
  const plannedDay = plannedMeal && plannedMeal.local_date < today ? plannedMeal.local_date : null;
  // a past day's planned meal logs to that day by default, as its one-tap Eaten does
  const [date, setDate] = useState<ISODate>(plannedDay ?? today);
  const [showOther, setShowOther] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<MacroField, string>>>({});
  const log = useLogPlannedMeal();
  // an allergy conflict has to be confirmed before it can be logged
  const conflicts = useRecipeConflicts(recipe);
  const allergy = conflicts.some((c) => c.kind === "allergy");
  const [allergyOk, setAllergyOk] = useState(false);
  const blocked = allergy && !allergyOk;

  const label = MEALS.find((m) => m.key === meal)?.label ?? "Snacks";
  const parsed = draftMacros(draft);
  const mismatch = draft.edited && parsed.ok ? macroMismatch(parsed.macros) : null;
  const yesterday = addDays(today, -1);
  const quick: { date: ISODate; text: string }[] = [
    { date: today, text: "Today" },
    { date: yesterday, text: "Yesterday" },
    ...(plannedDay && plannedDay !== yesterday ? [{ date: plannedDay, text: `${dayName(plannedDay, true)} · planned` }] : []),
  ];
  const isQuick = quick.some((q) => q.date === date);

  const submit = () => {
    if (blocked) return;
    const r = draftMacros(draft);
    if (!r.ok) {
      setErrors(r.errors);
      focusFirstInvalid(ref.current);
      return;
    }
    setErrors({});
    log.mutate(
      {
        id,
        plannedMealId: plannedMeal?.id ?? null,
        recipe: { key: recipe.key, name: recipe.name, ingredients: recipe.ingredients },
        servings: draft.servings,
        date,
        meal,
        macros: r.macros,
        features: recipeFeatures(recipe),
      },
      { onSuccess: (res) => onDone(res, draft.servings) },
    );
  };

  return (
    <div ref={ref} className="space-y-6 pt-1">
      <ConflictNote conflicts={conflicts}>
        {allergy && (
          <div className="mt-2.5 flex min-h-11 items-center justify-between gap-3 border-t border-warning/20 pt-2.5">
            <span className="t-label font-semibold leading-snug text-fg">I ate it anyway. Log it.</span>
            <Switch checked={allergyOk} onCheckedChange={setAllergyOk} label="Confirm logging a meal with an allergen" />
          </div>
        )}
      </ConflictNote>
      <div className="flex items-center justify-between gap-4 rounded-tile-lg bg-control/60 px-4 py-3">
        <div className="min-w-0">
          <p className="t-cap">Servings</p>
          <p className="mt-1 t-cap font-medium text-fg-2">How much you ate</p>
        </div>
        <ServingsStepper value={draft.servings} onChange={(s) => setDraft((d) => withServings(d, s, per))} showUnit={false} />
      </div>

      <div>
        <SubLabel>Meal</SubLabel>
        <MealChips value={meal} onChange={setMeal} />
      </div>

      <div>
        <SubLabel>Date</SubLabel>
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <Chip
              key={q.date}
              selected={date === q.date && !showOther}
              onClick={() => {
                setDate(q.date);
                setShowOther(false);
              }}
              className="h-11"
            >
              {q.text}
            </Chip>
          ))}
          <Chip selected={showOther || !isQuick} onClick={() => setShowOther(true)} className="h-11" ariaLabel="Another day">
            {!isQuick ? shortDate(date) : "Earlier…"}
          </Chip>
        </div>
        <Collapse open={showOther}>
          <Field label="Day eaten" className="pt-3">
            {(fid) => (
              <Input id={fid} type="date" value={date} max={today} onChange={(e) => setDate(clampDay(e.target.value, today))} className="[color-scheme:dark]" />
            )}
          </Field>
        </Collapse>
      </div>

      <div>
        <SubLabel
          action={
            draft.edited ? (
              <button type="button" onClick={() => (setDraft((d) => resetDraft(d, per)), setErrors({}))} className="press t-cap -my-3 -mr-2 inline-flex h-11 items-center rounded-field px-2 font-semibold text-fg underline decoration-vein-3 underline-offset-4">
                Use the estimate
              </button>
            ) : (
              <InfoButton how="Recipe numbers: each ingredient's USDA FoodData Central values times its amount, for the servings shown." />
            )
          }
        >
          Nutrition
        </SubLabel>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <Field
              key={f.k}
              error={errors[f.k] ?? null}
              label={
                <span className="inline-flex items-center gap-1.5">
                  {f.dot ? <span className={cn("size-1.5 rounded-full", f.dot)} aria-hidden /> : <span className="size-1.5 rounded-full bg-stone" aria-hidden />}
                  {f.label}
                </span>
              }
            >
              {(fid) => (
                <NumberInput
                  id={fid}
                  value={draft.fields[f.k]}
                  onChange={(e) => setDraft((d) => editField(d, f.k, e.target.value))}
                  suffix={f.suffix}
                  decimal={f.k !== "kcal"}
                  enterKeyHint="done"
                />
              )}
            </Field>
          ))}
        </div>
        <p className={cn("mt-2.5 t-cap font-medium leading-snug", mismatch ? "text-fg-2" : "text-fg-2")}>
          {mismatch ?? (draft.edited ? "Your numbers will be logged as you typed them." : "Worked out from the ingredients (USDA values). Adjust if your portion was different.")}
        </p>
      </div>

      <SheetFooterBar>
        <Button variant="primary" size="lg" block onClick={submit} loading={log.isPending} disabled={log.isPending || blocked}>
          Add to {label}
        </Button>
        {blocked ? (
          <p className="mt-2 text-center t-cap font-medium text-fg-2">Confirm the allergy note above to log it</p>
        ) : parsed.ok ? (
          <ConsequenceLine className="mt-2 justify-center" date={date} add={{ kcal: parsed.macros.kcal, protein: parsed.macros.protein }} />
        ) : (
          <p className="mt-2 text-center t-cap font-medium text-fg-2">Check the numbers</p>
        )}
      </SheetFooterBar>
    </div>
  );
}

"use client";

import { BackLink } from "@/components/shell/BackLink";
import { Check, ChevronLeft, Plus, X } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Chip, Segmented } from "@/components/ui/controls";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useMealFeedback, useMealPrefs, useSaveMealPrefs } from "@/lib/data/meals";
import type { Budget, Difficulty, MealPrefs } from "@/lib/meals/types";
import { DifficultyPips } from "../shared/DifficultyPips";
import { DIFFICULTY_HINT, DIFFICULTY_LABEL } from "../shared/format";
import { useRecipePool } from "../shared/useRecipePool";
import { IngredientPicker } from "./IngredientPicker";
import { LearnedPanel } from "./LearnedPanel";
import {
  ALLERGEN_LABEL,
  ALLERGEN_ORDER,
  CUISINES,
  cuisineMood,
  DIET_ORDER,
  dietName,
  EQUIPMENT_LABEL,
  EQUIPMENT_ORDER,
  namesOf,
  setCuisineMood,
  TIME_LIMITS,
  toggled,
  type CuisineMood,
} from "./model";

type ListKey = "dislikedIngredients" | "likedIngredients" | "pantry";

const LIST_COPY: Record<ListKey, { title: string; description: string; removed: string }> = {
  dislikedIngredients: { title: "Never plan", description: "Meals with these are never suggested.", removed: "Removed from never plan" },
  likedIngredients: { title: "Like more of", description: "The planner leans toward meals with these.", removed: "Removed from likes" },
  pantry: { title: "Already have", description: "Used first, and marked as have on the grocery list.", removed: "Removed from what you have" },
};

const BUDGET_HINT: Record<Budget, string> = {
  tight: "Mostly $ meals: eggs, beans, ground meat, pasta.",
  normal: "A mix of everyday prices.",
  flexible: "Price matters less than taste.",
};

const DIFFICULTIES: Difficulty[] = ["super_easy", "everyday", "i_like_cooking"];

/**
 * /nutrition/meals/preferences — how the planner picks (docs/MEALS.md §6, restyled per
 * docs/DESIGN-V2.md §3.5.4). Every change saves as it's made (optimistic, in order). Allergies,
 * diets and "never plan" are hard rules the planner never breaks (Tag RULE); the rest only nudge.
 * Selections are ivory, never gold: a setting is not an achievement. Ends with what it has
 * learned, with Reset.
 */
export function PreferencesScreen() {
  const { prefs, hasData, error, saved } = useMealPrefs();
  const save = useSaveMealPrefs();
  const feedback = useMealFeedback();
  const { lookup } = useRecipePool();
  const nameOf = useCallback((k: string) => lookup(k)?.name, [lookup]);
  const [picker, setPicker] = useState<ListKey | null>(null);
  const [touched, setTouched] = useState(false);

  const set = (patch: Partial<MealPrefs>) => {
    setTouched(true);
    save.mutate(patch);
  };

  /** Remove one ingredient from a list, with Undo (it's a delete). */
  const removeFrom = (list: ListKey, key: string) => {
    const before = prefs[list];
    set({ [list]: before.filter((k) => k !== key) });
    toast(LIST_COPY[list].removed, { duration: 6000, action: { label: "Undo", onClick: () => save.mutate({ [list]: before }) } });
  };

  const toggleIn = (list: ListKey, key: string, on: boolean) => {
    const patch: Partial<MealPrefs> = { [list]: toggled(prefs[list], key, on) };
    // a hard dislike can't also be a like or something you're asked to use up
    if (list === "dislikedIngredients" && on) {
      if (prefs.likedIngredients.includes(key)) patch.likedIngredients = prefs.likedIngredients.filter((k) => k !== key);
      if (prefs.pantry.includes(key)) patch.pantry = prefs.pantry.filter((k) => k !== key);
    }
    set(patch);
  };

  if (error && !hasData) {
    return (
      <Frame>
        <ErrorNote>Couldn&apos;t load your preferences. Check your connection.</ErrorNote>
      </Frame>
    );
  }
  if (!hasData) {
    return (
      <Frame>
        <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
          {["h-64", "h-72", "h-56", "h-64"].map((h, i) => (
            <Skeleton key={i} className={cn("rounded-card", h)} />
          ))}
        </div>
      </Frame>
    );
  }

  const status = save.isPending ? "Saving…" : touched || saved ? "Saved" : "Defaults until you change something";

  return (
    <Frame status={status}>
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-x-10">
        <div className="flex min-w-0 flex-col gap-8">
          {/* cooking level */}
          <Section id="pref-level" title="Cooking level" hint="Super Easy is the default: short, familiar, hard to get wrong.">
            <div role="radiogroup" aria-labelledby="pref-level" className="flex flex-col gap-2">
              {DIFFICULTIES.map((d) => {
                const on = prefs.difficulty === d;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ difficulty: d })}
                    className={cn(
                      "press-soft flex min-h-16 items-center gap-3.5 rounded-field px-4 py-3 text-left transition-[background-color,box-shadow] duration-(--dur-fast)",
                      on ? "bg-m4 shadow-[inset_0_0_0_1.5px_var(--ivory)]" : "bg-m2 shadow-[inset_0_0_0_1px_var(--vein-2)] hover:bg-m3",
                    )}
                  >
                    <DifficultyPips difficulty={d} label={false} />
                    <span className="min-w-0 flex-1">
                      <span className="t-callout flex flex-wrap items-baseline gap-x-2 font-semibold text-ivory">
                        {DIFFICULTY_LABEL[d]}
                        {d === "super_easy" && <span className="t-tag text-ash">Default</span>}
                      </span>
                      <span className="t-meta block text-stone">{DIFFICULTY_HINT[d]}</span>
                    </span>
                    <Radio on={on} />
                  </button>
                );
              })}
            </div>
            <SubLabel>Time limit</SubLabel>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Time limit">
              {TIME_LIMITS.map((t) => (
                <Chip key={t ?? "none"} selected={prefs.maxMinutes === t} onClick={() => set({ maxMinutes: t })}>
                  {t == null ? "Level's own" : `${t} min`}
                </Chip>
              ))}
            </div>
          </Section>

          {/* hard rules */}
          <Section
            id="pref-rules"
            title="Never broken"
            badge={<Tag kind="RULE" detail="hard" explain="The planner never suggests, swaps to or simplifies into a meal that breaks these." />}
            hint="Every pick, swap and easier version respects these. Planned meals that break a new rule are flagged in your week."
          >
            <SubLabel first>Allergies</SubLabel>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Allergies">
              {ALLERGEN_ORDER.map((a) => (
                <Chip key={a} selected={prefs.allergies.includes(a)} onClick={() => set({ allergies: toggled(prefs.allergies, a) })}>
                  {prefs.allergies.includes(a) && <Check className="size-3.5" strokeWidth={2} aria-hidden />}
                  {ALLERGEN_LABEL[a]}
                </Chip>
              ))}
            </div>
            <SubLabel>Diet</SubLabel>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Diet">
              {DIET_ORDER.map((d) => (
                <Chip key={d} selected={prefs.diets.includes(d)} onClick={() => set({ diets: toggled(prefs.diets, d) })}>
                  {prefs.diets.includes(d) && <Check className="size-3.5" strokeWidth={2} aria-hidden />}
                  {dietName(d)}
                </Chip>
              ))}
            </div>
            <SubLabel>Never plan</SubLabel>
            <Tokens keys={prefs.dislikedIngredients} empty="No ingredients ruled out." onRemove={(k) => removeFrom("dislikedIngredients", k)} onAdd={() => setPicker("dislikedIngredients")} addLabel="Add an ingredient" />
          </Section>

          {/* budget + snacks */}
          <Section id="pref-budget" title="Budget and snacks">
            <Segmented<Budget>
              value={prefs.budget}
              onChange={(b) => set({ budget: b })}
              options={[
                { value: "tight", label: "Tight" },
                { value: "normal", label: "Normal" },
                { value: "flexible", label: "Flexible" },
              ]}
              ariaLabel="Budget"
            />
            <p className="t-meta mt-2 text-stone" aria-live="polite">
              {BUDGET_HINT[prefs.budget]}
            </p>
            <BudgetField key={String(prefs.weeklyBudgetCad)} value={prefs.weeklyBudgetCad} onSave={(v) => set({ weeklyBudgetCad: v })} />
            <SubLabel>Snacks a day</SubLabel>
            <Segmented<"1" | "2" | "3">
              value={String(prefs.snacksPerDay) as "1" | "2" | "3"}
              onChange={(v) => set({ snacksPerDay: Number(v) })}
              options={[
                { value: "1", label: "1 snack" },
                { value: "2", label: "2 snacks" },
                { value: "3", label: "3 snacks" },
              ]}
              ariaLabel="Snacks a day"
            />
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          {/* tastes */}
          <Section id="pref-tastes" title="Tastes" hint="Nudges, never rules. The planner still mixes things up.">
            <SubLabel first>Like more of</SubLabel>
            <Tokens keys={prefs.likedIngredients} empty="Nothing picked yet." onRemove={(k) => removeFrom("likedIngredients", k)} onAdd={() => setPicker("likedIngredients")} addLabel="Add an ingredient" />
            <SubLabel>Cuisines</SubLabel>
            <ul className="@container divide-y divide-vein border-y border-vein">
              {CUISINES.map((c) => {
                const mood = cuisineMood(prefs, c.key);
                return (
                  <li key={c.key} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="t-callout block font-semibold text-ivory">{c.label}</span>
                      <span className="t-meta block text-stone">{c.recipes} recipes</span>
                    </span>
                    <Segmented<"less" | "any" | "more">
                      size="sm"
                      value={mood ?? "any"}
                      onChange={(v) => set(setCuisineMood(prefs, c.key, v === "any" ? null : (v as CuisineMood)))}
                      options={[
                        { value: "less", label: "Less" },
                        { value: "any", label: "Any" },
                        { value: "more", label: "More" },
                      ]}
                      ariaLabel={`${c.label}: less, any or more`}
                      className="w-[10.5rem] shrink-0 @max-[19rem]:w-full"
                    />
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* kitchen */}
          <Section id="pref-kitchen" title="Your kitchen" hint="Recipes that need something you don't have are never planned.">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Equipment">
              {EQUIPMENT_ORDER.map((e) => {
                const on = prefs.equipment.includes(e);
                const last = on && prefs.equipment.length === 1;
                return (
                  <Chip key={e} selected={on} disabled={last} onClick={() => set({ equipment: toggled(prefs.equipment, e) })}>
                    {on && <Check className="size-3.5" strokeWidth={2} aria-hidden />}
                    {EQUIPMENT_LABEL[e]}
                  </Chip>
                );
              })}
            </div>
            <SubLabel>What you already have</SubLabel>
            <Tokens keys={prefs.pantry} empty="Add what's in your fridge or cupboard." onRemove={(k) => removeFrom("pantry", k)} onAdd={() => setPicker("pantry")} addLabel="Add what you have" />
          </Section>

          <LearnedPanel feedback={feedback.data ?? []} loading={feedback.isLoading} nameOf={nameOf} />
        </div>
      </div>

      <IngredientPicker
        open={picker !== null}
        onOpenChange={(o) => !o && setPicker(null)}
        title={picker ? LIST_COPY[picker].title : ""}
        description={picker ? LIST_COPY[picker].description : ""}
        selected={picker ? prefs[picker] : []}
        blocked={picker && picker !== "dislikedIngredients" ? prefs.dislikedIngredients : undefined}
        blockedNote="On your never plan list"
        onToggle={(k, on) => picker && toggleIn(picker, k, on)}
      />
    </Frame>
  );
}

/* ------------------------------------------------------------------ parts */

function Frame({ status, children }: { status?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[65rem] pb-6">
      <BackLink href="/nutrition?tab=week" className="press t-callout -ml-2 inline-flex h-11 items-center gap-1 rounded-field pr-3 font-semibold text-stone hover:text-ivory">
        <ChevronLeft className="size-5" strokeWidth={1.6} aria-hidden />
        Week
      </BackLink>
      <header className="mb-6 mt-1 lg:mb-8">
        <p className="t-eyebrow mb-1.5">Fuel · the planner</p>
        <h1 className="t-title-1 text-ivory">Meal preferences</h1>
        <p className="t-meta mt-1.5 min-h-[1lh] text-stone" aria-live="polite">
          {status ?? " "}
          {status && status !== "Saving…" && status.startsWith("Saved") ? " · the next plan or swap uses these" : ""}
        </p>
      </header>
      {children}
    </div>
  );
}

/** A placard-style section: eyebrow + hint on night, a hairline over the controls. */
function Section({ id, title, badge, hint, children }: { id: string; title: string; badge?: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <section className="min-w-0" aria-labelledby={id}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="t-eyebrow">
          {title}
        </h2>
        {badge}
      </div>
      {hint && <p className="t-meta text-stone">{hint}</p>}
      <div className="mt-3 border-t border-vein pt-4">{children}</div>
    </section>
  );
}

function SubLabel({ children, first }: { children: ReactNode; first?: boolean }) {
  return <p className={cn("t-callout mb-2.5 font-semibold text-ivory", !first && "mt-6")}>{children}</p>;
}

function Radio({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-(--dur-fast)", on ? "border-ivory" : "border-ui-line")}>
      <span className={cn("size-2.5 rounded-full bg-ivory transition-transform duration-(--dur-base) ease-out", on ? "scale-100" : "scale-0")} />
    </span>
  );
}

/** Chosen ingredients as removable tokens, plus an Add button that opens the picker. */
function Tokens({ keys, empty, onRemove, onAdd, addLabel }: { keys: readonly string[]; empty: string; onRemove: (k: string) => void; onAdd: () => void; addLabel: string }) {
  const items = namesOf(keys);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.length === 0 && <span className="t-meta mr-1 text-stone">{empty}</span>}
      {items.map((i) => (
        <span key={i.key} className="t-callout inline-flex h-11 items-center gap-0.5 rounded-full bg-m3 pl-4 pr-0.5 font-semibold text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]">
          {i.name}
          <button type="button" onClick={() => onRemove(i.key)} aria-label={`Remove ${i.name}`} className="press grid size-10 place-items-center rounded-full text-stone hover:text-ivory">
            <X className="size-4" strokeWidth={1.6} />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="press t-callout inline-flex h-11 items-center gap-1.5 rounded-full border border-dashed border-ui-line px-4 font-semibold text-stone hover:text-ivory"
      >
        <Plus className="size-4" strokeWidth={1.6} aria-hidden />
        {addLabel}
      </button>
    </div>
  );
}

/** Optional weekly grocery budget in dollars; saved on blur or Enter, empty clears it. */
function BudgetField({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [err, setErr] = useState<string | null>(null);
  const commit = () => {
    const t = text.trim().replace(/[$,\s]/g, "");
    if (!t) {
      setErr(null);
      if (value != null) onSave(null);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 5000) return setErr("Enter an amount from $0 to $5,000.");
    setErr(null);
    const v = Math.round(n);
    if (v !== value) onSave(v);
  };
  return (
    <div className="mt-5">
      <label htmlFor="weekly-budget" className="t-callout mb-1.5 flex items-baseline justify-between gap-2 font-semibold text-ivory">
        Weekly grocery budget
        <span className="t-meta font-normal text-ash">Optional</span>
      </label>
      <div className="relative">
        <span className="t-num-s pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ash">$</span>
        <input
          id="weekly-budget"
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          placeholder="No budget"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? "weekly-budget-err" : undefined}
          className="tnum h-[3.25rem] w-full rounded-field border border-ui-line bg-m1 pl-8 pr-24 text-[length:max(18px,1.125rem)] font-semibold text-ivory outline-none transition-[border-color,box-shadow] placeholder:text-[length:max(16px,1rem)] placeholder:font-medium placeholder:text-ash focus:border-leaf-300 focus:shadow-[0_0_0_3px_var(--leaf-tint)] aria-invalid:border-cinnabar"
        />
        <span className="t-meta pointer-events-none absolute inset-y-0 right-3.5 flex items-center font-semibold text-ash">CAD / week</span>
      </div>
      {err && (
        <p id="weekly-budget-err" className="t-meta mt-1.5 text-cinnabar">
          {err}
        </p>
      )}
    </div>
  );
}

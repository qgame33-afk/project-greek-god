"use client";

import { BackLink } from "@/components/shell/BackLink";
import { Check, ChevronLeft, Plus, ShieldCheck, X } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Chip, Segmented } from "@/components/ui/controls";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
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
 * /nutrition/meals/preferences — how the planner picks (docs/MEALS.md §6). Every change saves as
 * it's made (optimistic, in order). Allergies, diets and "never plan" are hard rules the
 * planner never breaks; the rest only nudge. Ends with what it has learned, with Reset.
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
        <div className="grid gap-4 lg:grid-cols-2" aria-busy="true">
          {["h-[260px]", "h-[300px]", "h-[220px]", "h-[280px]"].map((h) => (
            <Skeleton key={h} className={cn("rounded-[16px]", h)} />
          ))}
        </div>
      </Frame>
    );
  }

  const status = save.isPending ? "Saving…" : touched || saved ? "Saved" : "Defaults until you change something";

  return (
    <Frame status={status}>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-5">
        <div className="flex flex-col gap-4 lg:gap-5">
          {/* cooking level */}
          <Section title="Cooking level" hint="Super Easy is the default: short, familiar, hard to get wrong.">
            <div role="radiogroup" aria-label="Cooking level" className="flex flex-col gap-2">
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
                      "press-soft flex min-h-[64px] items-center gap-3.5 rounded-[14px] border px-4 py-3 text-left transition-colors",
                      on ? "border-line-gold bg-gold-tint" : "border-line bg-s3/60 hover:bg-s3",
                    )}
                  >
                    <DifficultyPips difficulty={d} label={false} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[15px] font-bold", on ? "text-gold-200" : "text-fg")}>
                        {DIFFICULTY_LABEL[d]}
                        {d === "super_easy" && <span className="ml-2 text-[11px] font-bold uppercase tracking-[0.08em] text-fg-3">Default</span>}
                      </span>
                      <span className="block text-[12.5px] font-medium text-fg-3">{DIFFICULTY_HINT[d]}</span>
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
            title="Never broken"
            badge={
              <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-fg-2">
                <ShieldCheck className="size-3.5 text-success" aria-hidden />
                Hard rules
              </span>
            }
            hint="Every pick, swap and easier version respects these. Planned meals that break a new rule are flagged in your week."
          >
            <SubLabel first>Allergies</SubLabel>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Allergies">
              {ALLERGEN_ORDER.map((a) => (
                <Chip key={a} selected={prefs.allergies.includes(a)} onClick={() => set({ allergies: toggled(prefs.allergies, a) })}>
                  {prefs.allergies.includes(a) && <Check className="size-3.5" aria-hidden />}
                  {ALLERGEN_LABEL[a]}
                </Chip>
              ))}
            </div>
            <SubLabel>Diet</SubLabel>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Diet">
              {DIET_ORDER.map((d) => (
                <Chip key={d} selected={prefs.diets.includes(d)} onClick={() => set({ diets: toggled(prefs.diets, d) })}>
                  {prefs.diets.includes(d) && <Check className="size-3.5" aria-hidden />}
                  {dietName(d)}
                </Chip>
              ))}
            </div>
            <SubLabel>Never plan</SubLabel>
            <Tokens keys={prefs.dislikedIngredients} empty="No ingredients ruled out." onRemove={(k) => removeFrom("dislikedIngredients", k)} onAdd={() => setPicker("dislikedIngredients")} addLabel="Add an ingredient" />
          </Section>

          {/* budget + snacks */}
          <Section title="Budget and snacks">
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
            <p className="mt-2 text-[12.5px] font-medium text-fg-3" aria-live="polite">
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

        <div className="flex flex-col gap-4 lg:gap-5">
          {/* tastes */}
          <Section title="Tastes" hint="Nudges, never rules. The planner still mixes things up.">
            <SubLabel first>Like more of</SubLabel>
            <Tokens keys={prefs.likedIngredients} empty="Nothing picked yet." onRemove={(k) => removeFrom("likedIngredients", k)} onAdd={() => setPicker("likedIngredients")} addLabel="Add an ingredient" />
            <SubLabel>Cuisines</SubLabel>
            <ul className="divide-y divide-line-hair">
              {CUISINES.map((c) => {
                const mood = cuisineMood(prefs, c.key);
                return (
                  <li key={c.key} className="flex min-h-[56px] items-center gap-3 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-fg">{c.label}</span>
                      <span className="block text-[12px] font-medium text-fg-3">{c.recipes} recipes</span>
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
                      className="w-[168px] shrink-0"
                    />
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* kitchen */}
          <Section title="Your kitchen" hint="Recipes that need something you don't have are never planned.">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Equipment">
              {EQUIPMENT_ORDER.map((e) => {
                const on = prefs.equipment.includes(e);
                const last = on && prefs.equipment.length === 1;
                return (
                  <Chip key={e} selected={on} disabled={last} onClick={() => set({ equipment: toggled(prefs.equipment, e) })}>
                    {on && <Check className="size-3.5" aria-hidden />}
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
    <div className="mx-auto max-w-[1040px] pb-4">
      <BackLink href="/nutrition/meals" className="-ml-2 inline-flex h-11 items-center gap-1 rounded-[12px] pr-3 text-[14px] font-semibold text-fg-2 hover:text-fg">
        <ChevronLeft className="size-5" aria-hidden />
        Meals
      </BackLink>
      <header className="mt-1 mb-5 lg:mb-7">
        <p className="eyebrow mb-2">Meals</p>
        <h1 className="t-title">Preferences</h1>
        <p className="mt-2 text-[13px] font-medium text-fg-3" aria-live="polite">
          {status ?? " "}
          {status && status !== "Saving…" && status.startsWith("Saved") ? " · the next plan or swap uses these" : ""}
        </p>
      </header>
      {children}
    </div>
  );
}

function Section({ title, badge, hint, children }: { title: string; badge?: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <section className="card-instrument p-4 sm:p-5" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow">{title}</h2>
        {badge}
      </div>
      {hint && <p className="mt-1.5 text-[12.5px] font-medium leading-snug text-fg-3">{hint}</p>}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

function SubLabel({ children, first }: { children: ReactNode; first?: boolean }) {
  return <p className={cn("mb-2.5 text-[13px] font-semibold text-fg-2", !first && "mt-5")}>{children}</p>;
}

function Radio({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("grid size-[22px] shrink-0 place-items-center rounded-full border-2 transition-colors duration-(--dur-fast)", on ? "border-gold-400" : "border-line-strong")}>
      <span className={cn("size-2.5 rounded-full bg-gold-400 transition-transform duration-(--dur-base) ease-spring", on ? "scale-100" : "scale-0")} />
    </span>
  );
}

/** Chosen ingredients as removable tokens, plus an Add button that opens the picker. */
function Tokens({ keys, empty, onRemove, onAdd, addLabel }: { keys: readonly string[]; empty: string; onRemove: (k: string) => void; onAdd: () => void; addLabel: string }) {
  const items = namesOf(keys);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.length === 0 && <span className="mr-1 text-[13px] font-medium text-fg-3">{empty}</span>}
      {items.map((i) => (
        <span key={i.key} className="inline-flex h-9 items-center gap-0.5 rounded-full border border-line-strong bg-s3 pr-0.5 pl-3.5 text-[13px] font-semibold text-fg">
          {i.name}
          <button
            type="button"
            onClick={() => onRemove(i.key)}
            aria-label={`Remove ${i.name}`}
            className="press relative grid size-8 place-items-center rounded-full text-fg-3 before:absolute before:-inset-1.5 before:content-[''] hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="press relative inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3.5 text-[13px] font-bold text-fg-2 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:text-fg"
      >
        <Plus className="size-3.5 text-gold-300" aria-hidden />
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
    <div className="mt-4">
      <label htmlFor="weekly-budget" className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-semibold text-fg-2">
        Weekly grocery budget
        <span className="text-[12px] font-medium text-fg-3">Optional</span>
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[16px] font-semibold text-fg-3">$</span>
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
          className="num h-[52px] w-full rounded-[12px] border border-line-field bg-s3 pr-20 pl-8 text-[18px] text-fg outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-fg-3 focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(213_172_103/.18)] aria-invalid:border-danger"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13px] font-semibold text-fg-3">CAD / week</span>
      </div>
      {err && (
        <p id="weekly-budget-err" className="mt-1.5 text-[12.5px] font-medium text-danger">
          {err}
        </p>
      )}
    </div>
  );
}

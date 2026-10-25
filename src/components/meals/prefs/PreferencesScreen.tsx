"use client";

import { Plus, X } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BackHeader } from "@/components/shell/BackHeader";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { ListGroup, RadioGroup, RadioRow, Row, SectionHead } from "@/components/ui/list";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Confirm, Sheet } from "@/components/ui/sheet";
import { useMealFeedback, useMealPrefs, useSaveMealPrefs } from "@/lib/data/meals";
import { learnPrefs, summarizeLearning } from "@/lib/meals/engine";
import type { Budget, Difficulty, MealPrefs } from "@/lib/meals/types";
import { DIFFICULTY_HINT, DIFFICULTY_LABEL } from "../shared/format";
import { useRecipePool } from "../shared/useRecipePool";
import { useResetLearning } from "./hooks";
import { IngredientPicker } from "./IngredientPicker";
import { LearnedDetail } from "./LearnedPanel";
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
type Panel = "allergies" | "time" | "budget" | "snacks" | "tastes" | "kitchen" | "more" | "less";

const LIST_COPY: Record<ListKey, { title: string; description: string; removed: string }> = {
  dislikedIngredients: { title: "Never use", description: "Meals with these are never planned.", removed: "Removed from never use" },
  likedIngredients: { title: "Like more of", description: "The planner leans toward meals with these.", removed: "Removed from likes" },
  pantry: { title: "Already have", description: "Used first, and marked as have on the grocery list.", removed: "Removed from what you have" },
};

const BUDGET_LABEL: Record<Budget, string> = { tight: "Tight", normal: "Normal", flexible: "Flexible" };
const BUDGET_HINT: Record<Budget, string> = {
  tight: "Mostly cheap meals: eggs, beans, ground meat, pasta.",
  normal: "A mix of everyday prices.",
  flexible: "Price matters less than taste.",
};
const DIFFICULTIES: Difficulty[] = ["super_easy", "everyday", "i_like_cooking"];

/**
 * Meal preferences (`/nutrition/meals/preferences`, docs/DESIGN-V3-SIMPLE.md §4.4.6): "Never use"
 * chips with ✕ and Add, rows for Allergies, Cooking time and Budget (each opens its sheet), the
 * rest of the planner's settings one row further, and what it learned from you with "Forget what
 * was learned". Every change saves as it's made. Selections are white, never gold.
 */
export function PreferencesScreen() {
  const { prefs, hasData, error } = useMealPrefs();
  const save = useSaveMealPrefs();
  const feedback = useMealFeedback();
  const { lookup } = useRecipePool();
  const nameOf = useCallback((k: string) => lookup(k)?.name, [lookup]);
  const summary = useMemo(() => summarizeLearning(learnPrefs(feedback.data ?? []), { nameOf, limit: 5 }), [feedback.data, nameOf]);
  const reset = useResetLearning();
  const [picker, setPicker] = useState<ListKey | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [confirm, setConfirm] = useState(false);

  const set = (patch: Partial<MealPrefs>) => save.mutate(patch);

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

  const header = <BackHeader href="/nutrition" parent="Food" title="Meal preferences" subtitle="The planner uses these every time it plans." />;
  if (error && !hasData)
    return (
      <div className="mx-auto max-w-col">
        {header}
        <ErrorNote className="mt-6" />
      </div>
    );
  if (!hasData)
    return (
      <div className="mx-auto max-w-col" aria-busy="true">
        {header}
        <Skeleton className="mt-8 h-6 w-32" />
        <Skeleton className="mt-4 h-24 w-full rounded-tile-lg" />
        <Skeleton className="mt-4 h-44 w-full rounded-tile-lg" />
      </div>
    );

  const allergyNames = [...prefs.allergies.map((a) => ALLERGEN_LABEL[a]), ...prefs.diets.map(dietName)];
  const timeValue = prefs.maxMinutes ? `Up to ${prefs.maxMinutes} min` : DIFFICULTY_LABEL[prefs.difficulty];
  const featureList = (xs: { label: string }[]) => xs.map((x) => x.label.toLowerCase()).join(", ");
  const nothingLearned = summary.events === 0;

  return (
    <div className="mx-auto max-w-col">
      {header}

      <SectionHead id="never-use">Never use</SectionHead>
      <Tokens keys={prefs.dislikedIngredients} onRemove={(k) => removeFrom("dislikedIngredients", k)} onAdd={() => setPicker("dislikedIngredients")} addLabel="Add an ingredient to never use" />

      <ListGroup className="mt-5">
        <Row title="Allergies" value={allergyNames.length ? allergyNames.join(", ") : "None"} wrap onClick={() => setPanel("allergies")} className="[&_.text-right]:max-w-[55%] [&_.text-right]:truncate" />
        <Row title="Cooking time" value={timeValue} wrap onClick={() => setPanel("time")} />
        <Row title="Budget" value={prefs.weeklyBudgetCad ? `${BUDGET_LABEL[prefs.budget]} · $${prefs.weeklyBudgetCad}` : BUDGET_LABEL[prefs.budget]} wrap onClick={() => setPanel("budget")} />
      </ListGroup>
      <ListGroup className="mt-3">
        <Row title="Snacks a day" value={String(prefs.snacksPerDay)} wrap onClick={() => setPanel("snacks")} />
        <Row title="Tastes" subtitle="Likes and cuisines" onClick={() => setPanel("tastes")} />
        <Row title="Your kitchen" subtitle="Equipment and what you have" onClick={() => setPanel("kitchen")} />
      </ListGroup>

      <SectionHead id="learned">Learned from you</SectionHead>
      {feedback.isLoading ? (
        <Skeleton className="h-36 w-full rounded-tile-lg" />
      ) : nothingLearned ? (
        <p className="t-label px-1">Nothing yet. Likes, swaps and the meals you eat teach the planner what you enjoy.</p>
      ) : (
        <ListGroup>
          <Row title="More often" subtitle={summary.liked.length ? featureList(summary.liked) : "Nothing strong yet"} wrap onClick={() => setPanel("more")} />
          <Row title="Less often" subtitle={summary.disliked.length || summary.blocked.length ? featureList(summary.disliked) || `${summary.blocked.length} meals resting` : "Nothing strong yet"} wrap onClick={() => setPanel("less")} />
        </ListGroup>
      )}
      {!nothingLearned && (
        <Button variant="ghost" size="lg" block className="mt-4" onClick={() => setConfirm(true)} disabled={reset.isPending}>
          Forget what was learned
        </Button>
      )}

      {/* ------------------------------------------------------------ sheets */}
      <PanelSheet open={panel === "allergies"} onClose={() => setPanel(null)} title="Allergies" description="Hard rules: no pick, swap or easier version ever breaks them.">
        <ChipGroup label="Allergies">
          {ALLERGEN_ORDER.map((a) => (
            <Chip key={a} selected={prefs.allergies.includes(a)} onClick={() => set({ allergies: toggled(prefs.allergies, a) })}>
              {ALLERGEN_LABEL[a]}
            </Chip>
          ))}
        </ChipGroup>
        <p className="t-section mb-3 mt-7">Diet</p>
        <ChipGroup label="Diet">
          {DIET_ORDER.map((d) => (
            <Chip key={d} selected={prefs.diets.includes(d)} onClick={() => set({ diets: toggled(prefs.diets, d) })}>
              {dietName(d)}
            </Chip>
          ))}
        </ChipGroup>
        <p className="t-label mt-5">Planned meals that break a new rule show on Food with a way to replace them.</p>
      </PanelSheet>

      <PanelSheet open={panel === "time"} onClose={() => setPanel(null)} title="Cooking time" description="Super Easy is the default: short, familiar, hard to get wrong.">
        <RadioGroup ariaLabel="Cooking level">
          {DIFFICULTIES.map((d) => (
            <RadioRow key={d} title={DIFFICULTY_LABEL[d]} subtitle={DIFFICULTY_HINT[d]} checked={prefs.difficulty === d} onSelect={() => set({ difficulty: d })} />
          ))}
        </RadioGroup>
        <p className="t-section mb-3 mt-7">Time limit</p>
        <ChipGroup label="Time limit">
          {TIME_LIMITS.map((t) => (
            <Chip key={t ?? "none"} selected={prefs.maxMinutes === t} onClick={() => set({ maxMinutes: t })}>
              {t == null ? "No limit" : `Up to ${t} min`}
            </Chip>
          ))}
        </ChipGroup>
      </PanelSheet>

      <PanelSheet open={panel === "budget"} onClose={() => setPanel(null)} title="Budget" description={BUDGET_HINT[prefs.budget]}>
        <RadioGroup ariaLabel="Budget">
          {(["tight", "normal", "flexible"] as Budget[]).map((b) => (
            <RadioRow key={b} title={BUDGET_LABEL[b]} subtitle={BUDGET_HINT[b]} checked={prefs.budget === b} onSelect={() => set({ budget: b })} />
          ))}
        </RadioGroup>
        <BudgetField key={String(prefs.weeklyBudgetCad)} value={prefs.weeklyBudgetCad} onSave={(v) => set({ weeklyBudgetCad: v })} />
      </PanelSheet>

      <PanelSheet open={panel === "snacks"} onClose={() => setPanel(null)} title="Snacks a day">
        <RadioGroup ariaLabel="Snacks a day">
          {[1, 2, 3].map((n) => (
            <RadioRow key={n} title={`${n} ${n === 1 ? "snack" : "snacks"}`} checked={prefs.snacksPerDay === n} onSelect={() => set({ snacksPerDay: n })} />
          ))}
        </RadioGroup>
      </PanelSheet>

      <PanelSheet open={panel === "tastes"} onClose={() => setPanel(null)} title="Tastes" description="Nudges, never rules. The planner still mixes things up.">
        <p className="t-section mb-3">Like more of</p>
        <Tokens keys={prefs.likedIngredients} onRemove={(k) => removeFrom("likedIngredients", k)} onAdd={() => setPicker("likedIngredients")} addLabel="Add an ingredient you like" />
        <p className="t-section mb-3 mt-7">Cuisines</p>
        <ListGroup>
          {CUISINES.map((c) => {
            const mood = cuisineMood(prefs, c.key);
            const pick = (m: CuisineMood) => set(setCuisineMood(prefs, c.key, m));
            return (
              <div key={c.key} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                <span className="t-row min-w-0 flex-1">{c.label}</span>
                <span className="flex gap-1.5" role="group" aria-label={`${c.label}: less, any or more`}>
                  <Chip selected={mood === "less"} onClick={() => pick("less")}>
                    Less
                  </Chip>
                  <Chip selected={mood == null} onClick={() => pick(null)}>
                    Any
                  </Chip>
                  <Chip selected={mood === "more"} onClick={() => pick("more")}>
                    More
                  </Chip>
                </span>
              </div>
            );
          })}
        </ListGroup>
      </PanelSheet>

      <PanelSheet open={panel === "kitchen"} onClose={() => setPanel(null)} title="Your kitchen" description="Recipes that need something you don't have are never planned.">
        <ChipGroup label="Equipment">
          {EQUIPMENT_ORDER.map((e) => {
            const on = prefs.equipment.includes(e);
            return (
              <Chip key={e} selected={on} disabled={on && prefs.equipment.length === 1} onClick={() => set({ equipment: toggled(prefs.equipment, e) })}>
                {EQUIPMENT_LABEL[e]}
              </Chip>
            );
          })}
        </ChipGroup>
        <p className="t-section mb-3 mt-7">What you already have</p>
        <Tokens keys={prefs.pantry} onRemove={(k) => removeFrom("pantry", k)} onAdd={() => setPicker("pantry")} addLabel="Add something you have" />
      </PanelSheet>

      <PanelSheet open={panel === "more" || panel === "less"} onClose={() => setPanel(null)} title={panel === "less" ? "Less often" : "More often"} description="Straight from your likes, swaps and the meals you eat.">
        <LearnedDetail summary={summary} side={panel === "less" ? "less" : "more"} />
      </PanelSheet>

      <IngredientPicker
        open={picker !== null}
        onOpenChange={(o) => !o && setPicker(null)}
        title={picker ? LIST_COPY[picker].title : ""}
        description={picker ? LIST_COPY[picker].description : ""}
        selected={picker ? prefs[picker] : []}
        blocked={picker && picker !== "dislikedIngredients" ? prefs.dislikedIngredients : undefined}
        blockedNote="On your never use list"
        onToggle={(k, on) => picker && toggleIn(picker, k, on)}
      />
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Forget what was learned?"
        body="The planner forgets every like, swap and reason, and plans like it's new to you. Your preferences and saved meals stay. You can undo it."
        confirmLabel="Forget"
        onConfirm={() => reset.mutate()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

function PanelSheet({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title} description={description}>
      <div className="pb-2 pt-1">{children}</div>
    </Sheet>
  );
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** Chosen ingredients as chips with ✕, plus an Add chip that opens the picker. */
function Tokens({ keys, onRemove, onAdd, addLabel }: { keys: readonly string[]; onRemove: (k: string) => void; onAdd: () => void; addLabel: string }) {
  const items = namesOf(keys);
  return (
    <div className="flex flex-wrap items-center gap-2" data-food="">
      {items.map((i) => (
        <span key={i.key} className="t-label inline-flex h-11 items-center gap-0.5 rounded-pill bg-control pl-4 pr-1 font-semibold text-fg">
          {i.name}
          <button type="button" onClick={() => onRemove(i.key)} aria-label={`Remove ${i.name}`} className="press grid size-9 place-items-center rounded-full text-fg-2 hover:text-fg">
            <X className="size-4" strokeWidth={2.2} />
          </button>
        </span>
      ))}
      <button type="button" onClick={onAdd} aria-label={addLabel} className="press t-label inline-flex h-11 items-center gap-1.5 rounded-pill bg-control px-4 font-semibold text-fg">
        <Plus className="size-4" strokeWidth={2.2} aria-hidden />
        Add
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
    <div className="mt-6">
      <label htmlFor="weekly-budget" className="t-row mb-2 flex items-baseline justify-between gap-2">
        Weekly grocery budget
        <span className="t-label font-normal">Optional</span>
      </label>
      <div className="relative">
        <span className="t-body pointer-events-none absolute inset-y-0 left-4 flex items-center text-fg-2">$</span>
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
          className="t-body h-14 w-full rounded-field bg-sheet-card pl-8 pr-28 tabular-nums text-fg outline-none placeholder:text-fg-2 focus:ring-2 focus:ring-fg aria-invalid:ring-2 aria-invalid:ring-danger"
        />
        <span className="t-label pointer-events-none absolute inset-y-0 right-4 flex items-center">CAD a week</span>
      </div>
      {err && (
        <p id="weekly-budget-err" className="t-label mt-1.5 text-danger">
          {err}
        </p>
      )}
    </div>
  );
}

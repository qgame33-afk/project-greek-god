"use client";

import Link from "next/link";
import { CalendarPlus, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MealPrefs } from "@/lib/meals/types";
import { DIFFICULTY_LABEL, kcalText } from "../shared/format";
import { useOnline } from "../shared/useOnline";
import type { DayGoals } from "./hooks";

const BUDGET_LABEL: Record<MealPrefs["budget"], string> = { tight: "Tight budget", normal: "Normal budget", flexible: "Flexible budget" };

/** The settings a plan will be made with, in one quiet line. */
export function prefsSummary(p: MealPrefs): string {
  const parts = [DIFFICULTY_LABEL[p.difficulty], BUDGET_LABEL[p.budget], `${p.snacksPerDay} ${p.snacksPerDay === 1 ? "snack" : "snacks"} a day`];
  const hard = p.allergies.length + p.diets.length + p.dislikedIngredients.length;
  if (hard) parts.push(`${hard} ${hard === 1 ? "rule" : "rules"} never broken`);
  return parts.join(" · ");
}

/**
 * A week with no plan yet (under the empty mosaic): what you'll get, the settings it uses, and
 * "Plan 19–25 Oct" — the viewport's one gold key.
 */
export function EmptyWeek({
  range,
  goals,
  prefs,
  prefsSaved,
  ready,
  busy,
  fromToday = false,
  onGenerate,
  onGenerateWhole,
}: {
  range: string;
  goals: DayGoals;
  prefs: MealPrefs;
  prefsSaved: boolean;
  ready: boolean;
  busy: boolean;
  /** Mid-week: Generate plans today to Sunday; `onGenerateWhole` plans all seven days. */
  fromToday?: boolean;
  onGenerate: () => void;
  onGenerateWhole?: () => void;
}) {
  const online = useOnline();
  return (
    <section className="mt-4 text-center" aria-labelledby="empty-week-title">
      <Button variant="primary" size="lg" block onClick={onGenerate} loading={busy} disabled={!ready}>
        <CalendarPlus className="size-5" strokeWidth={1.8} />
        Plan {fromToday ? "today to Sunday" : range}
      </Button>
      {!ready && !busy && <p className="t-meta mt-2 text-stone">{online ? "Loading your preferences…" : "Offline · planning needs a connection"}</p>}
      {fromToday && onGenerateWhole && ready && (
        <button type="button" onClick={onGenerateWhole} disabled={busy} className="press t-callout mt-1 inline-flex min-h-11 items-center rounded-field px-3 font-semibold text-stone hover:text-ivory disabled:opacity-50">
          Plan the whole week instead
        </button>
      )}
      <h2 id="empty-week-title" className="t-title-2 mt-6 text-ivory">
        {fromToday ? "Today to Sunday, in one tap" : "Seven days, in one tap"}
      </h2>
      <p className="t-callout mx-auto mt-2 max-w-[34ch] text-stone">
        Easy, familiar meals sized to <span className="tnum font-semibold text-ivory">{kcalText(goals.kcal)} kcal</span> and{" "}
        <span className="tnum font-semibold text-ivory">{goals.protein} g protein</span> a day. Nothing goes in your food log until you eat it.
      </p>
      <p className="t-meta mt-3 text-stone">{prefsSummary(prefs)}</p>
      {!prefsSaved && (
        <Link href="/nutrition/meals/preferences" className="press t-callout mt-1 inline-flex min-h-11 items-center gap-1 rounded-field px-2 font-semibold text-ivory underline decoration-vein-3 underline-offset-4">
          Allergies or dislikes? Set them first
          <ChevronRight className="size-4" strokeWidth={1.6} aria-hidden />
        </Link>
      )}
    </section>
  );
}

/** No calorie or protein goal yet: the planner can't size meals, so say so and link to the fix. */
export function NeedsGoals() {
  return (
    <div className="border-y border-vein py-8 text-center">
      <p className="t-title-2 text-ivory">Set your calorie and protein goals first</p>
      <p className="t-callout mx-auto mt-1 max-w-[34ch] text-stone">The planner sizes every meal to them.</p>
      <Button asChild variant="outline" size="md" className="mt-4 rounded-full">
        <Link href="/settings">Open settings</Link>
      </Button>
    </div>
  );
}

/** Planned meals that break a hard rule added after the week was planned (an allergy, a dislike…). A word, not a colour. */
export function ConflictBanner({ count, examples, replaceable, busy, onReplace }: { count: number; examples: string[]; replaceable: number; busy: boolean; onReplace: () => void }) {
  return (
    <section className="rounded-card bg-m2 p-4 shadow-[inset_0_0_0_1px_var(--vein-3)]" role="status" aria-labelledby="conflict-title">
      <h2 id="conflict-title" className="t-title-3 text-ivory">
        {count === 1 ? "1 planned meal doesn't fit your preferences now" : `${count} planned meals don't fit your preferences now`}
      </h2>
      <ul className="t-meta mt-1 text-stone">
        {examples.slice(0, 2).map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      {replaceable < count && <p className="t-meta mt-1 text-stone">Locked meals stay until you unlock them.</p>}
      {replaceable > 0 && (
        <Button variant="secondary" size="md" block className="mt-3" onClick={onReplace} loading={busy}>
          <RefreshCw className="size-4" strokeWidth={1.6} />
          {replaceable === 1 ? "Replace it" : `Replace ${replaceable} meals`}
        </Button>
      )}
    </section>
  );
}

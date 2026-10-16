"use client";

import Link from "next/link";
import { CalendarPlus, ChevronRight, RefreshCw, ShoppingBasket, SlidersHorizontal, TriangleAlert, type LucideIcon } from "lucide-react";
import { EmptyArt } from "@/components/art/Motifs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { MealPrefs } from "@/lib/meals/types";
import { DIFFICULTY_LABEL, kcalText } from "../shared/format";
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
 * A week with no plan yet: what you'll get, the settings it uses, and GENERATE MY WEEK — the
 * screen's one gold fill.
 */
export function EmptyWeek({
  range,
  goals,
  prefs,
  prefsSaved,
  ready,
  busy,
  onGenerate,
}: {
  range: string;
  goals: DayGoals;
  prefs: MealPrefs;
  prefsSaved: boolean;
  ready: boolean;
  busy: boolean;
  onGenerate: () => void;
}) {
  return (
    <section className="card-accent relative overflow-hidden px-5 pt-7 pb-5 text-center sm:px-8" aria-labelledby="empty-week-title">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(55%_75%_at_50%_0%,rgb(213_172_103/.11),transparent)]" />
      <EmptyArt kind="kylix" size={64} strokeWidth={1.25} className="relative mx-auto" />
      <h2 id="empty-week-title" className="t-h2 relative mt-3">
        Plan {range}
      </h2>
      <p className="relative mx-auto mt-2 max-w-[36ch] text-[14px] leading-relaxed text-fg-2">
        Seven days of easy, familiar meals sized to <span className="font-bold text-fg">{kcalText(goals.kcal)} kcal</span> and{" "}
        <span className="font-bold text-fg">{goals.protein} g protein</span> a day. Nothing goes in your food log until you eat it.
      </p>
      <p className="relative mt-4 text-[12.5px] font-semibold text-fg-3">{prefsSummary(prefs)}</p>
      {!prefsSaved && (
        <Link href="/nutrition/meals/preferences" className="press relative mt-3 inline-flex min-h-11 items-center gap-1 rounded-[12px] px-3 text-[13.5px] font-bold text-lapis-text hover:text-fg">
          Allergies or dislikes? Set them first
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
      <Button variant="primary" size="lg" block className="relative mt-5" onClick={onGenerate} loading={busy} disabled={!ready}>
        <CalendarPlus className="size-5" strokeWidth={2.2} />
        Generate my week
      </Button>
      {!ready && !busy && <p className="relative mt-2 text-[12px] font-medium text-fg-3">Loading your preferences…</p>}
    </section>
  );
}

/** No calorie or protein goal yet: the planner can't size meals, so say so and link to the fix. */
export function NeedsGoals() {
  return (
    <div className="card-inset flex flex-col items-center px-5 py-8 text-center">
      <EmptyArt kind="kylix" size={56} strokeWidth={1.25} />
      <p className="mt-3 text-[15px] font-bold text-fg">Set your calorie and protein goals first</p>
      <p className="mt-1 max-w-[34ch] text-[13px] leading-relaxed text-fg-2">The planner sizes every meal to them.</p>
      <Button asChild variant="secondary" size="md" className="mt-4">
        <Link href="/settings">Open settings</Link>
      </Button>
    </div>
  );
}

/** Planned meals that break a hard rule added after the week was planned (an allergy, a dislike…). */
export function ConflictBanner({ count, examples, replaceable, busy, onReplace }: { count: number; examples: string[]; replaceable: number; busy: boolean; onReplace: () => void }) {
  return (
    <section className="rounded-[16px] border border-warning/30 bg-warning-tint p-4" role="status" aria-labelledby="conflict-title">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="conflict-title" className="text-[14px] font-bold text-fg">
            {count === 1 ? "1 planned meal doesn't fit your preferences now" : `${count} planned meals don't fit your preferences now`}
          </h2>
          <ul className="mt-1 text-[12.5px] font-medium leading-snug text-fg-2">
            {examples.slice(0, 2).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {replaceable < count && <p className="mt-1 text-[12px] font-medium text-fg-3">Locked meals stay until you unlock them.</p>}
        </div>
      </div>
      {replaceable > 0 && (
        <Button variant="secondary" size="md" block className="mt-3" onClick={onReplace} loading={busy}>
          <RefreshCw className="size-4 text-gold-300" />
          {replaceable === 1 ? "Replace it" : `Replace ${replaceable} meals`}
        </Button>
      )}
    </section>
  );
}

function LinkRow({ href, icon: Icon, label, detail }: { href: string; icon: LucideIcon; label: string; detail: string }) {
  return (
    <Link href={href} className="press-soft flex min-h-[60px] items-center gap-3 px-4 py-3 hover:bg-white/[.02]">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-s3 text-gold-300">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-fg">{label}</span>
        <span className="block truncate text-[12.5px] font-medium text-fg-3">{detail}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
    </Link>
  );
}

/** Grocery list and preferences, as one grouped list. */
export function PlannerLinks({ groceryDetail, prefsDetail, className }: { groceryDetail: string; prefsDetail: string; className?: string }) {
  return (
    <nav aria-label="Meal planner" className={cn("card-instrument divide-y divide-line-hair overflow-hidden p-0", className)}>
      <LinkRow href="/nutrition/meals/grocery" icon={ShoppingBasket} label="Grocery list" detail={groceryDetail} />
      <LinkRow href="/nutrition/meals/preferences" icon={SlidersHorizontal} label="Preferences" detail={prefsDetail} />
    </nav>
  );
}

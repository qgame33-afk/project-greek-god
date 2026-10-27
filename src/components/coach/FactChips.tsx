"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CoachCategory, FactChip } from "@/lib/coach/types";
import { shortDate, today } from "@/lib/dates";
import { cn } from "@/lib/cn";

const SOURCE_WORD: Record<CoachCategory, string> = {
  bodyweight: "weigh-ins",
  nutrition: "food",
  training: "workouts",
  recovery: "check-ins",
  measurements: "measurements",
  profile: "goals",
};

/**
 * Where an answer came from, in plain words (docs/DESIGN-V3-SIMPLE.md §4.8): "From your weigh-ins
 * and food", from the categories of the server's own facts (never the model's numbers). Null
 * when the answer used none.
 */
export function sourcesLine(facts: readonly FactChip[]): string | null {
  const words: string[] = [];
  for (const f of facts) {
    const w = f.kind === "plan" ? "plan" : f.category ? SOURCE_WORD[f.category] : null;
    if (w && !words.includes(w)) words.push(w);
  }
  if (!words.length) return null;
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
  return `From your ${list}`;
}

/**
 * "Based on" (§4.8, law 5): the records an answer relied on, label left, value right in tabular
 * figures, each row opening the screen that holds the records. Values are a snapshot from the
 * server, from when the question was asked. No provenance tags: a row reads "Your plan" or not.
 */
export function FactChips({ facts, asOf, onNavigate }: { facts: FactChip[]; asOf?: string | null; onNavigate?: () => void }) {
  if (!facts.length) return null;
  const old = asOf && asOf !== today() ? `As of ${shortDate(asOf)}` : null;
  return (
    <section className="mt-1" aria-label="Based on">
      {old && <p className="t-cap mb-1">{old}</p>}
      <ul className="[&>li+li]:border-t [&>li+li]:border-line">
        {facts.map((f) => (
          <li key={f.id} className="min-w-0">
            <Row fact={f} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ fact, onNavigate }: { fact: FactChip; onNavigate?: () => void }) {
  const isPlan = fact.kind === "plan";
  const inner = (
    <>
      <span className="t-label min-w-0 flex-[1_1_8rem]">
        {fact.label}
        {isPlan && <span className="text-fg-2"> · your plan</span>}
      </span>
      {/* a long value ("2,551 kcal · 218 g protein") drops to its own line, right-aligned, never cut */}
      <span className="ml-auto flex items-center gap-1.5 text-right">
        <span className="t-row tabular-nums">{fact.value}</span>
        {fact.href && <ChevronRight className="-mr-1 size-4 shrink-0 text-fg-3" strokeWidth={2} aria-hidden />}
      </span>
    </>
  );
  const label = `${isPlan ? "Your plan" : "Your records"}: ${fact.label}, ${fact.value}`;
  const cls = "flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-0.5 py-1.5";
  return fact.href ? (
    <Link href={fact.href} onClick={onNavigate} aria-label={`${label}. Open`} className={cn(cls, "press-soft")}>
      {inner}
    </Link>
  ) : (
    <span aria-label={label} className={cls}>
      {inner}
    </span>
  );
}

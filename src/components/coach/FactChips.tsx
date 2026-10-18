"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Tag } from "@/components/ui/tag";
import type { FactChip } from "@/lib/coach/types";
import { shortDate, today } from "@/lib/dates";
import { cn } from "@/lib/cn";

/**
 * "Based on" (docs/DESIGN-V2.md §3.9.2): the records an answer relied on, as a small placard —
 * label left, value right in tabular figures, each row opening the screen that holds the records.
 * Values come from the server's own snapshot, never from the model. LOG = his records or
 * arithmetic on them; PLAN = targets, schedule and program.
 */
export function FactChips({ facts, asOf, onNavigate }: { facts: FactChip[]; asOf?: string | null; onNavigate?: () => void }) {
  if (!facts.length) return null;
  const logged = facts.filter((f) => f.kind === "logged");
  const plan = facts.filter((f) => f.kind === "plan");
  // values are a snapshot from when the question was asked
  const old = asOf && asOf !== today() ? ` · as of ${shortDate(asOf)}` : "";
  return (
    <section className="mt-4" aria-label="Based on">
      <p className="t-eyebrow">Based on{old}</p>
      {logged.length > 0 && <Group kind="logged" facts={logged} onNavigate={onNavigate} />}
      {plan.length > 0 && <Group kind="plan" facts={plan} onNavigate={onNavigate} />}
    </section>
  );
}

function Group({ kind, facts, onNavigate }: { kind: FactChip["kind"]; facts: FactChip[]; onNavigate?: () => void }) {
  const isPlan = kind === "plan";
  return (
    <div className="mt-1.5" role="group" aria-label={isPlan ? "Your plan" : "Your records"}>
      <ul className="divide-y divide-vein border-y border-vein">
        {facts.map((f, i) => (
          <li key={f.id} className="min-w-0">
            <Row fact={f} tag={i === 0 ? <Tag kind={isPlan ? "PLAN" : "LOG"} /> : null} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ fact, tag, onNavigate }: { fact: FactChip; tag: React.ReactNode; onNavigate?: () => void }) {
  const isPlan = fact.kind === "plan";
  const inner = (
    <>
      <span className={cn("t-callout min-w-0 flex-[1_1_8rem]", isPlan ? "text-stone" : "text-ivory")}>{fact.label}</span>
      {tag}
      {/* a long value ("2,551 kcal · 218 g protein") drops to its own line, right-aligned, never cut */}
      <span className="ml-auto flex items-center gap-1.5 text-right">
        <span className="t-num-s text-ivory">{fact.value}</span>
        {fact.href && <ChevronRight className="-mr-1 size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />}
      </span>
    </>
  );
  const label = `${isPlan ? "Plan" : "Logged"}: ${fact.label}, ${fact.value}`;
  const cls = "flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-0.5 py-1.5";
  return fact.href ? (
    <Link href={fact.href} onClick={onNavigate} title={`${fact.label}: ${fact.value}`} aria-label={`${label}. Open`} className={cn(cls, "press-soft")}>
      {inner}
    </Link>
  ) : (
    <span aria-label={label} className={cls}>
      {inner}
    </span>
  );
}

"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { FactChip } from "@/lib/coach/types";
import { shortDate, today } from "@/lib/dates";
import { cn } from "@/lib/cn";

/**
 * The records an answer relied on, as a small ledger: label left, value right in tabular
 * numerals, each row opening the screen that holds the records. Values come from the server's
 * own snapshot (never from the model). LOGGED = the user's records or math on them (marble
 * dot); PLAN = targets, schedule, program (dashed marker, never mistaken for data).
 */
export function FactChips({ facts, asOf }: { facts: FactChip[]; asOf?: string | null }) {
  if (!facts.length) return null;
  const logged = facts.filter((f) => f.kind === "logged");
  const plan = facts.filter((f) => f.kind === "plan");
  // values are a snapshot from when the question was asked
  const old = asOf && asOf !== today() ? ` · as of ${shortDate(asOf)}` : "";
  return (
    <div className="card-inset mt-4 px-3.5 pb-1 pt-3">
      {logged.length > 0 && <Group kind="logged" hint={`From your records${old}`} facts={logged} />}
      {plan.length > 0 && <Group kind="plan" hint="Your targets and program" facts={plan} className={logged.length ? "mt-3" : undefined} />}
    </div>
  );
}

function Group({ kind, hint, facts, className }: { kind: FactChip["kind"]; hint: string; facts: FactChip[]; className?: string }) {
  const plan = kind === "plan";
  return (
    <section className={className} aria-label={plan ? "Plan" : "Logged"}>
      <p className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-5 items-center gap-1.5 rounded-[6px] px-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em]",
            plan ? "border border-dashed border-line-strong text-fg-3" : "bg-white/[.08] text-fg",
          )}
        >
          {!plan && <span className="size-1.5 rounded-full bg-marble" aria-hidden />}
          {plan ? "Plan" : "Logged"}
        </span>
        <span className="truncate text-[12px] font-medium text-fg-3">{hint}</span>
      </p>
      <ul className="mt-1 grid sm:grid-cols-2 sm:gap-x-5">
        {facts.map((f) => (
          <li key={f.id} className="min-w-0 border-b border-line-hair last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
            <Row fact={f} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ fact }: { fact: FactChip }) {
  const plan = fact.kind === "plan";
  const inner = (
    <>
      <span className={cn("min-w-0 flex-1 truncate text-[13.5px] font-medium", plan ? "text-fg-3" : "text-fg-2")}>{fact.label}</span>
      <span className={cn("num max-w-[70%] shrink-0 truncate text-right text-[16px] font-semibold tracking-[0.01em]", plan ? "text-fg-2" : "text-fg")}>{fact.value}</span>
      {fact.href && <ChevronRight className="-mr-1 size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" aria-hidden />}
    </>
  );
  const label = `${plan ? "Plan" : "Logged"}: ${fact.label}, ${fact.value}`;
  const cls = "flex min-h-11 items-center gap-3 py-1.5";
  return fact.href ? (
    <Link href={fact.href} title={`${fact.label}: ${fact.value}`} aria-label={`${label}. Open`} className={cn(cls, "press-soft group -mx-1.5 rounded-[10px] px-1.5 hover:bg-white/[.03]")}>
      {inner}
    </Link>
  ) : (
    <span aria-label={label} className={cls}>
      {inner}
    </span>
  );
}

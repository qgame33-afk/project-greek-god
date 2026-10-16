"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { FactChip } from "@/lib/coach/types";
import { shortDate, today } from "@/lib/dates";
import { cn } from "@/lib/cn";

/**
 * The records an answer relied on. Values come from the server's own snapshot (never from
 * the model). LOGGED = the user's records or math on them; PLAN = targets, schedule, program.
 */
export function FactChips({ facts, asOf }: { facts: FactChip[]; asOf?: string | null }) {
  if (!facts.length) return null;
  const logged = facts.filter((f) => f.kind === "logged");
  const plan = facts.filter((f) => f.kind === "plan");
  // values are a snapshot from when the question was asked
  const old = asOf && asOf !== today() ? ` · as of ${shortDate(asOf)}` : "";
  return (
    <div className="card-inset mt-3 px-3 pb-1.5 pt-2.5">
      {logged.length > 0 && <Group title="Logged" hint={`From your records${old}`} facts={logged} />}
      {plan.length > 0 && <Group title="Plan" hint="Your targets and program" facts={plan} className={logged.length ? "mt-1.5" : undefined} />}
    </div>
  );
}

function Group({ title, hint, facts, className }: { title: string; hint: string; facts: FactChip[]; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-0.5 flex items-baseline gap-2 px-0.5">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-2">{title}</span>
        <span className="text-[11.5px] font-medium text-fg-3">{hint}</span>
      </p>
      <ul className="-mx-0.5 flex flex-wrap gap-x-1.5">
        {facts.map((f) => (
          <li key={f.id} className="min-w-0 max-w-full">
            <Chip fact={f} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ fact }: { fact: FactChip }) {
  const plan = fact.kind === "plan";
  const inner = (
    <span
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full pl-2.5 pr-2 text-[13px] transition-colors",
        plan ? "border border-dashed border-line-strong text-fg-2" : "bg-white/[.07] text-fg",
        fact.href && "group-hover:bg-white/[.1]",
      )}
    >
      {!plan && <span className="size-1.5 shrink-0 rounded-full bg-marble" aria-hidden />}
      <span className="min-w-[4.5rem] shrink truncate font-medium text-fg-2">{fact.label}</span>
      <span className="num min-w-0 shrink-[2] truncate text-[15px] font-semibold text-fg">{fact.value}</span>
      {fact.href && <ChevronRight className="-ml-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden />}
    </span>
  );
  const label = `${plan ? "Plan" : "Logged"}: ${fact.label}, ${fact.value}`;
  return fact.href ? (
    <Link href={fact.href} title={`${fact.label}: ${fact.value}`} aria-label={`${label}. Open`} className="group press-soft flex h-11 max-w-full items-center rounded-full px-0.5 outline-offset-0">
      {inner}
    </Link>
  ) : (
    <span aria-label={label} className="flex h-11 max-w-full items-center px-0.5">
      {inner}
    </span>
  );
}

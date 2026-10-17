"use client";

import { useState } from "react";
import { ChevronDown, ShieldAlert } from "lucide-react";
import { Moon } from "@/components/art/icons";
import { Button } from "@/components/ui/button";
import { Collapse, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { relativeDay, type ISODate } from "@/lib/dates";
import { DISCLAIMER, THRESHOLDS, type Guidance, type ReadinessLevel } from "@/lib/recovery/guidance";
import { useReadiness } from "@/lib/recovery/hooks";

const STEPS = ["Train", "Trim", "Lighter", "Rest"] as const;
const STEP_OF: Partial<Record<ReadinessLevel, number>> = { go: 0, legs: 1, trim: 1, ease: 2, recover: 3 };

/**
 * The readiness call for a date (docs/DESIGN-V2.md §3.7): a fixed rule over the check-in, recent
 * nights, volleyball and training — so it carries RULE, in ivory (aegean is for AI only). The
 * Train → Rest scale, the reasons, and "How this works" with every signal's points.
 */
export function GuidanceCard({ date, today, onCheckin, compact, className }: { date: ISODate; today: ISODate; onCheckin?: () => void; compact?: boolean; className?: string }) {
  const { guidance, plan, loading, error, refetch } = useReadiness(date);
  return (
    <section className={cn("min-w-0", className)} aria-labelledby={`guidance-${date}`} aria-busy={loading || undefined}>
      <div className="flex min-h-6 items-center gap-2">
        <p className="t-eyebrow truncate">
          Readiness · {relativeDay(date, today)}
          {plan ? ` · ${plan.template?.name ?? "Rest day"}` : ""}
        </p>
        <Tag kind="RULE" explain="The readiness rule: strain points from your check-in, the last few nights, volleyball and recent training. No AI." />
      </div>
      {loading && !guidance ? (
        <div aria-hidden>
          <Skeleton className="mt-3 h-8 w-3/5" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
        </div>
      ) : error && !guidance ? (
        <ErrorNote className="mt-3" onRetry={refetch}>
          Couldn&apos;t load your recovery data.
        </ErrorNote>
      ) : guidance ? (
        <GuidanceBody g={guidance} id={`guidance-${date}`} onCheckin={onCheckin} compact={compact} isToday={date === today} />
      ) : null}
    </section>
  );
}

function GuidanceBody({ g, id, onCheckin, compact, isToday }: { g: Guidance; id: string; onCheckin?: () => void; compact?: boolean; isToday: boolean }) {
  const [open, setOpen] = useState(false);
  // after the session the Train → Rest scale described a call that has been acted on
  const step = g.session === "done" ? undefined : STEP_OF[g.level];
  const sleepExtra = isToday ? g.extras.find((e) => e.startsWith("Aim for")) : undefined;
  const pastUnknown = !isToday && g.level === "unknown" && !g.partialCheckin;

  return (
    <>
      <h2 id={id} className="t-verdict mt-2 text-ivory">
        {pastUnknown ? "No check-in this day." : g.title.endsWith(".") ? g.title : `${g.title}.`}
      </h2>
      <p className="t-callout mt-2 text-stone">{pastUnknown ? "Log how you slept and felt to see what the data suggested for that session." : g.detail}</p>

      {step != null && (
        <div className="mt-4" role="img" aria-label={`Readiness: ${STEPS[step]}. ${g.score} strain points.`}>
          <div className="grid grid-cols-4 gap-1">
            {STEPS.map((s, i) => (
              <span key={s} className={cn("h-1.5 rounded-full", i === step ? "bg-ivory" : "bg-vein-2")} />
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {STEPS.map((s, i) => (
              <span key={s} className={cn("t-eyebrow", i === step && "text-ivory", i === 3 && "text-right", (i === 1 || i === 2) && "text-center")}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {g.reasons.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Why">
          {g.reasons.map((r) => (
            <li key={r} className="t-meta inline-flex min-h-8 items-center rounded-full bg-m2 px-3 font-semibold text-stone shadow-[inset_0_0_0_1px_var(--vein-2)]">
              {r}
            </li>
          ))}
        </ul>
      )}

      {(sleepExtra || g.pain) && (
        <ul className="t-meta mt-3 space-y-1.5 text-stone">
          {sleepExtra && (
            <li className="flex items-center gap-2">
              <Moon className="size-4 shrink-0 text-stone" />
              {sleepExtra}
            </li>
          )}
          {g.pain && (
            <li className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-cinnabar" strokeWidth={1.6} aria-hidden />
              <span>Work around the sore area and skip anything that hurts.</span>
            </li>
          )}
        </ul>
      )}

      {!g.hasCheckin && onCheckin && isToday && (
        <Button variant="secondary" block className="mt-4" onClick={onCheckin}>
          {g.partialCheckin ? "Finish the check-in" : "Check in below"}
        </Button>
      )}

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="t-meta text-ash">{DISCLAIMER}</p>
        {!compact && g.factors.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-how`}
            onClick={() => setOpen((o) => !o)}
            className="t-meta -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 px-2 font-semibold text-stone hover:text-ivory"
          >
            How this works
            <ChevronDown className={cn("size-4 transition-[rotate] duration-(--dur-base) ease-out", open && "rotate-180")} strokeWidth={1.6} aria-hidden />
          </button>
        )}
      </div>

      {!compact && g.factors.length > 0 && (
        <Collapse open={open} id={`${id}-how`}>
          <div className="mt-2 rounded-field bg-m1 p-3.5 shadow-(--e1)">
            <table className="t-meta w-full">
              <caption className="sr-only">What the call is based on</caption>
              <thead>
                <tr className="text-left">
                  <th className="t-eyebrow pb-2">Signal</th>
                  <th className="t-eyebrow pb-2">Logged</th>
                  <th className="t-eyebrow pb-2 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {g.factors.map((f) => (
                  <tr key={f.key} className="border-t border-vein">
                    <td className="py-2 pr-2 font-semibold text-stone">{f.label}</td>
                    <td className="max-w-36 truncate py-2 pr-2 text-stone">{f.value}</td>
                    <td className={cn("t-num-s py-2 text-right", f.points ? "text-ivory" : "text-ash")}>{f.points ? `+${f.points}` : "0"}</td>
                  </tr>
                ))}
                <tr className="border-t border-vein-2">
                  <td className="pt-2 font-semibold text-ivory" colSpan={2}>
                    Total
                  </td>
                  <td className="t-num-s pt-2 text-right text-ivory">{g.score}</td>
                </tr>
              </tbody>
            </table>
            <p className="t-meta mt-3 text-ash">
              0–{THRESHOLDS.trim - 1} train as planned · {THRESHOLDS.trim}–{THRESHOLDS.ease - 1} drop a set · {THRESHOLDS.ease}–{THRESHOLDS.recover - 1} go lighter · {THRESHOLDS.recover}+ recovery
              day. Sleep counts at most 3. Leg days after volleyball skip jumps when legs are sore or tired.
            </p>
          </div>
        </Collapse>
      )}
    </>
  );
}

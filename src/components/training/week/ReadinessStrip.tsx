"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Volleyball } from "@/components/art/icons";
import { cn } from "@/lib/cn";
import { weekStart, type ISODate } from "@/lib/dates";
import { useReadiness } from "@/lib/recovery/hooks";
import { readinessChip } from "@/lib/today/now";
import { volleyballDaysLabel } from "@/lib/training/week";
import type { useTrainingWeek } from "../hooks";

type Week = ReturnType<typeof useTrainingWeek>;

const PLACARD = "relative flex min-h-18 min-w-0 flex-col justify-center rounded-card bg-m1 px-4 py-3 shadow-[inset_0_0_0_1px_var(--vein)]";

/**
 * Readiness + volleyball (§3.4.1 item 6): two placards. Readiness is the same call Now makes
 * for today's check-in ("—" and a way to check in before one). Volleyball counts this week's
 * sessions the way Recovery does (logged sessions plus the check-in switch).
 */
export function ReadinessStrip({ week, onLogVolleyball, className }: { week: Week; onLogVolleyball: () => void; className?: string }) {
  const { today } = week;
  const { guidance } = useReadiness(today);
  const plan = week.resolve(today);
  const label = readinessChip(guidance, plan.template?.key ?? null);
  const todayRec = week.recovery.find((r) => r.local_date === today);
  const at = label && todayRec?.updated_at ? new Date(todayRec.updated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
  const go = guidance?.level === "go";

  const ws = weekStart(today);
  const vbDays = week.volleyballDays.filter((v) => v.local_date >= ws && v.local_date <= today);
  const vbCount = vbDays.length;
  const vbWhen = volleyballDaysLabel(vbDays.map((v) => v.local_date as ISODate));
  const unknown = !!week.error;

  return (
    <div className={cn("grid grid-cols-2 gap-2 @max-[19rem]:grid-cols-1", className)}>
      <Link
        href={label ? "/recovery#history" : "/?dawn=1"}
        className={cn(PLACARD, "press-soft")}
        aria-label={label ? `Readiness: ${label}${at ? `, check-in ${at}` : ""}. Open the recovery history.` : "Readiness: no check-in today. Check in on Now."}
      >
        <span className="t-eyebrow">Readiness</span>
        <span className="t-title-3 mt-1.5 flex items-center gap-2 text-ivory">
          {label ? (
            <>
              <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", go ? "bg-ivory" : "bg-stone")} />
              <span className="min-w-0 truncate">{label}</span>
            </>
          ) : (
            "—"
          )}
        </span>
        <span className="t-meta mt-0.5 truncate text-stone">{label ? (at ? `Check-in ${at}` : "Today's check-in") : guidance?.partialCheckin ? "Finish the check-in on Now" : "Check in on Now"}</span>
      </Link>

      <div className={PLACARD}>
        <Link
          href="/recovery#history"
          className="press-soft min-w-0 before:absolute before:inset-0 before:rounded-card before:content-['']"
          aria-label={unknown ? "Volleyball this week: not loaded" : `Volleyball: ${vbCount} this week${vbWhen ? `, ${vbWhen}` : ""}. Open the recovery history.`}
        >
          <span className="t-eyebrow flex items-center gap-1.5">
            <Volleyball className="size-3.5" />
            Volleyball
          </span>
          <span className="t-title-3 tnum mt-1.5 block truncate text-ivory">{unknown ? "—" : `${vbCount} this week`}</span>
        </Link>
        <span className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
          <span className="t-meta min-w-0 truncate text-stone">{unknown ? "Not loaded" : vbWhen || (week.vbAdvice.heavy ? "Heavy load lately" : "None yet")}</span>
          <button type="button" onClick={onLogVolleyball} className="press hit-44 t-meta relative z-10 -my-1 inline-flex shrink-0 items-center gap-1 font-semibold text-ivory">
            <Plus className="size-4" strokeWidth={1.8} aria-hidden />
            Log
            <span className="sr-only"> volleyball</span>
          </button>
        </span>
      </div>
    </div>
  );
}

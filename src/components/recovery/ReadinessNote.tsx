"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import type { ISODate } from "@/lib/dates";
import { readinessLine } from "@/lib/recovery/guidance";
import { useReadiness } from "@/lib/recovery/hooks";

/**
 * The readiness call for the day as one ruled line, so the Training start card says exactly
 * what Now and the Recovery ledger say for the same check-in. It is a fixed rule, so it carries
 * RULE in ivory (aegean is for AI only). Without a check-in it offers one on Now, unless
 * `checkinPrompt` is off.
 */
export function ReadinessNote({ date, session, checkinPrompt = true, className }: { date: ISODate; session: string | null; checkinPrompt?: boolean; className?: string }) {
  const { guidance } = useReadiness(date);
  if (!guidance) return null;
  const line = guidance.hasCheckin ? readinessLine(guidance, session) : null;
  if (!line && (guidance.hasCheckin || !checkinPrompt)) return null;
  return (
    <Link href={line ? "/recovery" : "/?dawn=1"} className={cn("press-soft flex min-h-11 items-center gap-3 border-y border-vein py-2.5", className)}>
      <span className="t-callout min-w-0 flex-1">
        <span className="t-eyebrow mr-1.5">Readiness</span>
        {line ? (
          <span className="text-ivory">{line}</span>
        ) : (
          <span className="text-stone">{guidance.partialCheckin ? "Add sleep and legs for today's call." : "Check in for today's call. Three taps."}</span>
        )}
      </span>
      {line && <Tag kind="RULE" />}
      <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
    </Link>
  );
}

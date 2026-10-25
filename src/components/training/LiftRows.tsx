"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { StoredTemplate } from "@/lib/data/training";
import { useRecentHistory } from "@/lib/data/workout";
import { getExercise } from "@/lib/training/library";
import { suggest, type Mode } from "@/lib/training/progression";
import { modeTemplate } from "@/lib/training/volume";
import { formatLoad } from "@/lib/units";
import { liftLine, liftSpoken } from "./format";
import { useUnits } from "./hooks";

/**
 * A workout's lifts with their targets (docs/DESIGN-V3-SIMPLE.md §4.3.1 item 5, §4.3.2): one row
 * per exercise, the plan line ("4 sets · 12–20 reps · each hand"; optional lifts last with
 * "· optional"), the next-time weight from `suggest()` on the right ("—" before the first log,
 * with "First time" in the line), a chevron to the exercise detail. Follows the training mode.
 * AX layout: the weight moves under the name.
 */
export function LiftRows({ template, mode, limit, className }: { template: StoredTemplate; mode: Mode; limit?: number; className?: string }) {
  const { unit } = useUnits();
  const all = useMemo(() => {
    const m = modeTemplate(template, mode, { includeOptional: true });
    return [...m.exercises.filter((e) => !e.optional), ...m.exercises.filter((e) => e.optional)];
  }, [template, mode]);
  const shown = limit ? all.slice(0, limit) : all;
  const history = useRecentHistory(all.map((e) => e.slug));
  const loading = history.isLoading;
  return (
    <ul className={cn("@container overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line", className)}>
      {shown.map((e) => {
        const lib = getExercise(e.slug);
        const past = history.data?.[e.slug] ?? [];
        const s = suggest(e, lib, past, mode, { templateKey: template.key });
        const first = !loading && past.length === 0;
        const weight = loading ? null : s.weightLb != null ? formatLoad(s.weightLb, unit) : "—";
        const perHand = !!lib?.perHand;
        const line = liftLine(e, perHand) + (first ? " · First time" : "");
        const spokenWeight = weight && weight !== "—" ? `, ${weight.replace(/ lb$/, " pounds").replace(/ kg$/, " kilograms")}${perHand ? " each hand" : ""}` : "";
        return (
          <li key={`${e.slug}-${e.name}`}>
            <Link
              href={`/training/exercise/${encodeURIComponent(e.slug)}`}
              aria-label={`${e.name}, ${liftSpoken(e)}${spokenWeight}${first ? ", first time" : ""}`}
              className="press-soft flex min-h-[68px] items-center gap-3 px-4 py-3 ax:flex-wrap"
            >
              <span className="min-w-0 flex-1 ax:basis-[calc(100%-2rem)]">
                <span className="t-row block truncate ax:whitespace-normal" data-budget-name="">
                  {e.name}
                </span>
                <span className="t-label mt-0.5 block">{line}</span>
              </span>
              <span className={cn("t-row shrink-0 text-right tabular-nums ax:order-last ax:w-full ax:text-left", weight === "—" && "text-fg-2")}>{weight ?? <Skeleton className="h-4 w-12" />}</span>
              <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Lifts in the template as started in this mode (optional ones never start). */
export function plannedCounts(template: StoredTemplate, mode: Mode) {
  const eff = modeTemplate(template, mode);
  return { lifts: eff.exercises.length, sets: eff.exercises.reduce((n, e) => n + e.sets, 0), eff };
}

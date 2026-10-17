"use client";

import { useState, type CSSProperties } from "react";
import { ChevronDown, Moon, ShieldAlert } from "lucide-react";
import { SuggestedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapse, ErrorNote, Skeleton } from "@/components/ui/misc";
import { relativeDay, type ISODate } from "@/lib/dates";
import {
  DISCLAIMER,
  THRESHOLDS,
  type Guidance,
  type ReadinessLevel,
} from "@/lib/recovery/guidance";
import { useReadiness } from "@/lib/recovery/hooks";
import { cn } from "@/lib/cn";

const STEPS = ["Train", "Trim", "Lighter", "Rest"] as const;
const STEP_OF: Partial<Record<ReadinessLevel, number>> = {
  go: 0,
  legs: 1,
  trim: 1,
  ease: 2,
  recover: 3,
};

/**
 * Readiness guidance for a date. Lapis, labelled SUGGESTED, with its reasons and the
 * disclaimer. `compact` drops the factor breakdown for embedding on Today / Training.
 */
export function GuidanceCard({
  date,
  today,
  onCheckin,
  compact,
  className,
  style,
}: {
  date: ISODate;
  today: ISODate;
  onCheckin?: () => void;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const { guidance, plan, loading, error, refetch } = useReadiness(date);
  const when = relativeDay(date, today);

  return (
    <section
      className={cn("card relative overflow-hidden p-4 sm:p-5", className)}
      style={{ ...style, borderTopColor: "var(--lapis-line)" }}
      aria-labelledby={`guidance-${date}`}
      aria-busy={loading || undefined}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(70%_100%_at_85%_0%,rgb(111_163_236/.10),transparent_70%)]"
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <SuggestedBadge />
          <p className="eyebrow truncate">
            {when}
            {plan ? ` · ${plan.template?.name ?? "Rest day"}` : ""}
          </p>
        </div>

        {loading && !guidance ? (
          <div aria-hidden>
            <Skeleton className="mt-4 h-7 w-3/5" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-4/5" />
            <Skeleton className="mt-5 h-2 w-full" />
          </div>
        ) : error && !guidance ? (
          <ErrorNote className="mt-4" onRetry={refetch}>
            Couldn&apos;t load your recovery data.
          </ErrorNote>
        ) : guidance ? (
          <GuidanceBody
            g={guidance}
            id={`guidance-${date}`}
            onCheckin={onCheckin}
            compact={compact}
            isToday={date === today}
          />
        ) : null}
      </div>
    </section>
  );
}

function GuidanceBody({
  g,
  id,
  onCheckin,
  compact,
  isToday,
}: {
  g: Guidance;
  id: string;
  onCheckin?: () => void;
  compact?: boolean;
  isToday: boolean;
}) {
  const [open, setOpen] = useState(false);
  // after the session the Train → Rest scale described a call that has been acted on
  const step = g.session === "done" ? undefined : STEP_OF[g.level];
  const sleepExtra = isToday
    ? g.extras.find((e) => e.startsWith("Aim for"))
    : undefined;
  const pastUnknown = !isToday && g.level === "unknown" && !g.partialCheckin;

  return (
    <>
      <h2
        id={id}
        className="mt-3 font-num text-[26px] font-bold uppercase leading-[1.02] tracking-[0.01em] text-fg lg:text-[28px]"
      >
        {pastUnknown ? "No check-in this day" : g.title}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-fg-2">
        {pastUnknown
          ? "Log how you slept and felt to see what the data suggested for that session."
          : g.detail}
      </p>

      {step != null && (
        <div
          className="mt-4"
          role="img"
          aria-label={`Readiness: ${STEPS[step]}. ${g.score} strain points.`}
        >
          <div className="grid grid-cols-4 gap-1">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1.5 rounded-full",
                  i === step ? "bg-lapis" : "bg-white/[.07]",
                )}
              />
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-1 text-[10.5px] font-bold uppercase tracking-[0.08em]">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  i === step ? "text-lapis-text" : "text-fg-3",
                  i === 3 && "text-right",
                  (i === 1 || i === 2) && "text-center",
                )}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {g.reasons.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Why">
          {g.reasons.map((r) => (
            <li
              key={r}
              className="inline-flex h-8 items-center rounded-full border border-line bg-s2 px-3 text-[12.5px] font-semibold text-fg-2"
            >
              {r}
            </li>
          ))}
        </ul>
      )}

      {(sleepExtra || g.pain) && (
        <ul className="mt-3 space-y-1.5 text-[13px] text-fg-2">
          {sleepExtra && (
            <li className="flex items-center gap-2">
              <Moon className="size-4 shrink-0 text-lapis-text" aria-hidden />
              {sleepExtra}
            </li>
          )}
          {g.pain && (
            <li className="flex items-start gap-2">
              <ShieldAlert
                className="mt-0.5 size-4 shrink-0 text-danger"
                aria-hidden
              />
              <span>
                Work around the sore area and skip anything that hurts.
              </span>
            </li>
          )}
        </ul>
      )}

      {!g.hasCheckin && onCheckin && isToday && (
        <Button variant="secondary" block className="mt-4" onClick={onCheckin}>
          {g.partialCheckin ? "Finish check-in" : "Start check-in"}
        </Button>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium text-fg-3">{DISCLAIMER}</p>
        {!compact && g.factors.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="guidance-how"
            onClick={() => setOpen((o) => !o)}
            className="-my-2 -mr-2 inline-flex h-11 shrink-0 items-center gap-1 px-2 text-[12px] font-bold text-fg-2 hover:text-fg"
          >
            How this works
            <ChevronDown
              className={cn(
                "size-4 transition-[rotate] duration-(--dur-base) ease-out",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        )}
      </div>

      {!compact && g.factors.length > 0 && (
        <Collapse open={open} id="guidance-how">
          <div className="card-inset mt-2 p-3.5">
            <table className="w-full text-[13px]">
              <caption className="sr-only">
                What the suggestion is based on
              </caption>
              <thead>
                <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-fg-3">
                  <th className="pb-2 font-bold">Signal</th>
                  <th className="pb-2 font-bold">Logged</th>
                  <th className="pb-2 text-right font-bold">Points</th>
                </tr>
              </thead>
              <tbody>
                {g.factors.map((f) => (
                  <tr key={f.key} className="border-t border-line-hair">
                    <td className="py-2 pr-2 font-semibold text-fg-2">
                      {f.label}
                    </td>
                    <td className="max-w-[9rem] truncate py-2 pr-2 text-fg-2">
                      {f.value}
                    </td>
                    <td
                      className={cn(
                        "num py-2 text-right text-[15px]",
                        f.points ? "text-lapis-text" : "text-fg-3",
                      )}
                    >
                      {f.points ? `+${f.points}` : "0"}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <td className="pt-2 font-bold text-fg" colSpan={2}>
                    Total
                  </td>
                  <td className="num pt-2 text-right text-[15px] text-fg">
                    {g.score}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-[12px] leading-relaxed text-fg-3">
              0–{THRESHOLDS.trim - 1} train as planned · {THRESHOLDS.trim}–
              {THRESHOLDS.ease - 1} drop a set · {THRESHOLDS.ease}–
              {THRESHOLDS.recover - 1} go lighter · {THRESHOLDS.recover}+
              recovery day. Sleep counts at most 3. Leg days after volleyball
              skip jumps when legs are sore or tired.
            </p>
          </div>
        </Collapse>
      )}
    </>
  );
}

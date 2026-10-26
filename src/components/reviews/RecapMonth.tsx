"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { unitsOf } from "@/components/progress/kit";
import { BackHeader } from "@/components/shell/BackHeader";
import { DetailsSheet } from "@/components/ui/details-sheet";
import { Collapse, Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { StatCard, StatRow } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { longDate, monthEnd, monthName, type ISODate } from "@/lib/dates";
import { dayMonth } from "@/lib/progress/pace";
import { chronicleStamp } from "@/lib/reviews/chronicle";
import { computePriorities, computeReview } from "@/lib/reviews/compute";
import { useReviewSource, useSavedReviews } from "@/lib/reviews/hooks";
import { formatBodyweight, formatDelta, formatInt, formatLiters, formatLoad, round, toDisplayWeight } from "@/lib/units";
import { AiSummary } from "./AiSummary";
import { stableStringify } from "./kit";

/**
 * A month (`/reviews/[month]`, docs/DESIGN-V3-SIMPLE.md §4.5.6): BackHeader "Monthly recap" with
 * a download button (Print or save → `?view=ledger`), the month as the title, the weight change
 * of the 7-day average as the hero, a trio (workouts, protein days, new bests) and five rows that
 * open in place: Weight, Training, Food, Sleep and check-ins, Next month (one change to try and
 * the optional AI summary, labelled). Every number is lib/reviews/compute's. Retired sports logging is not shown
 * (its rows stay in the export).
 */
export function RecapMonth({ month }: { month: ISODate }) {
  const today = useToday();
  const src = useReviewSource(month, monthEnd(month));
  const saved = useSavedReviews();
  const { wu } = unitsOf(src.profile);
  const stats = useMemo(() => (src.rows && src.reviewProfile ? computeReview({ month, today, profile: src.reviewProfile, rows: src.rows }) : null), [src.rows, src.reviewProfile, month, today]);
  const priorities = useMemo(() => (stats ? computePriorities(stats, wu) : []), [stats, wu]);
  const savedRow = saved.data?.find((r) => r.month === month) ?? null;
  const stale = !!savedRow && !!stats && stableStringify(savedRow.stats) !== stableStringify(stats);
  const [details, setDetails] = useState<"weight" | "numbers" | null>(null);

  const title = `${monthName(month)}${month.slice(0, 4) !== today.slice(0, 4) ? ` ${month.slice(0, 4)}` : ""}`;
  const ledger = `/reviews/${month.slice(0, 7)}?view=ledger`;
  const header = (
    <BackHeader
      href="/reviews"
      parent="Monthly recap"
      title={title}
      right={
        <Link href={ledger} aria-label="Print or save" className="press grid size-11 place-items-center rounded-full bg-control text-fg">
          <Download className="size-5" strokeWidth={1.9} aria-hidden />
        </Link>
      }
    />
  );

  if (src.error) return <div>{header}<ErrorNote className="mt-5" onRetry={src.refetch} /></div>;
  if (!stats || !src.profile) return <RecapSkeleton header={header} />;
  if (stats.window.outOfRange) {
    const before = stats.window.outOfRange === "before";
    return (
      <div>
        <BackHeader href="/reviews" parent="Monthly recap" title={title} />
        <Empty className="mt-5" title={before ? "Before you started" : "This month hasn't started"}>
          {before ? `Your plan starts ${longDate(src.profile.start_date)}. Recaps begin that month.` : `${monthName(month)} starts ${longDate(month)}. Its recap builds as you log.`}
        </Empty>
      </div>
    );
  }

  const p = stats.physical;
  const t = stats.training;
  const n = stats.nutrition;
  const r = stats.recovery;
  const w = (lb: number | null) => (lb == null ? "—" : formatBodyweight(lb, wu));
  const change = p.change != null ? formatDelta(p.change, wu).replace(` ${wu}`, "") : null;
  const pace = paceWord(p.change, p.plannedChange);
  const heroLine =
    p.monthStartAvg != null && p.monthEndAvg != null && p.change != null
      ? `${w(p.monthStartAvg).replace(` ${wu}`, "")} → ${w(p.monthEndAvg)}.${pace ? ` ${pace.sentence}` : ""}`
      : p.weighIns
        ? "Needs weigh-ins a week apart to show a change."
        : "No weigh-ins this month. Log one on Progress.";
  const workouts = t.planned ? { value: `${t.plannedDone}`, of: `of ${t.planned}` } : { value: t.sessions ? String(t.sessions) : "—", of: "" };
  const best = priorities[0] ?? null;

  return (
    <div>
      {header}
      {!stats.window.complete && <p className="t-label mt-1">So far · {chronicleStamp(month)}</p>}

      {/* the hero */}
      <button type="button" onClick={() => setDetails("weight")} className="press-soft mt-4 block w-full rounded-card bg-surface px-6 py-[22px] text-left" aria-describedby="recap-hero-hint">
        <span className="t-cap block">Weight change · 7-day average</span>
        <span className="mt-1.5 flex items-center gap-1">
          <span className="t-hero" data-derived="">
            {change ?? "—"}
            {change != null && <span className="unit">{wu}</span>}
          </span>
          <ChevronRight className="size-4 shrink-0 text-fg-3" strokeWidth={2.2} aria-hidden />
        </span>
        <span className="t-label mt-2 block">{heroLine}</span>
        <span id="recap-hero-hint" className="sr-only">
          Shows how it is worked out.
        </span>
      </button>

      {/* the trio */}
      <StatRow cols={3} className="mt-3">
        <StatCard value={workouts.value} unit={workouts.of || undefined} label="Workouts" onDetails={() => setDetails("numbers")} ariaLabel={`${workouts.value} ${workouts.of} workouts`} />
        <StatCard
          value={n.daysLogged ? String(n.proteinHitDays) : "—"}
          unit={n.daysLogged ? `of ${stats.window.days}` : undefined}
          label="Protein days"
          onDetails={() => setDetails("numbers")}
          ariaLabel={n.daysLogged ? `Protein goal hit on ${n.proteinHitDays} of ${stats.window.days} days` : "Protein days: no food logged"}
        />
        <StatCard value={String(t.prs.items.length)} label="New bests" onDetails={() => setDetails("numbers")} ariaLabel={`${t.prs.items.length} new bests`} />
      </StatRow>

      {/* the rows */}
      <div className="mt-3 overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
        <Expand title="Weight" subtitle={p.change != null ? `${round(toDisplayWeight(p.change, wu), 1) === 0 ? "No change" : `${p.change > 0 ? "Up" : "Down"} ${formatDelta(Math.abs(p.change), wu).replace("+", "")}`}${pace ? `, ${pace.word}` : ""}` : "Not enough weigh-ins"}>
          <Lines
            rows={[
              ["Start of month", w(p.monthStartAvg), p.monthStartDate ? `7-day average to ${dayMonth(p.monthStartDate, today)}` : null],
              [stats.window.complete ? "End of month" : "Now", w(p.monthEndAvg), p.monthEndDate ? `7-day average to ${dayMonth(p.monthEndDate, today)}` : null],
              ["Weigh-ins", p.weighIns ? String(p.weighIns) : "—", null],
              ["Since you started", p.fromStart != null ? formatDelta(p.fromStart, wu) : "—", null],
              ["To your goal", p.toGoal != null ? (p.toGoal > 0 ? formatBodyweight(p.toGoal, wu) : "Reached") : "—", null],
              ["Photos", p.photos.count ? String(p.photos.count) : "—", null],
              ["Measured", p.measurements.updatedThisMonth && p.measurements.date ? dayMonth(p.measurements.date, today) : "Not this month", null],
            ]}
          />
        </Expand>
        <Expand title="Training" subtitle={t.sessions ? `${t.sessions} ${t.sessions === 1 ? "workout" : "workouts"}, ${formatInt(t.workingSets)} sets` : "No workouts"}>
          <Lines
            rows={[
              ["Planned workouts done", t.planned ? `${t.plannedDone} of ${t.planned}` : "—", null],
              ["Sets", t.workingSets ? formatInt(t.workingSets) : "—", null],
              ["Total lifted", t.volumeLb ? `${formatInt(toDisplayWeight(t.volumeLb, wu))} ${wu}` : "—", null],
              ["Average workout", t.avgSessionMin ? `${t.avgSessionMin} min` : "—", null],
              ...t.prs.items.slice(0, 8).map((b): [string, string, string | null] => [b.name, b.weight != null && b.reps != null ? `${formatLoad(b.weight, wu)} × ${b.reps}` : "New best", dayMonth(b.date, today)]),
            ]}
            history
          />
        </Expand>
        <Expand title="Food" subtitle={n.avgCalories != null ? `${formatInt(n.avgCalories)} kcal and ${n.avgProtein} g protein a day` : "Nothing logged"}>
          <Lines
            rows={[
              ["Days logged", `${n.daysLogged} of ${n.daysInWindow}`, null],
              ["Calories", n.avgCalories != null ? `${formatInt(n.avgCalories)} kcal` : "—", `Goal ${formatInt(n.calorieTarget)} kcal · hit ${n.calorieHitDays} days`],
              ["Protein", n.avgProtein != null ? `${n.avgProtein} g` : "—", `Goal ${n.proteinTarget} g · hit ${n.proteinHitDays} days`],
              ["Carbs and fat", n.avgCarbs != null ? `${n.avgCarbs} g · ${n.avgFat} g` : "—", null],
              ["Water", n.waterAvgMl != null ? formatLiters(n.waterAvgMl) : "—", n.waterDays ? `Goal reached ${n.waterGoalDays} of ${n.waterDays} days` : null],
            ]}
          />
        </Expand>
        <Expand title="Sleep and check-ins" subtitle={r.avgSleep != null ? `${hoursText(r.avgSleep)} a night` : "No sleep logged"}>
          <Lines
            rows={[
              ["Sleep", r.avgSleep != null ? hoursText(r.avgSleep) : "—", r.sleepNights ? `Goal ${r.sleepGoal} h met ${r.nightsAtGoal} of ${r.sleepNights} nights` : null],
              ["Check-ins", `${r.checkIns} of ${stats.window.days}`, null],
              ["Energy", r.avgEnergy != null ? `${r.avgEnergy.toFixed(1)} of 5` : "—", null],
              ["Soreness", r.avgSoreness != null ? `${r.avgSoreness.toFixed(1)} of 5` : "—", null],
              ["Pain notes", r.painDays ? `${r.painDays} ${r.painDays === 1 ? "day" : "days"}` : "None", null],
            ]}
          />
        </Expand>
        <Expand title="Next month" subtitle={best ? "One change to try" : "Nothing to change yet"}>
          <div className="grid gap-4 px-4 pb-4">
            {best ? (
              <div>
                <p className="t-row">{best.title}</p>
                <p className="t-label mt-1">{best.detail}</p>
                {best.action && (
                  <Link href={best.action.href} className="press t-label mt-1 inline-flex h-11 items-center gap-0.5 font-semibold text-fg">
                    {best.action.label}
                    <ChevronRight className="size-4" strokeWidth={2.2} aria-hidden />
                  </Link>
                )}
                <p className="t-cap mt-1">From your logged numbers. Nothing changes until you change it.</p>
              </div>
            ) : (
              <p className="t-label">Log weigh-ins, food and workouts for two weeks and a change to try shows here.</p>
            )}
            <AiSummary stats={stats} priorities={priorities} savedRow={savedRow} stale={stale} unit={wu} />
          </div>
        </Expand>
      </div>

      <DetailsSheet
        open={details === "weight"}
        onOpenChange={(o) => setDetails(o ? "weight" : null)}
        title="Weight change"
        rows={[
          { label: "Start of month", value: w(p.monthStartAvg), detail: p.monthStartDate ? `7-day average to ${dayMonth(p.monthStartDate, today)}` : undefined },
          { label: stats.window.complete ? "End of month" : "Now", value: w(p.monthEndAvg), detail: p.monthEndDate ? `7-day average to ${dayMonth(p.monthEndDate, today)}` : undefined },
          { label: "Plan for the month", value: p.plannedChange != null ? formatDelta(p.plannedChange, wu) : "—" },
        ]}
        how={`The change is the 7-day average of your weigh-ins at the end of the month minus the one at its start (${p.weighIns} ${p.weighIns === 1 ? "weigh-in" : "weigh-ins"} this month). The plan is a straight line from your start weight to your goal by your target date.${p.earlyWater ? " This month includes your first two weeks, when water and glycogen move the scale most." : ""}`}
      />
      <DetailsSheet
        open={details === "numbers"}
        onOpenChange={(o) => setDetails(o ? "numbers" : null)}
        title="The month in numbers"
        rows={[
          { label: "Workouts", value: t.planned ? `${t.plannedDone} of ${t.planned}` : String(t.sessions), detail: t.extraSessions ? `Plus ${t.extraSessions} not on a planned day` : undefined },
          { label: "Protein days", value: n.daysLogged ? `${n.proteinHitDays} of ${stats.window.days}` : "—", detail: `Days at ${n.proteinTarget} g or more` },
          { label: "New bests", value: String(t.prs.items.length) },
        ]}
        how="Workouts counts the planned training days you finished a workout on. Protein days counts days whose logged food reached your protein goal. A new best is a set that beats every earlier set of that lift."
      />
    </div>
  );
}

/** "Right in your range" when the month's change is within half to 1.6 times the plan's. */
function paceWord(change: number | null, planned: number | null): { word: string; sentence: string } | null {
  if (change == null || planned == null || planned <= 0) return null;
  if (change < planned * 0.5) return { word: "a bit slow", sentence: "A bit slow for your goal." };
  if (change > planned * 1.6) return { word: "a bit fast", sentence: "A bit fast for your goal." };
  return { word: "on track", sentence: "Right in your range." };
}

/** 7.08 → "7 h 05". */
function hoursText(h: number) {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

function Expand({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} className="press-soft flex min-h-[68px] w-full items-center gap-3.5 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="t-row block">{title}</span>
          <span className="t-label mt-0.5 block">{subtitle}</span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-fg-3 transition-transform duration-(--dur-fast)", open && "rotate-180")} strokeWidth={1.9} aria-hidden />
      </button>
      <Collapse open={open} id={id}>
        {children}
      </Collapse>
    </div>
  );
}

function Lines({ rows, history }: { rows: [string, string, string | null][]; history?: boolean }) {
  return (
    <dl className="mx-4 mb-3 overflow-hidden rounded-tile bg-control [&>*+*]:border-t [&>*+*]:border-line">
      {rows.map(([k, v, d], i) => (
        <div key={i} className="flex min-h-12 items-center gap-3 px-3.5 py-2.5">
          <dt className="min-w-0 flex-1">
            <span className="t-label block text-fg" data-history={history && i >= 4 ? "" : undefined} data-budget-name={history && i >= 4 ? "" : undefined}>
              {k}
            </span>
            {d && <span className="t-cap block">{d}</span>}
          </dt>
          <dd className="t-label shrink-0 text-right tabular-nums text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function RecapSkeleton({ header }: { header: ReactNode }) {
  return (
    <div aria-busy="true" aria-label="Loading the recap">
      {header}
      <Skeleton className="mt-4 h-40 w-full rounded-card" />
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-tile-lg" />
        ))}
      </div>
      <Skeleton className="mt-3 h-80 w-full rounded-tile-lg" />
    </div>
  );
}


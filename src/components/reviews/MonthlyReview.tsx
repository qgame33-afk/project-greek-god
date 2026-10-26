"use client";

import Link from "next/link";
import { Archive, CircleCheck, Download, Printer, RotateCcw, Trash } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { BackHeader } from "@/components/shell/BackHeader";
import { unitsOf } from "@/components/progress/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Confirm, Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { addMonths, longDate, monthEnd, monthLabel, monthName, shortDate } from "@/lib/dates";
import { computePriorities, computeReview, headline, monthWeightSeries, parseMonthParam, type Priority, type ReviewStats } from "@/lib/reviews/compute";
import { useReviewSource, useSaveReview, useSavedReviews, type SavedReview } from "@/lib/reviews/hooks";
import { formatDelta, type WeightUnit } from "@/lib/units";
import { AiSummary } from "./AiSummary";
import { LedgerHead, PriorityCard, rangeLabel, stableStringify, useDelayed } from "./kit";
import { PrintStyles } from "./PrintStyles";
import { NutritionCard, PhysicalCard, RecoveryCard, TrainingCard } from "./sections";

export function MonthlyReview({ monthParam }: { monthParam: string }) {
  const today = useToday();
  const month = parseMonthParam(monthParam);
  const from = month ?? today;
  const to = month ? monthEnd(month) : today;
  const src = useReviewSource(from, to);
  const saved = useSavedReviews();
  const { wu: unit, lu: lengthUnit } = unitsOf(src.profile);

  const stats = useMemo(
    () =>
      month && src.rows && src.reviewProfile
        ? computeReview({
            month,
            today,
            profile: src.reviewProfile,
            rows: src.rows,
          })
        : null,
    [month, today, src.rows, src.reviewProfile],
  );
  const priorities = useMemo(() => (stats ? computePriorities(stats, unit) : []), [stats, unit]);
  const series = useMemo(() => (stats && src.rows && src.reviewProfile ? monthWeightSeries(src.rows.weights, stats.window, src.reviewProfile) : null), [stats, src.rows, src.reviewProfile]);
  const savedRow = month ? (saved.data?.find((r) => r.month === month) ?? null) : null;
  // a snapshot is "stale" once the live numbers no longer match what was saved
  const stale = !!savedRow && !!stats && stableStringify(savedRow.stats) !== stableStringify(stats);

  if (!month) {
    return (
      <Shell>
        <Empty title="That isn't a month" action={<BackButton />}>
          Recaps live at addresses like /reviews/2026-10.
        </Empty>
      </Shell>
    );
  }
  if (src.error) {
    return (
      <Shell>
        <ErrorNote onRetry={src.refetch}>Couldn&apos;t load this month&apos;s logs. {src.error.message}</ErrorNote>
      </Shell>
    );
  }
  if (!stats || !src.profile) return <ReviewSkeleton />;

  if (stats.window.outOfRange) {
    const before = stats.window.outOfRange === "before";
    return (
      <Shell>
        <Empty title={before ? "Before you started" : "This month hasn't started"} action={<BackButton />}>
          {before ? `Your plan starts ${longDate(src.profile.start_date)}. Recaps begin that month.` : `${monthLabel(month)} starts ${longDate(month)}. Its recap builds as you log.`}
        </Empty>
      </Shell>
    );
  }

  return (
    <div id="pgg-review" className="mx-auto max-w-wide">
      <PrintStyles />
      <TopRow stats={stats} priorities={priorities} savedRow={savedRow} stale={stale} unit={unit} />
      <Monument stats={stats} unit={unit} />

      {/* one column on phones in reading order; two balanced columns on desktop so no card
          is stretched to match its neighbour */}
      <div className="review-sections mt-10 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-2 lg:items-start lg:gap-x-10">
        <div className="contents lg:flex lg:flex-col lg:gap-12">
          <PhysicalCard s={stats} unit={unit} lengthUnit={lengthUnit} series={series} />
          <NutritionCard s={stats} />
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-12">
          <TrainingCard s={stats} unit={unit} />
          <RecoveryCard s={stats} />
        </div>
      </div>

      <Priorities stats={stats} priorities={priorities} />

      <div className="review-grid mt-12 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-x-10">
        <SummaryCard stats={stats} priorities={priorities} savedRow={savedRow} stale={stale} unit={unit} />
        <ArchiveCard stats={stats} priorities={priorities} savedRow={savedRow} stale={stale} unit={unit} savedLoading={saved.isLoading} />
      </div>

      <p className="mt-6 hidden t-cap text-fg-2" data-print="only">
        Project Greek God · {stats.label} review · generated {longDate(today)} from logged data only. Suggestions are not applied automatically.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ shell */

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-col">
      <BackHeader href="/reviews" parent="Monthly recap" className="mb-4" />
      {children}
    </div>
  );
}

function BackButton() {
  return (
    <Button asChild variant="secondary">
      <Link href="/reviews">Monthly recap</Link>
    </Button>
  );
}

/** The printable page's header: back to the month, Saved, and the export sheet. */
function TopRow({ stats, priorities, savedRow, stale, unit }: { stats: ReviewStats; priorities: Priority[]; savedRow: SavedReview | null; stale: boolean; unit: WeightUnit }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-print="hide">
      <BackHeader
        href={`/reviews/${stats.month.slice(0, 7)}`}
        parent={monthName(stats.month)}
        right={
          <div className="flex items-center gap-2">
            {savedRow && (
              <span className="t-label inline-flex h-9 items-center gap-1.5 rounded-pill bg-control px-3 font-semibold text-fg">
                <CircleCheck className="size-4" strokeWidth={1.9} aria-hidden />
                Saved
              </span>
            )}
            <button type="button" aria-label="Print or save" onClick={() => setOpen(true)} className="press grid size-11 place-items-center rounded-full bg-control text-fg">
              <Download className="size-5" strokeWidth={1.9} aria-hidden />
            </button>
          </div>
        }
      />
      <Sheet open={open} onOpenChange={setOpen} title="Print or save" description={`${stats.label} · from your logs`}>
        <ExportActions stats={stats} priorities={priorities} savedRow={savedRow} stale={stale} unit={unit} onDone={() => setOpen(false)} />
      </Sheet>
    </div>
  );
}

/* --------------------------------------------------------------- the month */

function Monument({ stats, unit }: { stats: ReviewStats; unit: WeightUnit }) {
  const w = stats.window;
  const p = stats.physical;
  const t = stats.training;
  const status = w.complete ? `Complete · ${rangeLabel(w.from, w.to)} · ${w.days} days` : `So far · ${rangeLabel(w.from, w.to)} · ready ${shortDate(addMonths(stats.month, 1), w.to)}`;
  return (
    <section className="rounded-card bg-surface p-5">
      <p className="t-cap">
        Month {Math.max(1, w.monthIndex)} of {w.monthsTotal}
      </p>
      <h1 className="t-title mt-1.5">{stats.label}</h1>
      {stats.milestone && <p className="t-label mt-1.5">{stats.milestone.title}</p>}
      <p className="t-cap mt-1.5">{status}</p>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-line pt-5 sm:grid-cols-4">
        <HeroStat label="Weight change" caption={p.plannedChange != null && p.change != null ? `Plan ${formatDelta(p.plannedChange, unit)}` : p.weighIns ? "Needs weigh-ins a week apart" : "No weigh-ins"}>
          {p.change == null ? <Dash /> : formatDelta(p.change, unit).replace(` ${unit}`, "")}
          {p.change != null && <span className="unit">{unit}</span>}
        </HeroStat>
        <HeroStat label="Workouts" caption={t.planned ? `of ${t.planned} planned` : "None planned"}>
          {t.sessions || t.planned ? t.sessions : <Dash />}
        </HeroStat>
        <HeroStat label="Protein" caption={stats.nutrition.daysLogged ? `a day · goal ${stats.nutrition.proteinTarget} g` : "Not logged"}>
          {stats.nutrition.avgProtein == null ? <Dash /> : stats.nutrition.avgProtein}
          {stats.nutrition.avgProtein != null && <span className="unit">g</span>}
        </HeroStat>
        <HeroStat label="Sleep" caption={stats.recovery.sleepNights ? `a night · goal ${stats.recovery.sleepGoal} h` : "Not logged"}>
          {stats.recovery.avgSleep == null ? <Dash /> : stats.recovery.avgSleep.toFixed(1)}
          {stats.recovery.avgSleep != null && <span className="unit">h</span>}
        </HeroStat>
      </dl>
      <span className="sr-only">{headline(stats, unit).join(", ")}</span>
    </section>
  );
}

function Dash() {
  return <span className="text-fg-2">—</span>;
}

function HeroStat({ label, caption, children }: { label: string; caption: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="t-cap">{label}</dt>
      <dd className="t-num-s mt-1.5 whitespace-nowrap tabular-nums">{children}</dd>
      <dd className="t-cap mt-1 line-clamp-2">{caption}</dd>
    </div>
  );
}

/* ------------------------------------------------------------- priorities */

function Priorities({ stats, priorities }: { stats: ReviewStats; priorities: Priority[] }) {
  const next = monthName(addMonths(stats.month, 1));
  return (
    <section className="mt-10" aria-labelledby="priorities-title">
      <div className="mb-4 border-b border-line pb-3">
        <h2 id="priorities-title" className="t-section">
          To try in {next}
        </h2>
        <p className="t-cap mt-1.5">From your logged numbers. Suggestions only: nothing changes until you change it.</p>
      </div>
      {priorities.length === 0 ? (
        <Empty title="Not enough data yet">Log weigh-ins, food and workouts for two weeks and changes to try show here.</Empty>
      ) : (
        <div className={`review-priorities grid grid-cols-[minmax(0,1fr)] gap-3 lg:gap-4 ${priorities.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {priorities.map((p) => (
            <PriorityCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- AI summary */

function SummaryCard(props: { stats: ReviewStats; priorities: Priority[]; savedRow: SavedReview | null; stale: boolean; unit: WeightUnit }) {
  return (
    <section className="review-card min-w-0" data-print={props.savedRow?.summary ? undefined : "hide"}>
      <LedgerHead title="Summary · optional" />
      <AiSummary {...props} />
    </section>
  );
}

const savedAtLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/* --------------------------------------------------------- archive/export */

function ArchiveCard({
  stats,
  priorities,
  savedRow,
  stale,
  unit,
  savedLoading,
}: {
  stats: ReviewStats;
  priorities: Priority[];
  savedRow: SavedReview | null;
  stale: boolean;
  unit: WeightUnit;
  savedLoading: boolean;
}) {
  const { save, remove } = useSaveReview();
  const [confirm, setConfirm] = useState(false);
  const optimistic = savedRow?.id === "optimistic";
  const doSave = () => {
    if (save.isPending || optimistic) return;
    save.mutate({
      month: stats.month,
      stats,
      priorities,
      summary: savedRow?.summary ?? null,
      toast: savedRow ? `${stats.label} snapshot updated` : undefined,
    });
  };
  return (
    <section className="review-card min-w-0" data-print="hide">
      <LedgerHead title="Keep and export" />
      {savedLoading ? (
        <Skeleton className="h-24" />
      ) : savedRow ? (
        <div className="flex items-start gap-3">
          <CircleCheck className={cn("mt-0.5 size-5 shrink-0", stale ? "text-fg-2" : "text-fg")} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="t-label font-semibold text-fg">{stale ? "Snapshot out of date" : "Snapshot saved"}</p>
            <p className="mt-0.5 t-cap leading-snug text-fg-2">
              {optimistic ? "Saving…" : `Saved ${savedAtLabel(savedRow.generated_at)}`}
              {stale && !optimistic && ". Your logs changed since; update it to keep today's numbers."}
            </p>
          </div>
        </div>
      ) : (
        <p className="t-label leading-relaxed text-fg-2">Save keeps this month&apos;s numbers and priorities exactly as they are now, even if you edit older logs later.</p>
      )}

      <div className="mt-4 grid gap-2">
        {!savedRow ? (
          <Button variant="primary" block onClick={doSave} loading={save.isPending} disabled={savedLoading}>
            <Archive className="size-[18px]" aria-hidden />
            Save this recap
          </Button>
        ) : (
          stale && (
            <Button variant="secondary" block onClick={doSave} loading={save.isPending} disabled={optimistic}>
              <RotateCcw className="size-4" aria-hidden />
              Update snapshot
            </Button>
          )
        )}
        <ExportActions stats={stats} priorities={priorities} savedRow={savedRow} stale={stale} unit={unit} compact />
        {savedRow && (
          <Button variant="ghost" size="md" className="justify-start px-1 text-fg-2" onClick={() => setConfirm(true)} disabled={optimistic || remove.isPending}>
            <Trash className="size-4" aria-hidden />
            Remove snapshot
          </Button>
        )}
      </div>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Remove this snapshot?"
        body={`The live review stays, rebuilt from your logs.${savedRow?.summary ? " Its AI summary goes with it." : ""} You can undo for a few seconds.`}
        confirmLabel="Remove"
        onConfirm={() => savedRow && remove.mutate(savedRow)}
      />
    </section>
  );
}

function ExportActions({
  stats,
  priorities,
  savedRow,
  stale,
  unit,
  compact,
  onDone,
}: {
  stats: ReviewStats;
  priorities: Priority[];
  savedRow: SavedReview | null;
  stale: boolean;
  unit: WeightUnit;
  compact?: boolean;
  onDone?: () => void;
}) {
  const print = () => {
    onDone?.();
    // let the sheet close before the print dialog snapshots the page
    window.setTimeout(() => window.print(), onDone ? 350 : 0);
  };
  const download = () => {
    const exportedAt = new Date().toISOString();
    const plain = (ps: Priority[]) =>
      ps.map((p) => ({
        id: p.id,
        area: p.area,
        title: p.title,
        detail: p.detail,
        evidence: p.evidence,
        action: p.action ?? null,
      }));
    // live numbers and the saved snapshot are kept apart, each labelled with when it was built
    const data = {
      app: "Project Greek God",
      kind: "monthly-review",
      month: stats.month.slice(0, 7),
      exportedAt,
      units: {
        weight: "lb (stored)",
        display: unit,
        length: "in (stored)",
        water: "mL",
      },
      live: {
        builtAt: exportedAt,
        note: "Rebuilt from your logs at export time.",
        stats,
        priorities: plain(priorities),
      },
      snapshot: savedRow
        ? {
            savedAt: savedRow.generated_at,
            matchesLive: !stale,
            note: stale ? "Saved earlier; your logs changed since, so these numbers differ from live." : "Saved snapshot; identical to the live numbers.",
            stats: savedRow.stats,
            priorities: Array.isArray(savedRow.priorities) ? plain(savedRow.priorities as unknown as Priority[]) : savedRow.priorities,
            summary: savedRow.summary,
          }
        : null,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `greek-god-review-${stats.month.slice(0, 7)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onDone?.();
  };
  return (
    <div className={compact ? "grid grid-cols-2 gap-2" : "grid gap-2 pb-2"}>
      <Button variant="secondary" block onClick={print}>
        <Printer className="size-4" aria-hidden />
        Save as PDF
      </Button>
      <Button variant="secondary" block onClick={download}>
        <Download className="size-4" aria-hidden />
        {compact ? "Data (JSON)" : "Download data (JSON)"}
      </Button>
      {!compact && (
        <p className="mt-1 t-cap leading-relaxed text-fg-2">
          The PDF shows the numbers on screen; choose Save as PDF in the print dialog (on iPhone, Share from the print preview). The data file holds the live numbers
          {savedRow ? " and your saved snapshot" : ""}.
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- skeleton */

export function ReviewSkeleton() {
  const show = useDelayed(150);
  if (!show) return <div className="min-h-[60vh]" aria-busy />;
  return (
    <div className="mx-auto max-w-wide" aria-busy aria-label="Loading review">
      <Skeleton className="mb-3 h-11 w-28" />
      <div className="rounded-card bg-surface p-5">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="mt-4 h-8 w-64" />
        <Skeleton className="mt-3 h-3 w-36" />
        <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 lg:mt-4 lg:grid-cols-2 lg:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-t border-line pt-4">
            <Skeleton className="h-3 w-24" />
            <div className="mt-5 grid grid-cols-2 gap-5">
              {[0, 1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-12" />
              ))}
            </div>
            <Skeleton className="mt-6 h-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

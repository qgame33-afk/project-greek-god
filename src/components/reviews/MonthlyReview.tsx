"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Archive, ChevronLeft, CircleCheck, Download, Printer, RotateCcw, Trash } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { EmptyArt, Laurel } from "@/components/art/Motifs";
import { SuggestedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { CountUp, Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Confirm, Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { addMonths, longDate, monthEnd, monthLabel, shortDate } from "@/lib/dates";
import { aiDigest, computePriorities, computeReview, headline, parseMonthParam, type Priority, type ReviewStats } from "@/lib/reviews/compute";
import { useAISummary, useReviewSource, useSaveReview, useSavedReviews, type SavedReview } from "@/lib/reviews/hooks";
import { formatDelta, type LengthUnit, type WeightUnit } from "@/lib/units";
import { PriorityCard, rangeLabel, stableStringify, useDelayed } from "./kit";
import { PrintStyles } from "./PrintStyles";
import { NutritionCard, PhysicalCard, RecoveryCard, TrainingCard } from "./sections";

export function MonthlyReview({ monthParam }: { monthParam: string }) {
  const today = useToday();
  const month = parseMonthParam(monthParam);
  const from = month ?? today;
  const to = month ? monthEnd(month) : today;
  const src = useReviewSource(from, to);
  const saved = useSavedReviews();
  const unit = (src.profile?.weight_unit ?? "lb") as WeightUnit;
  const lengthUnit = (src.profile?.length_unit ?? "in") as LengthUnit;

  const stats = useMemo(() => (month && src.rows && src.reviewProfile ? computeReview({ month, today, profile: src.reviewProfile, rows: src.rows }) : null), [month, today, src.rows, src.reviewProfile]);
  const priorities = useMemo(() => (stats ? computePriorities(stats, unit) : []), [stats, unit]);
  const savedRow = month ? (saved.data?.find((r) => r.month === month) ?? null) : null;

  if (!month) {
    return (
      <Shell>
        <Empty art={<EmptyArt kind="laurel" size={56} />} title="That isn't a month" action={<BackButton />}>
          Reviews live at addresses like /reviews/2026-10.
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
        <Empty
          art={<EmptyArt kind={before ? "plinth" : "column"} size={56} />}
          title={before ? "Before your ascent began" : "This month hasn't started"}
          action={<BackButton />}
        >
          {before
            ? `Your programme starts ${longDate(src.profile.start_date)}. Reviews begin that month.`
            : `${monthLabel(month)} opens on ${longDate(month)}. Its review builds as you log.`}
        </Empty>
      </Shell>
    );
  }

  return (
    <div id="pgg-review" className="mx-auto max-w-[1080px]">
      <PrintStyles />
      <TopRow stats={stats} priorities={priorities} savedRow={savedRow} unit={unit} />
      <Monument stats={stats} unit={unit} />

      <div className="review-grid mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 lg:mt-4 lg:grid-cols-2 lg:gap-4">
        <PhysicalCard s={stats} unit={unit} lengthUnit={lengthUnit} />
        <TrainingCard s={stats} unit={unit} />
        <NutritionCard s={stats} />
        <RecoveryCard s={stats} />
      </div>

      <Priorities stats={stats} priorities={priorities} />

      <div className="review-grid mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 lg:mt-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-4">
        <SummaryCard stats={stats} priorities={priorities} savedRow={savedRow} unit={unit} />
        <ArchiveCard stats={stats} priorities={priorities} savedRow={savedRow} unit={unit} savedLoading={saved.isLoading} />
      </div>

      <p className="mt-6 hidden text-[11px] text-fg-3" data-print="only">
        Project Greek God · {stats.label} review · generated {longDate(today)} from logged data only. Suggestions are not applied automatically.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ shell */

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[640px]">
      <div className="mb-4">
        <BackLink />
      </div>
      {children}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/reviews" data-print="hide" className="-ml-2 inline-flex h-11 items-center gap-1 rounded-[12px] px-2 text-[14px] font-semibold text-fg-2 hover:text-fg">
      <ChevronLeft className="size-5" aria-hidden />
      Reviews
    </Link>
  );
}

function BackButton() {
  return (
    <Button asChild variant="secondary">
      <Link href="/reviews">All reviews</Link>
    </Button>
  );
}

function TopRow({ stats, priorities, savedRow, unit }: { stats: ReviewStats; priorities: Priority[]; savedRow: SavedReview | null; unit: WeightUnit }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 flex items-center justify-between gap-2 lg:mb-4" data-print="hide">
      <BackLink />
      <div className="flex items-center gap-1">
        {savedRow && (
          <span className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[12px] font-semibold text-fg-2">
            <CircleCheck className="size-3.5 text-success" aria-hidden />
            Saved
          </span>
        )}
        <Button variant="ghost" size="icon" aria-label="Export review" onClick={() => setOpen(true)}>
          <Download className="size-5" />
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title="Export review" description={`${stats.label} · built from your logs`}>
        <ExportActions stats={stats} priorities={priorities} savedRow={savedRow} unit={unit} onDone={() => setOpen(false)} />
      </Sheet>
    </div>
  );
}

/* --------------------------------------------------------------- monument */

function Monument({ stats, unit }: { stats: ReviewStats; unit: WeightUnit }) {
  const w = stats.window;
  const p = stats.physical;
  const t = stats.training;
  const status = w.complete
    ? `Complete · ${rangeLabel(w.from, w.to)} · ${w.days} days`
    : `In progress · ${rangeLabel(w.from, w.to)} · final review ${shortDate(addMonths(stats.month, 1), w.to)}`;
  return (
    <Card variant="monument" className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-6 hidden opacity-[.16] sm:block">
        <Laurel size={190} />
      </div>
      <div className="relative lg:flex lg:items-end lg:justify-between lg:gap-10">
        <div className="min-w-0">
          <p className="eyebrow text-gold-300">
            Monthly review · Month {w.monthIndex} of {w.monthsTotal}
          </p>
          <h1 className="t-hero mt-3">{stats.label}</h1>
          {stats.milestone && <p className="t-plaque mt-2.5">{stats.milestone.title}</p>}
          <p className="mt-3 text-[13px] font-medium text-fg-2">{status}</p>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-line-gold/50 pt-5 sm:grid-cols-4 lg:mt-0 lg:shrink-0 lg:gap-x-8 lg:border-0 lg:pt-0">
          <HeroStat label="Trend" caption={p.plannedChange != null && p.change != null ? `Plan ${formatDelta(p.plannedChange, unit)}` : p.weighIns ? "Needs 2 weeks" : "No weigh-ins"}>
            {p.change == null ? <Dash /> : <CountUp value={p.change} decimals={1} format={(v) => formatDelta(v, unit).replace(` ${unit}`, "")} />}
            {p.change != null && <span className="unit">{unit}</span>}
          </HeroStat>
          <HeroStat label="Workouts" caption={t.planned ? `of ${t.planned} planned` : "None planned"}>
            {t.sessions || t.planned ? <CountUp value={t.sessions} /> : <Dash />}
          </HeroStat>
          <HeroStat label="Protein" caption={stats.nutrition.daysLogged ? `avg · target ${stats.nutrition.proteinTarget}` : "Not logged"}>
            {stats.nutrition.avgProtein == null ? <Dash /> : <CountUp value={stats.nutrition.avgProtein} />}
            {stats.nutrition.avgProtein != null && <span className="unit">g</span>}
          </HeroStat>
          <HeroStat label="Sleep" caption={stats.recovery.sleepNights ? `avg · goal ${stats.recovery.sleepGoal}` : "Not logged"}>
            {stats.recovery.avgSleep == null ? <Dash /> : <CountUp value={stats.recovery.avgSleep} decimals={1} />}
            {stats.recovery.avgSleep != null && <span className="unit">h</span>}
          </HeroStat>
        </dl>
      </div>
      <span className="sr-only">{headline(stats, unit).join(", ")}</span>
    </Card>
  );
}

function Dash() {
  return <span className="text-fg-3">—</span>;
}

function HeroStat({ label, caption, children }: { label: string; caption: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="num-md mt-2 whitespace-nowrap lg:text-[34px]">{children}</dd>
      <dd className="mt-1 truncate text-[12px] font-medium text-fg-3">{caption}</dd>
    </div>
  );
}

/* ------------------------------------------------------------- priorities */

function Priorities({ stats, priorities }: { stats: ReviewStats; priorities: Priority[] }) {
  const next = monthLabel(addMonths(stats.month, 1)).split(" ")[0];
  return (
    <section className="mt-8 lg:mt-10" aria-labelledby="priorities-title">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <h2 id="priorities-title" className="eyebrow">
            Priorities for {next}
          </h2>
          <p className="mt-1.5 text-[13px] font-medium text-fg-3">From your recorded numbers. Suggestions only. Nothing changes until you confirm it.</p>
        </div>
      </div>
      {priorities.length === 0 ? (
        <Empty art={<EmptyArt kind="laurel" size={56} />} title="Not enough data for priorities yet">
          Log weigh-ins, food and sessions for two weeks and this month&apos;s priorities appear here.
        </Empty>
      ) : (
        <div className={`review-priorities grid grid-cols-[minmax(0,1fr)] gap-3 lg:gap-4 ${priorities.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {priorities.map((p, i) => (
            <PriorityCard key={p.id} p={p} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- AI summary */

function SummaryCard({ stats, priorities, savedRow, unit }: { stats: ReviewStats; priorities: Priority[]; savedRow: SavedReview | null; unit: WeightUnit }) {
  const today = useToday();
  const status = useQuery({
    queryKey: ["ai-review-status"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch("/api/ai/review");
      if (!r.ok) return { configured: false };
      return (await r.json()) as { configured: boolean };
    },
  });
  const ai = useAISummary();
  const { save } = useSaveReview();
  const [draft, setDraft] = useState<string | null>(null);
  const configured = status.data?.configured ?? false;
  const summary = savedRow?.summary ?? null;

  const write = () => {
    if (ai.isPending) return;
    ai.mutate({ month: stats.month.slice(0, 7), localDate: today, digest: aiDigest(stats, priorities, unit) }, { onSuccess: (r) => setDraft(r.summary) });
  };
  const accept = () => {
    if (!draft || save.isPending) return;
    save.mutate({ month: stats.month, stats, priorities, summary: draft, toast: "Summary saved with the review" }, { onSuccess: () => setDraft(null) });
  };

  return (
    <Card className="review-card" data-print={summary && !draft ? undefined : "hide"}>
      <CardHeader title="Summary" action={summary && !draft ? <SuggestedBadge>AI · from these numbers</SuggestedBadge> : undefined} />
      {draft ? (
        <div>
          <div className="rounded-[14px] border border-lapis-line bg-lapis-tint p-4">
            <SuggestedBadge>AI draft</SuggestedBadge>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-fg">{draft}</p>
          </div>
          <p className="mt-2 text-[12px] font-medium text-fg-3">Written by AI from this review&apos;s numbers only. Read it before you keep it.</p>
          <div className="mt-4 flex flex-wrap gap-2" data-print="hide">
            <Button variant="outline-gold" onClick={accept} loading={save.isPending}>
              Keep summary
            </Button>
            <Button variant="secondary" onClick={write} loading={ai.isPending}>
              <RotateCcw className="size-4" aria-hidden />
              Rewrite
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
              Discard
            </Button>
          </div>
        </div>
      ) : summary ? (
        <div>
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-fg">{summary}</p>
          <div className="mt-4 flex flex-wrap gap-2" data-print="hide">
            <Button variant="secondary" size="md" onClick={write} loading={ai.isPending} disabled={!configured}>
              <RotateCcw className="size-4" aria-hidden />
              Rewrite
            </Button>
            <Button
              variant="ghost"
              onClick={() => savedRow && save.mutate({ month: stats.month, stats, priorities, summary: null, toast: "Summary removed" })}
              disabled={save.isPending}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div data-print="hide">
          <p className="text-[14px] leading-relaxed text-fg-2">
            A short written recap of this month, drafted by AI from the numbers above. No logs, notes or photos are sent, and nothing is saved until you keep it.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={write} loading={ai.isPending} disabled={status.isLoading || !configured}>
              Write summary with AI
            </Button>
            {!status.isLoading && !configured && <span className="text-[12.5px] font-medium text-fg-3">AI isn&apos;t connected yet. It needs a GEMINI_API_KEY on the server.</span>}
          </div>
        </div>
      )}
      {ai.error && (
        <ErrorNote className="mt-4" onRetry={ai.error.code === "not_configured" ? undefined : write}>
          {ai.error.message}
        </ErrorNote>
      )}
    </Card>
  );
}

/* --------------------------------------------------------- archive/export */

function ArchiveCard({ stats, priorities, savedRow, unit, savedLoading }: { stats: ReviewStats; priorities: Priority[]; savedRow: SavedReview | null; unit: WeightUnit; savedLoading: boolean }) {
  const { save, remove } = useSaveReview();
  const [confirm, setConfirm] = useState(false);
  const stale = !!savedRow && stableStringify(savedRow.stats) !== stableStringify(stats);
  const optimistic = savedRow?.id === "optimistic";
  const doSave = () => {
    if (save.isPending) return;
    save.mutate({ month: stats.month, stats, priorities, summary: savedRow?.summary ?? null, toast: savedRow ? `${stats.label} snapshot updated` : undefined });
  };
  return (
    <Card className="review-card" data-print="hide">
      <CardHeader title="Keep & export" />
      {savedLoading ? (
        <Skeleton className="h-24" />
      ) : savedRow ? (
        <div className="flex items-start gap-3">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-fg">Snapshot saved</p>
            <p className="mt-0.5 text-[13px] font-medium text-fg-3">
              {optimistic ? "Saving…" : new Date(savedRow.generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {stale && " · your logs changed since"}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-[14px] leading-relaxed text-fg-2">Save keeps this month&apos;s numbers and priorities exactly as they are now, even if you edit older logs later.</p>
      )}

      <div className="mt-4 grid gap-2">
        {!savedRow ? (
          <Button variant="primary" block onClick={doSave} loading={save.isPending} disabled={savedLoading}>
            <Archive className="size-[18px]" aria-hidden />
            Save review
          </Button>
        ) : (
          stale && (
            <Button variant="secondary" block onClick={doSave} loading={save.isPending} disabled={optimistic}>
              <RotateCcw className="size-4" aria-hidden />
              Update snapshot
            </Button>
          )
        )}
        <ExportActions stats={stats} priorities={priorities} savedRow={savedRow} unit={unit} compact />
        {savedRow && (
          <Button variant="ghost" size="md" className="justify-start px-1 text-fg-3" onClick={() => setConfirm(true)} disabled={optimistic || remove.isPending}>
            <Trash className="size-4" aria-hidden />
            Remove snapshot
          </Button>
        )}
      </div>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Remove this snapshot?"
        body="The live review stays — it's always rebuilt from your logs. You can undo for a few seconds."
        confirmLabel="Remove"
        onConfirm={() => savedRow && remove.mutate(savedRow)}
      />
    </Card>
  );
}

function ExportActions({ stats, priorities, savedRow, unit, compact, onDone }: { stats: ReviewStats; priorities: Priority[]; savedRow: SavedReview | null; unit: WeightUnit; compact?: boolean; onDone?: () => void }) {
  const print = () => {
    onDone?.();
    // let the sheet close before the print dialog snapshots the page
    window.setTimeout(() => window.print(), onDone ? 350 : 0);
  };
  const download = () => {
    const data = {
      app: "Project Greek God",
      kind: "monthly-review",
      month: stats.month.slice(0, 7),
      exportedAt: new Date().toISOString(),
      units: { weight: "lb (stored)", display: unit, length: "in (stored)", water: "mL" },
      stats,
      priorities: priorities.map((p) => ({ id: p.id, area: p.area, title: p.title, detail: p.detail, evidence: p.evidence, action: p.action ?? null })),
      summary: savedRow?.summary ?? null,
      snapshotSavedAt: savedRow?.generated_at ?? null,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
      {!compact && <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-fg-3">Save as PDF opens the print dialog; choose Save as PDF there. On iPhone, tap Share in the print preview.</p>}
    </div>
  );
}

/* --------------------------------------------------------------- skeleton */

export function ReviewSkeleton() {
  const show = useDelayed(150);
  if (!show) return <div className="min-h-[60vh]" aria-busy />;
  return (
    <div className="mx-auto max-w-[1080px]" aria-busy aria-label="Loading review">
      <Skeleton className="mb-3 h-11 w-28" />
      <div className="card-monument p-5 sm:p-6 lg:p-7">
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
          <div key={i} className="card p-4 sm:p-5 lg:p-6">
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


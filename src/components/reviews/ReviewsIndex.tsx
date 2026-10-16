"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, CircleCheck } from "lucide-react";
import { useMemo } from "react";
import { EmptyArt } from "@/components/art/Motifs";
import { PRBadge } from "@/components/ui/badge";
import { Bar } from "@/components/ui/progress";
import { Empty, ErrorNote, PageHeader, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { useProfile, type Profile } from "@/lib/data/profile";
import {
  addMonths,
  daysBetween,
  longDate,
  monthEnd,
  monthStart,
  type ISODate,
} from "@/lib/dates";
import {
  computeReview,
  headline,
  reviewMonths,
  type ReviewStats,
} from "@/lib/reviews/compute";
import { useReviewSource, useSavedReviews } from "@/lib/reviews/hooks";
import { formatDelta, type WeightUnit } from "@/lib/units";
import { useDelayed } from "./kit";

export function ReviewsIndex() {
  const { profile, error, refetch } = useProfile();
  if (error && !profile)
    return (
      <ErrorNote onRetry={() => void refetch()}>
        Couldn&apos;t load your profile. {(error as Error).message}
      </ErrorNote>
    );
  if (!profile) return <IndexSkeleton />;
  return <IndexBody profile={profile} />;
}

function IndexBody({ profile }: { profile: Profile }) {
  const today = useToday();
  const start = profile.start_date > today ? today : profile.start_date;
  const src = useReviewSource(monthStart(start), today, { withSets: false });
  const saved = useSavedReviews();
  const unit = profile.weight_unit as WeightUnit;

  const months = useMemo(() => {
    if (!src.rows || !src.reviewProfile) return null;
    return reviewMonths(start, today).map((m) =>
      computeReview({
        month: m,
        today,
        profile: src.reviewProfile!,
        rows: src.rows!,
      }),
    );
  }, [src.rows, src.reviewProfile, start, today]);

  const savedSet = new Set((saved.data ?? []).map((r) => r.month));
  const current = months?.at(-1) ?? null;
  const completed = (months ?? []).slice(0, -1).reverse();
  const next = addMonths(today, 1);

  return (
    <div className="mx-auto max-w-[1080px]">
      <PageHeader
        eyebrow={
          current
            ? `The ascent · Month ${current.window.monthIndex} of ${current.window.monthsTotal}`
            : "The ascent"
        }
        title="Monthly reviews"
      >
        <p className="mt-2 max-w-[48ch] text-[14px] leading-relaxed text-fg-2">
          Every month, rebuilt from what you logged: body, training, food and
          recovery, with 2–3 priorities for the next.
        </p>
      </PageHeader>

      {src.error ? (
        <ErrorNote onRetry={src.refetch}>
          Couldn&apos;t load your logs. {src.error.message}
        </ErrorNote>
      ) : !months || !current ? (
        <IndexSkeleton inner />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-8">
          <section className="lg:sticky lg:top-8" aria-labelledby="current-title">
            <h2 id="current-title" className="eyebrow mb-2 px-1">
              This month
            </h2>
            <CurrentMonth
              s={current}
              unit={unit}
              today={today}
              saved={savedSet.has(current.month)}
            />
            <p className="mt-3 flex items-center gap-2 px-1 text-[13px] font-medium text-fg-3">
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              <span>
                Next full review: {longDate(next).split(", ")[1]}.{" "}
                <Link
                  href="/settings#reminders"
                  className="relative font-bold text-gold-300 before:absolute before:-inset-x-2 before:-inset-y-[13px] before:content-[''] hover:text-gold-200"
                >
                  Remind me
                </Link>
              </span>
            </p>
          </section>

          <section aria-labelledby="completed-title">
            <h2 id="completed-title" className="eyebrow mb-2 px-1">
              Completed
            </h2>
            {completed.length === 0 ? (
              <Empty
                art={<EmptyArt kind="laurel" size={56} />}
                title={`Your first full review lands ${longDate(next).split(", ")[1]}`}
              >
                This month&apos;s review is already building from your logs.
                Open it any time to see where you stand.
              </Empty>
            ) : (
              <ol className="relative overflow-hidden rounded-[20px] border border-line bg-s1 shadow-[var(--e1)]">
                {completed.map((s, i) => (
                  <MonthRow
                    key={s.month}
                    s={s}
                    unit={unit}
                    saved={savedSet.has(s.month)}
                    first={i === 0}
                    last={i === completed.length - 1}
                  />
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function CurrentMonth({
  s,
  unit,
  today,
  saved,
}: {
  s: ReviewStats;
  unit: WeightUnit;
  today: ISODate;
  saved: boolean;
}) {
  const total = daysBetween(s.month, monthEnd(s.month)) + 1;
  const day = Math.min(total, daysBetween(s.month, today) + 1);
  const t = s.training;
  return (
    <Link
      href={`/reviews/${s.month.slice(0, 7)}`}
      className="card-accent press-soft group block p-5 transition-colors hover:border-line-strong sm:p-6"
      aria-label={`${s.label}, in progress. Open review`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-gold-300">
          In progress · Day {day} of {total}
        </p>
        {saved && (
          <CircleCheck
            className="size-4 text-success"
            aria-label="Snapshot saved"
          />
        )}
      </div>
      <h3 className="t-card mt-3">{s.label}</h3>
      {s.milestone && (
        <p className="mt-1.5 text-[14px] font-medium text-fg-2">
          {s.milestone.title}
        </p>
      )}
      <dl className="mt-5 grid grid-cols-3 gap-3">
        <Mini
          label="Workouts"
          value={
            t.planned
              ? `${t.plannedDone}/${t.planned}`
              : t.sessions
                ? String(t.sessions)
                : "—"
          }
        />
        <Mini
          label="Trend"
          value={
            s.physical.change == null
              ? "—"
              : formatDelta(s.physical.change, unit)
          }
        />
        <Mini
          label="Protein"
          value={
            s.nutrition.avgProtein == null ? "—" : `${s.nutrition.avgProtein} g`
          }
        />
      </dl>
      <div className="mt-5">
        <Bar value={day / total} label={`${s.label}: day ${day} of ${total}`} />
      </div>
      <p className="mt-4 flex items-center justify-between text-[14px] font-bold text-gold-300">
        Open this month
        <ChevronRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </p>
    </Link>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow truncate">{label}</dt>
      <dd
        className={cn("num-sm mt-1.5 truncate", value === "—" && "text-fg-3")}
      >
        {value}
      </dd>
    </div>
  );
}

function MonthRow({
  s,
  unit,
  saved,
  first,
  last,
}: {
  s: ReviewStats;
  unit: WeightUnit;
  saved: boolean;
  first: boolean;
  last: boolean;
}) {
  const line = headline(s, unit);
  return (
    <li className="relative">
      <Link
        href={`/reviews/${s.month.slice(0, 7)}`}
        className={cn(
          "press-soft group relative flex min-h-[76px] items-center gap-4 py-3.5 pl-4 pr-3 transition-colors hover:bg-white/[.025] active:bg-white/[.04]",
          !first && "border-t border-line-hair",
        )}
      >
        {/* roadmap rail: gold up to today, filled node for each completed month */}
        <span
          aria-hidden
          className="relative flex w-3 shrink-0 justify-center self-stretch"
        >
          <span
            className={cn(
              "absolute w-px bg-gold-600/60",
              first ? "top-1/2" : "-top-4",
              last ? "bottom-1/2" : "-bottom-4",
            )}
          />
          <span className="relative top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-[image:var(--grad-leaf)] shadow-[0_0_0_3px_var(--surface-1)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="t-h2 truncate">{s.label}</span>
            {saved ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-[6px] bg-success-tint px-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-success">
                <CircleCheck className="size-3" aria-hidden />
                Saved
              </span>
            ) : (
              <span className="inline-flex h-5 items-center rounded-[6px] border border-line px-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-2">
                Ready
              </span>
            )}
          </span>
          <span className="mt-1 block truncate text-[13px] font-medium text-fg-3 lg:whitespace-normal">
            {line.length ? line.join(" · ") : "Nothing logged this month"}
          </span>
        </span>
        {s.training.prs.items.length > 0 && (
          <span
            className="hidden items-center gap-1.5 sm:flex"
            aria-label={`${s.training.prs.items.length} lifts with records`}
          >
            <PRBadge />
            <span className="num-xs text-fg-2">
              ×{s.training.prs.items.length}
            </span>
          </span>
        )}
        <ChevronRight
          className="size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </li>
  );
}

function IndexSkeleton({ inner }: { inner?: boolean }) {
  const show = useDelayed(150);
  if (!show) return <div className="min-h-[50vh]" aria-busy />;
  return (
    <div
      className={inner ? "" : "mx-auto max-w-[1080px]"}
      aria-busy
      aria-label="Loading reviews"
    >
      {!inner && (
        <>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 mb-6 h-9 w-64" />
        </>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="card-accent p-5 sm:p-6">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="mt-4 h-7 w-48" />
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
          <Skeleton className="mt-6 h-1.5" />
        </div>
        <div className="overflow-hidden rounded-[20px] border border-line bg-s1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "flex h-[76px] items-center gap-4 px-4",
                i > 0 && "border-t border-line-hair",
              )}
            >
              <Skeleton className="size-2.5 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

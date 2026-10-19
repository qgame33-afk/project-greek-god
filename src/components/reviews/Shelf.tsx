"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { MilestoneSheet, type MilestoneEntry } from "@/components/progress/mountain/MilestoneSheet";
import { Collapse, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { useProfile, type Profile } from "@/lib/data/profile";
import { addMonths, dayName, monthStart, type ISODate } from "@/lib/dates";
import { formatBodyweight, type WeightUnit } from "@/lib/units";
import { pace as paceOf, roman, terraces as terracesOf, trendSeries } from "@/lib/progress/pace";
import { parseRoadmap, roadmapMonths } from "@/lib/progress/months";
import { planFromProfile } from "@/lib/progress/plan";
import { bookTitle, sessionsLine } from "@/lib/reviews/chronicle";
import { computeReview, reviewMonths, type ReviewStats } from "@/lib/reviews/compute";
import { useReviewSource } from "@/lib/reviews/hooks";
import { dayMonth } from "@/lib/progress/pace";

export interface ShelfBook {
  month: ISODate;
  slug: string;
  numeral: string;
  film: string;
  subtitle: string;
  current: boolean;
  stats: ReviewStats;
}

/** The Books written so far (one per month from the start month to this one), newest first. */
export function useBooks(profile: Profile | null | undefined) {
  const today = useToday();
  const start = profile ? (profile.start_date > today ? today : profile.start_date) : today;
  const src = useReviewSource(monthStart(start), today, { withSets: false });
  const books = useMemo<ShelfBook[] | null>(() => {
    if (!profile || !src.rows || !src.reviewProfile) return null;
    const ws = src.rows.weights.map((w) => ({ local_date: w.local_date, weight_lb: Number(w.weight_lb) }));
    const p = paceOf({ weighIns: ws, today, profile });
    const series = trendSeries(ws, undefined, today);
    const ts = p.band ? terracesOf(p, series, Number(profile.start_weight_lb), p.band.min) : [];
    const cur = monthStart(today);
    const months = reviewMonths(start, today);
    const sameMonthTwice = new Set(months.map((m) => m.slice(5, 7))).size < months.length;
    return months
      .map((m) => {
        const stats = computeReview({ month: m, today, profile: src.reviewProfile!, rows: src.rows! });
        const t = bookTitle(stats, { startDate: profile.start_date, current: m === cur, terraces: ts, withYear: sameMonthTwice });
        return { month: m, slug: m.slice(0, 7), numeral: t.numeral, film: t.film, subtitle: t.subtitle, current: m === cur, stats };
      })
      .reverse();
  }, [profile, src.rows, src.reviewProfile, start, today]);
  return { books, error: src.error, refetch: src.refetch };
}

/** A small book spine: leaf rim once written, a dashed rim while being written, an outline ahead. */
export function Spine({ numeral, state, size = "md" }: { numeral: string; state: "written" | "writing" | "ahead"; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "t-title-2 grid shrink-0 place-items-center rounded-tag tracking-[0.06em]",
        size === "lg" ? "h-16 w-12" : "h-14 w-10",
        state === "written" && "bg-m2 text-leaf-300 shadow-[inset_0_0_0_1.5px_var(--leaf-400),inset_0_0_0_4px_var(--m2),inset_0_0_0_5px_var(--leaf-line)]",
        state === "writing" && "text-ivory outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-leaf-line",
        state === "ahead" && "text-stone shadow-[inset_0_0_0_1px_var(--ui-line)]",
      )}
    >
      {numeral}
    </span>
  );
}

/**
 * The Chronicles on the Mountain (docs/DESIGN-V2.md §3.6.1 item 8): the Books written so far,
 * each opening /reviews/[month]; the current month "being written". The months still ahead
 * (the old Roadmap) fold away underneath with their milestones, which stay editable.
 */
export function Shelf({ unit }: { unit: WeightUnit }) {
  const today = useToday();
  const { profile } = useProfile();
  const { books, error, refetch } = useBooks(profile);
  const [editing, setEditing] = useState<MilestoneEntry | null>(null);
  const [ahead, setAhead] = useState(false);

  const plan = planFromProfile(profile, today);
  const overrides = useMemo(() => parseRoadmap(profile?.roadmap), [profile?.roadmap]);
  const months = useMemo(
    () => roadmapMonths({ plan, today, overrides, weights: [], startLabel: formatBodyweight(plan.startLb, unit) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.startDate, plan.targetDate, plan.startLb, plan.goalLb, today, overrides, unit],
  );
  const future = months.filter((m) => m.status === "future");
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const edit = (month: ISODate) => {
    const m = byMonth.get(month);
    if (m) setEditing({ month: m.month, offset: m.offset, title: m.title, detail: m.detail, custom: m.custom });
  };

  return (
    <section id="ascent-chronicles" aria-labelledby="chronicles-h" className="@container scroll-mt-24">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id="chronicles-h" className="t-title-2 text-ivory">
          Chronicles
        </h2>
        <Link href="/reviews" className="press t-callout -mr-2 inline-flex h-11 items-center gap-0.5 rounded-field px-2 font-semibold text-leaf-300 hover:text-leaf-200">
          All books <ChevronRight className="size-4" strokeWidth={1.6} aria-hidden />
        </Link>
      </div>

      {error ? (
        <ErrorNote onRetry={refetch}>Couldn&apos;t open the Chronicles. {error.message}</ErrorNote>
      ) : !books ? (
        <div className="divide-y divide-vein border-y border-vein">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="h-14 w-10 rounded-tag" />
              <div className="flex-1">
                <Skeleton className="h-3 w-24 rounded-tag" />
                <Skeleton className="mt-2 h-5 w-40 rounded-tag" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-vein border-y border-vein">
          {books.map((b) => {
            const s = sessionsLine(b.stats.training);
            const milestone = byMonth.get(b.month)?.title ?? null;
            const nextMonth = addMonths(b.month, 1);
            const line = b.current
              ? `Being written · seals ${dayName(nextMonth, true)} ${dayMonth(nextMonth, today)}`
              : [b.subtitle, b.stats.training.planned || b.stats.training.sessions ? `${s.value} ${s.label}` : null].filter(Boolean).join(" · ");
            return (
              <li key={b.month} className="flex items-center gap-1">
                <Link href={`/reviews/${b.slug}`} className="press-soft flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-4 py-2.5">
                  <Spine numeral={b.numeral} state={b.current ? "writing" : "written"} />
                  <span className="min-w-0 flex-1">
                    <span className="t-eyebrow block truncate @max-[19rem]:whitespace-normal">
                      Book {b.numeral}
                      {milestone ? ` · ${milestone}` : ""}
                    </span>
                    <span className="t-title-2 mt-0.5 block text-ivory">{b.film.charAt(0) + b.film.slice(1).toLowerCase()}</span>
                    <span className="t-meta block truncate @max-[19rem]:whitespace-normal text-stone">{line}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ash @max-[19rem]:hidden" strokeWidth={1.6} aria-hidden />
                </Link>
                {byMonth.has(b.month) && (
                  <button
                    type="button"
                    onClick={() => edit(b.month)}
                    className="press grid size-11 shrink-0 place-items-center rounded-field text-ash hover:text-ivory"
                    aria-label={`Edit the ${b.film.toLowerCase()} milestone`}
                  >
                    <Pencil className="size-4" strokeWidth={1.6} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {future.length > 0 && (
        <div className="mt-1">
          <button type="button" onClick={() => setAhead(!ahead)} aria-expanded={ahead} aria-controls="books-ahead" className="press flex min-h-11 w-full items-center justify-between gap-3 text-left">
            <span className="t-callout text-stone">
              The road ahead · <span className="tnum">{future.length}</span> {future.length === 1 ? "book" : "books"} unwritten
            </span>
            <ChevronDown className={cn("size-4 text-ash transition-transform duration-(--dur-fast)", ahead && "rotate-180")} strokeWidth={1.6} aria-hidden />
          </button>
          <Collapse open={ahead} id="books-ahead" className="relative">
            <ul className="divide-y divide-vein border-y border-vein">
              {future.map((m) => (
                <li key={m.month} className="flex items-center gap-4 py-2.5">
                  <Spine numeral={roman(m.offset + 1)} state="ahead" />
                  <span className="min-w-0 flex-1">
                    <span className="t-eyebrow block truncate @max-[19rem]:whitespace-normal">
                      {m.month.slice(0, 4)} · {m.title || "No milestone yet"}
                    </span>
                    <span className="t-title-2 mt-0.5 block text-stone">{monthLabelShort(m.month)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Tag kind="PLAN" />
                      <span className="t-meta tnum text-stone">{m.plan != null ? `${formatBodyweight(m.plan, unit)} at month end` : "—"}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => edit(m.month)}
                    className="press grid size-11 shrink-0 place-items-center rounded-field text-ash hover:text-ivory"
                    aria-label={`Edit the ${monthLabelShort(m.month)} milestone`}
                  >
                    <Pencil className="size-4" strokeWidth={1.6} />
                  </button>
                </li>
              ))}
            </ul>
            <p className="t-meta mt-2 text-stone">PLAN weights are a straight line from your start to your goal, not a prediction.</p>
          </Collapse>
        </div>
      )}

      <MilestoneSheet entry={editing} total={months.length} onClose={() => setEditing(null)} />
    </section>
  );
}

function monthLabelShort(m: ISODate) {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
  return d.toLocaleString("en-GB", { month: "long" });
}

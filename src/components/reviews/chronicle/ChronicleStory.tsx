"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { planFollowed } from "@/lib/adherence";
import { useToday } from "@/lib/data/core";
import { useMealPrefs } from "@/lib/data/meals";
import { monthEnd, monthStart, type ISODate } from "@/lib/dates";
import { plannedTime } from "@/lib/now/meal-times";
import { parseAppPrefs } from "@/lib/prefs";
import { pace as paceOf, terraces as terracesOf, trendSeries } from "@/lib/progress/pace";
import { bookGild, bookTitle, chronicleStamp, monthChange, nextMonthPlan, terracesReachedIn, titleCredits } from "@/lib/reviews/chronicle";
import { computePriorities, computeReview, reviewMonths } from "@/lib/reviews/compute";
import { useChronicleExtras, useReviewSource } from "@/lib/reviews/hooks";
import type { WeightUnit } from "@/lib/units";
import { MonthlyReview } from "../MonthlyReview";
import { CHAPTERS, FuelChapter, MountainChapter, NextChapter, StrengthChapter, TitleChapter, type ChronicleData } from "./chapters";

const ROMAN = ["I", "II", "III", "IV", "V"];
const HOLD_MS = 260;

/**
 * The Chronicle story viewer (docs/DESIGN-V2.md §3.8): a month as five chapters on obsidian.
 * Tap the right two thirds to advance, the left third to go back; hold to pause the title's
 * Gild; swipe down or ✕ to close; Next › and the arrow keys do the same without gestures.
 * Content and controls are live from the first frame. Numbers come from lib/reviews/compute
 * (unchanged) and the shared pace and adherence functions.
 */
export function ChronicleStory({ month }: { month: ISODate }) {
  const today = useToday();
  const router = useRouter();
  const to = monthEnd(month);
  const src = useReviewSource(month, to);
  const extras = useChronicleExtras(month, to);
  const mealPrefs = useMealPrefs();
  const unit = (src.profile?.weight_unit ?? "lb") as WeightUnit;

  const stats = useMemo(() => (src.rows && src.reviewProfile ? computeReview({ month, today, profile: src.reviewProfile, rows: src.rows }) : null), [src.rows, src.reviewProfile, month, today]);
  const data = useMemo<ChronicleData | null>(() => {
    const profile = src.profile;
    if (!stats || !src.rows || !profile || extras.loading || stats.window.outOfRange) return null;
    const ws = src.rows.weights.map((w) => ({ local_date: w.local_date, weight_lb: Number(w.weight_lb) }));
    const startLb = Number(profile.start_weight_lb);
    const goalLb = Number(profile.goal_weight_lb);
    const p = paceOf({ weighIns: ws, today, profile });
    const fullSeries = trendSeries(ws, undefined, today);
    const ts = p.band ? terracesOf(p, fullSeries, startLb, p.band.min) : [];
    const months = reviewMonths(profile.start_date > today ? today : profile.start_date, today);
    const sameMonthTwice = new Set(months.map((m) => m.slice(5, 7))).size < months.length;
    const current = monthStart(today) === month;
    // plan followed over the month, on the one definition (lib/adherence) and the planned times
    const schedule = parseAppPrefs(profile.prefs).day;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const planned = extras.planned.map((m) => ({
      id: m.id,
      local_date: m.local_date,
      at: plannedTime({ slot: m.slot, position: m.position }, { schedule, snacksPerDay: mealPrefs.prefs.snacksPerDay, train: null }).at,
    }));
    return {
      stats,
      priorities: computePriorities(stats, unit),
      unit,
      today,
      title: bookTitle(stats, { startDate: profile.start_date, current, terraces: ts, withYear: sameMonthTwice }),
      current,
      gild: bookGild(ws, stats.window.to, startLb, goalLb),
      credits: titleCredits(stats, unit),
      change: monthChange(stats, unit),
      series: trendSeries(ws, stats.window.from, stats.window.to),
      weighIns: ws.filter((w) => w.local_date >= stats.window.from && w.local_date <= stats.window.to).map((w) => ({ date: w.local_date, lb: w.weight_lb })),
      terraces: ts,
      reached: terracesReachedIn(ts, stats.window.from, stats.window.to) as typeof ts,
      followed: planned.length ? planFollowed(planned, extras.loggedIds, today, nowMin) : null,
      ritesDone: extras.ritesDone,
      plan: nextMonthPlan(month, profile),
    };
  }, [stats, src.rows, src.profile, extras.loading, extras.planned, extras.loggedIds, extras.ritesDone, mealPrefs.prefs.snacksPerDay, month, today, unit]);

  const [chapter, setChapter] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);
  const [paused, setPaused] = useState(false);
  const last = CHAPTERS.length - 1;
  const go = useCallback((n: number) => setChapter(Math.max(0, Math.min(last, n))), [last]);

  const close = useCallback(() => {
    // back to wherever he came from in the app (Ascent, Now, the index); a story opened directly
    // (a reminder link, a reload) has nothing to go back to, so it lands on the index
    let direct = true;
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      direct = !nav || nav.name === window.location.href;
    } catch {
      /* no timing API: treat as direct */
    }
    if (!direct && window.history.length > 1) router.back();
    else router.replace("/reviews");
  }, [router]);

  // the story is a full-screen layer: the page under it does not scroll
  const outOfRange = !!stats?.window.outOfRange;
  useEffect(() => {
    if (outOfRange) return;
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = prev;
    };
  }, [outOfRange]);

  // gestures: tap zones, hold to pause, swipe down to close
  const press = useRef<{ x: number; y: number; t: number; held: boolean; timer: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("a,button,[role=button],input,select,textarea")) return;
    const timer = window.setTimeout(() => {
      if (press.current) {
        press.current.held = true;
        setPaused(true);
      }
    }, HOLD_MS);
    press.current = { x: e.clientX, y: e.clientY, t: Date.now(), held: false, timer };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    window.clearTimeout(p.timer);
    setPaused(false);
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (dy > 90 && Math.abs(dx) < 70) return close();
    if (p.held || Math.abs(dx) > 24 || Math.abs(dy) > 24) return;
    const w = e.currentTarget.getBoundingClientRect().width;
    if (e.clientX - e.currentTarget.getBoundingClientRect().left < w / 3) go(chapter - 1);
    else go(chapter + 1);
  };
  const onPointerCancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    setPaused(false);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") go(chapter + 1);
    else if (e.key === "ArrowLeft") go(chapter - 1);
    else if (e.key === "Escape") close();
    else return;
    e.preventDefault();
  };

  const stamp = chronicleStamp(month, today);
  // a month before the programme or still ahead: the ledger says so plainly
  if (outOfRange) return <MonthlyReview monthParam={month.slice(0, 7)} />;
  const ledger = `/reviews/${month.slice(0, 7)}?view=ledger`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-roledescription="story"
      aria-label={data ? `${data.title.book}, ${data.title.film.toLowerCase()}. Chapter ${chapter + 1} of ${CHAPTERS.length}, ${CHAPTERS[chapter]}` : "The Chronicle"}
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKey}
      className="@container fixed inset-0 z-(--z-sheet) flex flex-col overflow-hidden text-ivory outline-none"
      style={{ background: "var(--spot), url(/art/marble-veins.svg) 0 0 / 400px 400px, var(--obsidian)" }}
      data-paused={paused || undefined}
    >
      {/* the reel: chapter bars, the stamp, close */}
      <div className="relative z-10 px-gutter pt-[calc(var(--safe-top)+10px)]">
        <div className="flex gap-1.5" aria-hidden>
          {CHAPTERS.map((c, i) => (
            <span key={c} className="relative h-0.75 flex-1 overflow-hidden rounded-full bg-vein-3">
              <span className={cn("absolute inset-0 origin-left rounded-full bg-ivory transition-transform duration-(--dur-base) ease-out", i <= chapter ? "scale-x-100" : "scale-x-0")} />
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="t-eyebrow truncate">{stamp}</p>
          <button type="button" onClick={close} className="press -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-stone hover:text-ivory" aria-label="Close the Chronicle">
            <X className="size-5" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {/* the chapter: tap zones on the whole page; links and buttons keep their own taps */}
      <div className="relative min-h-0 flex-1 touch-pan-y select-none" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onPointerLeave={onPointerCancel}>
        <div className="h-full overflow-y-auto overscroll-contain px-gutter pb-6 pt-3">
          <div className="mx-auto h-full max-w-col">
            {src.error ? (
              <ErrorNote onRetry={src.refetch}>Couldn&apos;t open this Book. {src.error.message}</ErrorNote>
            ) : !data ? (
              <div className="flex h-full flex-col items-center justify-center gap-3" aria-busy="true" aria-label="Opening the Book">
                <span className="skeleton h-72 w-56 rounded-card" />
                <span className="skeleton h-8 w-48 rounded-tag" />
              </div>
            ) : (
              <div key={chapter} className="turn-in h-full" aria-live="polite">
                {chapter === 0 && <TitleChapter d={data} />}
                {chapter === 1 && <StrengthChapter d={data} />}
                {chapter === 2 && <MountainChapter d={data} />}
                {chapter === 3 && <FuelChapter d={data} />}
                {chapter === 4 && <NextChapter d={data} />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* the foot: where the next tap goes, and buttons for every gesture */}
      <div className="relative z-10 mx-auto flex w-full max-w-col items-center justify-between gap-3 px-gutter pb-[calc(var(--safe-bottom)+12px)] pt-3">
        {chapter < last ? (
          <>
            <div className="flex min-w-0 items-center gap-1">
              {chapter > 0 && (
                <button
                  type="button"
                  onClick={() => go(chapter - 1)}
                  className="press -ml-2 grid size-11 shrink-0 place-items-center rounded-full text-stone hover:text-ivory"
                  aria-label="Previous chapter"
                >
                  <ChevronLeft className="size-5" strokeWidth={1.6} />
                </button>
              )}
              <p className="t-meta truncate text-stone">
                Tap for chapter {ROMAN[chapter + 1]} · {CHAPTERS[chapter + 1]}
              </p>
            </div>
            <Button variant="secondary" size="md" onClick={() => go(chapter + 1)} className="shrink-0 px-4" aria-label={`Next: chapter ${chapter + 2}, ${CHAPTERS[chapter + 1]}`}>
              Next <ChevronRight className="size-4" strokeWidth={1.8} />
            </Button>
          </>
        ) : (
          <>
            <Link href={ledger} className={buttonVariants({ variant: "secondary", size: "md", className: "min-w-0 px-4" })}>
              <BookOpen className="size-4 shrink-0" strokeWidth={1.6} /> <span className="truncate">Read the full ledger</span>
            </Link>
            <Button variant="primary" size="md" onClick={close} className="shrink-0 px-6">
              Done
            </Button>
          </>
        )}
      </div>
      <style>{`[data-paused] * { animation-play-state: paused !important; }`}</style>
    </div>
  );
}

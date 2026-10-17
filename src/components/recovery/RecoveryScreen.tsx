"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { TabHeader } from "@/components/shell/TabHeader";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { useRecovery } from "@/lib/data/recovery";
import { useSwapIn } from "@/lib/motion";
import { addDays, parseISODate, toISODate, weekStart, type ISODate } from "@/lib/dates";
import { DateStrip } from "./DateStrip";
import { GuidanceCard } from "./GuidanceCard";
import { HabitsCard } from "./HabitsCard";
import { HistoryCard } from "./HistoryCard";
import { LedgerCheckIn, type CheckInHandle } from "./LedgerCheckIn";
import { ReadinessHistory } from "./ReadinessHistory";
import { WaterCard } from "./WaterCard";
import { WeeklyReviewCard } from "./WeeklyReviewCard";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST_WEEKS_BACK = 104;

/** A `?date=` deep link, only when it is a real calendar day inside the editable range. */
function validDateParam(raw: string | null, today: ISODate, startDate: ISODate | null): ISODate | null {
  if (!raw || !ISO.test(raw)) return null;
  if (toISODate(parseISODate(raw)) !== raw) return null; // 2026-02-31
  if (raw > today) return null;
  if (raw < addDays(weekStart(today), -7 * EARLIEST_WEEKS_BACK)) return null;
  if (startDate && raw < startDate) return null;
  return raw;
}

/**
 * The Recovery ledger (docs/DESIGN-V2.md §3.7): the history and editing that left Now. A check-in
 * for any day (the same per-tap controls as Dawn), that day's readiness call, the last 14 nights,
 * the rites and their editor (#habits), water by day and the week's end review.
 * `/recovery?checkin=1` now opens the check-in on Now (`/?dawn=1`).
 */
export function RecoveryScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const wantCheckin = params.get("checkin") === "1";
  useEffect(() => {
    if (wantCheckin) router.replace("/?dawn=1");
  }, [wantCheckin, router]);
  if (wantCheckin) return <RecoverySkeleton />;
  return <Ledger />;
}

function Ledger() {
  const today = useToday();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { profile, loading, error: profileError, refetch: refetchProfile } = useProfile();
  const paramDate = params.get("date");
  const [date, setDate] = useState<ISODate>(() => validDateParam(paramDate, today, null) ?? today);
  const startDate = profile?.start_date ?? null;
  if (startDate && date < startDate && date !== today) setDate(today);

  // a ?date= link while the ledger is open: follow it
  const [seenParam, setSeenParam] = useState(paramDate);
  if (paramDate !== seenParam) {
    setSeenParam(paramDate);
    const d = validDateParam(paramDate, today, startDate);
    if (d) setDate(d);
  }
  // follow midnight when on "today"
  const [seenToday, setSeenToday] = useState(today);
  if (seenToday !== today) {
    setSeenToday(today);
    if (date === seenToday) setDate(today);
  }

  const checkin = useRef<CheckInHandle>(null);
  const dayRef = useSwapIn<HTMLDivElement, ISODate>(date);
  const recent = useRecovery(addDays(today, -13), today);

  const goToCheckin = useCallback(() => {
    const el = document.getElementById("checkin");
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => checkin.current?.focus(), reduce ? 0 : 350);
  }, []);
  /** Choose the ledger's day (and keep it in the URL so a reload or share lands on it). */
  const selectDay = useCallback(
    (d: ISODate) => {
      setDate(d);
      setSeenParam(d === today ? null : d);
      const next = new URLSearchParams(params.toString());
      if (d === today) next.delete("date");
      else next.set("date", d);
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [params, pathname, router, today],
  );
  /** Choose a day from further down (history, calendar) and go to its check-in. */
  const openDay = useCallback(
    (d: ISODate) => {
      selectDay(d);
      window.setTimeout(goToCheckin, 60);
    },
    [goToCheckin, selectDay],
  );

  // /recovery#habits (Now's rites "Edit"): scroll there once the page has content
  const ready = !loading && !!profile;
  useEffect(() => {
    if (!ready || typeof window === "undefined" || window.location.hash !== "#habits") return;
    const t = window.setTimeout(() => document.getElementById("habits")?.scrollIntoView({ block: "start" }), 120);
    return () => window.clearTimeout(t);
  }, [ready]);

  if (!profile && profileError)
    return (
      <div className="pb-4">
        <TabHeader eyebrow="Recovery" />
        <h1 className="t-title-1 mb-5 text-ivory">Recovery ledger</h1>
        <ErrorNote onRetry={() => void refetchProfile()}>Couldn&apos;t load your recovery settings. {(profileError as Error).message}</ErrorNote>
      </div>
    );
  if (loading || !profile) return <RecoverySkeleton />;

  const sleepGoal = Number(profile.sleep_goal_h);
  const fresh = !recent.isLoading && (recent.data ?? []).length === 0;

  return (
    <div className="pb-4">
      <TabHeader eyebrow="Recovery" />
      <h1 className="t-title-1 text-ivory">Recovery ledger</h1>
      <p className="t-callout mt-1.5 text-stone">Check-ins, readiness, rites and water, day by day.</p>

      {fresh && (
        <Link href="/?dawn=1" className="press-soft mt-5 flex min-h-16 items-center gap-3 rounded-card bg-m1 px-4 py-3 shadow-(--e1)">
          <span className="min-w-0 flex-1">
            <span className="t-title-3 block text-ivory">Your first check-in starts this page</span>
            <span className="t-meta mt-0.5 block text-stone">Three questions on Now, each morning. They land here.</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
        </Link>
      )}

      <DateStrip value={date} onChange={selectDay} today={today} startDate={startDate} className="mt-6" />

      <div ref={dayRef} className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start lg:gap-12">
        <div className="min-w-0 space-y-10">
          <GuidanceCard date={date} today={today} onCheckin={goToCheckin} />
          <LedgerCheckIn ref={checkin} date={date} today={today} sleepGoal={sleepGoal} />
        </div>
        <div className="min-w-0 space-y-10">
          <ReadinessHistory today={today} selected={date} sleepGoal={sleepGoal} onOpenDay={openDay} />
          <HabitsCard date={date} today={today} onCheckin={goToCheckin} />
          <WaterCard date={date} today={today} goalMl={profile.water_goal_ml} startDate={startDate} onPickDay={selectDay} />
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
        <WeeklyReviewCard today={today} startDate={startDate} />
        <HistoryCard today={today} startDate={startDate} onOpenDay={openDay} />
      </div>
    </div>
  );
}

export function RecoverySkeleton() {
  return (
    <div className="pb-4" aria-busy>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-3 h-4 w-72" />
      <Skeleton className="mt-6 h-[106px] w-full" />
      <Skeleton className="mt-6 h-40 w-full" />
      <Skeleton className="mt-6 h-72 w-full" />
    </div>
  );
}

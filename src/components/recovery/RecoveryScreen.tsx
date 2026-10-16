"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { useRecoveryDay } from "@/lib/data/recovery";
import { useSwapIn } from "@/lib/motion";
import { useReadiness } from "@/lib/recovery/hooks";
import {
  addDays,
  parseISODate,
  toISODate,
  weekStart,
  type ISODate,
} from "@/lib/dates";
import { CheckInCard, type CheckInHandle } from "./CheckInCard";
import { DateStrip } from "./DateStrip";
import { GuidanceCard } from "./GuidanceCard";
import { HabitsCard } from "./HabitsCard";
import { HistoryCard } from "./HistoryCard";
import { CardSkeleton, useEntrance } from "./parts";
import { WaterCard } from "./WaterCard";
import { WeeklyReviewCard } from "./WeeklyReviewCard";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST_WEEKS_BACK = 104;

/**
 * A `?date=` deep link, only when it is a real calendar day inside the editable range:
 * not in the future, not before the start date, not beyond the date strip's reach.
 */
function validDateParam(
  raw: string | null,
  today: ISODate,
  startDate: ISODate | null,
): ISODate | null {
  if (!raw || !ISO.test(raw)) return null;
  if (toISODate(parseISODate(raw)) !== raw) return null; // 2026-02-31
  if (raw > today) return null;
  const earliest = addDays(weekStart(today), -7 * EARLIEST_WEEKS_BACK);
  if (raw < earliest) return null;
  if (startDate && raw < startDate) return null;
  return raw;
}

export function RecoveryScreen() {
  const today = useToday();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { profile, loading } = useProfile();
  const enter = useEntrance();

  const wantCheckin = params.get("checkin") === "1";
  const paramDate = params.get("date");
  const [date, setDate] = useState<ISODate>(
    () => validDateParam(paramDate, today, null) ?? today,
  );
  // Once the profile is known, a deep link to before the start date falls back to today.
  const startDate = profile?.start_date ?? null;
  if (startDate && date < startDate && date !== today) setDate(today);

  // Links into this screen while it is already open (Quick Log's Check-in tile, a
  // ?date= link): follow them. A bare ?checkin=1 means today's check-in.
  const query = params.toString();
  const [seenQuery, setSeenQuery] = useState(query);
  if (query !== seenQuery) {
    setSeenQuery(query);
    const d = validDateParam(paramDate, today, startDate);
    if (d) setDate(d);
    else if (wantCheckin) setDate(today);
  }

  // Follow midnight: if you were on "today", stay on today when the date rolls over.
  const [seenToday, setSeenToday] = useState(today);
  if (seenToday !== today) {
    setSeenToday(today);
    if (date === seenToday) setDate(today);
  }

  const checkin = useRef<CheckInHandle>(null);

  const goToCheckin = useCallback(() => {
    const el = document.getElementById("checkin");
    if (!el) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => checkin.current?.focus(), reduce ? 0 : 350);
  }, []);

  const openDay = useCallback(
    (d: ISODate) => {
      setDate(d);
      window.setTimeout(goToCheckin, 60);
    },
    [goToCheckin],
  );

  // /recovery?checkin=1 — scroll to and focus the check-in once everything above it has
  // loaded (so nothing shifts it afterwards), then drop the flag.
  const readiness = useReadiness(date);
  const day = useRecoveryDay(date);
  // another day slides in from the side it lives on (earlier = left)
  const dayRef = useSwapIn<HTMLDivElement, ISODate>(date);
  const settled = !loading && !readiness.loading && !day.loading;
  const handled = useRef(false);
  useEffect(() => {
    if (!wantCheckin) {
      handled.current = false; // ready for the next ?checkin=1
      return;
    }
    if (handled.current || !settled) return;
    const t = window.setTimeout(() => {
      handled.current = true;
      goToCheckin();
      const next = new URLSearchParams(params.toString());
      next.delete("checkin");
      router.replace(next.size ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [wantCheckin, settled, goToCheckin, params, pathname, router]);

  if (loading || !profile) return <RecoverySkeleton />;

  const sleepGoal = Number(profile.sleep_goal_h);

  return (
    <div className="pb-4">
      <div className="lg:mb-6 lg:flex lg:items-end lg:justify-between lg:gap-10">
        <PageHeader
          eyebrow="Recovery"
          title="Recovery & Habits"
          className="mb-5 lg:mb-1"
        />
        <DateStrip
          value={date}
          onChange={setDate}
          today={today}
          startDate={startDate}
          className="lg:mb-0 lg:w-[440px] lg:shrink-0"
        />
      </div>

      {/* Mobile: guidance → check-in → water → habits. Desktop: check-in left, the rest right. */}
      <div
        ref={dayRef}
        className="flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:items-start lg:gap-4"
      >
        <div className="contents lg:col-span-7 lg:block">
          <CheckInCard
            ref={checkin}
            date={date}
            today={today}
            sleepGoal={sleepGoal}
            className={`order-2 ${enter(1).className ?? ""}`}
            style={enter(1).style}
          />
        </div>
        <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-4">
          <GuidanceCard
            date={date}
            today={today}
            onCheckin={goToCheckin}
            className={`order-1 ${enter(0).className ?? ""}`}
            style={enter(0).style}
          />
          <WaterCard
            date={date}
            today={today}
            goalMl={profile.water_goal_ml}
            className={`order-3 ${enter(2).className ?? ""}`}
            style={enter(2).style}
          />
          <HabitsCard
            date={date}
            today={today}
            onCheckin={goToCheckin}
            className={`order-4 ${enter(3).className ?? ""}`}
            style={enter(3).style}
          />
        </div>
      </div>

      <div className="mb-3 mt-9 flex items-baseline justify-between lg:mt-10">
        <h2 className="t-h2">History</h2>
      </div>
      <div className="grid gap-3 lg:grid-cols-12 lg:items-start lg:gap-4">
        <HistoryCard
          today={today}
          startDate={startDate}
          onOpenDay={openDay}
          className={`lg:col-span-6 ${enter(4).className ?? ""}`}
          style={enter(4).style}
        />
        <WeeklyReviewCard
          today={today}
          startDate={startDate}
          className={`lg:col-span-6 ${enter(5).className ?? ""}`}
          style={enter(5).style}
        />
      </div>
    </div>
  );
}

export function RecoverySkeleton() {
  return (
    <div className="pb-4" aria-busy>
      <div className="mb-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-9 w-64" />
      </div>
      <Skeleton className="mb-5 h-[106px] w-full" />
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:gap-4">
        <CardSkeleton className="lg:col-span-7" lines={6} />
        <div className="flex flex-col gap-3 lg:col-span-5 lg:gap-4">
          <CardSkeleton lines={2} />
          <CardSkeleton tall lines={1} />
        </div>
      </div>
    </div>
  );
}

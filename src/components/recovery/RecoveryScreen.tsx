"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { useRecoveryDay } from "@/lib/data/recovery";
import { useReadiness } from "@/lib/recovery/hooks";
import { type ISODate } from "@/lib/dates";
import { CheckInCard, type CheckInHandle } from "./CheckInCard";
import { DateStrip } from "./DateStrip";
import { GuidanceCard } from "./GuidanceCard";
import { HabitsCard } from "./HabitsCard";
import { HistoryCard } from "./HistoryCard";
import { CardSkeleton, useEntrance } from "./parts";
import { WaterCard } from "./WaterCard";
import { WeeklyReviewCard } from "./WeeklyReviewCard";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function RecoveryScreen() {
  const today = useToday();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { profile, loading } = useProfile();
  const enter = useEntrance();

  const wantCheckin = params.get("checkin") === "1";
  const paramDate = params.get("date");
  const [date, setDate] = useState<ISODate>(() =>
    paramDate && ISO.test(paramDate) && paramDate <= today ? paramDate : today,
  );

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
  const settled = !loading && !readiness.loading && !day.loading;
  const handled = useRef(false);
  useEffect(() => {
    if (!wantCheckin || handled.current || !settled) return;
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
  const startDate = profile.start_date ?? null;

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
          className="lg:mb-0 lg:w-[440px] lg:shrink-0"
        />
      </div>

      {/* Mobile: guidance → check-in → water → habits. Desktop: check-in left, the rest right. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:items-start lg:gap-4">
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

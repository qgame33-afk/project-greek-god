"use client";

import { Bed, CalendarDays, ChevronRight, GlassWater, ListChecks } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckInSheet, ENERGY, QUALITY, SORENESS, STRESS, TIREDNESS, readinessWord, sleepWords, wordFor } from "@/components/now/CheckIn";
import { HabitsList } from "@/components/now/habits";
import { BackHeader } from "@/components/shell/BackHeader";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/controls";
import { DayStrip, type StripDay } from "@/components/ui/day-strip";
import { ListGroup, Row } from "@/components/ui/list";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useDailyWater } from "@/lib/data/nutrition";
import { useProfile } from "@/lib/data/profile";
import { useRecovery } from "@/lib/data/recovery";
import { addDays, dateRange, dayName, monthName, parseISODate, toISODate, weekDates, weekStart, type ISODate } from "@/lib/dates";
import { rowToUpsert, storedSleep } from "@/lib/recovery/checkin";
import { hasSignal, type CheckinLite } from "@/lib/recovery/guidance";
import { useDeleteRecovery, useReadiness, useSaveCheckin } from "@/lib/recovery/hooks";
import { CustomiseSheet } from "./CustomiseSheet";
import { HistoryCard } from "./HistoryCard";
import { ReadinessHistory } from "./ReadinessHistory";
import { ReadinessSheet } from "./ReadinessSheet";
import { SleepGoalSheet } from "./SleepGoalSheet";
import { WaterCard } from "./WaterCard";
import { WeeklyReviewCard } from "./WeeklyReviewCard";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST_WEEKS_BACK = 104;

/** A `?date=` deep link, only when it is a real calendar day inside the editable range. */
function validDateParam(raw: string | null, today: ISODate): ISODate | null {
  if (!raw || !ISO.test(raw)) return null;
  if (toISODate(parseISODate(raw)) !== raw) return null; // 2026-02-31
  if (raw > today) return null;
  if (raw < addDays(weekStart(today), -7 * EARLIEST_WEEKS_BACK)) return null;
  return raw;
}

type Panel = "sleep" | "habits" | "water" | "weekly" | null;

/**
 * Check-ins (docs/DESIGN-V3-SIMPLE.md §4.6): the week strip (checked-in days ringed), the chosen
 * day's check-in with its result ("Ready" / "Go lighter") and an Edit pill that opens the check-in
 * sheet for that date, then four rows — Sleep (the last 14 nights, the sleep goal), Habits (that
 * day's habits, choosing habits, habits by month), Water (by day) and the weekly review.
 * `#habits` and `#history` open those rows; `/recovery?checkin=1` goes to Today's check-in.
 */
export function RecoveryScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const wantCheckin = params.get("checkin") === "1";
  useEffect(() => {
    if (wantCheckin) router.replace("/?dawn=1");
  }, [wantCheckin, router]);
  if (wantCheckin) return <RecoverySkeleton />;
  return <CheckIns />;
}

function CheckIns() {
  const today = useToday();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { profile, loading, error: profileError, refetch: refetchProfile } = useProfile();
  const paramDate = params.get("date");
  const [date, setDate] = useState<ISODate>(() => validDateParam(paramDate, today) ?? today);
  const [panel, setPanel] = useState<Panel>(null);
  const [edit, setEdit] = useState(false);
  const [goal, setGoal] = useState(false);
  const [customise, setCustomise] = useState(false);
  const [why, setWhy] = useState(false);

  // a ?date= link while the page is open: follow it
  const [seenParam, setSeenParam] = useState(paramDate);
  if (paramDate !== seenParam) {
    setSeenParam(paramDate);
    const d = validDateParam(paramDate, today);
    if (d) setDate(d);
  }
  // follow midnight when on "today"
  const [seenToday, setSeenToday] = useState(today);
  if (seenToday !== today) {
    setSeenToday(today);
    if (date === seenToday) setDate(today);
  }

  /** Choose the day (and keep it in the URL so a reload or share lands on it). */
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

  // #habits and #history open those rows once the page has content (read once, on the first ready render)
  const ready = !loading && !!profile;
  const [hashDone, setHashDone] = useState(false);
  if (ready && !hashDone && typeof window !== "undefined") {
    setHashDone(true);
    const h = window.location.hash;
    if (h === "#habits") setPanel("habits");
    else if (h === "#history") setPanel("sleep");
  }

  const week = useMemo(() => weekDates(date), [date]);
  const rec = useRecovery(addDays(today, -13) < week[0] ? addDays(today, -13) : week[0], today);
  const rows = useMemo(() => rec.data ?? [], [rec.data]);
  const row = rows.find((r) => r.local_date === date) ?? null;
  const readiness = useReadiness(date);
  const water = useDailyWater(weekStart(today), today);
  const del = useDeleteRecovery();
  const save = useSaveCheckin();

  if (!profile && profileError)
    return (
      <div className="pb-4">
        <BackHeader href="/" parent="Today" title="Check-ins" />
        <ErrorNote className="mt-5" onRetry={() => void refetchProfile()} />
      </div>
    );
  if (loading || !profile) return <RecoverySkeleton />;

  const thisWeek = weekStart(today);
  const days: StripDay[] = week.map((d) => {
    const r = rows.find((x) => x.local_date === d);
    const has = !!r && hasSignal(r as CheckinLite);
    return { date: d, state: has ? "logged" : "none", spoken: d > today ? undefined : has ? "checked in" : "not checked in" };
  });

  const word = readinessWord(readiness.guidance);
  const checked = !!row && hasSignal(row as CheckinLite);
  const caption = date === today ? "Today" : `${dayName(date, true)} ${parseISODate(date).getDate()} ${monthName(date, true)}`;
  const sleep = storedSleep(row?.sleep_hours);
  const facts: { label: string; value: string; danger?: boolean }[] = checked
    ? [
        { label: "Sleep", value: sleepWords(sleep) },
        { label: "Energy", value: wordFor(ENERGY, row?.energy) ?? "—" },
        { label: "Soreness", value: wordFor(SORENESS, row?.soreness) ?? "—" },
        ...(row?.fatigue != null ? [{ label: "Tiredness", value: wordFor(TIREDNESS, row.fatigue) ?? "—" }] : []),
        ...(row?.stress != null ? [{ label: "Stress", value: wordFor(STRESS, row.stress) ?? "—" }] : []),
        ...(row?.sleep_quality != null ? [{ label: "Sleep quality", value: wordFor(QUALITY, row.sleep_quality) ?? "—" }] : []),
        ...(row?.pain_notes?.trim() ? [{ label: "Pain", value: row.pain_notes.trim(), danger: true }] : []),
      ]
    : [];

  // the last 14 nights' average, and this week's water per day so far
  const nights = rows.filter((r) => r.local_date >= addDays(today, -13) && r.local_date <= today).map((r) => storedSleep(r.sleep_hours)).filter((h): h is number => h != null && h > 0);
  const avgSleep = nights.length ? Math.round((nights.reduce((a, h) => a + h, 0) / nights.length) * 12) / 12 : null;
  const elapsed = dateRange(thisWeek, today).length;
  const waterTotal = (water.data ?? []).reduce((a, r) => a + Number(r.total_ml ?? 0), 0);
  const waterAvg = water.data ? waterTotal / Math.max(1, elapsed) : null;

  const remove = () => {
    if (!row || del.isPending || row.id.startsWith("optimistic-")) return;
    const saved = row;
    setEdit(false);
    del.mutate(saved, {
      onSuccess: () =>
        toast("Check-in deleted", {
          id: `checkin-${date}`,
          duration: 6000,
          action: { label: "Undo", onClick: () => save.mutate(rowToUpsert(saved), { onError: () => toast.error("Couldn't bring the check-in back") }) },
        }),
    });
  };

  return (
    <div className="pb-4">
      <BackHeader href="/" parent="Today" title="Check-ins" />
      <DayStrip
        className="mb-4 mt-4"
        days={days}
        selected={date}
        today={today}
        futureInert
        onSelect={selectDay}
        onPrevWeek={week[0] > addDays(thisWeek, -7 * EARLIEST_WEEKS_BACK) ? () => selectDay(addDays(week[0], -1)) : undefined}
        onNextWeek={week[0] < thisWeek ? () => selectDay(addDays(week[0], 7) > today ? today : addDays(week[0], 7)) : undefined}
        ariaLabel="Check-in days"
      />

      {rec.isLoading ? (
        <Skeleton className="h-[220px] rounded-card" />
      ) : rec.error && !rec.data ? (
        <ErrorNote onRetry={() => void rec.refetch()} />
      ) : (
        <section aria-label={`${caption} check-in`} className="rounded-card bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="t-cap">{caption}</p>
              {checked && word ? (
                <button type="button" onClick={() => setWhy(true)} aria-describedby="why-hint" className="press-soft mt-0.5 flex items-center gap-1 text-left">
                  <span className="t-head" data-derived="">
                    {word}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-3" strokeWidth={2.2} aria-hidden />
                  <span id="why-hint" className="sr-only">
                    Shows how it is worked out.
                  </span>
                </button>
              ) : (
                <p className="t-head mt-0.5">Not checked in</p>
              )}
            </div>
            {checked && (
              <Pill onClick={() => setEdit(true)} ariaLabel={`Edit the ${caption.toLowerCase()} check-in`}>
                Edit
              </Pill>
            )}
          </div>
          {checked ? (
            <dl className="mt-4 border-t border-line pt-3">
              {facts.map((f) => (
                <div key={f.label} className="flex min-h-10 items-baseline justify-between gap-4 py-1">
                  <dt className={f.danger ? "t-body text-danger" : "t-body text-fg-2"}>{f.label}</dt>
                  <dd className={f.danger ? "t-row min-w-0 text-right text-danger [overflow-wrap:anywhere]" : "t-row text-right"}>{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <>
              <p className="t-label mt-1">{date === today ? "3 quick questions: sleep, energy and soreness." : "Add how you slept and felt that day."}</p>
              <Button variant="primary" size="md" block className="mt-4" onClick={() => setEdit(true)}>
                Check in
              </Button>
            </>
          )}
        </section>
      )}

      <ListGroup className="mt-3">
        <Row icon={Bed} title="Sleep" subtitle={avgSleep != null ? `${sleepWords(avgSleep)} a night, last 14 nights` : "No nights logged yet"} onClick={() => setPanel("sleep")} />
        <Row icon={ListChecks} title="Habits" subtitle="Edit what you track each day" onClick={() => setPanel("habits")} />
        <Row icon={GlassWater} title="Water" subtitle={waterAvg != null && waterTotal > 0 ? `${(waterAvg / 1000).toFixed(1)} L a day this week` : "None logged this week"} onClick={() => setPanel("water")} />
        <Row icon={CalendarDays} title="Weekly review" onClick={() => setPanel("weekly")} />
      </ListGroup>

      <CheckInSheet open={edit} onOpenChange={setEdit} date={date} onDelete={checked ? remove : undefined} />
      <ReadinessSheet open={why} onOpenChange={setWhy} guidance={readiness.guidance} title={`${caption} · ${word ?? "Check-in"}`} />

      <Sheet open={panel === "sleep"} onOpenChange={(o) => !o && setPanel(null)} title="Sleep">
        <div className="pb-2 pt-1">
          <ReadinessHistory
            today={today}
            selected={date}
            sleepGoal={Number(profile.sleep_goal_h)}
            onOpenDay={(d) => {
              setPanel(null);
              selectDay(d);
            }}
          />
          <ListGroup className="mt-5">
            <Row
              title="Sleep goal"
              value={sleepWords(Number(profile.sleep_goal_h))}
              onClick={() => {
                setPanel(null);
                setGoal(true);
              }}
            />
          </ListGroup>
        </div>
      </Sheet>
      <Sheet open={panel === "habits"} onOpenChange={(o) => !o && setPanel(null)} title="Habits" description={date === today ? "Today" : caption}>
        <div className="pb-2 pt-1">
          <HabitsList date={date} today={today} />
          <Button
            variant="secondary"
            block
            className="mt-4"
            onClick={() => {
              setPanel(null);
              setCustomise(true);
            }}
          >
            Choose habits
          </Button>
          <HistoryCard today={today} startDate={profile.start_date ?? null} onOpenDay={selectDay} />
        </div>
      </Sheet>
      <Sheet open={panel === "water"} onOpenChange={(o) => !o && setPanel(null)} title="Water">
        <div className="pb-2 pt-1">
          <WaterCard date={date} today={today} goalMl={profile.water_goal_ml} startDate={profile.start_date ?? null} onPickDay={selectDay} />
        </div>
      </Sheet>
      <Sheet open={panel === "weekly"} onOpenChange={(o) => !o && setPanel(null)} title="Weekly review">
        <div className="pb-2 pt-1">
          <WeeklyReviewCard today={today} startDate={profile.start_date ?? null} />
        </div>
      </Sheet>
      <SleepGoalSheet open={goal} onOpenChange={setGoal} current={Number(profile.sleep_goal_h)} />
      <CustomiseSheet open={customise} onOpenChange={setCustomise} />
    </div>
  );
}

export function RecoverySkeleton() {
  return (
    <div className="pb-4" aria-busy>
      <Skeleton className="mt-2 h-6 w-20 rounded-tile" />
      <Skeleton className="mt-3 h-9 w-44 rounded-tile" />
      <div className="mt-6 grid grid-cols-7 justify-items-center gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="size-[38px] rounded-full" />
        ))}
      </div>
      <Skeleton className="mt-5 h-[220px] rounded-card" />
      <Skeleton className="mt-3 h-[272px] rounded-tile-lg" />
    </div>
  );
}

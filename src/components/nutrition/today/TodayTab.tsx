"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { useUser } from "@/lib/data/core";
import { useDeleteFood, type FoodEntry } from "@/lib/data/nutrition";
import { addDays, type ISODate } from "@/lib/dates";
import { useSwapIn } from "@/lib/motion";
import { clampDay } from "@/lib/nutrition-ui/format";
import { asMeal, mealSections } from "@/lib/nutrition-ui/group";
import { FuelProvider, type Goals } from "../context";
import { DayTitle } from "../DateSwitcher";
import { EditFoodSheet, type EditState } from "../EditFoodSheet";
import { keepOpenOnToast, useDelayedFlag, useQueryHealth } from "../hooks";
import { LOG_TABS, LogSheet, type LogRequestState, type LogTab } from "../LogSheet";
import { SaveMealSheet, type SaveMealState } from "../SaveMealSheet";
import { DayMenu } from "./DayMenu";
import { FuelHero, FuelHeroSkeleton } from "./FuelHero";
import { Timeline } from "./Timeline";
import { useFuelDay } from "./useFuelDay";

/**
 * Fuel → Today (docs/DESIGN-V2.md §3.5.1): the day's protein hero and meters, the day line, then
 * the plan and the diary as one timeline. ?date=YYYY-MM-DD shows a past day; ?add=1[&meal=][&tab=]
 * opens the log sheet (the Offering's "Search food" lands here until the Sheets stream ships the
 * natural-language Offering). Food is added through the Offering (+), never a FAB here.
 */
export function TodayTab({ today, onDateChange }: { today: ISODate; onDateChange?: (d: ISODate) => void }) {
  const params = useSearchParams();
  const date = clampDay(params.get("date"), today);
  const isToday = date === today;
  const day = useFuelDay(date, today);
  const { userId } = useUser();
  const { food, water, goals, timeline } = day;
  const contentRef = useSwapIn<HTMLDivElement, ISODate>(date);

  const legacyGoals: Goals | null = useMemo(
    () => (goals ? { calories: goals.kcal, protein: goals.protein, carbs: goals.carbs, fat: goals.fat, waterMl: goals.waterMl } : null),
    [goals],
  );

  const [logState, setLogState] = useState<LogRequestState>({ open: false, nonce: 0 });
  const [edit, setEdit] = useState<EditState>({ open: false, nonce: 0, entry: null });
  const [saveMeal, setSaveMeal] = useState<SaveMealState>({ open: false, nonce: 0, section: null });

  const openLog = useCallback((r?: { meal?: ReturnType<typeof asMeal>; tab?: LogTab }) => setLogState((s) => ({ open: true, nonce: s.nonce + 1, meal: r?.meal, tab: r?.tab })), []);
  const openEdit = useCallback((entry: FoodEntry) => setEdit((s) => ({ open: true, nonce: s.nonce + 1, entry })), []);
  const setDate = useCallback(
    (d: ISODate) => {
      const next = clampDay(d, today);
      const sp = new URLSearchParams(window.location.search);
      if (next === today) sp.delete("date");
      else sp.set("date", next);
      const qs = sp.toString();
      window.history.replaceState(window.history.state, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
      onDateChange?.(next);
    },
    [today, onDateChange],
  );

  // Deep link: ?add=1 opens the log sheet once (meal and panel preselected), then the params go.
  // Not mapped to openOffering yet: the seeded Offering's "Search food" comes here (it would bounce).
  const wantsAdd = params.get("add") === "1";
  const [handledAdd, setHandledAdd] = useState(false);
  if (wantsAdd && !handledAdd) {
    setHandledAdd(true);
    const t = params.get("tab") as LogTab | null;
    const m = params.get("meal");
    setLogState((s) => ({ open: true, nonce: s.nonce + 1, meal: m ? asMeal(m) : undefined, tab: t && LOG_TABS.includes(t) ? t : undefined }));
  }
  if (!wantsAdd && handledAdd) setHandledAdd(false);
  useEffect(() => {
    if (!wantsAdd) return;
    const sp = new URLSearchParams(window.location.search);
    ["add", "meal"].forEach((k) => sp.delete(k));
    if (LOG_TABS.includes(sp.get("tab") as LogTab)) sp.delete("tab");
    const qs = sp.toString();
    window.history.replaceState(window.history.state, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [wantsAdd]);

  // Desktop: ← / → step through days when nothing else has focus.
  const anySheet = logState.open || edit.open || saveMeal.open;
  useEffect(() => {
    if (anySheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input,textarea,select,button,[role=tab],[contenteditable],[role=dialog],[role=menu]") || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") setDate(addDays(date, -1));
      else if (e.key === "ArrowRight" && date < today) setDate(addDays(date, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anySheet, date, today, setDate]);

  const sections = useMemo(() => mealSections(food.entries), [food.entries]);
  const loading = day.profileLoading || food.loading;
  const showSkeleton = useDelayedFlag(loading, 150);
  // a failed load must never read as "nothing logged": "—" until real rows arrive
  const foodHealth = useQueryHealth(["food", date, userId]);
  const waterHealth = useQueryHealth(["water", date, userId]);
  const foodUnknown = !!food.error && !foodHealth.hasData && food.entries.length === 0;
  const waterUnknown = waterHealth.failed && !waterHealth.hasData;

  const del = useDeleteFood();
  const removing = useRef(new Set<string>());
  const removeGroup = (rows: FoodEntry[]) => {
    const fresh = rows.filter((r) => !removing.current.has(r.id));
    if (!fresh.length) return;
    fresh.forEach((r) => removing.current.add(r.id));
    del
      .mutateAsync({ ids: fresh.map((r) => r.id), date, rows: fresh, label: `Removed ${fresh.length} items` })
      .catch(() => {})
      .finally(() => fresh.forEach((r) => removing.current.delete(r.id)));
  };

  const hasRows = timeline.rows.some((r) => r.kind !== "now");
  const noPlanThisWeek = !day.planLoading && !day.hasPlanWeek;
  const planHref = "/nutrition?tab=week&generate=1";

  return (
    <FuelProvider date={date} today={today} goals={legacyGoals} entries={food.entries} openLog={openLog} openEdit={openEdit} setDate={setDate}>
      <DayTitle
        date={date}
        today={today}
        onChange={setDate}
        calorieGoal={goals?.kcal ?? 0}
        extra={<DayMenu sections={sections} onSaveMeal={(s) => setSaveMeal((st) => ({ open: true, nonce: st.nonce + 1, section: s }))} />}
      />

      <div ref={contentRef} className="mt-5">
        {foodUnknown && (
          <ErrorNote className="mb-5" onRetry={() => void food.refetch()}>
            Couldn&apos;t load this day. Your entries are safe; check the connection.
          </ErrorNote>
        )}
        {!day.profile && day.profileError ? (
          <ErrorNote onRetry={() => void day.refetchProfile()}>Couldn&apos;t load your daily targets.</ErrorNote>
        ) : loading ? (
          showSkeleton ? <FuelHeroSkeleton /> : <div className="h-72" aria-hidden />
        ) : (
          <FuelHero
            eaten={timeline.eaten}
            remaining={timeline.remaining}
            remainingCount={timeline.remainingCount}
            missedCount={timeline.missedCount}
            goals={goals}
            unknown={foodUnknown}
            isToday={isToday}
            date={date}
            today={today}
            waterMl={water.hasData ? water.totalMl : null}
            waterUnknown={waterUnknown}
          />
        )}

        <section aria-label="Timeline" className="mt-6">
          {loading || day.planLoading ? (
            showSkeleton && <TimelineSkeleton />
          ) : foodUnknown ? null : (
            <>
              {hasRows ? (
                <Timeline rows={timeline.rows} eaten={timeline.eaten} date={date} today={today} isToday={isToday} onEdit={openEdit} onRemoveGroup={removeGroup} />
              ) : null}
              {!hasRows && (
                <EmptyDay isToday={isToday} planned={timeline.plannedCount > 0} noPlan={noPlanThisWeek} planHref={planHref} />
              )}
              {hasRows && noPlanThisWeek && isToday && <NoPlanPlacard href={planHref} />}
            </>
          )}
        </section>
      </div>

      {/* Tapping a toast's Undo never dismisses the sheet underneath (the user keeps their place). */}
      <LogSheet state={logState} onOpenChange={keepOpenOnToast((o) => setLogState((s) => ({ ...s, open: o })))} />
      <EditFoodSheet state={edit} onOpenChange={keepOpenOnToast((o) => setEdit((s) => ({ ...s, open: o })))} />
      <SaveMealSheet state={saveMeal} onOpenChange={keepOpenOnToast((o) => setSaveMeal((s) => ({ ...s, open: o })))} />
    </FuelProvider>
  );
}

function EmptyDay({ isToday, planned, noPlan, planHref }: { isToday: boolean; planned: boolean; noPlan: boolean; planHref: string }) {
  if (!isToday)
    return (
      <div className="border-y border-vein py-8 text-center">
        <p className="t-title-2 text-ivory">Nothing logged that day</p>
        <p className="t-callout mt-1 text-stone">{planned ? "Its planned meals are above." : "No meals were planned for it either."}</p>
      </div>
    );
  return (
    <div className="flex flex-col items-center border-y border-vein px-2 py-9 text-center">
      <p className="t-title-2 text-ivory">Nothing logged yet</p>
      <p className="t-callout mt-1.5 max-w-[30ch] text-stone">Tap + to log food{noPlan ? ", or plan your week and your meals appear here at your times" : ""}.</p>
      {noPlan && (
        <Button asChild variant="outline" size="md" className="mt-5 rounded-full">
          <Link href={planHref}>
            <CalendarPlus className="size-[18px]" strokeWidth={1.6} />
            Plan this week
          </Link>
        </Button>
      )}
    </div>
  );
}

/** Logged food but no plan this week: one quiet placard (never gold; it is not earned). */
function NoPlanPlacard({ href }: { href: string }) {
  return (
    <div className="mt-6 flex items-center gap-3 border-y border-vein py-3">
      <div className="min-w-0 flex-1">
        <p className="t-title-3 text-ivory">No meals planned</p>
        <p className="t-meta text-stone">Planned meals land here at your times, one tap to log.</p>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0 rounded-full">
        <Link href={href}>Plan this week</Link>
      </Button>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="mt-2 h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

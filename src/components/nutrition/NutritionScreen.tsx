"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MessagesSquare, NotebookPen, ScanLine } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { useToday, useUser } from "@/lib/data/core";
import { useFoodEntries, useWater, type FoodEntry } from "@/lib/data/nutrition";
import { useProfile } from "@/lib/data/profile";
import { addDays, type ISODate } from "@/lib/dates";
import { useSwapIn } from "@/lib/motion";
import { clampDay } from "@/lib/nutrition-ui/format";
import { asMeal, mealSections } from "@/lib/nutrition-ui/group";
import { FuelProvider, useFuel, type Goals, type LogRequest } from "./context";
import { DateSwitcher } from "./DateSwitcher";
import { EditFoodSheet, type EditState } from "./EditFoodSheet";
import { FuelRings, FuelRingsSkeleton, NoTargets } from "./FuelRings";
import { keepOpenOnToast, useDelayedFlag, useQueryHealth } from "./hooks";
import { LOG_TABS, LogSheet, type LogRequestState, type LogTab } from "./LogSheet";
import { MealCard, MealCardSkeleton } from "./MealCard";
import { RecentRail } from "./RecentRail";
import { SaveMealSheet, type SaveMealState } from "./SaveMealSheet";
import { WaterCard } from "./WaterCard";
import { WeekStrip } from "./WeekStrip";

/**
 * /nutrition — the Fuel screen. URL: ?date=YYYY-MM-DD (past days), ?add=1[&meal=][&tab=] opens the log sheet.
 * Everything here is per-user, per-timezone and fetched on the client, so the server sends only the frame.
 */
export function NutritionScreen() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <ScreenFrame />;
  return <Screen />;
}

function ScreenFrame() {
  return (
    <div className="mx-auto max-w-[1040px]" aria-busy="true">
      <header className="mb-5 lg:mb-7">
        <p className="eyebrow mb-2">Nutrition</p>
        <h1 className="t-title">Fuel</h1>
      </header>
      <div className="h-[372px]" />
    </div>
  );
}

function Screen() {
  const params = useSearchParams();
  const today = useToday();
  const date = clampDay(params.get("date"), today);
  const { userId, loading: userLoading } = useUser();
  const { profile, loading: profileLoading, error: profileError, refetch: refetchProfile } = useProfile();
  const food = useFoodEntries(date);
  const water = useWater(date);
  // another day's meals slide in from the side that day lives on (earlier = left)
  const mealsRef = useSwapIn<HTMLDivElement, ISODate>(date);

  const goals: Goals | null = useMemo(
    () =>
      profile
        ? {
            calories: Number(profile.calorie_goal) || 0,
            protein: Number(profile.protein_goal) || 0,
            carbs: Number(profile.carb_goal) || 0,
            fat: Number(profile.fat_goal) || 0,
            waterMl: Number(profile.water_goal_ml) || 0,
          }
        : null,
    [profile],
  );

  const [logState, setLogState] = useState<LogRequestState>({ open: false, nonce: 0 });
  const [edit, setEdit] = useState<EditState>({ open: false, nonce: 0, entry: null });
  const [saveMeal, setSaveMeal] = useState<SaveMealState>({ open: false, nonce: 0, section: null });
  const [openRow, setOpenRow] = useState<string | null>(null);

  const openLog = useCallback((r?: LogRequest) => setLogState((s) => ({ open: true, nonce: s.nonce + 1, meal: r?.meal, tab: r?.tab })), []);
  const openEdit = useCallback((entry: FoodEntry) => setEdit((s) => ({ open: true, nonce: s.nonce + 1, entry })), []);
  const setDate = useCallback(
    (d: ISODate) => {
      const next = clampDay(d, today);
      const sp = new URLSearchParams(window.location.search);
      if (next === today) sp.delete("date");
      else sp.set("date", next);
      const qs = sp.toString();
      window.history.replaceState(null, "", qs ? `/nutrition?${qs}` : "/nutrition");
      setOpenRow(null);
    },
    [today],
  );

  // Deep link: /nutrition?add=1 opens the log sheet once, then the param is dropped.
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
    ["add", "meal", "tab"].forEach((k) => sp.delete(k));
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `/nutrition?${qs}` : "/nutrition");
  }, [wantsAdd]);

  // Desktop: ← / → step through days when nothing else has focus.
  const anySheet = logState.open || edit.open || saveMeal.open;
  useEffect(() => {
    if (anySheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input,textarea,select,[contenteditable],[role=dialog],[role=menu]") || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") setDate(addDays(date, -1));
      else if (e.key === "ArrowRight" && date < today) setDate(addDays(date, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anySheet, date, today, setDate]);

  const sections = useMemo(() => mealSections(food.entries), [food.entries]);
  const loading = userLoading || profileLoading || food.loading;
  const showSkeleton = useDelayedFlag(loading, 150);
  // A failed load must never read as "nothing logged": show "—" until real rows arrive.
  const foodHealth = useQueryHealth(["food", date, userId]);
  const waterHealth = useQueryHealth(["water", date, userId]);
  const foodUnknown = !!food.error && !foodHealth.hasData;
  const waterUnknown = waterHealth.failed && !waterHealth.hasData;

  return (
    <FuelProvider date={date} today={today} goals={goals} entries={food.entries} openLog={openLog} openEdit={openEdit} setDate={setDate}>
      <div className="mx-auto max-w-[1040px]">
        <header className="mb-5 flex items-end justify-between gap-3 lg:mb-7">
          <div className="min-w-0">
            <p className="eyebrow mb-2">Nutrition</p>
            <h1 className="t-title">Fuel</h1>
          </div>
          <DateSwitcher date={date} today={today} onChange={setDate} calorieGoal={goals?.calories ?? 0} />
        </header>

        {food.error ? (
          <ErrorNote className="mb-4" onRetry={() => food.refetch()}>
            Couldn&apos;t load this day. Check your connection.
          </ErrorNote>
        ) : null}

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-5">
          <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-5">
            <div className="order-1 lg:order-none">
              {loading ? (
                showSkeleton ? <FuelRingsSkeleton /> : <div className="h-[372px]" aria-hidden />
              ) : goals && goals.calories > 0 ? (
                <FuelRings
                  totals={foodUnknown ? null : food.totals}
                  goals={goals}
                  waterMl={waterUnknown ? null : water.totalMl}
                  isToday={date === today}
                  empty={food.entries.length === 0}
                />
              ) : !profile && profileError ? (
                // The targets didn't load; that is not the same as having none set.
                <ErrorNote onRetry={() => void refetchProfile()}>Couldn&apos;t load your daily targets. {(profileError as Error).message}</ErrorNote>
              ) : (
                <NoTargets />
              )}
            </div>
            <Actions className="order-2 lg:order-none" />
            {goals && (
              <div className="order-5 lg:order-none">
                <WaterCard date={date} today={today} goalMl={goals.waterMl} unknown={waterUnknown} />
              </div>
            )}
            {goals && goals.calories > 0 && (
              <div className="order-6 lg:order-none">
                <WeekStrip date={date} today={today} goals={goals} onPick={setDate} />
              </div>
            )}
          </div>

          <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-4">
            <div className="order-3 lg:order-none">
              <RecentRail />
            </div>
            <div ref={mealsRef} className="order-4 flex flex-col gap-3 lg:order-none">
              {loading
                ? showSkeleton && [0, 1, 2, 3].map((i) => <MealCardSkeleton key={i} />)
                : foodUnknown
                  ? <MealsUnavailable />
                  : sections.map((s) => (
                    <MealCard
                      key={s.meal}
                      section={s}
                      openRow={openRow}
                      setOpenRow={setOpenRow}
                      onSaveMeal={(sec) => setSaveMeal((st) => ({ open: true, nonce: st.nonce + 1, section: sec }))}
                    />
                  ))}
              {!loading && !foodUnknown && food.entries.length > 0 && <DayTotalLine />}
            </div>
          </div>
        </div>
      </div>

      {/* Tapping a toast's Undo never dismisses the sheet underneath (the user keeps their place). */}
      <LogSheet state={logState} onOpenChange={keepOpenOnToast((o) => setLogState((s) => ({ ...s, open: o })))} />
      <EditFoodSheet state={edit} onOpenChange={keepOpenOnToast((o) => setEdit((s) => ({ ...s, open: o })))} />
      <SaveMealSheet state={saveMeal} onOpenChange={keepOpenOnToast((o) => setSaveMeal((s) => ({ ...s, open: o })))} />
    </FuelProvider>
  );
}

/** Primary actions: SCAN MY MEAL is the screen's one gold fill. */
function Actions({ className }: { className?: string }) {
  const { openLog } = useFuel();
  const firstVisit = useFirstVisitThisSession("pgg.sheen.scan");
  return (
    <div className={className}>
      <Button asChild variant="primary" size="lg" block shine={firstVisit}>
        <Link href="/nutrition/scan">
          <ScanLine className="size-5" strokeWidth={2.2} />
          Scan my meal
        </Link>
      </Button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button asChild variant="secondary" size="md">
          <Link href="/nutrition/coach">
            <MessagesSquare className="size-[18px] text-gold-300" />
            Ask Food Coach
          </Link>
        </Button>
        <Button variant="secondary" size="md" onClick={() => openLog({ tab: "manual" })}>
          <NotebookPen className="size-[18px] text-gold-300" />
          Add manually
        </Button>
      </div>
    </div>
  );
}

function MealsUnavailable() {
  return (
    <div className="card-instrument px-5 py-8 text-center" role="status">
      <p className="text-[15px] font-bold text-fg">Meals didn&apos;t load</p>
      <p className="mx-auto mt-1 max-w-[34ch] text-[13px] leading-relaxed text-fg-2">Your entries are safe. They&apos;ll show here once the day loads.</p>
    </div>
  );
}

function DayTotalLine() {
  const { entries } = useFuel();
  const n = entries.length;
  return (
    <p className="px-1 pt-1 text-center text-[12px] font-medium text-fg-3">
      {n} {n === 1 ? "entry" : "entries"} · tap one to edit{" "}
      <span className="md:hidden">· swipe left for quick actions</span>
    </p>
  );
}

/* ------------------------------------------------- once-per-session flag */

const seen = new Map<string, boolean>();
const noop = () => () => {};
function firstVisit(key: string) {
  if (!seen.has(key)) {
    let first = false;
    try {
      first = !window.sessionStorage.getItem(key);
      window.sessionStorage.setItem(key, "1");
    } catch {
      first = false;
    }
    seen.set(key, first);
  }
  return seen.get(key)!;
}
function useFirstVisitThisSession(key: string) {
  return useSyncExternalStore(
    noop,
    () => firstVisit(key),
    () => false,
  );
}

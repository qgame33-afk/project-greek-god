"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { addDays, parseISODate, toISODate, type ISODate } from "@/lib/dates";
import { useSwapIn } from "@/lib/motion";
import { DaySheet } from "./DaySheet";
import { PLAN_AHEAD, PLAN_BACK, useTrainingWeek } from "./hooks";
import { LiftsPage, type LiftsView } from "./lifts/LiftsTab";
import { ProgramTab } from "./ProgramTab";
import { TrainingSkeleton } from "./Skeletons";
import { useMounted } from "./useMounted";
import { useRefreshRestored } from "./useRefreshRestored";
import { VolumePage } from "./volume/VolumePage";
import { WeekView } from "./week/WeekView";

type Tab = "week" | "program" | "volume" | "lifts";
const TABS: Tab[] = ["week", "program", "volume", "lifts"];

/**
 * The page a URL asks for (docs/DESIGN-V3-SIMPLE.md §3.7): the week by default; `program`,
 * `volume` and `lifts` (`&view=library|history`); the old `history` and `exercises` open Lifts.
 * Anything else (an old sheet query such as `?vb=1`) lands on the week without an error.
 */
export function tabFromParams(tab: string | null, view: string | null): { tab: Tab; view: LiftsView } {
  if (tab === "history") return { tab: "lifts", view: "history" };
  if (tab === "exercises") return { tab: "lifts", view: "library" };
  const t: Tab = tab && (TABS as string[]).includes(tab) ? (tab as Tab) : "week";
  return { tab: t, view: view === "history" ? "history" : "library" };
}

/** A real calendar date in YYYY-MM-DD inside the window the hub has plans for, else null. */
function validDay(d: string | null, today: ISODate): ISODate | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (toISODate(parseISODate(d)) !== d) return null;
  return d >= addDays(today, -PLAN_BACK) && d <= addDays(today, PLAN_AHEAD) ? d : null;
}

/**
 * /training — Train (§4.3): the week, and its pushed pages Program (`?tab=program`), Sets by
 * muscle (`?tab=volume`) and Lifts (`?tab=lifts`), plus `?day=YYYY-MM-DD` (that day's sheet).
 * Moving between them uses the History API (no server round trip), so it works with no signal.
 */
export function TrainingHub() {
  const mounted = useMounted();
  return mounted ? <Hub /> : <TrainingSkeleton />;
}

function Hub() {
  const week = useTrainingWeek();
  useRefreshRestored();
  const pathname = usePathname();
  const params = useSearchParams();
  const { tab, view } = tabFromParams(params.get("tab"), params.get("view"));
  const dayParam = params.get("day");
  const panelRef = useSwapIn<HTMLDivElement, number>(TABS.indexOf(tab));

  const [day, setDay] = useState<ISODate | null>(() => validDay(dayParam, week.today));
  const [dayOpen, setDayOpen] = useState(!!day);
  // a new ?day= while the hub is mounted (from Today) opens it too
  const [seenParam, setSeenParam] = useState(dayParam);
  if (dayParam !== seenParam) {
    setSeenParam(dayParam);
    const d = validDay(dayParam, week.today);
    if (d) {
      setDay(d);
      setDayOpen(true);
    }
  }

  const setParams = useCallback(
    (patch: Record<string, string | null>, push = false) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) sp.delete(k);
        else sp.set(k, v);
      }
      const qs = sp.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (push) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [params, pathname],
  );
  /** Open a Train page (a push, so Back returns here). */
  const go = useCallback((href: string) => {
    window.history.pushState(null, "", href);
    window.scrollTo({ top: 0 });
  }, []);

  const openDay = (d: ISODate) => {
    setDay(d);
    setDayOpen(true);
  };
  const onDayOpenChange = (o: boolean) => {
    setDayOpen(o);
    if (!o && dayParam) setParams({ day: null });
  };

  return (
    <div className="pb-4">
      <div ref={panelRef}>
        {tab === "week" && <WeekView week={week} onDay={openDay} go={go} />}
        {tab === "program" && <ProgramTab week={week} />}
        {tab === "volume" && <VolumePage week={week} />}
        {tab === "lifts" && <LiftsPage week={week} view={view} onView={(v) => setParams({ tab: "lifts", view: v === "library" ? null : v })} />}
      </div>
      <DaySheet date={day} open={dayOpen && !!day} onOpenChange={onDayOpenChange} week={week} />
    </div>
  );
}

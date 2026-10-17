"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { TabHeader } from "@/components/shell/TabHeader";
import { Segmented } from "@/components/ui/controls";
import { addDays, parseISODate, toISODate, type ISODate } from "@/lib/dates";
import type { Session } from "@/lib/data/training";
import { useSwapIn } from "@/lib/motion";
import { DaySheet } from "./DaySheet";
import { PLAN_AHEAD, PLAN_BACK, useAllPREvents, useTrainingWeek, useUnits } from "./hooks";
import { LiftsTab, type LiftsView } from "./lifts/LiftsTab";
import { ProgramTab } from "./ProgramTab";
import { SessionSheet } from "./SessionSheet";
import { TrainingSkeleton } from "./Skeletons";
import { useMounted } from "./useMounted";
import { VolleyballSheet } from "./VolleyballSheet";
import { WeekTab } from "./week/WeekTab";

type Tab = "week" | "program" | "lifts";
const TABS: Tab[] = ["week", "program", "lifts"];
const TAB_LABEL: Record<Tab, string> = { week: "Week", program: "Program", lifts: "Lifts" };

/**
 * The tab a URL asks for (docs/DESIGN-V2.md §2.3): week by default; the old `history` and
 * `exercises` tabs open Lifts on that view.
 */
export function tabFromParams(tab: string | null, view: string | null): { tab: Tab; view: LiftsView } {
  if (tab === "history") return { tab: "lifts", view: "history" };
  if (tab === "exercises") return { tab: "lifts", view: "library" };
  const t: Tab = tab && (TABS as string[]).includes(tab) ? (tab as Tab) : "week";
  return { tab: t, view: view === "history" ? "history" : "library" };
}

/**
 * A real calendar date in YYYY-MM-DD (rejects 2026-02-31 and friends) inside the window the
 * hub has plans for (two weeks either side of today), else null.
 */
function validDay(d: string | null, today: ISODate): ISODate | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (toISODate(parseISODate(d)) !== d) return null;
  return d >= addDays(today, -PLAN_BACK) && d <= addDays(today, PLAN_AHEAD) ? d : null;
}

/**
 * /training — Train (docs/DESIGN-V2.md §3.4): Week · Program · Lifts.
 * Deep links: ?tab=week|program|lifts (&view=library|history), the old ?tab=history|exercises,
 * and ?day=YYYY-MM-DD (opens that day's sheet on any tab).
 */
export function TrainingHub() {
  const mounted = useMounted();
  return mounted ? <Hub /> : <TrainingSkeleton />;
}

function Hub() {
  const week = useTrainingWeek();
  const { unit } = useUnits();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { tab, view } = tabFromParams(params.get("tab"), params.get("view"));
  const dayParam = params.get("day");
  // switching sections slides the panel in from the side of the tab that was picked
  const panelRef = useSwapIn<HTMLDivElement, number>(TABS.indexOf(tab));

  const [day, setDay] = useState<ISODate | null>(() => validDay(dayParam, week.today));
  const [dayOpen, setDayOpen] = useState(!!day);
  // A new ?day= while the hub is already mounted (e.g. from Now) opens it too.
  const [seenParam, setSeenParam] = useState(dayParam);
  if (dayParam !== seenParam) {
    setSeenParam(dayParam);
    const d = validDay(dayParam, week.today);
    if (d) {
      setDay(d);
      setDayOpen(true);
    }
  }
  const [vb, setVb] = useState<{ open: boolean; date: ISODate }>({ open: false, date: week.today });
  const [session, setSession] = useState<Session | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const prs = useAllPREvents();
  const prSetIds = useMemo(() => new Set((prs.data ?? []).map((p) => p.set_id).filter((x): x is string => !!x)), [prs.data]);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) sp.delete(k);
        else sp.set(k, v);
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

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
      <TabHeader eyebrow="Train" oracle={{ kind: "train", label: oracleLabel(week) }} />
      <Segmented
        ariaLabel="Train sections"
        value={tab}
        onChange={(v) => setParams({ tab: v === "week" ? null : v, view: null })}
        options={TABS.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
        className="mb-6 lg:max-w-sm"
      />

      <div ref={panelRef} role="tabpanel" aria-label={TAB_LABEL[tab]}>
        {tab === "week" && <WeekTab week={week} onDay={openDay} onLogVolleyball={() => setVb({ open: true, date: week.today })} />}
        {tab === "program" && <ProgramTab week={week} />}
        {tab === "lifts" && <LiftsTab week={week} view={view} onView={(v) => setParams({ tab: "lifts", view: v === "library" ? null : v })} onStartToday={() => openDay(week.today)} />}
      </div>

      <DaySheet
        date={day}
        open={dayOpen && !!day}
        onOpenChange={onDayOpenChange}
        week={week}
        onLogVolleyball={(d) => {
          setDayOpen(false);
          setVb({ open: true, date: d });
        }}
        onOpenSession={(s) => {
          setDayOpen(false);
          setSession(s);
          setSessionOpen(true);
        }}
      />
      <VolleyballSheet open={vb.open} onOpenChange={(o) => setVb((v) => ({ ...v, open: o }))} date={vb.date} today={week.today} recent={week.volleyball} />
      <SessionSheet session={session} open={sessionOpen} onOpenChange={setSessionOpen} prSetIds={prSetIds} unit={unit} />
    </div>
  );
}

function oracleLabel(week: ReturnType<typeof useTrainingWeek>) {
  const t = week.resolve(week.today).template;
  const n = week.weekNo ? `Week ${week.weekNo}` : "This week";
  return t ? `${n} · ${t.name} today` : `${n} · rest day`;
}

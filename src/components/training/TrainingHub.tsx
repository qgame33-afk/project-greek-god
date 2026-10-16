"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Segmented } from "@/components/ui/controls";
import { ErrorNote, PageHeader } from "@/components/ui/misc";
import { dayName, longDate, type ISODate } from "@/lib/dates";
import type { Session } from "@/lib/data/training";
import { DaySheet } from "./DaySheet";
import { ExercisesTab } from "./ExercisesTab";
import { HistoryTab } from "./HistoryTab";
import { LegAdviceCard, MissedCard, NextWorkoutCard, WeekCard } from "./HubCards";
import { useAllPREvents, useTrainingWeek, useUnits } from "./hooks";
import { ProgramTab } from "./ProgramTab";
import { SessionSheet } from "./SessionSheet";
import { TrainingSkeleton } from "./Skeletons";
import { useMounted } from "./useMounted";
import { VolleyballSheet } from "./VolleyballSheet";

type Tab = "program" | "history" | "exercises";
const TABS: Tab[] = ["program", "history", "exercises"];

/**
 * /training — the week as a colonnade, today's workout, quiet catch-up for missed sessions,
 * lapis advice for heavy volleyball weeks, then Program | History | Exercises.
 * Deep links: ?tab=history|exercises, ?day=YYYY-MM-DD (opens that day's sheet).
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
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "program";
  const dayParam = params.get("day");

  const [day, setDay] = useState<ISODate | null>(dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : null);
  const [dayOpen, setDayOpen] = useState(!!day);
  const [vb, setVb] = useState<{ open: boolean; date: ISODate }>({ open: false, date: week.today });
  const [session, setSession] = useState<Session | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const prs = useAllPREvents();
  const prSetIds = useMemo(() => new Set((prs.data ?? []).map((p) => p.set_id).filter((x): x is string => !!x)), [prs.data]);

  const setParam = useCallback(
    (k: string, v: string | null) => {
      const sp = new URLSearchParams(params.toString());
      if (v == null) sp.delete(k);
      else sp.set(k, v);
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
    if (!o && dayParam) setParam("day", null);
  };

  const missed = week.missed[0];

  return (
    <div className="pb-4">
      <PageHeader eyebrow={`${dayName(week.today)} · ${longDate(week.today).split(", ")[1]}`} title="Training" />

      {week.error && (
        <ErrorNote className="mb-4" onRetry={week.refetch}>
          Couldn&apos;t load this week. Check your connection.
        </ErrorNote>
      )}

      <div className="grid gap-3 lg:grid-cols-12 lg:gap-4">
        <WeekCard
          week={week}
          onDay={openDay}
          onVolleyball={() => setVb({ open: true, date: week.today })}
          className="lg:col-span-7"
        />
        <NextWorkoutCard week={week} onDay={openDay} className="lg:col-span-5" />
        {!week.loading && missed && <MissedCard week={week} missed={missed} className="lg:col-span-6" />}
        {!week.loading && <LegAdviceCard week={week} className={missed ? "lg:col-span-6" : "lg:col-span-12"} />}
      </div>

      <div className="sticky top-[calc(52px+var(--safe-top))] z-10 -mx-4 mt-8 bg-[rgb(8_9_12/.97)] px-4 py-2 md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 lg:max-w-[480px]">
        <Segmented
          ariaLabel="Training sections"
          value={tab}
          onChange={(v) => setParam("tab", v === "program" ? null : v)}
          options={[
            { value: "program", label: "Program" },
            { value: "history", label: "History" },
            { value: "exercises", label: "Exercises" },
          ]}
        />
      </div>

      <div className="mt-5" role="tabpanel" aria-label={tab}>
        {tab === "program" && <ProgramTab week={week} />}
        {tab === "history" && <HistoryTab week={week} onStartToday={() => openDay(week.today)} />}
        {tab === "exercises" && <ExercisesTab today={week.today} />}
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

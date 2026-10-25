"use client";

import { useMemo, useState } from "react";
import { ListGroup, Row } from "@/components/ui/list";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { addDays, dayName, monthName, parseISODate, weekStart, type ISODate } from "@/lib/dates";
import { useAllSessions, type Session } from "@/lib/data/training";
import { groupByWeek } from "@/lib/training/schedule";
import { plural } from "../format";
import { MODE_LABEL, useAllPREvents, useUnits, type useTrainingWeek } from "../hooks";
import { SessionSheet } from "../SessionSheet";

type Week = ReturnType<typeof useTrainingWeek>;

/** "Thu 22 Oct" */
const dmy = (d: ISODate) => `${dayName(d, true)} ${parseISODate(d).getDate()} ${monthName(d, true)}`;

/**
 * History (§4.3.10): finished workouts newest first, grouped by week. Each keeps its stored name
 * (a past name stays as stored, `data-history`): "Shoulders, Biceps & Triceps B" · "Thu 22 Oct · 58 min
 * · 1 new best" → the workout's sets in a sheet.
 */
export function History({ week }: { week: Week }) {
  const q = useAllSessions();
  const prs = useAllPREvents();
  const { unit } = useUnits();
  const [open, setOpen] = useState<Session | null>(null);
  const [sheet, setSheet] = useState(false);

  const prSetIds = useMemo(() => new Set((prs.data ?? []).map((p) => p.set_id).filter((x): x is string => !!x)), [prs.data]);
  const bests = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prs.data ?? []) if (p.session_id) m.set(p.session_id, (m.get(p.session_id) ?? 0) + 1);
    return m;
  }, [prs.data]);
  const weeks = useMemo(() => groupByWeek(q.data ?? []), [q.data]);

  if (q.isPending && q.fetchStatus === "paused") return <ErrorNote onRetry={() => q.refetch()}>You&apos;re offline. Your workouts show when you&apos;re back.</ErrorNote>;
  if (q.isPending) return <Skeleton className="h-[480px] rounded-tile-lg" />;
  if (q.error) return <ErrorNote onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <Empty title="No workouts yet.">Your first workout shows here.</Empty>;

  return (
    <div className="flex flex-col gap-6">
      {weeks.map((w) => (
        <section key={w.weekStart} aria-label={weekLabel(w.weekStart, week.today)} style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${w.items.length * 68 + 32}px` }}>
          <p className="t-cap mb-2 px-1">{weekLabel(w.weekStart, week.today)}</p>
          <ListGroup>
            {w.items.map((s) => {
              const n = bests.get(s.id) ?? 0;
              const min = s.duration_sec ? `${Math.max(1, Math.round(s.duration_sec / 60))} min` : null;
              const sub = [dmy(s.local_date), min, n ? plural(n, "new best") : null, s.mode !== "standard" ? MODE_LABEL[s.mode as keyof typeof MODE_LABEL] : null].filter(Boolean).join(" · ");
              return (
                <Row
                  key={s.id}
                  title={s.name}
                  history
                  dataName
                  wrap
                  subtitle={sub}
                  onClick={() => {
                    setOpen(s);
                    setSheet(true);
                  }}
                />
              );
            })}
          </ListGroup>
        </section>
      ))}
      <SessionSheet session={open} open={sheet} onOpenChange={setSheet} prSetIds={prSetIds} unit={unit} />
    </div>
  );
}

function weekLabel(start: ISODate, today: ISODate) {
  const thisWeek = weekStart(today);
  if (start === thisWeek) return "This week";
  if (start === addDays(thisWeek, -7)) return "Last week";
  return `Week of ${dmy(start).slice(4)}`;
}

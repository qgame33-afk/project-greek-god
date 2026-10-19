"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { LaurelSprig, TempleGlyph } from "@/components/art/icons";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { addDays, dayName, shortDate, weekStart, type ISODate } from "@/lib/dates";
import { useAllSessions, type Session } from "@/lib/data/training";
import { groupByWeek } from "@/lib/training/schedule";
import { timingSummary } from "@/lib/training/timing-history";
import { formatInt, toDisplayWeight } from "@/lib/units";
import { fmtSessionMinutes, fmtVolume, plural } from "../format";
import { MODE_LABEL, useAllPREvents, useSessionTimings, useUnits, type useTrainingWeek } from "../hooks";
import { SessionSheet } from "../SessionSheet";

type Week = ReturnType<typeof useTrainingWeek>;

/**
 * Lifts → History (§3.4.3): finished sessions newest first, grouped by week, each with its
 * timing summary ("3 records · 8 beat last") from the same setTiming Gym Mode uses.
 */
export function History({ week, onStartToday }: { week: Week; onStartToday: () => void }) {
  const q = useAllSessions();
  const prs = useAllPREvents();
  const timings = useSessionTimings();
  const { unit } = useUnits();
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<Session | null>(null);
  const [sheet, setSheet] = useState(false);

  const prSetIds = useMemo(() => new Set((prs.data ?? []).map((p) => p.set_id).filter((x): x is string => !!x)), [prs.data]);
  const sessions = useMemo(() => (q.data ?? []).filter((s) => filter === "all" || s.template_key === filter), [q.data, filter]);
  const weeks = useMemo(() => groupByWeek(sessions), [sessions]);
  const keysUsed = useMemo(() => new Set((q.data ?? []).map((s) => s.template_key)), [q.data]);

  if (q.isPending && q.fetchStatus === "paused") {
    return <ErrorNote onRetry={() => q.refetch()}>You&apos;re offline. Your sessions show when you&apos;re back online.</ErrorNote>;
  }
  if (q.isPending) {
    return (
      <div aria-hidden>
        <Skeleton className="h-11 w-60 rounded-full" />
        <Skeleton className="mt-7 h-3 w-24" />
        <div className="mt-3 divide-y divide-vein border-y border-vein">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex min-h-18 items-center gap-3 py-3">
              <span className="flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-48" />
              </span>
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (q.error) return <ErrorNote onRetry={() => q.refetch()}>Couldn&apos;t load your history. Nothing was lost.</ErrorNote>;
  if (!q.data?.length) {
    return (
      <Empty
        art={<TempleGlyph className="size-12 text-stone" />}
        title="No sessions yet"
        action={
          <Button variant="secondary" size="sm" onClick={onStartToday}>
            See today&apos;s plan
          </Button>
        }
      >
        Sealed workouts land here with time, volume, sets and how each set compared with last time.
      </Empty>
    );
  }

  return (
    <div>
      <div className="no-scrollbar -mx-(--gutter) flex gap-2 overflow-x-auto px-(--gutter) md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filter by workout">
        <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Chip>
        {week.templates
          .filter((t) => keysUsed.has(t.key))
          .map((t) => (
            <Chip key={t.key} selected={filter === t.key} onClick={() => setFilter(t.key)}>
              {t.name}
            </Chip>
          ))}
      </div>

      {weeks.length === 0 ? (
        <p className="t-callout mt-6 border-y border-vein py-6 text-center text-stone">No sessions of this workout yet.</p>
      ) : (
        <div className="mt-6 space-y-8">
          {weeks.map((w) => {
            const vol = w.items.reduce((n, s) => n + Number(s.total_volume_lb || 0), 0);
            return (
              <section key={w.weekStart} aria-label={`${weekLabel(w.weekStart, week.today)}: ${plural(w.items.length, "session")}`} style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${w.items.length * 76 + 40}px` }}>
                <div className="mb-1 flex min-h-8 items-baseline justify-between gap-3">
                  <h2 className="t-eyebrow">{weekLabel(w.weekStart, week.today)}</h2>
                  <p className="t-meta tnum text-ash">
                    {plural(w.items.length, "session")} · {fmtVolume(vol, unit)}
                  </p>
                </div>
                <ul className="divide-y divide-vein border-y border-vein">
                  {w.items.map((s) => {
                    const summary = timingSummary(timings.counts?.get(s.id));
                    const records = timings.counts?.get(s.id)?.record ?? 0;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(s);
                            setSheet(true);
                          }}
                          className="press-soft flex min-h-18 w-full items-center gap-3 py-3 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className="t-title-3 truncate text-ivory">{s.name}</span>
                              <span className="t-meta shrink-0 text-ash">{dayName(s.local_date, true)} {shortDate(s.local_date, week.today)}</span>
                              {s.mode !== "standard" && <span className="t-tag shrink-0 text-stone">{MODE_LABEL[s.mode as keyof typeof MODE_LABEL]}</span>}
                            </span>
                            <span className="t-meta tnum mt-0.5 block truncate text-stone">
                              {fmtSessionMinutes(s.duration_sec)} · {Number(s.total_volume_lb) > 0 ? `${formatInt(toDisplayWeight(Number(s.total_volume_lb), unit))} ${unit}` : "—"} · {plural(s.sets_completed, "set")}
                            </span>
                            {timings.loading ? (
                              <Skeleton className="mt-1.5 h-3 w-32" />
                            ) : (
                              summary && (
                                <span className={records ? "t-meta mt-1 flex items-center gap-1.5 text-leaf-300" : "t-meta mt-1 flex items-center gap-1.5 text-ivory"}>
                                  {records > 0 && <LaurelSprig className="size-4" />}
                                  {summary}
                                </span>
                              )
                            )}
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <SessionSheet session={open} open={sheet} onOpenChange={setSheet} prSetIds={prSetIds} unit={unit} />
    </div>
  );
}

function weekLabel(start: ISODate, today: ISODate) {
  const thisWeek = weekStart(today);
  if (start === thisWeek) return "This week";
  if (start === addDays(thisWeek, -7)) return "Last week";
  return `Week of ${shortDate(start, today)}`;
}

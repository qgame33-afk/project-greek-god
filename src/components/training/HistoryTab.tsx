"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { EmptyArt, LaurelBullet } from "@/components/art/Motifs";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { addDays, shortDate, weekStart, type ISODate } from "@/lib/dates";
import { useAllSessions, type Session } from "@/lib/data/training";
import { groupByWeek } from "@/lib/training/schedule";
import { fmtSessionMinutes, fmtVolume, plural } from "./format";
import { MODE_LABEL, useAllPREvents, useUnits, type useTrainingWeek } from "./hooks";
import { SessionSheet } from "./SessionSheet";

type Week = ReturnType<typeof useTrainingWeek>;

export function HistoryTab({ week, onStartToday }: { week: Week; onStartToday: () => void }) {
  const q = useAllSessions();
  const prs = useAllPREvents();
  const { unit } = useUnits();
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<Session | null>(null);
  const [sheet, setSheet] = useState(false);

  // PR sets and the distinct exercises that set a record, per session.
  const { prSetIds, prBySession } = useMemo(() => {
    const ids = new Set<string>();
    const by = new Map<string, Set<string>>();
    for (const p of prs.data ?? []) {
      if (p.set_id) ids.add(p.set_id);
      if (!p.session_id) continue;
      if (!by.has(p.session_id)) by.set(p.session_id, new Set());
      by.get(p.session_id)!.add(p.exercise_name ?? p.exercise_slug ?? "");
    }
    return { prSetIds: ids, prBySession: by };
  }, [prs.data]);

  const sessions = useMemo(() => (q.data ?? []).filter((s) => filter === "all" || s.template_key === filter), [q.data, filter]);
  const weeks = useMemo(() => groupByWeek(sessions), [sessions]);
  const keysUsed = useMemo(() => new Set((q.data ?? []).map((s) => s.template_key)), [q.data]);

  if (q.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-[16px]" />
        ))}
      </div>
    );
  }
  if (q.error) return <ErrorNote onRetry={() => q.refetch()}>Couldn&apos;t load your history. Nothing was lost.</ErrorNote>;
  if (!q.data?.length) {
    return (
      <Empty
        art={<EmptyArt kind="column" size={56} />}
        title="No sessions yet"
        action={
          <Button variant="secondary" onClick={onStartToday}>
            See today&apos;s plan
          </Button>
        }
      >
        Finished workouts land here with time, volume, sets and any records, grouped by week.
      </Empty>
    );
  }

  return (
    <div>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Filter by workout">
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
        <p className="rounded-[14px] bg-s3 px-4 py-6 text-center text-[13px] text-fg-2">No sessions of this workout yet.</p>
      ) : (
        <div className="space-y-6">
          {weeks.map((w) => {
            const vol = w.items.reduce((n, s) => n + Number(s.total_volume_lb || 0), 0);
            return (
              <section key={w.weekStart} aria-label={`Week of ${shortDate(w.weekStart)}`} style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${w.items.length * 76 + 40}px` }}>
                <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                  <h3 className="eyebrow">
                    {weekLabel(w.weekStart, week.today)}
                  </h3>
                  <p className="num text-[13px] text-fg-3">
                    {plural(w.items.length, "session")} · {fmtVolume(vol, unit)}
                  </p>
                </div>
                <ul className="card divide-y divide-line-hair overflow-hidden p-0">
                  {w.items.map((s) => {
                    const pr = prBySession.get(s.id);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(s);
                            setSheet(true);
                          }}
                          className="flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[.02] active:bg-white/[.04]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2">
                              <span className="truncate text-[15px] font-bold">{s.name}</span>
                              <span className="shrink-0 text-[13px] text-fg-3">· {shortDate(s.local_date, week.today)}</span>
                              {s.mode !== "standard" && <span className="shrink-0 text-[11px] font-bold uppercase tracking-[.1em] text-fg-3">{MODE_LABEL[s.mode as keyof typeof MODE_LABEL]}</span>}
                            </p>
                            <p className="num mt-0.5 truncate text-[15px] text-fg-2">
                              {fmtSessionMinutes(s.duration_sec)} · {fmtVolume(Number(s.total_volume_lb), unit)} · {s.sets_completed} sets
                            </p>
                          </div>
                          {pr && pr.size > 0 && (
                            <span className="flex shrink-0 items-center gap-1" aria-label={`${pr.size} personal ${pr.size === 1 ? "record" : "records"}`}>
                              {Array.from({ length: Math.min(pr.size, 3) }, (_, i) => (
                                <LaurelBullet key={i} size={14} />
                              ))}
                              {pr.size > 3 && <span className="num text-[13px] text-gold-300">+{pr.size - 3}</span>}
                            </span>
                          )}
                          <ChevronRight className="size-4 shrink-0 text-fg-3" />
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

"use client";

import Link from "next/link";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { BackHeader } from "@/components/shell/BackHeader";
import { Button } from "@/components/ui/button";
import { ListGroup, Row } from "@/components/ui/list";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Bar } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/sheet";
import { SuggestionRow } from "@/components/ui/suggestion-row";
import { addDays, parseISODate, weekDates, weekStart, type ISODate } from "@/lib/dates";
import { useSetsInRange } from "@/lib/data/training";
import { getExercise } from "@/lib/training/library";
import { groupCredit, type GroupRow, type VolumeSuggestion } from "@/lib/training/volume-zones";
import { useWeekVolume, type useTrainingWeek } from "../hooks";
import { Caption, SheetActions, SheetReason } from "../parts";
import { volumeTitle } from "../week/Suggestion";

type Week = ReturnType<typeof useTrainingWeek>;

const half = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const STATUS: Record<GroupRow["status"], string> = { under: "a bit low", in: "in range", above: "a bit high" };
/** "Mon 19" */
const dm = (d: ISODate) => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parseISODate(d).getDay()]} ${parseISODate(d).getDate()}`;

/**
 * Train › Sets by muscle (docs/DESIGN-V3-SIMPLE.md §4.3.9, `train-volume`): Quinton's 13 groups in
 * PROGRAM's `GROUPS` order, each with a Bar whose band is the usual range. The current week reads
 * "7 of 14 planned" with no judgement word; a finished week reads "13 · in range". A row opens the
 * lifts that counted, the range and the group's own strength trend. At most one suggestion on top.
 */
export function VolumePage({ week }: { week: Week }) {
  const [offset, setOffset] = useState(0);
  const current = offset === 0;
  const sunday = addDays(weekStart(week.today), 7 * offset + 6);
  const dates = weekDates(sunday);
  // a past week is read as if it were that week's Sunday, with nothing left to plan
  const shim = useMemo<Week>(() => (current ? week : { ...week, today: sunday, dates, resolve: (d: ISODate) => ({ ...week.resolve(d), template: null }) }), [current, week, sunday, dates]);
  const v = useWeekVolume(shim);
  const sets = useSetsInRange(dates[0], current ? week.today : sunday);
  const [open, setOpen] = useState<GroupRow | null>(null);
  const [tip, setTip] = useState<VolumeSuggestion | null>(null);
  const suggestion = current ? v.suggestions[0] : undefined;
  const range = `${current ? "This week" : offset === -1 ? "Last week" : "Week"} · ${dm(dates[0])} – ${dm(dates[6])}`;
  const scale = (r: GroupRow) => Math.max(24, r.sets, r.sets + r.planned, r.zone[1] + 2);

  return (
    <div>
      <BackHeader href="/training" parent="Train" title="Sets by muscle" />
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="t-label" aria-live="polite">
          {range}
        </p>
        <div className="-mr-2 flex">
          <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week" className="press grid size-11 place-items-center rounded-full text-fg">
            <ChevronLeft className="size-5" strokeWidth={1.9} aria-hidden />
          </button>
          <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={current} aria-label="Next week" className="press grid size-11 place-items-center rounded-full text-fg disabled:text-fg-3">
            <ChevronRight className="size-5" strokeWidth={1.9} aria-hidden />
          </button>
        </div>
      </div>

      {suggestion && (
        <div className="mt-4">
          <SuggestionRow icon={Activity} title={volumeTitle(suggestion)} reason={suggestion.reason} onClick={() => setTip(suggestion)} />
        </div>
      )}

      <div className="mt-4">
        {v.error ? (
          <ErrorNote onRetry={v.refetch} />
        ) : v.offline ? (
          <ErrorNote onRetry={v.refetch}>You&apos;re offline. These sets show when you&apos;re back.</ErrorNote>
        ) : v.loading ? (
          <Skeleton className="h-[760px] rounded-tile-lg" />
        ) : (
          <ul className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
            {v.rows.map((r) => {
              const max = scale(r);
              const total = r.sets + r.planned;
              return (
                <li key={r.group}>
                  <button type="button" onClick={() => setOpen(r)} aria-haspopup="dialog" aria-label={current ? `${r.label}, ${half(r.sets)} of ${half(total)} planned sets. Shows which lifts count.` : `${r.aria}. Shows which lifts count.`} className="press-soft block w-full px-4 pb-4 pt-3.5 text-left">
                    <span aria-hidden className="flex items-baseline justify-between gap-3">
                      <span className="t-row min-w-0 truncate">{r.label}</span>
                      <span className="t-label shrink-0 whitespace-nowrap">
                        <span className="font-bold text-fg">{half(r.sets)}</span> {current ? `of ${half(total)} planned` : `· ${STATUS[r.status]}`}
                      </span>
                    </span>
                    <Bar value={r.sets / max} band={[r.zone[0] / max, r.zone[1] / max]} className="mt-2.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Caption>White: sets you logged. Grey band: the usual range for a week. A muscle that only helps counts as half a set. Tap a muscle to see which lifts count.</Caption>

      <GroupSheet row={open} onOpenChange={(o) => !o && setOpen(null)} sets={sets.data ?? []} />
      <Sheet open={!!tip} onOpenChange={(o) => !o && setTip(null)} title={tip ? volumeTitle(tip) : ""}>
        {tip && (
          <div className="flex flex-col gap-5 pb-2">
            <SheetReason>{tip.reason}</SheetReason>
            <Caption className="mt-0">Nothing changes until you edit the workout yourself.</Caption>
            <SheetActions>
              {tip.exercise && (
                <Button variant="primary" size="lg" block asChild>
                  <Link href={`/training/program/${tip.exercise.templateKey}`}>Open the workout</Link>
                </Button>
              )}
              <Button variant="ghost" size="lg" block onClick={() => setTip(null)}>
                Not now
              </Button>
            </SheetActions>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------- one group */

type SetRow = { exercise_slug: string | null; exercise_name?: string | null; kind?: string | null };

function GroupSheet({ row, onOpenChange, sets }: { row: GroupRow | null; onOpenChange: (o: boolean) => void; sets: SetRow[] }) {
  const lifts = useMemo(() => {
    if (!row) return [];
    const by = new Map<string, { name: string; sets: number; credit: number }>();
    for (const s of sets) {
      if (!s.exercise_slug || s.kind === "warmup") continue;
      const c = groupCredit(s.exercise_slug)[row.group] ?? 0;
      if (!c) continue;
      const cur = by.get(s.exercise_slug) ?? { name: getExercise(s.exercise_slug)?.name ?? s.exercise_name ?? s.exercise_slug, sets: 0, credit: c };
      cur.sets++;
      by.set(s.exercise_slug, cur);
    }
    return [...by.values()].sort((a, b) => b.credit - a.credit || b.sets - a.sets);
  }, [row, sets]);
  const t = row?.trend;
  const trendLine = !t || t.trend === "unknown" || t.changePct == null ? "Not enough sessions yet" : t.trend === "up" ? `Stronger · up ${Math.abs(t.changePct)}% in ${t.weeks} weeks` : t.trend === "down" ? `Down ${Math.abs(t.changePct)}% in ${t.weeks} weeks` : "About the same";
  return (
    <Sheet open={!!row} onOpenChange={onOpenChange} title={row?.label ?? ""}>
      {row && (
        <div className="flex flex-col gap-5 pb-2">
          <SheetReason>
            {half(row.sets)} {row.sets === 1 ? "set" : "sets"} so far. Usual range {row.zone[0]}–{row.zone[1]} sets a week.
          </SheetReason>
          <section aria-label="Lifts that counted">
            <p className="t-cap mb-2 px-1">Lifts that counted</p>
            {lifts.length ? (
              <ListGroup>
                {lifts.map((l) => (
                  <Row key={l.name} title={l.name} dataName subtitle={`${l.sets} ${l.sets === 1 ? "set" : "sets"}${l.credit < 1 ? " · counts half" : ""}`} value={half(l.sets * l.credit)} />
                ))}
              </ListGroup>
            ) : (
              <p className="t-body text-fg-2">No sets yet.</p>
            )}
          </section>
          <section aria-label="Strength">
            <p className="t-cap mb-2 px-1">Strength</p>
            <ListGroup>
              <Row title={trendLine} subtitle="Best set of each lift that trains it, over 6 weeks" />
              {(t?.lifts ?? []).map((l) => (
                <Row key={l.slug} title={l.name} dataName value={`${l.changePct > 0 ? "+" : l.changePct < 0 ? "−" : ""}${Math.abs(l.changePct)}%`} />
              ))}
            </ListGroup>
          </section>
        </div>
      )}
    </Sheet>
  );
}

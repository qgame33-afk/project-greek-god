"use client";

import { useState } from "react";
import { EmptyArt } from "@/components/art/Motifs";
import { RecordMark } from "@/components/ui/record-mark";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { daysBetween } from "@/lib/dates";
import { dayMonth } from "@/lib/progress/pace";
import type { HallLift } from "@/lib/progress/hall";
import { formatSet, metricMode, sessionMetric, type LiftSummary } from "@/lib/progress/strength";
import { formatInt, formatLoad, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { HistoryChart } from "../charts/HistoryChart";
import { BenchmarkBadge, SrTable, StatTile, signed } from "../kit";

/** e1RM is an estimate: whole units (268, not 268.3) so it never reads as a measured load. */
const e1 = (lb: number, unit: WeightUnit) => String(Math.round(toDisplayWeight(lb, unit)));

/**
 * One lift's history (the old Strength detail, on the Olympus system): its bests, the metric
 * over time with records marked, the previous session and every session's sets.
 */
export function LiftSheet({ lift, s, unit, onClose }: { lift: HallLift | null; s: LiftSummary | null; unit: WeightUnit; onClose: () => void }) {
  const today = useToday();
  // keep the last lift while the sheet animates closed
  const [keep, setKeep] = useState<{ lift: HallLift; s: LiftSummary } | null>(null);
  if (lift && s && keep?.lift !== lift) setKeep({ lift, s });
  const cur = lift && s ? { lift, s } : keep;
  const [all, setAll] = useState(false);
  if (!cur) return null;
  const { lift: r, s: sum } = cur;
  const fmt = (lb: number) => formatLoad(lb, unit, false);
  const mode = metricMode(sum, { bodyweight: r.bodyweight });
  const loadVol = sum.sessions.some((x) => x.volume > 0);
  const metricLabel = mode === "e1rm" ? "e1RM" : mode === "load" ? (r.bodyweight ? "Added load" : "Top set") : "Best reps";
  const points = sum.sessions.map((x) => {
    const v = sessionMetric(x, mode);
    return {
      date: x.date,
      value: v == null ? null : mode === "reps" ? v : mode === "e1rm" ? Math.round(toDisplayWeight(v, unit)) : Math.round(toDisplayWeight(v, unit) * 10) / 10,
      pr: x.pr,
      bar: loadVol ? toDisplayWeight(x.volume, unit) : x.totalReps,
    };
  });
  const last = sum.sessions.at(-1);
  const sessionsDesc = [...sum.sessions].reverse();
  const shown = all ? sessionsDesc : sessionsDesc.slice(0, 8);
  const trend = r.bodyweight ? null : sum.trend;

  return (
    <Sheet open={!!lift} onOpenChange={(o) => !o && onClose()} title={r.name} description={r.perHand ? "Loads are per dumbbell." : r.bodyweight ? "Added load on top of bodyweight." : undefined} wide>
      {!sum.sessions.length ? (
        <div className="py-4">
          <Empty art={<EmptyArt kind="laurel" size={56} />} title="Not logged yet">
            Log {r.name.toLowerCase()} in a workout and its history, bests and records appear here.
          </Empty>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 pb-2 pt-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-y border-vein py-4 sm:grid-cols-3">
            {r.bodyweight ? (
              <StatTile label="Sessions" value={sum.sessions.length} caption={`${sum.totalSets} sets since ${dayMonth(sum.firstDate!, today)}`} />
            ) : (
              <StatTile
                label="Best e1RM"
                badge={sum.bestE1rm != null ? <Tag kind="CALC" /> : undefined}
                value={sum.bestE1rm != null ? e1(sum.bestE1rm, unit) : "—"}
                unit={sum.bestE1rm != null ? unit : undefined}
                caption={sum.bestE1rmSet ? `${formatSet(sum.bestE1rmSet, fmt, r.bodyweight)} · ${dayMonth(sum.bestE1rmSet.local_date, today)}` : "Needs a 1–12 rep set"}
              />
            )}
            <StatTile
              label={r.bodyweight ? "Most added" : "Heaviest"}
              value={sum.heaviest ? `${r.bodyweight ? "+" : ""}${fmt(sum.heaviest.weight)}` : r.bodyweight ? "BW" : "—"}
              unit={sum.heaviest ? unit : undefined}
              caption={sum.heaviest ? `× ${sum.heaviest.reps} · ${dayMonth(sum.heaviest.date, today)}` : undefined}
            />
            <StatTile
              label="Best reps"
              value={sum.bestReps?.reps ?? "—"}
              caption={sum.bestReps ? `${sum.bestReps.weight ? `at ${fmt(sum.bestReps.weight)} ${unit}` : "bodyweight"} · ${dayMonth(sum.bestReps.date, today)}` : undefined}
            />
            <StatTile
              label="Since the first"
              value={trend ? signed(toDisplayWeight(trend.change, unit), 0) : "—"}
              unit={trend ? unit : undefined}
              delta={trend ? `e1RM since ${dayMonth(trend.since, today)}` : undefined}
              tone={trend && trend.change > 0 ? "earned" : "neutral"}
              caption={trend ? undefined : r.bodyweight ? "Tracked by added load and reps" : "Needs two sessions"}
            />
            <StatTile
              label="Total volume"
              value={loadVol ? formatInt(toDisplayWeight(sum.totalVolume, unit)) : formatInt(sum.sessions.reduce((a, x) => a + x.totalReps, 0))}
              unit={loadVol ? unit : "reps"}
              caption={`${sum.totalSets} sets · ${sum.sessions.length} sessions`}
            />
            <StatTile label="Records" value={sum.prCount} caption={sum.prCount ? "Beat every earlier set" : "The first session is the benchmark"} />
          </div>

          {last && (
            <div>
              <p className="t-eyebrow">Previous session</p>
              <p className="t-callout tnum mt-1 text-ivory">
                {dayMonth(last.date, today)} · {last.sets.map((x) => formatSet(x, fmt, r.bodyweight).replace(" × ", "×")).join(", ")}
              </p>
            </div>
          )}

          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h3 className="t-eyebrow">{metricLabel} over time</h3>
              <span className="t-meta flex items-center gap-3 text-stone" aria-hidden>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded-full bg-leaf-300" /> {metricLabel}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-1.5 rounded-xs bg-vein-3" /> {loadVol ? "Volume" : "Reps"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rotate-45 bg-leaf-300" /> Record
                </span>
              </span>
            </div>
            <HistoryChart points={points} format={(v) => (mode === "reps" ? `${v} reps` : `${v} ${unit}`)} decimals={mode === "load" ? 1 : 0} />
            <SrTable
              caption={`${r.name}: last ${Math.min(7, points.length)} sessions`}
              head={["Date", metricLabel, loadVol ? `Volume ${unit}` : "Reps", "Record"]}
              rows={points
                .slice(-7)
                .reverse()
                .map((p) => [dayMonth(p.date, today), p.value ?? "—", Math.round(p.bar ?? 0), p.pr ? "yes" : "no"])}
            />
          </div>

          <div>
            <h3 className="t-eyebrow mb-1">Sessions</h3>
            <ul className="divide-y divide-vein border-y border-vein">
              {shown.map((x) => {
                const isFirst = x === sum.sessions[0];
                return (
                  <li key={x.sessionId + x.date} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="t-title-3 flex items-center gap-2 text-ivory">
                        {dayMonth(x.date, today)}
                        {x.pr && <RecordMark compact />}
                        {isFirst && <BenchmarkBadge />}
                      </span>
                      <span className="t-meta tnum text-stone">
                        {loadVol ? `${formatInt(toDisplayWeight(x.volume, unit))} ${unit}` : `${x.totalReps} reps`}
                        {x.bestE1rm != null ? ` · e1RM ${e1(x.bestE1rm, unit)}` : ""}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {x.sets.map((set) => (
                        <span
                          key={set.id}
                          className={cn(
                            "t-callout tnum inline-flex h-7 items-center rounded-tag px-2",
                            x.prSet?.id === set.id ? "bg-leaf-tint font-semibold text-leaf-200 shadow-[inset_0_0_0_1px_var(--leaf-line)]" : "bg-m3 text-stone",
                          )}
                        >
                          {formatSet(set, fmt, r.bodyweight).replace(" × ", "×")}
                        </span>
                      ))}
                      {x.pr && x.prGain != null && <span className="t-meta tnum inline-flex h-7 items-center px-1 text-leaf-300">{signed(toDisplayWeight(x.prGain, unit), 0)} e1RM</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {sessionsDesc.length > 8 && (
              <Button variant="ghost" size="sm" block className="mt-1" onClick={() => setAll(!all)} aria-expanded={all}>
                {all ? "Show fewer" : `Show all ${sessionsDesc.length} sessions`}
              </Button>
            )}
          </div>
          {sum.lastDate && daysBetween(sum.lastDate, today) > 21 && (
            <p className="t-meta text-stone">
              Last logged {dayMonth(sum.lastDate, today)}, {daysBetween(sum.lastDate, today)} days ago.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

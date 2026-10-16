"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { EmptyArt, LaurelBullet } from "@/components/art/Motifs";
import { PRBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { daysBetween, shortDate } from "@/lib/dates";
import { formatInt, formatLoad, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { cn } from "@/lib/cn";
import { useStrengthSets } from "@/lib/progress/hooks";
import { TRACKED_LIFTS, formatSet, metricMode, otherExercises, sessionMetric, summarizeLift, type LiftSummary, type StrengthSet } from "@/lib/progress/strength";
import { dateToT } from "@/lib/progress/weightSeries";
import { BenchmarkBadge, ChartFrame, ChartSkeleton, SectionHead, Sparkline, SrTable, StatTile, signed } from "../kit";

const StrengthChart = dynamic(() => import("./StrengthChart"), { ssr: false, loading: () => <ChartSkeleton /> });

interface LiftRow {
  key: string;
  name: string;
  sets: StrengthSet[];
  tracked: boolean;
  bodyweight: boolean;
  perHand: boolean;
}

export function StrengthTab() {
  const today = useToday();
  const { profile } = useProfile();
  const unit = (profile?.weight_unit ?? "lb") as WeightUnit;
  const q = useStrengthSets();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const sets = useMemo(() => q.data ?? [], [q.data]);
  const rows: LiftRow[] = useMemo(() => {
    const tracked = TRACKED_LIFTS.map((l) => ({
      key: l.key,
      name: l.name,
      sets: sets.filter((s) => l.slugs.includes(s.exercise_slug)),
      tracked: true,
      bodyweight: !!l.bodyweight,
      perHand: !!l.perHand,
    }));
    const others = otherExercises(sets).map((o) => ({ key: o.slug, name: o.name, sets: o.sets, tracked: false, bodyweight: false, perHand: false }));
    return [...tracked, ...others];
  }, [sets]);
  const summaries = useMemo(() => new Map(rows.map((r) => [r.key, summarizeLift(r.sets)])), [rows]);

  if (q.error) return <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["exercise-sets"] })}>Couldn&apos;t load your lifts. {(q.error as Error).message}</ErrorNote>;

  const tracked = rows.filter((r) => r.tracked);
  const others = rows.filter((r) => !r.tracked);
  const recentPRs = rows.reduce((n, r) => n + (summaries.get(r.key)?.sessions.filter((s) => s.pr && daysBetween(s.date, today) <= 30).length ?? 0), 0);
  const active = rows.find((r) => r.key === open) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:gap-5">
      {q.isLoading ? (
        <Card>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="mb-2 h-14 w-full" />
          ))}
        </Card>
      ) : !sets.length ? (
        <Empty
            art={<EmptyArt kind="laurel" size={56} />}
            title="No lifts logged yet"
            action={
              <Link href="/training" className={buttonVariants({ variant: "secondary" })}>
                Go to Training
              </Link>
            }
          >
            Finish a workout and your bests, records and trends build here from the sets you log. Nothing is estimated ahead of time.
          </Empty>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="min-w-0 !p-3.5 lg:!p-5">
              <StatTile label="Sessions" value={new Set(sets.map((s) => s.session_id)).size} size="sm" caption="with sets" />
            </Card>
            <Card className="min-w-0 !p-3.5 lg:!p-5">
              <StatTile label="Sets" value={formatInt(sets.length)} size="sm" caption={`since ${shortDate(sets[0].local_date, today)}`} />
            </Card>
            <Card className="min-w-0 !p-3.5 lg:!p-5">
              <StatTile label="Records" value={recentPRs} size="sm" caption="last 30 days" />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-5">
            <Card className="min-w-0">
              <SectionHead title="Major lifts" className="mb-1 min-h-6" />
              <ul>
                {tracked.map((r, i) => (
                  <LiftRowView key={r.key} row={r} s={summaries.get(r.key)!} unit={unit} first={i === 0} onOpen={() => setOpen(r.key)} />
                ))}
              </ul>
            </Card>
            {others.length > 0 && (
              <Card className="min-w-0">
                <SectionHead title={`Other exercises · ${others.length}`} className="mb-1 min-h-6" />
                <ul>
                  {(showAll ? others : others.slice(0, 6)).map((r, i) => (
                    <LiftRowView key={r.key} row={r} s={summaries.get(r.key)!} unit={unit} first={i === 0} onOpen={() => setOpen(r.key)} />
                  ))}
                </ul>
                {others.length > 6 && (
                  <button type="button" onClick={() => setShowAll(!showAll)} className="mt-1 h-11 w-full text-[14px] font-bold text-fg-2 hover:text-fg">
                    {showAll ? "Show fewer" : `Show all ${others.length}`}
                  </button>
                )}
              </Card>
            )}
          </div>
          <p className="text-[12px] leading-relaxed text-fg-3">e1RM is an estimate (Epley) from sets of 1–12 reps. Higher-rep and bodyweight sets still count toward best reps and volume.</p>
        </>
      )}

      <LiftDetail row={active} s={active ? summaries.get(active.key)! : null} unit={unit} onClose={() => setOpen(null)} />
    </div>
  );
}

function LiftRowView({ row, s, unit, first, onOpen }: { row: LiftRow; s: LiftSummary; unit: WeightUnit; first: boolean; onOpen: () => void }) {
  const today = useToday();
  const mode = metricMode(s, { bodyweight: row.bodyweight });
  const spark = s.sessions.map((x) => sessionMetric(x, mode)).filter((v): v is number => v != null);
  const fmt = (lb: number) => formatLoad(lb, unit, false);
  const best = (row.bodyweight ? (s.heaviest?.set ?? s.bestReps?.set) : (s.bestE1rmSet ?? s.heaviest?.set ?? s.bestReps?.set)) ?? null;
  const recentPR = s.sessions.some((x) => x.pr && daysBetween(x.date, today) <= 14);
  const logged = s.sessions.length > 0;
  const head = mode === "e1rm" ? s.bestE1rm : mode === "load" ? (s.heaviest?.weight ?? null) : (s.bestReps?.reps ?? null);
  return (
    <li className={cn("border-line-hair", !first && "border-t")}>
      <button type="button" onClick={onOpen} disabled={!logged && !row.tracked} className="press-soft flex min-h-[64px] w-full min-w-0 items-center gap-2.5 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[15px] font-bold", logged ? "text-fg" : "text-fg-2")}>{row.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-fg-3">
            {recentPR && <PRBadge />}
            <span className="truncate">{logged && best ? `${formatSet(best, fmt, row.bodyweight)}${row.perHand ? " ea" : ""} · ${shortDate(s.lastDate!, today)}` : "Not logged yet"}</span>
          </span>
        </span>
        {spark.length > 1 && <Sparkline values={spark} width={44} height={22} />}
        <span className="w-[64px] shrink-0 text-right">
          <span className="num-sm block">{head != null ? (mode === "reps" ? head : fmt(head)) : "—"}</span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-fg-3">{!logged ? "\u00a0" : mode === "e1rm" ? `e1RM ${unit}` : mode === "load" ? (row.bodyweight ? `+${unit}` : `top ${unit}`) : "reps"}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
      </button>
    </li>
  );
}

function LiftDetail({ row, s, unit, onClose }: { row: LiftRow | null; s: LiftSummary | null; unit: WeightUnit; onClose: () => void }) {
  const today = useToday();
  const [keep, setKeep] = useState<{ row: LiftRow; s: LiftSummary } | null>(null);
  if (row && s && keep?.row !== row) setKeep({ row, s });
  const cur = row && s ? { row, s } : keep;
  const [all, setAll] = useState(false);
  if (!cur) return null;
  const { row: r, s: sum } = cur;
  const fmt = (lb: number) => formatLoad(lb, unit, false);
  const mode = metricMode(sum, { bodyweight: r.bodyweight });
  const loadVol = sum.sessions.some((x) => x.volume > 0);
  const points = sum.sessions.map((x) => ({
    date: x.date,
    t: dateToT(x.date),
    metric: (() => {
      const v = sessionMetric(x, mode);
      return v == null ? null : mode === "reps" ? v : Math.round(toDisplayWeight(v, unit) * 10) / 10;
    })(),
    volume: loadVol ? Math.round(toDisplayWeight(x.volume, unit)) : x.totalReps,
    pr: x.pr,
  }));
  const last = sum.sessions.at(-1);
  const sessionsDesc = [...sum.sessions].reverse();
  const shown = all ? sessionsDesc : sessionsDesc.slice(0, 8);
  const trend = r.bodyweight ? null : sum.trend;
  const metricLabel = mode === "e1rm" ? "e1RM" : mode === "load" ? (r.bodyweight ? "Added load" : "Top set") : "Best reps";

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()} title={r.name} description={r.perHand ? "Loads are per dumbbell." : r.bodyweight ? "Added load on top of bodyweight." : undefined} wide>
      {!sum.sessions.length ? (
        <div className="py-4">
          <Empty art={<EmptyArt kind="laurel" size={56} />} title="Not logged yet">
            Log {r.name.toLowerCase()} in a workout and its history, bests and records appear here.
          </Empty>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 pb-2 pt-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            {r.bodyweight ? (
              <StatTile label="Sessions" value={sum.sessions.length} caption={`${sum.totalSets} sets since ${shortDate(sum.firstDate!, today)}`} size="md" />
            ) : (
              <StatTile
                label="Best e1RM"
                value={sum.bestE1rm != null ? fmt(sum.bestE1rm) : "—"}
                unit={sum.bestE1rm != null ? unit : undefined}
                caption={sum.bestE1rmSet ? `${formatSet(sum.bestE1rmSet, fmt, r.bodyweight)} · ${shortDate(sum.bestE1rmSet.local_date, today)}` : "Needs a 1–12 rep set"}
                size="md"
              />
            )}
            <StatTile
              label={r.bodyweight ? "Most added" : "Heaviest"}
              value={sum.heaviest ? `${r.bodyweight ? "+" : ""}${fmt(sum.heaviest.weight)}` : r.bodyweight ? "BW" : "—"}
              unit={sum.heaviest ? unit : undefined}
              caption={sum.heaviest ? `× ${sum.heaviest.reps} · ${shortDate(sum.heaviest.date, today)}` : undefined}
              size="md"
            />
            <StatTile label="Best reps" value={sum.bestReps?.reps ?? "—"} caption={sum.bestReps ? `${sum.bestReps.weight ? `at ${fmt(sum.bestReps.weight)} ${unit}` : "bodyweight"} · ${shortDate(sum.bestReps.date, today)}` : undefined} size="md" />
            <StatTile
              label="Strength trend"
              value={trend ? signed(toDisplayWeight(trend.change, unit), 1) : "—"}
              unit={trend ? unit : undefined}
              delta={trend ? `e1RM since ${shortDate(trend.since, today)}` : undefined}
              tone={trend && trend.change > 0 ? "success" : "neutral"}
              caption={trend ? undefined : r.bodyweight ? "Tracked by added load and reps" : "Needs two sessions"}
              size="md"
            />
            <StatTile label="Total volume" value={loadVol ? formatInt(toDisplayWeight(sum.totalVolume, unit)) : formatInt(sum.sessions.reduce((a, x) => a + x.totalReps, 0))} unit={loadVol ? unit : "reps"} caption={`${sum.totalSets} sets · ${sum.sessions.length} sessions`} size="md" />
            <StatTile label="Records" value={sum.prCount} caption={sum.prCount ? "e1RM beat every earlier set" : "First session is the benchmark"} size="md" />
          </div>

          {last && (
            <div className="card-inset p-3.5">
              <p className="eyebrow mb-1.5">Previous performance</p>
              <p className="text-[14px] font-semibold text-fg">
                {shortDate(last.date, today)} · {last.sets.map((x) => formatSet(x, fmt, r.bodyweight).replace(" × ", "×")).join(", ")}
              </p>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="eyebrow">{metricLabel} over time</h3>
              <span className="flex items-center gap-3 text-[11px] font-semibold text-fg-3" aria-hidden>
                <span className="inline-flex items-center gap-1">
                  <span className="h-[2px] w-3 bg-gold-400" /> {metricLabel}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-1.5 rounded-sm bg-verdigris/40" /> {loadVol ? "Volume" : "Reps"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rotate-45 bg-gold-400" /> Record
                </span>
              </span>
            </div>
            <ChartFrame tall={false}>
              <StrengthChart points={points} metricLabel={metricLabel} volumeLabel={loadVol ? `Volume (${unit})` : "Reps"} format={(v) => (mode === "reps" ? `${v}` : `${v} ${unit}`)} />
            </ChartFrame>
            <SrTable
              caption={`${r.name}: last ${Math.min(7, points.length)} sessions`}
              head={["Date", metricLabel, loadVol ? `Volume ${unit}` : "Reps", "Record"]}
              rows={points.slice(-7).reverse().map((p) => [shortDate(p.date, today), p.metric ?? "—", p.volume, p.pr ? "yes" : "no"])}
            />
          </div>

          <div>
            <SectionHead title="Sessions" className="mb-1 min-h-6" />
            <ul>
              {shown.map((x, i) => {
                const isFirst = x === sum.sessions[0];
                return (
                  <li key={x.sessionId + x.date} className={cn("py-3", i > 0 && "border-t border-line-hair")}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                        {x.pr && <LaurelBullet size={14} />}
                        {shortDate(x.date, today)}
                        {x.pr && <PRBadge />}
                        {isFirst && sum.sessions.length > 0 && <BenchmarkBadge />}
                      </span>
                      <span className="num text-[13px] text-fg-3">
                        {loadVol ? `${formatInt(toDisplayWeight(x.volume, unit))} ${unit}` : `${x.totalReps} reps`}
                        {x.bestE1rm != null ? ` · e1RM ${fmt(x.bestE1rm)}` : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {x.sets.map((set) => (
                        <span key={set.id} className={cn("num inline-flex h-7 items-center rounded-[8px] px-2 text-[14px]", x.prSet?.id === set.id ? "bg-gold-tint text-gold-200 ring-1 ring-line-gold" : "bg-s3 text-fg-2")}>
                          {formatSet(set, fmt, r.bodyweight).replace(" × ", "×")}
                        </span>
                      ))}
                      {x.pr && x.prGain != null && <span className="num inline-flex h-7 items-center px-1 text-[13px] text-gold-300">{signed(toDisplayWeight(x.prGain, unit), 1)} e1RM</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {sessionsDesc.length > 8 && (
              <button type="button" onClick={() => setAll(!all)} className="mt-1 h-11 w-full text-[14px] font-bold text-fg-2 hover:text-fg">
                {all ? "Show fewer" : `Show all ${sessionsDesc.length} sessions`}
              </button>
            )}
          </div>
          {sum.lastDate && daysBetween(sum.lastDate, today) > 21 && (
            <p className="text-[12px] text-fg-3">
              Last logged {shortDate(sum.lastDate, today)}, {daysBetween(sum.lastDate, today)} days ago.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

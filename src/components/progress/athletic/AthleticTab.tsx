"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Plus } from "lucide-react";
import { LaurelBullet } from "@/components/art/Motifs";
import { PRBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useAthleticTests, useWeights, type AthleticTest } from "@/lib/data/body";
import { useProfile } from "@/lib/data/profile";
import { useVolleyball } from "@/lib/data/training";
import { useRecovery } from "@/lib/data/recovery";
import { volleyballEntries } from "@/lib/recovery/volleyball";
import { weightStats } from "@/lib/bodyweight";
import { addDays, shortDate } from "@/lib/dates";
import { formatLoad, round, toDisplayLength, toDisplayWeight, type LengthUnit, type WeightUnit } from "@/lib/units";
import { fmtLen } from "@/lib/progress/measurements";
import { cn } from "@/lib/cn";
import { TESTS, TEST_BY_KEY, feetInches, prIds, sprintDistances, squatToBodyweight, testPR, testSeries, touchHeight, volleyballFrequency, type TestType } from "@/lib/progress/athletic";
import { planFromProfile } from "@/lib/progress/plan";
import { summarizeLift } from "@/lib/progress/strength";
import { useAthleticWrite, useStrengthSets } from "@/lib/progress/hooks";
import { dateToT } from "@/lib/progress/weightSeries";
import { useProgressActions } from "../context";
import { BenchmarkBadge, ChartFrame, ChartSkeleton, RowMenu, SectionHead, Sparkline, SrTable, StatTile, signed } from "../kit";

const TrendChart = dynamic(() => import("../charts/TrendChart"), { ssr: false, loading: () => <ChartSkeleton /> });

export function AthleticTab() {
  const today = useToday();
  const { profile } = useProfile();
  const lu = (profile?.length_unit ?? "in") as LengthUnit;
  const wu = (profile?.weight_unit ?? "lb") as WeightUnit;
  const q = useAthleticTests();
  const qc = useQueryClient();
  const tests = useMemo(() => q.data ?? [], [q.data]);
  const { weights } = useWeights();
  const strength = useStrengthSets();
  const vb = useVolleyball(addDays(today, -27), today);
  // check-in "Volleyball this day" switches count too, as on Training and Recovery
  const vbRec = useRecovery(addDays(today, -27), today);
  const actions = useProgressActions();
  const [detail, setDetail] = useState<TestType | null>(null);

  const plan = planFromProfile(profile, today);
  const stats = useMemo(() => weightStats(weights, plan.startLb, plan.goalLb, today), [weights, plan.startLb, plan.goalLb, today]);
  const trendBw = stats.avg7 ?? stats.current;
  const squat = useMemo(() => summarizeLift((strength.data ?? []).filter((s) => s.exercise_slug === "back-squat")), [strength.data]);
  const ratio = squatToBodyweight(squat.bestE1rm, trendBw);
  const freq = volleyballFrequency(volleyballEntries(vb.data ?? [], vbRec.data ?? []), today);
  const vbTarget = profile?.volleyball_per_week ?? null;

  if (q.error) return <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["athletic"] })}>Couldn&apos;t load your tests. {(q.error as Error).message}</ErrorNote>;

  const reach = testSeries(tests, "standing_reach").at(-1);
  const approachPR = testPR(tests, "approach_vertical");
  const touch = touchHeight(reach ? Number(reach.value) : null, approachPR ? Number(approachPR.value) : null);

  return (
    <div className="grid grid-cols-1 gap-4 lg:gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="eyebrow">Athletic performance</h2>
          <p className="mt-1 truncate text-[13px] text-fg-2">Manual tests, dated. No predictions.</p>
        </div>
        <Button variant="secondary" className="h-11 shrink-0 px-4" onClick={() => actions.logAthletic()}>
          <Plus className="size-[18px]" /> Log test
        </Button>
      </div>

      <div className="card-inset flex items-start gap-3 p-3.5">
        <Info className="mt-0.5 size-[18px] shrink-0 text-lapis-text" aria-hidden />
        <p className="text-[13px] leading-relaxed text-fg-2">
          <span className="font-semibold text-fg">Test fresh, same time, surface and footwear.</span> Warm up fully, take the best of 3, and test before lifting. Results only count when conditions match.
        </p>
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-[16px]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
          {TESTS.map((t) => (
            <TestTile key={t.key} type={t.key} tests={tests} unit={lu} onOpen={() => setDetail(t.key)} onLog={() => actions.logAthletic(t.key)} />
          ))}
          <div className="card-instrument flex min-h-[132px] min-w-0 flex-col justify-between p-3.5 lg:p-4">
            <p className="eyebrow truncate">Touch height</p>
            <div>
              <p className="num-md mt-3 whitespace-nowrap">
                {touch != null ? (lu === "in" ? feetInches(touch) : fmtLen(touch, lu)) : "—"}
                {touch != null && lu === "cm" && <span className="unit [font-size:max(12px,0.4em)]!">cm</span>}
              </p>
              <p className="mt-1 text-[12px] font-medium leading-snug text-fg-3">
                {touch != null ? "Reach + best approach vertical" : !reach ? "Log standing reach to see it" : "Log an approach vertical"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        <div className="card-instrument flex min-w-0 items-center justify-between gap-4 p-4">
          <StatTile
            label="Back squat ÷ bodyweight"
            value={ratio != null ? ratio.toFixed(2) : "—"}
            unit={ratio != null ? "× BW" : undefined}
            size="md"
            caption={ratio != null ? "Best e1RM ÷ 7-day average" : squat.bestE1rm == null ? "Log a back squat set of 1–12 reps" : "Needs a weigh-in"}
          />
          {ratio != null && squat.bestE1rm != null && trendBw != null && (
            <div className="shrink-0 text-right text-[12px] font-medium leading-relaxed text-fg-3">
              <p>
                e1RM <span className="num text-[14px] text-fg-2">{Math.round(toDisplayWeight(squat.bestE1rm, wu))} {wu}</span>
              </p>
              <p>
                weight <span className="num text-[14px] text-fg-2">{formatLoad(round(trendBw, 1), wu)}</span>
              </p>
            </div>
          )}
        </div>
        <div className="card-instrument flex min-w-0 items-center justify-between gap-4 p-4">
          <StatTile
            label="Volleyball"
            value={vb.isLoading || vbRec.isLoading ? "—" : freq.perWeek.toFixed(1)}
            unit={vb.isLoading || vbRec.isLoading ? undefined : "/ wk"}
            size="md"
            caption={`${freq.total} ${freq.total === 1 ? "session" : "sessions"} in 4 weeks${vbTarget != null ? ` · plan ${vbTarget}/wk` : ""}`}
          />
          <div className="flex h-10 w-[104px] shrink-0 items-end gap-1.5" role="img" aria-label={`Volleyball sessions per week, oldest first: ${freq.weeks.map((w) => w.count).join(", ")}`}>
            {freq.weeks.map((w) => (
              <span key={w.start} className="flex flex-1 flex-col items-center gap-1">
                <span className="w-full rounded-[3px] bg-lapis/75" style={{ height: `${Math.max(3, (w.count / Math.max(3, ...freq.weeks.map((x) => x.count))) * 30)}px`, opacity: w.count ? 1 : 0.3 }} />
              </span>
            ))}
          </div>
        </div>
      </div>

      <TestDetail type={detail} tests={tests} unit={lu} onClose={() => setDetail(null)} />
    </div>
  );
}

function fmtValue(v: number, type: TestType, unit: LengthUnit) {
  if (type === "sprint") return { value: v.toFixed(2), unit: "s" };
  return { value: fmtLen(v, unit), unit };
}

function TestTile({ type, tests, unit, onOpen, onLog }: { type: TestType; tests: AthleticTest[]; unit: LengthUnit; onOpen: () => void; onLog: () => void }) {
  const today = useToday();
  const def = TEST_BY_KEY[type];
  const distance = type === "sprint" ? (sprintDistances(tests)[0] ?? null) : null;
  const series = testSeries(tests, type, distance);
  const latest = series.at(-1);
  const pr = testPR(tests, type, distance);
  const latestIsPR = !!latest && prIds(tests, type, distance).has(latest.id);
  const first = series[0];
  const change = latest && first && latest !== first ? Number(latest.value) - Number(first.value) : null;
  const better = change == null ? false : def.better === "higher" ? change > 0 : def.better === "lower" ? change < 0 : false;
  const v = latest ? fmtValue(Number(latest.value), type, unit) : null;

  if (!latest || !v)
    return (
      <button type="button" onClick={onLog} className="card-instrument press-soft flex min-h-[132px] min-w-0 flex-col justify-between p-3.5 text-left hover:border-line-strong lg:p-4">
        <p className="eyebrow truncate">{def.short}</p>
        <div>
          <p className="num-md text-fg-3">—</p>
          <p className="mt-1 text-[12px] font-bold text-gold-300">Log first test</p>
        </div>
      </button>
    );

  const sub =
    type === "sprint" && distance != null
      ? `${distance} m${pr && pr.id !== latest.id ? ` · best ${Number(pr.value).toFixed(2)}` : ""}`
      : pr && pr.id !== latest.id
        ? `Best ${fmtValue(Number(pr.value), type, unit).value} · ${shortDate(pr.local_date, today)}`
        : type === "broad_jump" && unit === "in"
          ? `${feetInches(Number(latest.value))} · ${shortDate(latest.local_date, today)}`
          : shortDate(latest.local_date, today);

  return (
    <button type="button" onClick={onOpen} className="card-instrument press-soft flex min-h-[132px] min-w-0 flex-col justify-between p-3.5 text-left hover:border-line-strong lg:p-4" aria-label={`${def.label}: ${v.value} ${v.unit}. Open history`}>
      <p className="eyebrow truncate">{def.short}</p>
      <div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <p className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="num-md">
              {v.value}
              <span className="unit [font-size:max(12px,0.4em)]!">{v.unit}</span>
            </span>
            {latestIsPR && <PRBadge className="self-center" />}
          </p>
          {series.length > 1 && <Sparkline values={series.map((r) => Number(r.value) * (def.better === "lower" ? -1 : 1))} tone="verdigris" width={44} height={20} className="mb-0.5" />}
        </div>
        <p className={cn("mt-1 truncate text-[12px] font-semibold", better ? "text-success" : "text-fg-2")}>
          {change != null ? `${signed(type === "sprint" ? change : toDisplayLength(change, unit), type === "sprint" ? 2 : unit === "cm" ? 1 : 2)} since ${shortDate(first!.local_date, today)}` : def.better ? "First benchmark" : "Reference"}
        </p>
        <p className="truncate text-[12px] font-medium text-fg-3">{sub}</p>
      </div>
    </button>
  );
}

function TestDetail({ type, tests, unit, onClose }: { type: TestType | null; tests: AthleticTest[]; unit: LengthUnit; onClose: () => void }) {
  const today = useToday();
  const actions = useProgressActions();
  const { del } = useAthleticWrite();
  const [keep, setKeep] = useState<TestType | null>(type);
  if (type && type !== keep) setKeep(type);
  const t = type ?? keep;
  const distances = t === "sprint" ? sprintDistances(tests) : [];
  const [dist, setDist] = useState<number | null>(null);
  if (!t) return null;
  const def = TEST_BY_KEY[t];
  const d = t === "sprint" ? (dist != null && distances.includes(dist) ? dist : (distances[0] ?? null)) : null;
  const series = testSeries(tests, t, d);
  const prs = prIds(tests, t, d);
  const best = testPR(tests, t, d);
  const conv = (v: number) => (t === "sprint" ? v : toDisplayLength(v, unit));
  const u = t === "sprint" ? "s" : unit;
  const dp = t === "sprint" ? 2 : unit === "cm" ? 1 : 2;
  const points = series.map((r) => ({ date: r.local_date, t: dateToT(r.local_date), value: round(conv(Number(r.value)), 2), pr: prs.has(r.id) }));

  return (
    <Sheet open={!!type} onOpenChange={(o) => !o && onClose()} title={def.label} description={def.how} wide>
      <div className="grid grid-cols-1 gap-5 pb-2 pt-1">
        {t === "sprint" && distances.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Distance">
            {distances.map((x) => (
              <Chip key={x} selected={x === d} onClick={() => setDist(x)}>
                {x} m
              </Chip>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <StatTile label="Latest" value={series.length ? conv(Number(series.at(-1)!.value)).toFixed(dp) : "—"} unit={series.length ? u : undefined} caption={series.length ? shortDate(series.at(-1)!.local_date, today) : undefined} size="md" />
          {def.better ? (
            <StatTile
              label={def.better === "lower" ? "Fastest" : "Best"}
              badge={best ? <LaurelBullet size={12} /> : undefined}
              value={best ? conv(Number(best.value)).toFixed(dp) : "—"}
              unit={best ? u : undefined}
              caption={best ? shortDate(best.local_date, today) : undefined}
              size="md"
            />
          ) : (
            <StatTile label="Entries" value={series.length} caption="Reference measurement" size="md" />
          )}
        </div>
        {points.length >= 2 ? (
          <div>
            <ChartFrame tall={false}>
              <TrendChart points={points} format={(v) => `${v.toFixed(dp)} ${u}`} invert={def.better === "lower"} tone="verdigris" decimals={t === "sprint" ? 2 : 1} />
            </ChartFrame>
            <SrTable caption={`${def.label} results`} head={["Date", `Result (${u})`, "Record"]} rows={series.slice(-7).reverse().map((r) => [shortDate(r.local_date, today), conv(Number(r.value)).toFixed(dp), prs.has(r.id) ? "yes" : "no"])} />
          </div>
        ) : (
          <p className="card-inset p-4 text-[13px] text-fg-2">One result so far. Re-test in 4–6 weeks under the same conditions to see a trend.</p>
        )}

        <div>
          <SectionHead title="Results" className="mb-1 min-h-6">
            <button type="button" onClick={() => actions.logAthletic(t)} className="-mr-2 inline-flex h-11 items-center px-2 text-[13px] font-bold text-gold-300 hover:text-gold-200">
              Log result
            </button>
          </SectionHead>
          <ul>
            {[...series].reverse().map((r, i) => (
              <li key={r.id} className={cn("flex items-center gap-3 py-2.5", i > 0 && "border-t border-line-hair")}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                    {shortDate(r.local_date, today)}
                    {prs.has(r.id) && <PRBadge />}
                    {series[0]?.id === r.id && def.better && <BenchmarkBadge />}
                  </p>
                  {(r.conditions || r.notes) && <p className="truncate text-[12px] font-medium text-fg-3">{[r.conditions, r.notes].filter(Boolean).join(" · ")}</p>}
                </div>
                <span className="num-sm">
                  {conv(Number(r.value)).toFixed(dp)}
                  <span className="unit [font-size:max(12px,0.4em)]!">{u}</span>
                </span>
                {!r.id.startsWith("optimistic") && <RowMenu label={`${def.label} ${shortDate(r.local_date, today)}`} onDelete={() => del(r)} />}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12px] leading-relaxed text-fg-3">No projections. Jump height responds to strength, power and bodyweight in ways no chart can promise; these are your logged results only.</p>
      </div>
    </Sheet>
  );
}

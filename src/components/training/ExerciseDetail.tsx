"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { EmptyArt, LaurelBullet } from "@/components/art/Motifs";
import { PRBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { useMediaQuery } from "@/components/ui/sheet";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { addDays, dayName, shortDate } from "@/lib/dates";
import { useToday } from "@/lib/data/core";
import { useExerciseBests, useExerciseDaily, useExerciseSets } from "@/lib/data/training";
import { getExercise } from "@/lib/training/library";
import { MUSCLE_LABEL, sessionsFromSets, strengthSeries, usesE1rm } from "@/lib/training/volume";
import { formatInt, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { RISE_IN_PLACE, useSwapIn } from "@/lib/motion";
import { fmtLoadValue, fmtVolume, plural } from "./format";
import { useCustomExercises, useExercisePRs, useUnits } from "./hooks";
import { equipmentLabel } from "./LibraryPicker";
import { DetailSkeleton } from "./Skeletons";
import { useMounted } from "./useMounted";

const ExerciseChart = dynamic(() => import("./ExerciseChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-[220px] w-full lg:h-[300px]" />,
});

type Range = "3m" | "6m" | "all";

const CATEGORY: Record<string, string> = { compound: "Compound", isolation: "Isolation", explosive: "Explosive", carry: "Carry", core: "Core" };

/** /training/exercise/[slug] — everything about one exercise, from real logged sets only. */
export function ExerciseDetail({ slug }: { slug: string }) {
  const mounted = useMounted();
  return mounted ? <Detail slug={slug} /> : <DetailSkeleton />;
}

function Detail({ slug }: { slug: string }) {
  const today = useToday();
  const { unit } = useUnits();
  const lib = getExercise(slug);
  const bests = useExerciseBests();
  const custom = useCustomExercises();
  const daily = useExerciseDaily(slug);
  const sets = useExerciseSets(slug);
  const prs = useExercisePRs(slug);
  const [range, setRange] = useState<Range>("all");

  const best = bests.data?.find((b) => b.exercise_slug === slug) ?? null;
  const customRow = custom.data?.find((c) => c.slug === slug) ?? null;
  const name = lib?.name ?? best?.exercise_name ?? customRow?.name ?? null;
  const loading = bests.isLoading || daily.isLoading;

  if (!lib && !loading && !best && !custom.isLoading && !customRow) {
    return (
      <div>
        <BackLink />
        <h1 className="sr-only">Exercise not found</h1>
        <Empty art={<EmptyArt kind="column" size={56} />} title="Exercise not found" className="mt-6" action={<Button variant="secondary" asChild><Link href="/training?tab=exercises">Browse exercises</Link></Button>}>
          It isn&apos;t in the library and you haven&apos;t logged it.
        </Empty>
      </div>
    );
  }
  if (!name) return <DetailSkeleton />;

  const hasHistory = (best?.total_sets ?? 0) > 0;
  const timed = lib?.tracking === "weight_time" || (!!best?.best_duration_sec && !best?.best_reps);

  return (
    <div className="pb-6">
      <BackLink />
      <header className="mb-6 mt-3">
        <p className="eyebrow">{lib ? `${CATEGORY[lib.category] ?? lib.category} · ${equipmentLabel(lib.equipment)}` : "Custom exercise"}</p>
        <h1 className="t-title mt-2 break-words">{name}</h1>
        {lib && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {lib.primary.map((m) => (
              <span key={m} className="inline-flex h-7 items-center rounded-full border border-line-strong px-2.5 text-[12px] font-semibold text-fg">
                {MUSCLE_LABEL[m]}
              </span>
            ))}
            {lib.secondary.map((m) => (
              <span key={m} className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-[12px] font-medium text-fg-3">
                {MUSCLE_LABEL[m]}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <div className="min-w-0 space-y-4 lg:col-span-8">
          {/* stat sheet: all-time bests from real sets, each dated to when it happened */}
          {loading ? (
            <Skeleton className="h-[188px] rounded-[20px] sm:h-[100px]" />
          ) : (
            <StatSheet
              unit={unit}
              timed={timed}
              best={best}
              daily={daily.data ?? []}
              today={today}
            />
          )}
          {!loading && !hasHistory && (
            <Empty art={<EmptyArt kind="plinth" size={56} />} title="No sets logged yet">
              Log {name} in a workout and your estimated 1RM, best sets, chart and records build from those real sets.
            </Empty>
          )}

          {hasHistory && (
            <ChartCard
              daily={daily.data ?? []}
              loading={daily.isLoading}
              error={!!daily.error}
              retry={() => daily.refetch()}
              range={range}
              setRange={setRange}
              unit={unit}
              today={today}
            />
          )}

          {hasHistory && (
            <Card>
              <CardHeader title="Session history" />
              {sets.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : sets.error ? (
                <ErrorNote onRetry={() => sets.refetch()}>Couldn&apos;t load the sets.</ErrorNote>
              ) : (
                <SessionList rows={sets.data ?? []} unit={unit} today={today} prIds={new Set((prs.data ?? []).map((p) => p.set_id ?? ""))} timed={timed} showE1rm={usesE1rm(daily.data ?? [])} />
              )}
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-4">
          {hasHistory && (
            <Card>
              <CardHeader title="Records" action={prs.data?.length ? <span className="num text-[13px] text-fg-3">{prs.data.length}</span> : undefined} />
              {prs.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !prs.data?.length ? (
                <p className="text-[13px] leading-relaxed text-fg-2">No records beyond your first benchmark yet. A record is any set whose estimated 1RM beats every earlier set.</p>
              ) : (
                <ol className="relative space-y-0.5">
                  {prs.data.slice(0, 12).map((p) => {
                    const gain = p.e1rm_lb != null && p.prior_best_e1rm != null ? Number(p.e1rm_lb) - Number(p.prior_best_e1rm) : null;
                    return (
                      <li key={p.set_id} className="flex min-h-12 items-center gap-3">
                        <LaurelBullet size={14} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="num text-[17px] font-semibold">
                            {fmtLoadValue(Number(p.weight_lb), unit)}
                            <span className="unit">{unit}</span>
                            <span className="mx-1 text-fg-3">×</span>
                            {p.reps}
                          </p>
                          <p className="text-[12px] text-fg-3">{p.local_date ? `${dayName(p.local_date, true)}, ${shortDate(p.local_date, today)}` : ""}</p>
                        </div>
                        <div className="text-right">
                          <p className="num text-[15px] text-fg">
                            {fmtLoadValue(Number(p.e1rm_lb), unit)}
                            <span className="unit">e1RM</span>
                          </p>
                          {gain != null && gain > 0 && <p className="num text-[13px] text-gold-300">+{fmtLoadValue(gain, unit)}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          )}

          {lib ? (
            <Card>
              <CardHeader title="How to" />
              <ol className="space-y-2.5">
                {lib.instructions.map((s, i) => (
                  <li key={i} className="flex gap-3 text-[14px] leading-relaxed">
                    <span className="num mt-px w-4 shrink-0 text-[15px] text-gold-300">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <p className="eyebrow mb-2 mt-5">Form tips</p>
              <ul className="space-y-2">
                {lib.formTips.map((t) => (
                  <li key={t} className="flex gap-2.5 text-[13px] leading-relaxed text-fg-2">
                    <span className="mt-[8px] size-1 shrink-0 rounded-full bg-gold-600" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${lib.name} proper form`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-[12px] border border-line-strong bg-s3 px-4 text-[14px] font-semibold text-fg hover:bg-s4"
              >
                Watch demos
                <ExternalLink className="size-4 text-fg-3" />
              </a>
              <p className="mt-1.5 text-[12px] text-fg-3">Opens a YouTube search in a new tab.</p>
            </Card>
          ) : (
            <Card>
              <CardHeader title="About" />
              <p className="text-[13px] leading-relaxed text-fg-2">{customRow?.instructions || "A custom exercise you logged. The library has no instructions for it."}</p>
            </Card>
          )}

          {lib && lib.substitutes.length > 0 && (
            <Card>
              <CardHeader title="Substitutes" />
              <ul className="-mx-1">
                {lib.substitutes.map((s) => {
                  const sub = getExercise(s);
                  if (!sub) return null;
                  return (
                    <li key={s}>
                      <Link href={`/training/exercise/${s}`} className="flex min-h-12 items-center gap-3 rounded-[12px] px-1 hover:bg-white/[.03]">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold">{sub.name}</span>
                          <span className="block truncate text-[12px] text-fg-3">{sub.primary.map((m) => MUSCLE_LABEL[m]).join(", ")}</span>
                        </span>
                        <ChevronRight className="size-4 text-fg-3" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/training?tab=exercises" className="-ml-2 inline-flex h-11 items-center gap-1 rounded-[12px] pr-3 text-[14px] font-semibold text-fg-2 hover:text-fg">
      <ChevronLeft className="size-5" />
      Exercises
    </Link>
  );
}

type Best = NonNullable<ReturnType<typeof useExerciseBests>["data"]>[number];
type Daily = NonNullable<ReturnType<typeof useExerciseDaily>["data"]>[number];

/** Date of the first day a per-day value reached its all-time maximum. */
function dateOfBest(daily: Daily[], pick: (d: Daily) => number | null): string | null {
  let best = 0;
  let date: string | null = null;
  for (const d of daily) {
    const v = Number(pick(d) ?? 0);
    if (v > best && d.local_date) {
      best = v;
      date = d.local_date;
    }
  }
  return date;
}

/** Four all-time numbers in one sheet (2×2 on phones, one row from 640px). */
function StatSheet({ unit, timed, best, daily, today }: { unit: WeightUnit; timed: boolean; best: Best | null; daily: Daily[]; today: string }) {
  const has = (best?.total_sets ?? 0) > 0;
  const when = (d: string | null) => (d ? shortDate(d, today) : undefined);
  // High-rep work only gets an e1RM on its odd short (usually missed) set: not a best.
  const e1rm = usesE1rm(daily) ? best?.best_e1rm_lb : null;
  const cells: { label: string; value: string; unit?: string; caption?: string }[] = [
    {
      label: "Best e1RM",
      value: e1rm ? fmtLoadValue(e1rm, unit) : "—",
      unit: e1rm ? unit : undefined,
      caption: e1rm ? when(dateOfBest(daily, (d) => d.best_e1rm_lb)) : has ? (best?.best_weight_lb ? "High-rep lift" : "Not a load lift") : undefined,
    },
    {
      label: "Heaviest",
      value: best?.best_weight_lb ? fmtLoadValue(best.best_weight_lb, unit) : "—",
      unit: best?.best_weight_lb ? unit : undefined,
      caption: best?.best_weight_lb ? when(dateOfBest(daily, (d) => d.top_weight_lb)) : has ? "Unloaded" : undefined,
    },
    timed
      ? { label: "Longest", value: best?.best_duration_sec ? String(best.best_duration_sec) : "—", unit: best?.best_duration_sec ? "s" : undefined }
      : { label: "Best reps", value: best?.best_reps ? String(best.best_reps) : "—", caption: best?.best_reps ? when(dateOfBest(daily, (d) => d.max_reps)) : undefined },
    {
      label: "Sessions",
      value: has ? formatInt(best!.sessions ?? 0) : "—",
      caption: has ? `${plural(best!.total_sets ?? 0, "set")}${best?.last_date ? ` · last ${shortDate(best.last_date, today)}` : ""}` : undefined,
    },
  ];
  const anyCaption = cells.some((c) => c.caption);
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-line bg-line-hair sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="min-w-0 bg-s1 px-4 py-3.5 sm:px-5">
          <dt className="eyebrow truncate">{c.label}</dt>
          <dd className="num mt-2 truncate text-[28px] font-semibold leading-none">
            {c.value}
            {c.unit && <span className="unit">{c.unit}</span>}
          </dd>
          {anyCaption && <dd className="mt-1.5 truncate text-[12px] text-fg-3">{c.caption ?? "\u00a0"}</dd>}
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ chart */

function ChartCard({
  daily,
  loading,
  error,
  retry,
  range,
  setRange,
  unit,
  today,
}: {
  daily: Parameters<typeof strengthSeries>[0];
  loading: boolean;
  error: boolean;
  retry: () => void;
  range: Range;
  setRange: (r: Range) => void;
  unit: WeightUnit;
  today: string;
}) {
  const from = range === "3m" ? addDays(today, -91) : range === "6m" ? addDays(today, -182) : null;
  const series = useMemo(() => strengthSeries(daily, from), [daily, from]);
  const data = useMemo(
    () =>
      series.points.map((p) => ({
        date: p.date,
        value: p.value == null ? null : series.metric === "reps" ? p.value : round(toDisplayWeight(p.value, unit), 1),
        bar: series.bars === "volume" ? Math.round(toDisplayWeight(p.bar, unit)) : p.bar,
        pr: p.pr,
      })),
    [series, unit],
  );
  const latestIdx = data.findLastIndex((d) => d.value != null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const dateRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const metricUnit = series.metric === "reps" ? "reps" : unit;
  const label = series.metric === "e1rm" ? "Estimated 1RM" : series.metric === "weight" ? "Top weight" : "Best reps";

  const fmtValue = (v: number | null) => (v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1));
  const fmtBar = (v: number) => (series.bars === "volume" ? `${formatInt(v)} ${unit} volume` : plural(v, "set"));
  const write = (i: number | null) => {
    const d = data[i ?? latestIdx];
    if (!d) return;
    if (valueRef.current) valueRef.current.textContent = fmtValue(d.value);
    if (dateRef.current) dateRef.current.textContent = `${i == null ? "Latest · " : ""}${dayName(d.date, true)}, ${shortDate(d.date, today)}`;
    if (barRef.current) barRef.current.textContent = `${fmtBar(d.bar)}${d.pr ? " · Record" : ""}`;
  };

  const latest = data[latestIdx];
  const first = data.find((d) => d.value != null);
  const change = latest && first && latest !== first && latest.value != null && first.value != null ? latest.value - first.value : null;
  const desktop = useMediaQuery("(min-width: 1024px)");
  const chartRef = useSwapIn<HTMLDivElement, Range>(range, { direction: RISE_IN_PLACE });
  const chartLabel =
    first && latest && first !== latest
      ? `${label} chart: ${fmtValue(first.value)} ${metricUnit} on ${shortDate(first.date, today)} to ${fmtValue(latest.value)} ${metricUnit} on ${shortDate(latest.date, today)}, over ${plural(data.length, "session")}.`
      : `${label} chart.`;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className="num mt-2 text-[40px] font-semibold leading-none" aria-live="off">
            <span ref={valueRef}>{fmtValue(latest?.value ?? null)}</span>
            <span className="unit">{metricUnit}</span>
          </p>
          <p className="mt-1.5 text-[12px] font-semibold text-fg-3">
            <span ref={dateRef}>{latest ? `Latest · ${dayName(latest.date, true)}, ${shortDate(latest.date, today)}` : "—"}</span>
          </p>
          <p className="text-[12px] text-fg-3">
            <span ref={barRef}>{latest ? `${fmtBar(latest.bar)}${latest.pr ? " · Record" : ""}` : ""}</span>
          </p>
        </div>
        <Segmented<Range>
          size={desktop ? "sm" : "md"}
          ariaLabel="Chart range"
          className="w-[150px] shrink-0"
          value={range}
          onChange={setRange}
          options={[
            { value: "3m", label: "3M" },
            { value: "6m", label: "6M" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      {change != null && (
        <p className="mt-2 text-[13px] font-semibold text-fg-2">
          {change > 0 ? "+" : change < 0 ? "−" : ""}
          {fmtValue(Math.abs(round(change, 1)))} {metricUnit} since {shortDate(first!.date, today)}
        </p>
      )}

      <div ref={chartRef} className="mt-4">
        {loading ? (
          <Skeleton className="h-[220px] w-full lg:h-[300px]" />
        ) : error ? (
          <ErrorNote onRetry={retry}>Couldn&apos;t load the chart data.</ErrorNote>
        ) : data.length === 0 ? (
          <p className="grid h-[160px] place-items-center rounded-[14px] bg-s3 px-6 text-center text-[13px] text-fg-2">No sessions in this range. Choose All to see your full history.</p>
        ) : data.length === 1 ? (
          <p className="grid h-[160px] place-items-center rounded-[14px] bg-s3 px-6 text-center text-[13px] text-fg-2">One session so far. The trend line appears after your next one.</p>
        ) : (
          <div role="img" aria-label={chartLabel}>
            <ExerciseChart data={data} metric={series.metric} bars={series.bars} unit={unit} onScrub={write} />
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-3">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-gold-400" aria-hidden />
          {label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2 rounded-[2px] bg-verdigris/40" aria-hidden />
          {series.bars === "volume" ? "Volume" : "Sets"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rotate-45 bg-gold-300" aria-hidden />
          Record
        </span>
      </div>

      <table className="sr-only">
        <caption>{label}, last 7 sessions</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>{label}</th>
            <th>{series.bars === "volume" ? "Volume" : "Sets"}</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(-7).map((d) => (
            <tr key={d.date}>
              <td>{shortDate(d.date, today)}</td>
              <td>
                {fmtValue(d.value)} {metricUnit}
                {d.pr ? " (record)" : ""}
              </td>
              <td>{series.bars === "volume" ? `${formatInt(d.bar)} ${unit}` : d.bar}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* --------------------------------------------------------- session list */

function SessionList({
  rows,
  unit,
  today,
  prIds,
  timed,
  showE1rm,
}: {
  rows: Parameters<typeof sessionsFromSets>[0];
  unit: WeightUnit;
  today: string;
  prIds: Set<string>;
  timed: boolean;
  showE1rm: boolean;
}) {
  const [limit, setLimit] = useState(8);
  const sessions = useMemo(() => sessionsFromSets(rows), [rows]);
  if (!sessions.length) return <p className="text-[13px] text-fg-2">No completed sets yet.</p>;
  return (
    <div>
      <ol className="divide-y divide-line-hair">
        {sessions.slice(0, limit).map((s) => (
          <li key={s.sessionId} className="py-3 first:pt-0" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 96px" }}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="text-[14px] font-bold">
                {dayName(s.date, true)}, {shortDate(s.date, today)}
              </p>
              <p className="num text-[13px] text-fg-3">
                {showE1rm && s.topE1rm ? `e1RM ${fmtLoadValue(s.topE1rm, unit)} · ` : ""}
                {s.volumeLb > 0 ? fmtVolume(s.volumeLb, unit) : plural(s.sets.length, "set")}
              </p>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {s.sets.map((x) => {
                const pr = !!x.id && prIds.has(x.id);
                const work = timed ? `${x.duration_sec ?? x.reps ?? 0}s` : `${x.reps ?? 0}`;
                return (
                  <li
                    key={x.id ?? `${s.sessionId}-${x.set_index}`}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 ${pr ? "border border-line-gold bg-gold-tint" : "bg-s3"}`}
                  >
                    <span className="num text-[16px] font-semibold">
                      {x.weight_lb && Number(x.weight_lb) > 0 ? `${fmtLoadValue(Number(x.weight_lb), unit)}×` : ""}
                      {work}
                    </span>
                    {x.rir != null && <span className="text-[11px] font-semibold text-fg-3">@{Number(x.rir)}</span>}
                    {pr && <PRBadge className="ml-0.5" />}
                  </li>
                );
              })}
            </ul>
            {s.sets.some((x) => x.notes) && (
              <ul className="mt-2 space-y-0.5">
                {s.sets
                  .filter((x) => x.notes)
                  .map((x) => (
                    <li key={x.id ?? x.set_index} className="text-[13px] text-fg-2">
                      <span className="text-fg-3">Set {(x.set_index ?? 0) + 1}:</span> {x.notes}
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {sessions.length > limit && (
        <Button variant="ghost" block className="mt-1" onClick={() => setLimit((l) => l + 12)}>
          Show {Math.min(12, sessions.length - limit)} more
        </Button>
      )}
      <p className="mt-2 text-[12px] text-fg-3">
        {plural(sessions.length, "session")} · weight × reps, @ reps in reserve
      </p>
    </div>
  );
}

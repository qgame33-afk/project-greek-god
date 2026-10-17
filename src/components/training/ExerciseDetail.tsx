"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { LaurelSprig, TempleGlyph } from "@/components/art/icons";
import { BackLink } from "@/components/shell/BackLink";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { addDays, dayName, shortDate } from "@/lib/dates";
import { useToday } from "@/lib/data/core";
import { useAllSessions, useExerciseBests, useExerciseDaily, useExerciseSets } from "@/lib/data/training";
import { getExercise } from "@/lib/training/library";
import type { Mode } from "@/lib/training/progression";
import { historyTimings } from "@/lib/training/timing-history";
import { MUSCLE_LABEL, sessionsFromSets, strengthSeries, usesE1rm } from "@/lib/training/volume";
import { RISE_IN_PLACE, useSwapIn } from "@/lib/motion";
import { formatInt, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { fmtLoadValue, fmtVolume, plural } from "./format";
import { MODE_LABEL, useCustomExercises, useExercisePRs, useUnits } from "./hooks";
import { equipmentLabel } from "./LibraryPicker";
import { TimingMark } from "./lifts/TimingMark";
import { DetailSkeleton } from "./Skeletons";
import { useMounted } from "./useMounted";

const CHART_H = "h-56 lg:h-75";
const ExerciseChart = dynamic(() => import("./ExerciseChart"), {
  ssr: false,
  loading: () => <Skeleton className={cn("w-full", CHART_H)} />,
});

type Range = "3m" | "6m" | "all";

const CATEGORY: Record<string, string> = { compound: "Compound", isolation: "Isolation", explosive: "Explosive", carry: "Carry", core: "Core" };

/**
 * /training/exercise/[slug] (DESIGN-V2 §3.4.3): bests, the e1RM chart with laurel diamonds on
 * records, every session's sets with their timing marks (the same setTiming as Gym Mode), the
 * records, the how-to and substitutes — from real logged sets only. Every block keeps its
 * height while it loads.
 */
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
  const sessions = useAllSessions();
  const [range, setRange] = useState<Range>("all");

  const best = bests.data?.find((b) => b.exercise_slug === slug) ?? null;
  const customRow = custom.data?.find((c) => c.slug === slug) ?? null;
  const name = lib?.name ?? best?.exercise_name ?? customRow?.name ?? null;
  const loading = bests.isLoading || daily.isLoading;

  if (!lib && !loading && !best && !custom.isLoading && !customRow) {
    return (
      <div>
        <Back />
        <h1 className="sr-only">Exercise not found</h1>
        <Empty
          art={<TempleGlyph className="size-12 text-stone" />}
          title="Exercise not found"
          className="mt-6"
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href="/training?tab=lifts">Browse lifts</Link>
            </Button>
          }
        >
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
      <Back />
      <header className="mt-3">
        <p className="t-eyebrow">{lib ? `${CATEGORY[lib.category] ?? lib.category} · ${equipmentLabel(lib.equipment)}` : "Custom exercise"}</p>
        <h1 className="t-title-1 mt-2 break-words text-ivory">{name}</h1>
        {lib && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Muscles">
            {lib.primary.map((m) => (
              <li key={m} className="t-meta inline-flex h-7 items-center rounded-full px-2.5 font-semibold text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]">
                {MUSCLE_LABEL[m]}
              </li>
            ))}
            {lib.secondary.map((m) => (
              <li key={m} className="t-meta inline-flex h-7 items-center rounded-full px-2.5 text-stone shadow-[inset_0_0_0_1px_var(--vein)]">
                {MUSCLE_LABEL[m]}
                <span className="sr-only"> (secondary)</span>
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
        <div className="min-w-0 space-y-10 lg:col-span-7">
          {loading ? <Skeleton className="h-42 sm:h-21" /> : <StatSheet unit={unit} timed={timed} best={best} daily={daily.data ?? []} today={today} />}
          {!loading && !hasHistory && (
            <Empty art={<TempleGlyph className="size-12 text-stone" />} title="No sets logged yet">
              Log {name} in a workout and your estimated 1RM, best sets, chart and records build from those real sets.
            </Empty>
          )}

          {(loading || hasHistory) && (
            <ChartBlock daily={daily.data ?? []} loading={loading} error={!!daily.error} retry={() => daily.refetch()} range={range} setRange={setRange} unit={unit} today={today} />
          )}

          {hasHistory && (
            <section aria-labelledby="sets-h">
              <div className="mb-1 flex min-h-11 items-center justify-between gap-3">
                <h2 id="sets-h" className="t-eyebrow">
                  Sessions
                </h2>
                <span className="t-meta text-ash">each set against the same set last time</span>
              </div>
              {sets.isLoading || sessions.isLoading ? (
                <div className="space-y-px border-y border-vein" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-40 w-full rounded-none" />
                  ))}
                </div>
              ) : sets.error ? (
                <ErrorNote onRetry={() => sets.refetch()}>Couldn&apos;t load the sets.</ErrorNote>
              ) : (
                <SessionList rows={sets.data ?? []} modes={sessions.data ?? []} unit={unit} today={today} timed={timed} showE1rm={usesE1rm(daily.data ?? [])} />
              )}
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-10 lg:col-span-5">
          {hasHistory && (
            <section aria-labelledby="rec-h">
              <div className="mb-1 flex min-h-11 items-center justify-between gap-3">
                <h2 id="rec-h" className="t-eyebrow">
                  Records
                </h2>
                {!!prs.data?.length && <span className="t-meta tnum text-ash">{prs.data.length}</span>}
              </div>
              {prs.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !prs.data?.length ? (
                <p className="t-callout border-y border-vein py-4 text-stone">No records beyond your first benchmark yet. A record is a set whose estimated 1RM beats every earlier set by at least 1 lb.</p>
              ) : (
                <ol className="divide-y divide-vein border-y border-vein">
                  {prs.data.slice(0, 12).map((p) => {
                    const gain = p.e1rm_lb != null && p.prior_best_e1rm != null ? Number(p.e1rm_lb) - Number(p.prior_best_e1rm) : null;
                    return (
                      <li key={p.set_id} className="flex min-h-14 items-center gap-3 py-2">
                        <LaurelSprig className="size-5 shrink-0 text-leaf-300" />
                        <span className="min-w-0 flex-1">
                          <span className="t-num-s block text-ivory">
                            {fmtLoadValue(Number(p.weight_lb), unit)}
                            <span className="t-meta text-stone"> {unit}</span> × {p.reps}
                          </span>
                          <span className="t-meta block text-ash">{p.local_date ? `${dayName(p.local_date, true)} ${shortDate(p.local_date, today)}` : ""}</span>
                        </span>
                        <span className="text-right">
                          <span className="t-num-s block text-ivory">
                            {fmtLoadValue(Number(p.e1rm_lb), unit)}
                            <span className="t-meta text-stone"> e1RM</span>
                          </span>
                          {gain != null && gain > 0 && <span className="t-meta tnum block text-leaf-300">+{fmtLoadValue(gain, unit)}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}

          {lib ? (
            <section aria-labelledby="how-h">
              <h2 id="how-h" className="t-eyebrow mb-3 flex min-h-8 items-center">
                How to
              </h2>
              <ol className="space-y-3">
                {lib.instructions.map((s, i) => (
                  <li key={i} className="t-body flex gap-3 text-ivory">
                    <span className="t-num-s w-5 shrink-0 text-stone">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <h3 className="t-eyebrow mb-2 mt-6">Form tips</h3>
              <ul className="space-y-2">
                {lib.formTips.map((t) => (
                  <li key={t} className="t-callout flex gap-2.5 text-stone">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rotate-45 bg-ui-line" />
                    {t}
                  </li>
                ))}
              </ul>
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${lib.name} proper form`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="press t-callout mt-5 inline-flex h-11 items-center gap-2 rounded-field px-4 font-semibold text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]"
              >
                Watch demos
                <ExternalLink className="size-4 text-ash" strokeWidth={1.6} aria-hidden />
                <span className="sr-only">(opens a YouTube search in a new tab)</span>
              </a>
            </section>
          ) : (
            <section aria-labelledby="about-h">
              <h2 id="about-h" className="t-eyebrow mb-2">
                About
              </h2>
              <p className="t-callout text-stone">{customRow?.instructions || "A custom exercise you logged. The library has no instructions for it."}</p>
            </section>
          )}

          {lib && lib.substitutes.length > 0 && (
            <section aria-labelledby="subs-h">
              <h2 id="subs-h" className="t-eyebrow mb-1 flex min-h-8 items-center">
                Substitutes
              </h2>
              <ul className="divide-y divide-vein border-y border-vein">
                {lib.substitutes.map((s) => {
                  const sub = getExercise(s);
                  if (!sub) return null;
                  return (
                    <li key={s}>
                      <Link href={`/training/exercise/${s}`} className="press-soft flex min-h-14 items-center gap-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="t-title-3 block truncate text-ivory">{sub.name}</span>
                          <span className="t-meta block truncate text-stone">{sub.primary.map((m) => MUSCLE_LABEL[m]).join(", ")}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Back() {
  return (
    <BackLink href="/training?tab=lifts" className="press t-callout -ml-2 inline-flex h-11 items-center gap-1 rounded-field pr-3 font-semibold text-stone hover:text-ivory">
      <ChevronLeft className="size-5" strokeWidth={1.6} aria-hidden />
      Lifts
    </BackLink>
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

/** Four all-time numbers on one placard (2×2 on phones, one row from 640 px), each dated. */
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
      caption: e1rm ? when(dateOfBest(daily, (d) => d.best_e1rm_lb)) : has ? (best?.best_weight_lb ? "High-rep lift" : "Not a load lift") : "Log a set",
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
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card bg-vein shadow-[inset_0_0_0_1px_var(--vein)] sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="min-h-21 min-w-0 bg-night px-4 py-3.5">
          <dt className="t-eyebrow truncate">{c.label}</dt>
          <dd className="t-num-m mt-2 truncate text-ivory">
            {c.value}
            {c.unit && <span className="t-meta text-stone"> {c.unit}</span>}
          </dd>
          <dd className="t-meta mt-1 truncate text-ash">{c.caption ?? " "}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ chart */

function ChartBlock({
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
  const metricUnit = series.metric === "reps" ? "reps" : unit;
  const label = series.metric === "e1rm" ? "Estimated 1RM" : series.metric === "weight" ? "Top weight" : "Best reps";

  const fmtValue = (v: number | null) => (v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1));
  const fmtBar = (v: number) => (series.bars === "volume" ? `${formatInt(v)} ${unit} moved` : plural(v, "set"));
  const write = (i: number | null) => {
    const d = data[i ?? latestIdx];
    if (!d) return;
    if (valueRef.current) valueRef.current.textContent = fmtValue(d.value);
    if (dateRef.current) dateRef.current.textContent = `${i == null ? "Latest · " : ""}${dayName(d.date, true)} ${shortDate(d.date, today)} · ${fmtBar(d.bar)}${d.pr ? " · record" : ""}`;
  };

  const latest = data[latestIdx];
  const first = data.find((d) => d.value != null);
  const change = latest && first && latest !== first && latest.value != null && first.value != null ? latest.value - first.value : null;
  const chartRef = useSwapIn<HTMLDivElement, Range>(range, { direction: RISE_IN_PLACE });
  const chartLabel =
    first && latest && first !== latest
      ? `${label} chart: ${fmtValue(first.value)} ${metricUnit} on ${shortDate(first.date, today)} to ${fmtValue(latest.value)} ${metricUnit} on ${shortDate(latest.date, today)}, over ${plural(data.length, "session")}.`
      : `${label} chart.`;

  return (
    <section aria-labelledby="chart-h">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="chart-h" className="t-eyebrow">
            {loading ? " " : label}
          </h2>
          <p className="t-dial mt-2 text-ivory" aria-live="off">
            <span ref={valueRef}>{loading ? "—" : fmtValue(latest?.value ?? null)}</span>
            <span className="t-callout text-stone"> {metricUnit}</span>
          </p>
          <p className="t-meta tnum mt-1.5 min-h-[2.7em] text-stone">
            <span ref={dateRef}>{latest ? `Latest · ${dayName(latest.date, true)} ${shortDate(latest.date, today)} · ${fmtBar(latest.bar)}${latest.pr ? " · record" : ""}` : " "}</span>
          </p>
        </div>
        <Segmented<Range>
          size="sm"
          ariaLabel="Chart range"
          className="w-36 shrink-0"
          value={range}
          onChange={setRange}
          options={[
            { value: "3m", label: "3M" },
            { value: "6m", label: "6M" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      <p className="t-meta tnum mt-2 flex min-h-5 items-center gap-2 text-stone">
        {change != null && (
          <>
            {change > 0 ? "+" : change < 0 ? "−" : ""}
            {fmtValue(Math.abs(round(change, 1)))} {metricUnit} since {shortDate(first!.date, today)}
            <Tag kind="CALC" />
          </>
        )}
      </p>

      <div ref={chartRef} className="mt-3">
        {loading ? (
          <Skeleton className={cn("w-full", CHART_H)} />
        ) : error ? (
          <div className={cn("grid place-items-center", CHART_H)}>
            <ErrorNote onRetry={retry}>Couldn&apos;t load the chart data.</ErrorNote>
          </div>
        ) : data.length < 2 ? (
          <p className={cn("t-callout grid place-items-center border-y border-vein px-6 text-center text-stone", CHART_H)}>
            {data.length === 0 ? "No sessions in this range. Choose All to see your full history." : "One session so far. The line appears after your next one."}
          </p>
        ) : (
          <div role="img" aria-label={chartLabel}>
            <ExerciseChart data={data} metric={series.metric} bars={series.bars} unit={unit} onScrub={write} />
          </div>
        )}
      </div>
      <div className="t-meta mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-ash">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-leaf-300" />
          {label}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2 rounded-tag bg-vein-3" />
          {series.bars === "volume" ? "Volume" : "Sets"}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rotate-45 bg-leaf-300" />
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
    </section>
  );
}

/* --------------------------------------------------------- session list */

type HistRow = NonNullable<ReturnType<typeof useExerciseSets>["data"]>[number];

function SessionList({
  rows,
  modes,
  unit,
  today,
  timed,
  showE1rm,
}: {
  rows: HistRow[];
  modes: { id: string; mode: string }[];
  unit: WeightUnit;
  today: string;
  timed: boolean;
  showE1rm: boolean;
}) {
  const [limit, setLimit] = useState(6);
  const sessions = useMemo(() => sessionsFromSets(rows), [rows]);
  const modeById = useMemo(() => new Map(modes.map((s) => [s.id, s.mode as Mode])), [modes]);
  const timings = useMemo(() => historyTimings(rows, (id) => modeById.get(id)), [rows, modeById]);
  if (!sessions.length) return <p className="t-callout border-y border-vein py-4 text-stone">No completed sets yet.</p>;
  return (
    <div>
      <ol className="divide-y divide-vein border-y border-vein">
        {sessions.slice(0, limit).map((s) => {
          const mode = modeById.get(s.sessionId);
          return (
            <li key={s.sessionId} className="py-3" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 160px" }}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="t-title-3 text-ivory">
                  {dayName(s.date, true)} {shortDate(s.date, today)}
                  {mode && mode !== "standard" && <span className="t-tag ml-2 text-stone">{MODE_LABEL[mode]}</span>}
                </p>
                <p className="t-meta tnum text-ash">
                  {showE1rm && s.topE1rm ? `e1RM ${fmtLoadValue(s.topE1rm, unit)} · ` : ""}
                  {s.volumeLb > 0 ? fmtVolume(s.volumeLb, unit) : plural(s.sets.length, "set")}
                </p>
              </div>
              <ul className="mt-1.5">
                {s.sets.map((x, i) => {
                  const t = x.id ? (timings.get(x.id) ?? null) : null;
                  const work = timed ? `${x.duration_sec ?? x.reps ?? 0} s` : `${x.reps ?? 0}`;
                  const load = x.weight_lb && Number(x.weight_lb) > 0 ? fmtLoadValue(Number(x.weight_lb), unit) : null;
                  return (
                    <li
                      key={x.id ?? `${s.sessionId}-${x.set_index}`}
                      className={cn("-mx-2 flex min-h-11 items-center gap-3 rounded-field px-2", t?.timing === "record" && "bg-leaf-tint")}
                      aria-label={`Set ${i + 1}, ${load ? `${load} ${unit === "lb" ? "pounds" : "kilograms"} for ` : ""}${work}${timed ? "" : " reps"}, ${t?.timing ? (t.timing === "record" ? "a record" : t.timing === "first" ? "first benchmark" : t.timing === "beat" ? "beat last time" : t.timing === "matched" ? "matched last time" : "below last time") : "logged"}`}
                    >
                      <span aria-hidden className="t-eyebrow w-12 shrink-0">
                        Set {i + 1}
                      </span>
                      <span aria-hidden className="t-num-s min-w-0 flex-1 text-ivory">
                        {load ? (
                          <>
                            {load}
                            <span className="text-stone"> × </span>
                          </>
                        ) : null}
                        {work}
                        {x.rir != null && <span className="t-meta text-ash"> @{Number(x.rir)}</span>}
                      </span>
                      <span aria-hidden>
                        <TimingMark timing={t?.timing ?? null} />
                      </span>
                    </li>
                  );
                })}
              </ul>
              {s.sets.some((x) => x.notes) && (
                <ul className="mt-1 space-y-0.5">
                  {s.sets
                    .filter((x) => x.notes)
                    .map((x) => (
                      <li key={x.id ?? x.set_index} className="t-meta text-stone">
                        <span className="text-ash">Set {s.sets.indexOf(x) + 1}:</span> {x.notes}
                      </li>
                    ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {sessions.length > limit && (
        <Button variant="ghost" size="sm" block className="mt-1" onClick={() => setLimit((l) => l + 10)}>
          Show {Math.min(10, sessions.length - limit)} more
        </Button>
      )}
      <p className="t-meta mt-2 text-ash">
        {plural(sessions.length, "session")} · weight × reps, @ reps in reserve
      </p>
    </div>
  );
}

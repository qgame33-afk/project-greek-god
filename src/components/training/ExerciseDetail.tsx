"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronRight, Ellipsis, ExternalLink, Info, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { BackHeader } from "@/components/shell/BackHeader";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { DetailsSheet } from "@/components/ui/details-sheet";
import { ListGroup, Row, SectionHead } from "@/components/ui/list";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { addDays, dayName, monthName, parseISODate, type ISODate } from "@/lib/dates";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { useAllSessions, useExerciseDaily, useExerciseSets, useTemplates } from "@/lib/data/training";
import { useRecentHistory } from "@/lib/data/workout";
import { getExercise } from "@/lib/training/library";
import { exerciseDisplayName } from "@/lib/training/programs";
import { suggest, type Mode } from "@/lib/training/progression";
import { MUSCLE_LABEL, sessionsFromSets, strengthSeries } from "@/lib/training/volume";
import { formatLoad, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { effortText, plural } from "./format";
import { useCustomExercises, useExercisePRs, useUnits } from "./hooks";
import { equipmentLabel } from "./LibraryPicker";
import { Caption } from "./parts";
import { DetailSkeleton } from "./Skeletons";
import { useMounted } from "./useMounted";

const ExerciseChart = dynamic(() => import("./ExerciseChart"), { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> });

/** "Tue 20 Oct" */
const dm = (d: ISODate) => `${dayName(d, true)} ${parseISODate(d).getDate()} ${monthName(d, true)}`;
const e1 = (w: number, r: number) => w * (1 + r / 30);

/**
 * /training/exercise/[slug] (docs/DESIGN-V3-SIMPLE.md §4.3.11, `exercise-detail`): the best set
 * as the hero with PROGRAM's double-progression "Next time" line (→ How we got this), one chart,
 * the sessions with a plain verdict each ("New best", "+1 rep", "Same"), and How to do it. Past
 * sessions keep their stored names (`data-history`). Everything comes from logged sets.
 */
export function ExerciseDetail({ slug }: { slug: string }) {
  const mounted = useMounted();
  return mounted ? <Detail slug={slug} /> : <DetailSkeleton />;
}

function Detail({ slug }: { slug: string }) {
  const today = useToday();
  const { unit } = useUnits();
  const { profile } = useProfile();
  const lib = getExercise(slug);
  const custom = useCustomExercises();
  const daily = useExerciseDaily(slug);
  const sets = useExerciseSets(slug);
  const prs = useExercisePRs(slug);
  const sessions = useAllSessions();
  const { templates } = useTemplates();
  const history = useRecentHistory([slug]);
  const [more, setMore] = useState(false);
  const [how, setHow] = useState(false);
  const [details, setDetails] = useState(false);
  const [range, setRange] = useState<"3m" | "all">("all");
  const [limit, setLimit] = useState(6);

  const customRow = custom.data?.find((c) => c.slug === slug) ?? null;
  const rows = useMemo(() => sets.data ?? [], [sets.data]);
  const name = lib ? exerciseDisplayName(slug, templates) : (customRow?.name ?? rows[0]?.exercise_name ?? null);
  const inTemplate = templates.find((t) => t.exercises.some((e) => e.slug === slug)) ?? null;
  const te = inTemplate?.exercises.find((e) => e.slug === slug) ?? null;
  const mode = (profile?.training_mode ?? "standard") as Mode;
  const offline = sets.isPending && sets.fetchStatus === "paused";
  const loading = !offline && sets.isPending;

  const best = useMemo(() => {
    let b: { w: number; r: number; d: string } | null = null;
    for (const x of rows) {
      const w = Number(x.weight_lb ?? 0);
      const r = Number(x.reps ?? 0);
      if (!r) continue;
      if (!b || (w > 0 ? e1(w, r) > e1(b.w, b.r) : b.w === 0 && r > b.r)) b = { w, r, d: x.local_date ?? "" };
    }
    return b;
  }, [rows]);
  const estMax = best && best.w > 0 && best.r <= 12 ? e1(best.w, best.r) : null;

  const s = te && lib && history.data ? suggest(te, lib, history.data[slug] ?? [], mode, { templateKey: inTemplate?.key }) : null;
  const lastSession = (history.data?.[slug] ?? []).filter((x, _, a) => x.session_id === a[0]?.session_id);
  const next = s ? nextLine(s.kind, s.weightLb, unit, te!, lastSession.length) : null;

  const sessionNames = useMemo(() => new Map((sessions.data ?? []).map((x) => [x.id, x.name])), [sessions.data]);
  const prSets = useMemo(() => new Set((prs.data ?? []).map((p) => p.set_id)), [prs.data]);
  const grouped = useMemo(() => sessionsFromSets(rows), [rows]);

  if (!lib && !customRow && !loading && !offline && !custom.isLoading && rows.length === 0) {
    return (
      <div>
        <BackHeader href="/training?tab=lifts" parent="Lifts" title="Lift not found" />
        <Empty title="This lift isn't in the library." className="mt-6" action={<Button variant="secondary" size="sm" asChild><Link href="/training?tab=lifts">See your lifts</Link></Button>}>
          And you haven&apos;t logged it.
        </Empty>
      </div>
    );
  }
  if (!name) return <DetailSkeleton />;

  const perHand = !!lib?.perHand;
  const right = (
    <Button variant="secondary" size="icon" aria-label="More" aria-haspopup="dialog" onClick={() => setMore(true)}>
      <Ellipsis aria-hidden />
    </Button>
  );

  return (
    <div className="pb-6">
      <BackHeader href="/training?tab=lifts" parent="Lifts" title={<span className="break-words">{name}</span>} right={right} />

      {/* the hero: the best set */}
      {offline ? (
        <ErrorNote className="mt-5" onRetry={() => sets.refetch()}>
          You&apos;re offline. This lift&apos;s numbers show when you&apos;re back.
        </ErrorNote>
      ) : loading ? (
        <Skeleton className="mt-5 h-[168px] rounded-card" />
      ) : (
        <button type="button" onClick={() => setDetails(true)} aria-haspopup="dialog" aria-describedby="best-hint" className="press-soft mt-5 block w-full rounded-card bg-surface px-[22px] pb-[22px] pt-5 text-left" data-derived="">
          <span className="flex items-center justify-between gap-3">
            <span className="t-label">Best set{perHand ? " · each hand" : ""}</span>
            <ChevronRight className="size-4 text-fg-3" strokeWidth={2.2} aria-hidden />
          </span>
          {best ? (
            <span className="t-hero mt-2 block tabular-nums">
              {best.w > 0 ? (
                <>
                  {formatLoad(best.w, unit, false)}
                  <span className="unit">{unit}</span> × {best.r}
                </>
              ) : (
                <>
                  {best.r}
                  <span className="unit">reps</span>
                </>
              )}
            </span>
          ) : (
            <span className="t-hero mt-2 block">—</span>
          )}
          <span className="t-label mt-2 block">{best ? (next ?? `Last time ${dm(rows.reduce((a, b) => ((b.local_date ?? "") > (a.local_date ?? "") ? b : a)).local_date ?? today)}.`) : "Log it in a workout to see your best set."}</span>
          <span id="best-hint" className="sr-only">
            Shows how it is worked out
          </span>
        </button>
      )}

      {/* the chart */}
      {!offline && grouped.length > 1 && <ChartCard daily={daily.data ?? []} loading={daily.isPending} unit={unit} today={today} range={range} setRange={setRange} />}

      {/* sessions */}
      {!offline && grouped.length > 0 && (
        <section aria-labelledby="ses-h">
          <SectionHead id="ses-h">Sessions</SectionHead>
          <ListGroup>
            {grouped.slice(0, limit).map((g, i) => {
              const older = grouped[i + 1];
              const record = g.sets.some((x) => x.id && prSets.has(x.id));
              const nm = sessionNames.get(g.sessionId);
              return (
                <Row
                  key={g.sessionId}
                  title={
                    <span data-history="">
                      {dm(g.date)}
                      {nm ? <span className="text-fg-2"> · {nm}</span> : null}
                    </span>
                  }
                  wrap
                  subtitle={setsLine(g.sets, unit)}
                  value={record ? <NewBest /> : verdict(g, older, unit)}
                />
              );
            })}
          </ListGroup>
          {grouped.length > limit && (
            <Button variant="ghost" size="md" block className="mt-2" onClick={() => setLimit((l) => l + 10)}>
              Show {Math.min(10, grouped.length - limit)} more
            </Button>
          )}
        </section>
      )}
      {!loading && !offline && grouped.length === 0 && <Caption className="mt-4">No sessions yet. Your first set of {name} shows here.</Caption>}

      <ListGroup className="mt-7">
        <Row icon={Info} title="How to do it" onClick={() => setHow(true)} />
      </ListGroup>

      <DetailsSheet
        open={details}
        onOpenChange={setDetails}
        title="Best set"
        rows={[
          { label: "Best set", value: best ? (best.w > 0 ? `${formatLoad(best.w, unit)} × ${best.r}` : `${best.r} reps`) : "—", detail: best?.d ? dm(best.d) : undefined },
          { label: "Est. max", value: estMax ? formatLoad(round(estMax, 0), unit) : "—", detail: "One rep, worked out from the best set" },
          { label: "Sessions", value: String(grouped.length) },
          ...(s?.weightLb != null ? [{ label: "Next time", value: formatLoad(s.weightLb, unit) }] : []),
        ]}
        how={`${s?.reason ? `${s.reason} ` : ""}Next time follows the plan's double progression: once every set reaches the top of the rep range at the target effort, add the smallest weight step. Otherwise keep the weight and add reps. The est. max is weight × (1 + reps ÷ 30) on your best set of 12 reps or fewer. Only sets you logged count.`}
      />

      <Sheet open={how} onOpenChange={setHow} title="How to do it">
        <div className="flex flex-col gap-5 pb-4" data-program-text="">
          {te && <p className="t-row">{effortText(te.rir)}</p>}
          {lib ? (
            <>
              <ol className="flex flex-col gap-3">
                {lib.instructions.map((x, i) => (
                  <li key={i} className="t-body flex gap-3">
                    <span aria-hidden className="t-row w-5 shrink-0 text-fg-2 tabular-nums">
                      {i + 1}
                    </span>
                    <span>{x}</span>
                  </li>
                ))}
              </ol>
              {lib.formTips.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {lib.formTips.map((t) => (
                    <li key={t} className="t-label">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              <p className="t-label">
                {lib.primary.map((m) => MUSCLE_LABEL[m]).join(", ")} · {equipmentLabel(lib.equipment)}
              </p>
              <Button variant="secondary" size="md" asChild>
                <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${lib.name} proper form`)}`} target="_blank" rel="noopener noreferrer">
                  Watch how
                  <ExternalLink aria-hidden />
                  <span className="sr-only">(opens a YouTube search)</span>
                </a>
              </Button>
            </>
          ) : (
            <p className="t-body text-fg-2">{customRow?.instructions || "A lift you added yourself. There are no steps for it."}</p>
          )}
        </div>
      </Sheet>

      <Sheet open={more} onOpenChange={setMore} title={name}>
        <div className="flex flex-col gap-5 pb-4">
          {inTemplate && (
            <ListGroup>
              <Row title="Edit in workout" subtitle={inTemplate.name} href={`/training/program/${inTemplate.key}`} />
            </ListGroup>
          )}
          {lib && lib.substitutes.length > 0 && (
            <section aria-label="Swap options">
              <p className="t-cap mb-2 px-1">Swap options</p>
              <ListGroup>
                {lib.substitutes
                  .map((x) => getExercise(x))
                  .filter((x): x is NonNullable<typeof x> => !!x && !x.retired)
                  .map((x) => (
                    <Row key={x.slug} title={x.name} dataName subtitle={x.primary.map((m) => MUSCLE_LABEL[m]).join(", ")} href={`/training/exercise/${x.slug}`} />
                  ))}
              </ListGroup>
            </section>
          )}
          {!inTemplate && !(lib && lib.substitutes.length) && <p className="t-body text-fg-2">This lift isn&apos;t in your current plan.</p>}
        </div>
      </Sheet>
    </div>
  );
}

function NewBest() {
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-gold">
      <Trophy className="size-4" strokeWidth={2.2} aria-hidden />
      New best
    </span>
  );
}

type G = ReturnType<typeof sessionsFromSets<NonNullable<ReturnType<typeof useExerciseSets>["data"]>[number]>>[number];

/** "70 × 10 · 10 · 10" (one weight) or "70 × 10 · 65 × 9" (weights changed). */
function setsLine(sets: G["sets"], unit: WeightUnit) {
  const w = (x: G["sets"][number]) => (x.weight_lb == null ? 0 : Number(x.weight_lb));
  const reps = (x: G["sets"][number]) => (x.duration_sec && !x.reps ? `${x.duration_sec} s` : String(x.reps ?? 0));
  if (!sets.length) return "—";
  const same = sets.every((x) => w(x) === w(sets[0]));
  if (same) return w(sets[0]) > 0 ? `${formatLoad(w(sets[0]), unit, false)} × ${sets.map(reps).join(" · ")}` : `${sets.map(reps).join(" · ")} reps`;
  return sets.map((x) => (w(x) > 0 ? `${formatLoad(w(x), unit, false)} × ${reps(x)}` : reps(x))).join(" · ");
}

/** The session against the one before it: more weight, or reps at the same weight. */
function verdict(g: G, older: G | undefined, unit: WeightUnit) {
  if (!older) return "First time";
  const top = (x: G) => Math.max(0, ...x.sets.map((s) => Number(s.weight_lb ?? 0)));
  const reps = (x: G, w: number) => x.sets.filter((s) => Number(s.weight_lb ?? 0) === w).reduce((n, s) => n + (s.reps ?? 0), 0);
  const a = top(g);
  const b = top(older);
  if (a !== b) return `${a > b ? "+" : "−"}${formatLoad(Math.abs(a - b), unit)}`;
  const d = reps(g, a) - reps(older, b);
  return d === 0 ? "Same" : `${d > 0 ? "+" : "−"}${Math.abs(d)} ${Math.abs(d) === 1 ? "rep" : "reps"}`;
}

/** PROGRAM's double progression in one line (the reason itself is in How we got this). */
function nextLine(kind: string, w: number | null, unit: WeightUnit, te: { repLow: number; repHigh: number; sets: number }, lastSets: number) {
  const load = w != null ? formatLoad(w, unit) : null;
  switch (kind) {
    case "increase":
      return `Next time: try ${load}. You hit ${te.repHigh} reps on ${lastSets > 1 ? `all ${lastSets} sets` : "your set"}.`;
    case "add_reps":
    case "hold":
      return "Next time: same weight, aim for more reps.";
    case "reset":
      return load ? `Next time: ${load}, then build back up.` : "Next time: a little lighter, then build back up.";
    case "deload":
      return load ? `Next time: ${load} for the light week.` : null;
    case "first":
      return `Next time: pick a weight you can lift ${te.repLow}–${te.repHigh} times.`;
    case "bodyweight":
      return "Next time: aim for more reps.";
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ chart */

function ChartCard({ daily, loading, unit, today, range, setRange }: { daily: Parameters<typeof strengthSeries>[0]; loading: boolean; unit: WeightUnit; today: ISODate; range: "3m" | "all"; setRange: (r: "3m" | "all") => void }) {
  const from = range === "3m" ? addDays(today, -91) : null;
  const series = useMemo(() => strengthSeries(daily, from), [daily, from]);
  const data = useMemo(() => series.points.map((p) => ({ date: p.date, value: p.value == null ? null : series.metric === "reps" ? p.value : round(toDisplayWeight(p.value, unit), 1), pr: p.pr })), [series, unit]);
  const label = series.metric === "e1rm" ? "Est. max" : series.metric === "weight" ? "Top weight" : "Best reps";
  const u = series.metric === "reps" ? "reps" : unit;
  const first = data.find((d) => d.value != null);
  const last = data.findLast((d) => d.value != null);
  const spoken = first && last && first !== last ? `${label}: ${first.value} ${u} on ${dm(first.date)} to ${last.value} ${u} on ${dm(last.date)}, over ${plural(data.length, "session")}.` : `${label}.`;
  return (
    <section aria-labelledby="chart-h" className="mt-3 rounded-card bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="chart-h" className="t-row">
          {label}
        </h2>
        <div className="flex gap-2" role="group" aria-label="Chart range">
          <Chip selected={range === "3m"} onClick={() => setRange("3m")} ariaLabel="Last 3 months">
            3M
          </Chip>
          <Chip selected={range === "all"} onClick={() => setRange("all")} ariaLabel="All time">
            All
          </Chip>
        </div>
      </div>
      <div className="mt-3" data-budget-group="" role="img" aria-label={spoken}>
        {loading ? <Skeleton className="h-40 w-full" /> : data.length < 2 ? <p className="t-label grid h-40 place-items-center text-center">One session in this range. Choose All.</p> : <ExerciseChart data={data} metric={series.metric} />}
      </div>
      <table className="sr-only">
        <caption>{label}, last 7 sessions</caption>
        <tbody>
          {data.slice(-7).map((d) => (
            <tr key={d.date}>
              <td>{dm(d.date)}</td>
              <td>
                {d.value ?? "—"} {u}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { SquarePen, X } from "lucide-react";
import { LaurelBullet, Meander } from "@/components/art/Motifs";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/misc";
import { useProfile } from "@/lib/data/profile";
import { useTemplates } from "@/lib/data/training";
import { dayName, longDate, relativeDay } from "@/lib/dates";
import { getExercise } from "@/lib/training/library";
import type { TemplateKey } from "@/lib/training/types";
import { formatLoad, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { firstBenchmarks, sessionRecords } from "@/lib/workout/pr";
import { groupSets, setChip, trackingFor } from "@/lib/workout/session";
import { formatGain } from "@/lib/workout/copy";
import { comparisonLine, improvements, sessionTotals, volumeDeltaPct } from "@/lib/workout/summary";
import { usePriorBests, usePriorHistory, useNextWorkout, usePreviousSession, type LiveData } from "./data";

export function SessionSummary({ data, onEdit }: { data: LiveData; onEdit: () => void }) {
  const router = useRouter();
  const { profile } = useProfile();
  const unit: WeightUnit = profile?.weight_unit === "kg" ? "kg" : "lb";
  const fmt = (lb: number) => formatLoad(lb, unit, false);
  const { byKey } = useTemplates();
  const { session, sets } = data;
  const template = session.template_key ? byKey[session.template_key as TemplateKey] : undefined;

  const logged = useMemo(() => sets.filter((s) => s.completed), [sets]);
  const groups = useMemo(() => groupSets(logged), [logged]);
  const slugs = useMemo(() => [...new Set(groups.map((g) => g.slug))], [groups]);
  const bests = usePriorBests(session.id, slugs, session.local_date);
  const history = usePriorHistory(session.id, slugs, session.local_date);
  const prev = usePreviousSession(session);
  const next = useNextWorkout();

  // Stored totals are authoritative (written at Finish); recomputed only as a fallback.
  const totals = sessionTotals(logged);
  const volumeLb = Number(session.total_volume_lb) || totals.volumeLb;
  const setsDone = session.sets_completed || totals.setsCompleted;
  const minutes = session.duration_sec ? Math.max(1, Math.round(session.duration_sec / 60)) : null;
  const plaques = bests.data ? sessionRecords(groups, bests.data) : [];
  const firsts = bests.data ? firstBenchmarks(groups, bests.data) : [];
  const pct = volumeDeltaPct(volumeLb, prev.data ? Number(prev.data.total_volume_lb) : null);
  const compare = comparisonLine(pct, template?.name ?? session.name);
  const notable = history.data ? improvements(groups, history.data, fmt, unit, new Set(plaques.map((p) => p.slug))) : [];
  const volumeShown = toDisplayWeight(volumeLb, unit);

  return (
    <div className="min-h-dvh bg-bg-deep">
      <div className="mx-auto w-full max-w-[640px] px-3 pb-[calc(var(--safe-bottom)+32px)] sm:px-4" style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}>
        <div className="flex h-12 items-center justify-between">
          <button type="button" onClick={() => router.push("/")} aria-label="Close summary" className="-ml-1 grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg">
            <X className="size-5" />
          </button>
          <button type="button" onClick={onEdit} className="inline-flex h-11 items-center gap-2 rounded-[12px] px-3 text-[14px] font-bold text-fg-2 hover:text-fg">
            <SquarePen className="size-4" aria-hidden /> Edit sets
          </button>
        </div>

        <section className="card-monument wk-rise relative overflow-hidden px-5 pb-6 pt-7 sm:px-7" aria-label="Session complete">
          <p className="eyebrow text-gold-300">Session complete</p>
          <h1 className="t-hero mt-3 text-fg">{session.name}</h1>
          <p className="mt-2 text-[14px] font-medium text-fg-2">
            {longDate(session.local_date)}
            {template?.subtitle ? ` · ${template.subtitle}` : ""}
          </p>

          <dl className="mt-7 grid grid-cols-2 gap-x-5 gap-y-6">
            <SumStat label="Duration" unit="min" value={minutes} />
            <SumStat label="Volume" unit={unit} value={volumeShown > 0 ? Math.round(volumeShown) : null} />
            <SumStat label="Sets" value={setsDone} />
            <SumStat label="Exercises" value={totals.exercises} />
          </dl>

          <div className="my-7 text-gold-700" aria-hidden>
            <Meander width={300} height={10} className="w-full" />
          </div>

          <h2 className="eyebrow text-gold-300">Hall of records</h2>
          {plaques.length ? (
            <ul className="mt-4 space-y-3">
              {plaques.map((p) => (
                <li key={p.slug} className="flex items-center gap-3 rounded-[16px] border border-line-gold/70 bg-gold-tint px-4 py-3.5">
                  <LaurelBullet size={18} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="t-plaque line-clamp-2">{p.name}</p>
                    <p className="num mt-1 text-[16px] font-medium text-fg-2">
                      {fmt(p.weightLb)} × {p.reps} · e1RM {Math.round(toDisplayWeight(p.e1rm, unit))} {unit}
                    </p>
                  </div>
                  <span className="num shrink-0 text-[22px] font-semibold text-gold-200">{formatGain(p.gain, unit)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[15px] leading-relaxed text-fg-2">
              {bests.isLoading ? "Checking your records…" : compare ? `No new records today. ${compare}.` : "No new records today. Consistency is what moves the numbers."}
            </p>
          )}
          {plaques.length > 0 && compare && <p className="mt-4 text-[14px] font-semibold text-fg-2">{compare}</p>}
          {firsts.length > 0 && (
            <p className="mt-4 text-[13px] leading-relaxed text-fg-2">
              <span className="mr-2 inline-flex h-5 items-center rounded-[6px] border border-marble/45 px-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-marble">First benchmark</span>
              {firsts.map((f) => f.name).join(", ")}
            </p>
          )}

          <div className="mt-7 flex items-center justify-between gap-3 border-t border-line-hair pt-5">
            <p className="text-[14px] font-semibold text-fg-2">
              {next ? (
                <>
                  <span className="eyebrow mr-2">Next</span>
                  {next.inDays === 1 ? "Tomorrow" : dayName(next.date)} · <span className="text-fg">{next.name}</span>
                </>
              ) : (
                <span className="text-fg-3">No session scheduled this week</span>
              )}
            </p>
          </div>
          <Button variant="primary" size="lg" block className="mt-5" onClick={() => router.push("/")}>
            Done
          </Button>
        </section>

        {notable.length > 0 && (
          <section className="card-instrument mt-4 p-4 sm:p-5" aria-label="Improvements">
            <h2 className="eyebrow mb-3">Improvements vs last time</h2>
            <ul className="space-y-2.5">
              {notable.map((n) => (
                <li key={n.slug} className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="truncate font-semibold text-fg">{n.name}</span>
                  <span className="num shrink-0 text-[15px] text-success">{n.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card-instrument mt-4 p-4 sm:p-5" aria-label="Exercises">
          <h2 className="eyebrow mb-1">Logged</h2>
          {groups.length ? (
            <ul className="divide-y divide-line-hair">
              {groups.map((g) => {
                const t = trackingFor(getExercise(g.slug), g.working[0]?.target_unit);
                const pr = plaques.some((p) => p.slug === g.slug);
                return (
                  <li key={g.key} className="py-3">
                    <p className="flex items-center gap-1.5 text-[15px] font-semibold text-fg">
                      {g.name}
                      {pr && <LaurelBullet size={13} />}
                    </p>
                    <p className="num mt-0.5 text-[14px] leading-relaxed text-fg-2">
                      {g.warmups.length > 0 && (
                        <span className="text-fg-3">
                          W {g.warmups.map((s) => setChip(s, t, fmt)).join(" · ")}
                          {g.working.length > 0 && " · "}
                        </span>
                      )}
                      {g.working.map((s) => setChip(s, t, fmt)).join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-3 text-[14px] text-fg-2">No sets were logged in this session.</p>
          )}
          {session.notes && (
            <div className="mt-2 border-t border-line-hair pt-3">
              <p className="eyebrow mb-1">Notes</p>
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-fg-2">{session.notes}</p>
            </div>
          )}
          <p className="mt-3 text-[12px] font-medium text-fg-3">
            Saved {relativeDay(session.local_date).toLowerCase() === "today" ? "today" : longDate(session.local_date)}. Volume counts working sets only.
          </p>
        </section>
      </div>
    </div>
  );
}

function SumStat({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="num-lg mt-2 text-fg">
        {value == null ? <span className="text-fg-3">—</span> : <CountUp value={value} />}
        {value != null && unit && <span className="unit">{unit}</span>}
      </dd>
    </div>
  );
}

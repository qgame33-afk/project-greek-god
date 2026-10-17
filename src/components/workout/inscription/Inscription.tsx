"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ellipsis, PencilLine } from "lucide-react";
import { Laurel } from "@/components/art/Laurel";
import { LaurelSprig } from "@/components/art/icons";
import { Colonnade } from "@/components/signature/Colonnade";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { useTemplates } from "@/lib/data/training";
import { dayName } from "@/lib/dates";
import { EASE, prefersReducedMotion } from "@/lib/motion";
import { getExercise } from "@/lib/training/library";
import { suggest, type Mode } from "@/lib/training/progression";
import type { TemplateExercise, TemplateKey } from "@/lib/training/types";
import { formatInt, formatLoad, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { formatGain, repRange } from "@/lib/workout/copy";
import { asPastSets, clockTime, gymDate, lastRealSession, liftResults, targetLine, type LiftResult } from "@/lib/workout/gym";
import { firstBenchmarks, sessionRecords } from "@/lib/workout/pr";
import { groupSets, hasWeight, isTimed, setChip, trackingFor } from "@/lib/workout/session";
import { comparisonLine, sessionTotals, volumeDeltaPct } from "@/lib/workout/summary";
import { useNextWorkout, usePreviousSession, usePriorBests, usePriorHistory, type LiveData } from "../data";
import { TimingMark } from "../gym/SetTower";
import { useSessionWeek } from "./data";
import { clearInscription, peekInscription, plannedFor } from "./flags";
import { RefuelCard } from "./RefuelCard";

/**
 * The Inscription (docs/DESIGN-V2.md §3.3): the session, sealed. Obsidian, marble veins and one
 * spotlight. Everything — the title row, stats, the per-lift rows, refuel, the next-time rule and
 * Done — is final from frame 0. The animated layers (the laurel inscribing, the record number
 * counting up from the old best, one sheen, today's temple column gilding) play once, right after
 * the seal on this device; any tap skips to the end. Past sessions show the same layout, still.
 * Reduced motion: the final composition after a 150 ms fade. No Share until a renderer exists.
 */
export function Inscription({ data, onEdit }: { data: LiveData; onEdit: () => void }) {
  const router = useRouter();
  const today = useToday();
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
  const week = useSessionWeek(session.local_date, today);

  // Played once, for the seal that just happened on this device (never on a revisit).
  const [play] = useState(() => peekInscription(session.id) && !prefersReducedMotion());
  const [skipped, setSkipped] = useState(false);
  const animate = play && !skipped;
  useEffect(() => clearInscription(session.id), [session.id]);
  const [templeLive, setTempleLive] = useState(!play);
  useEffect(() => {
    if (!animate) return;
    const t = window.setTimeout(() => setTempleLive(true), 3500);
    return () => window.clearTimeout(t);
  }, [animate]);
  const skip = () => {
    if (!animate) return;
    setSkipped(true);
    setTempleLive(true);
  };

  /* numbers, all from the logged sets */
  const totals = sessionTotals(logged);
  const volumeLb = Number(session.total_volume_lb) || totals.volumeLb;
  const setsDone = session.sets_completed || totals.setsCompleted;
  const [planned] = useState(() => plannedFor(session.id));
  const minutes = session.duration_sec ? Math.max(1, Math.round(session.duration_sec / 60)) : null;
  const plaques = bests.data ? sessionRecords(groups, bests.data) : [];
  const firsts = bests.data ? firstBenchmarks(groups, bests.data) : [];
  const pct = volumeDeltaPct(volumeLb, prev.data ? Number(prev.data.total_volume_lb) : null);
  const compare = comparisonLine(pct, template?.name ?? session.name);
  const results = history.data && bests.data ? liftResults(groups, history.data, bests.data, plaques, session.mode as Mode, unit) : null;
  const hero = plaques[0] ?? null;
  const restPlaques = plaques.slice(1);
  const endedAt = session.ended_at ?? session.started_at;

  /* the next-time rule: the progression rule on the updated history, main lifts first */
  const nextLines = useMemo(() => {
    if (!history.data) return [];
    const mine = asPastSets(sets, session.mode as Mode);
    const out: { key: string; name: string; line: string }[] = [];
    for (const g of groups) {
      if (out.length >= 3) break;
      const lib = getExercise(g.slug);
      const t = trackingFor(lib, g.working[0]?.target_unit);
      if (!hasWeight(t) || isTimed(t) || t === "bodyweight_reps") continue;
      const first = g.working[0];
      const fromT = template?.exercises.find((e) => e.slug === g.slug);
      const tEx: TemplateExercise = fromT ?? {
        slug: g.slug,
        name: g.name,
        sets: Math.max(1, g.total),
        repLow: first?.target_rep_low ?? 8,
        repHigh: first?.target_rep_high ?? 12,
        unit: (first?.target_unit as TemplateExercise["unit"]) ?? "reps",
        rir: first?.target_rir ?? "1–2",
        rest: first?.rest_sec ?? lib?.rest ?? 90,
      };
      const hist = [...(mine[g.slug] ?? []), ...(history.data[g.slug] ?? [])];
      const s = suggest(tEx, lib, hist, (profile?.training_mode ?? "standard") as Mode);
      if (s.weightLb == null) continue;
      out.push({ key: g.key, name: g.name, line: targetLine(s, lastRealSession(hist), fmt, t) });
    }
    return out;
    // fmt is a pure function of unit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.data, sets, session.mode, groups, template, profile?.training_mode, unit]);

  const [menuOpen, setMenuOpen] = useState(false);
  const leave = () => {
    if (!play && session.local_date !== today && window.history.length > 1) router.back();
    else router.push("/");
  };

  const heroFrom = hero ? Math.round(toDisplayWeight(hero.e1rm - hero.gain, unit)) : 0;
  const heroTo = hero ? Math.round(toDisplayWeight(hero.e1rm, unit)) : 0;
  const unitWord = unit === "kg" ? "kilograms" : "pounds";

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-obsidian" onPointerDownCapture={skip}>
      {/* one light from above, and the marble's own veins at 4% */}
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-[86vh]", animate && "spot-in")}>
        <div className="absolute inset-0 bg-[radial-gradient(26%_88%_at_50%_0%,rgb(236_200_140/.13),transparent_78%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(70%_46%_at_50%_0%,rgb(236_200_140/.09),transparent_70%)]" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[url(/art/marble-veins.svg)] bg-[length:400px_400px] opacity-[.04]" />

      <div className="wk-fade motion-keep relative mx-auto w-full max-w-col px-5" style={{ paddingTop: "var(--safe-top)", paddingBottom: "calc(var(--safe-bottom) + 112px)" }}>
        <div className="flex h-[52px] items-center justify-end">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Session options" className="press -mr-2 grid size-11 place-items-center rounded-full text-stone hover:text-ivory">
            <Ellipsis className="size-5" strokeWidth={1.6} />
          </button>
        </div>

        <header className="text-center">
          <h1 className="sr-only">Session sealed</h1>
          <p aria-hidden className="t-eyebrow !text-leaf-300 [letter-spacing:.24em]">
            Session sealed
          </p>
          <p className="t-callout mt-2 text-stone">
            {session.name} · {gymDate(session.local_date)}
            {session.ended_at ? ` · ${clockTime(endedAt)}` : ""}
          </p>
        </header>

        {hero ? (
          <section aria-label={`New record: ${hero.name}, estimated max ${heroTo} ${unitWord}, up ${formatGain(hero.gain, unit).replace("+", "")}`} className="mt-6">
            <div aria-hidden className="relative mx-auto grid aspect-square w-full max-w-[300px] place-items-center">
              <Laurel size={300} inscribe={animate} delay={100} leaves={11} className="absolute inset-0 size-full" />
              <div className="relative -mt-2 flex flex-col items-center">
                <p className={cn("t-eyebrow !text-leaf-200 [letter-spacing:.3em]", animate && "wk-rise-late")} style={animate ? { animationDelay: "750ms" } : undefined}>
                  New record
                </p>
                <p className="t-monument relative mt-2 overflow-hidden bg-[linear-gradient(180deg,var(--leaf-100),var(--leaf-300)_45%,var(--leaf-500))] bg-clip-text pb-1 text-transparent">
                  <CountUp from={heroFrom} to={heroTo} play={animate} delay={950} duration={700} />
                  {animate && <span aria-hidden className="wk-sheen-late pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(100deg,transparent_15%,rgb(255_250_235/.55)_50%,transparent_85%)]" />}
                </p>
                <p className="t-eyebrow mt-2 !text-stone">{unit} · est. 1-rep max</p>
              </div>
            </div>
            <p className="t-title-1 mt-2 text-center text-ivory">{hero.name}</p>
            <p className={cn("t-callout tnum mt-1.5 text-center text-stone", animate && "wk-rise-late")} style={animate ? { animationDelay: "2050ms" } : undefined}>
              {fmt(hero.weightLb)} × {hero.reps}
              {heroTarget(groups, hero.slug) && <> · target {heroTarget(groups, hero.slug)}</>} · <span className="text-leaf-300">{formatGain(hero.gain, unit)}</span> over {heroFrom}
            </p>
            {restPlaques.length > 0 && (
              <ul className="mt-6 space-y-2">
                {restPlaques.map((p) => (
                  <li key={p.slug} className="flex items-center gap-3 rounded-btn bg-leaf-tint px-4 py-3 shadow-[inset_0_0_0_1px_var(--leaf-line)]">
                    <LaurelSprig aria-hidden className="size-5 shrink-0 text-leaf-300" strokeWidth={1.6} />
                    <span className="min-w-0 flex-1">
                      <span className="t-title-3 block truncate text-ivory">{p.name}</span>
                      <span className="t-meta tnum block text-stone">
                        {fmt(p.weightLb)} × {p.reps} · e1RM {Math.round(toDisplayWeight(p.e1rm, unit))}
                      </span>
                    </span>
                    <span className="t-num-m shrink-0 text-leaf-300">{formatGain(p.gain, unit)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <p className="t-title-1 mt-6 text-center text-ivory">{session.name}, sealed.</p>
        )}

        {/* stats */}
        <dl className="mt-8 grid grid-cols-3 divide-x divide-vein-2 text-center">
          <Stat label="Duration" value={minutes == null ? "—" : String(minutes)} unit={minutes == null ? null : "min"} />
          <Stat label="Sets" value={String(setsDone)} unit={planned && planned >= setsDone ? `/${planned}` : null} />
          <Stat label="Moved" value={volumeLb > 0 ? formatInt(toDisplayWeight(volumeLb, unit)) : "—"} unit={volumeLb > 0 ? unit : null} />
        </dl>
        {compare && (
          <p className="t-meta mt-3 flex items-center justify-center gap-2 text-center text-stone">
            {compare}
            <Tag kind="CALC" explain={`Volume is weight × reps over your working sets: ${formatInt(toDisplayWeight(volumeLb, unit))} ${unit} today, ${formatInt(toDisplayWeight(Number(prev.data?.total_volume_lb ?? 0), unit))} ${unit} last ${template?.name ?? session.name}.`} />
          </p>
        )}

        {/* the lifts (the Classification) */}
        <section aria-label="The lifts" className="mt-9">
          <h2 className="t-eyebrow">The lifts</h2>
          {groups.length ? (
            <ul className="mt-2 divide-y divide-vein border-y border-vein">
              {groups.map((g) => {
                const r = results?.find((x) => x.key === g.key) ?? null;
                const t = trackingFor(getExercise(g.slug), g.working[0]?.target_unit);
                return <LiftRow key={g.key} name={g.name} result={r} best={r ? setChip(r.best, t, fmt) : g.working.length ? setChip(g.working[0], t, fmt) : `W ${g.warmups.length}`} first={firsts.some((f) => f.slug === g.slug)} />;
              })}
            </ul>
          ) : (
            <p className="t-callout mt-2 text-stone">No sets were logged in this session.</p>
          )}
          {session.notes && <p className="t-callout mt-4 whitespace-pre-line text-stone">{session.notes}</p>}
        </section>

        {/* refuel (today only) */}
        <RefuelCard date={session.local_date} endedAt={session.ended_at} className="mt-8" />

        {/* next time */}
        {nextLines.length > 0 && (
          <section aria-label="Next time" className="mt-8">
            <h2 className="t-eyebrow flex items-center gap-2">
              Next {template?.name ?? session.name}
              <Tag kind="RULE" explain="From the progression rule: every set at the top of the range adds load; inside the range adds reps; a miss holds the load." />
            </h2>
            <ul className="mt-2 space-y-1.5">
              {nextLines.map((l) => (
                <li key={l.key} className="t-callout flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-ivory">{l.name}</span>
                  <span className="tnum text-stone">{l.line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* the temple */}
        {week && (
          <section aria-label="This week" className="mt-9">
            <Colonnade key={templeLive ? "live" : "before"} days={templeLive ? week : week.map((d) => (d.date === session.local_date ? { ...d, done: false } : d))} height={96} />
            <div className="t-eyebrow mt-3 flex justify-between gap-3">
              <span>
                Week · <span className="!text-leaf-300">{week.filter((d) => d.kind === "train" && d.done).length} of {week.filter((d) => d.kind === "train").length} raised</span>
              </span>
              <span className="truncate text-right">{next ? `Next · ${next.inDays === 1 ? "tomorrow" : dayName(next.date, true)} · ${next.name}` : "Nothing scheduled this week"}</span>
            </div>
          </section>
        )}
      </div>

      {/* Done: the one gold control, live from frame 0 */}
      <div className="fixed inset-x-0 bottom-0 z-(--z-sticky) bg-[linear-gradient(to_top,var(--obsidian)_62%,transparent)] px-5 pt-8" style={{ paddingBottom: "calc(var(--safe-bottom) + 16px)" }}>
        <div className="mx-auto max-w-col">
          <Button variant="primary" size="lg" block onClick={leave}>
            Done
          </Button>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title={session.name} description={gymDate(session.local_date)}>
        <div className="-mx-2 pb-2">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onEdit();
            }}
            className="press-soft flex min-h-14 w-full items-center gap-3.5 rounded-field px-3 text-left hover:bg-white/[.04]"
          >
            <span className="grid size-9 place-items-center rounded-field bg-m3 text-stone">
              <PencilLine className="size-[18px]" strokeWidth={1.6} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-title-3 block text-ivory">Edit sets</span>
              <span className="t-meta block text-stone">Fix a number; totals and records are recounted</span>
            </span>
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function heroTarget(groups: ReturnType<typeof groupSets>, slug: string): string | null {
  const g = groups.find((x) => x.slug === slug);
  const s = g?.working[0];
  if (!s || (s.target_rep_low == null && s.target_rep_high == null)) return null;
  return repRange(s.target_rep_low, s.target_rep_high, s.target_unit);
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string | null }) {
  return (
    <div className="min-w-0 px-2">
      <dd className="t-num-m tnum text-ivory">
        {value}
        {unit && <span className="t-meta ml-0.5 text-stone">{unit}</span>}
      </dd>
      <dt className="t-eyebrow mt-1">{label}</dt>
    </div>
  );
}

const WORD = { record: "record", beat: "beat last", matched: "matched", below: "below last", first: "first benchmark" } as const;

function LiftRow({ name, result, best, first }: { name: string; result: LiftResult | null; best: string; first: boolean }) {
  const timing = result?.timing ?? (first ? "first" : null);
  const tone = timing === "record" || timing === "beat" ? "text-leaf-300" : timing === "below" ? "text-stone" : "text-ivory";
  const word = timing ? WORD[timing] : "logged";
  // "= last" says the same as "matched": the word alone carries it
  const delta = result?.delta && result.delta !== "= last" ? result.delta : null;
  return (
    <li className="flex min-h-14 items-center gap-3 py-2.5">
      <span aria-hidden className="grid size-6 shrink-0 place-items-center">
        <TimingMark timing={timing} logged />
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-title-3 block truncate text-ivory">{name}</span>
        <span className="t-meta tnum block text-stone">best {best}</span>
      </span>
      <span className="shrink-0 text-right">
        {delta && <span className={cn("t-num-s tnum block", tone)}>{delta}</span>}
        <span className={cn("t-tag block", delta ? "mt-0.5 text-ash" : tone)}>{word}</span>
      </span>
    </li>
  );
}

/** Counts from `from` to `to` (ease-out) after `delay`; writes textContent, so React renders once. */
function CountUp({ from, to, play, delay, duration }: { from: number; to: number; play: boolean; delay: number; duration: number }): ReactNode {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!play || from === to) {
      el.textContent = String(to);
      return;
    }
    el.textContent = String(from);
    let raf = 0;
    const start = performance.now() + delay;
    const [x1, y1, x2, y2] = EASE.out;
    const ease = (t: number) => cubic(t, x1, y1, x2, y2);
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      el.textContent = String(Math.round(from + (to - from) * ease(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, play, delay, duration]);
  return <span ref={ref}>{to}</span>;
}

/** A cubic-bezier easing evaluated by bisection (x → y). */
function cubic(x: number, x1: number, y1: number, x2: number, y2: number) {
  const bez = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, x1, x2) < x) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, y1, y2);
}

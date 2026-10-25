"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Ellipsis, Info, MessageCircle, NotebookPen, PencilLine, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailsSheet } from "@/components/ui/details-sheet";
import { ListGroup, Row, SectionHead } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { StatCard, StatRow } from "@/components/ui/stat-card";
import { WinCard } from "@/components/ui/win-card";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { useTemplates } from "@/lib/data/training";
import { getExercise } from "@/lib/training/library";
import { e1rm, suggest, type Mode } from "@/lib/training/progression";
import type { TemplateExercise } from "@/lib/training/types";
import { formatInt, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { asPastSets, gymDate, liftResults } from "@/lib/workout/gym";
import { sessionRecords } from "@/lib/workout/pr";
import { formatClock } from "@/lib/workout/rest";
import { groupSets, hasWeight, isTimed, trackingFor } from "@/lib/workout/session";
import { sessionTotals, volumeDeltaPct } from "@/lib/workout/summary";
import { timeBetweenSets } from "@/lib/workout/timing";
import { usePreviousSession, usePriorBests, usePriorHistory, useSessionOps, type LiveData } from "./data";
import { plannedFor } from "./inscription/flags";
import { NoteSheet } from "./live/sheets";
import { lastTimeText, verdict, winSentence } from "./live/words";

/** The session's best working set of a lift (highest estimate, then weight, then reps), from its own logged sets. */
function bestSet<T extends { weight_lb: number | string | null; reps: number | null; duration_sec: number | null }>(sets: T[]): T | null {
  let best: T | null = null;
  let key = [-Infinity, -Infinity, -Infinity];
  for (const s of sets) {
    const w = Number(s.weight_lb ?? 0);
    const k = [e1rm(w, s.reps) ?? -1, w, Number(s.reps ?? s.duration_sec ?? 0)];
    if (k[0] > key[0] || (k[0] === key[0] && (k[1] > key[1] || (k[1] === key[1] && k[2] > key[2])))) {
      best = s;
      key = k;
    }
  }
  return best;
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1))));

/**
 * Workout done (docs/DESIGN-V3-SIMPLE.md §4.2.11): `/workout/[id]` for a finished workout.
 * "Workout done" and the workout's stored name with its date; the win card for the top new best
 * (or "Beat last time on 3 of 7 lifts"); the trio (time, sets, lifted); one row per lift with its
 * best set, "next time 135 lb" where the double progression adds weight, and a verdict. ⋯ holds
 * Details, Edit sets, Notes and Ask coach. Sticky gold "Done" → Today. Everything is from the
 * logged sets; nothing animates in.
 */
export function Summary({ data, onEdit }: { data: LiveData; onEdit: () => void }) {
  const router = useRouter();
  const today = useToday();
  const { profile } = useProfile();
  const unit: WeightUnit = profile?.weight_unit === "kg" ? "kg" : "lb";
  const toDisplay = (lb: number) => round(toDisplayWeight(lb, unit), 1);
  const { byKey } = useTemplates();
  const { session, sets } = data;
  const template = session.template_key ? byKey[session.template_key] : undefined;
  const ops = useSessionOps(session.id);

  const logged = useMemo(() => sets.filter((s) => s.completed), [sets]);
  const groups = useMemo(() => groupSets(logged), [logged]);
  const slugs = useMemo(() => [...new Set(groups.map((g) => g.slug))], [groups]);
  const bests = usePriorBests(session.id, slugs, session.local_date);
  const history = usePriorHistory(session.id, slugs, session.local_date);
  const prev = usePreviousSession(session);

  const totals = sessionTotals(logged);
  const volumeLb = Number(session.total_volume_lb) || totals.volumeLb;
  const setsDone = session.sets_completed || totals.setsCompleted;
  const [planned] = useState(() => plannedFor(session.id));
  const minutes = session.duration_sec ? Math.max(1, Math.round(session.duration_sec / 60)) : null;
  const plaques = bests.data ? sessionRecords(groups, bests.data) : [];
  const results = history.data && bests.data ? liftResults(groups, history.data, bests.data, plaques, session.mode as Mode, unit) : null;
  const hero = plaques[0] ?? null;
  const beat = results ? results.filter((r) => r.timing === "beat" || r.timing === "record").length : 0;
  const compared = results ? results.filter((r) => r.timing && r.timing !== "first").length : 0;

  /* next time: the progression rule on the updated history; shown only when it adds weight */
  const nextTime = useMemo(() => {
    const out = new Map<string, number>();
    if (!history.data) return out;
    const mine = asPastSets(sets, session.mode as Mode);
    for (const g of groups) {
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
      const s = suggest(tEx, lib, [...(mine[g.slug] ?? []), ...(history.data[g.slug] ?? [])], (profile?.training_mode ?? "standard") as Mode);
      if (s.kind === "increase" && s.weightLb != null) out.set(g.key, s.weightLb);
    }
    return out;
  }, [history.data, sets, session.mode, groups, template, profile?.training_mode]);

  const [menu, setMenu] = useState(false);
  const [details, setDetails] = useState(false);
  const [notes, setNotes] = useState(false);
  const leave = () => {
    if (session.local_date !== today && window.history.length > 1) router.back();
    else router.push("/");
  };

  const heroPrior = hero ? bests.data?.[hero.slug] : undefined;
  const heroW = hero ? trim(toDisplay(hero.weightLb)) : "";
  const heroSentence = hero ? winSentence({ weightLb: hero.weightLb, reps: hero.reps }, heroPrior, `${heroW} ${unit}`, getExercise(hero.slug)?.perHand ? "each hand" : "").replace(" .", ".") : "";

  /* details: total lifted vs last time, and the rest actually taken */
  const pct = volumeDeltaPct(volumeLb, prev.data ? Number(prev.data.total_volume_lb) : null);
  const vsLast = pct == null ? "No earlier workout to compare" : Math.round(pct) === 0 ? "The same as last time" : `${Math.abs(Math.round(pct))}% ${pct > 0 ? "more" : "less"} than last time`;
  const gaps = timeBetweenSets(logged);
  const restRows = groups
    .map((g) => {
      const v = g.working.map((s) => gaps.get(s.id)).filter((x): x is number => x != null);
      return v.length ? { label: g.name, value: `${formatClock(Math.round(v.reduce((a, b) => a + b, 0) / v.length))} rest` } : null;
    })
    .filter((x): x is { label: string; value: string } => !!x);

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-col px-5" style={{ paddingTop: "var(--safe-top)", paddingBottom: "calc(var(--safe-bottom) + 7rem)" }}>
        <div className="flex h-14 items-center justify-end">
          <button type="button" onClick={() => setMenu(true)} aria-label="Workout options" className="press grid size-11 place-items-center rounded-full bg-control text-fg">
            <Ellipsis className="size-6" strokeWidth={2.2} aria-hidden />
          </button>
        </div>

        <h1 className="t-title">Workout done</h1>
        <p className="t-label mt-1" data-history="">
          <span data-budget-name="">{session.name}</span> · {gymDate(session.local_date)}
        </p>

        <div className="mt-5">
          {hero ? (
            <WinCard
              align="start"
              weight={heroW}
              unit={unit}
              reps={hero.reps}
              sentence={heroSentence}
              lift={hero.name}
              caption={plaques.length > 1 ? `${plaques.length} new bests` : undefined}
              ariaLabel={`New best. ${hero.name}, ${heroW} ${unit === "kg" ? "kilograms" : "pounds"} times ${hero.reps}. ${heroSentence}`}
            />
          ) : compared > 0 ? (
            <div className="rounded-card bg-surface p-5">
              <p className="t-row">
                Beat last time on {beat} of {groups.length} {groups.length === 1 ? "lift" : "lifts"}
              </p>
            </div>
          ) : null}
        </div>

        <StatRow cols={3} className="mt-3">
          <StatCard value={minutes == null ? "—" : String(minutes)} unit={minutes == null ? undefined : "min"} label="Time" />
          <StatCard value={String(setsDone)} unit={planned && planned >= setsDone ? `of ${planned}` : undefined} label="Sets" />
          <StatCard value={volumeLb > 0 ? formatInt(toDisplayWeight(volumeLb, unit)) : "—"} unit={volumeLb > 0 ? unit : undefined} label="Lifted" />
        </StatRow>

        <SectionHead>Lifts</SectionHead>
        {groups.length ? (
          <ListGroup ariaLabel="Lifts">
            {groups.map((g) => {
              const r = results?.find((x) => x.key === g.key) ?? null;
              const t = trackingFor(getExercise(g.slug), g.working[0]?.target_unit);
              const top = bestSet(g.working);
              const best = top ? lastTimeText([top], t, toDisplay) : null;
              const nt = nextTime.get(g.key);
              const v = verdict(r);
              return (
                <Row
                  key={g.key}
                  title={g.name}
                  dataName
                  wrap
                  subtitle={[best ? `Best ${best}` : `${g.warmups.length} warm-up ${g.warmups.length === 1 ? "set" : "sets"}`, nt != null ? `next time ${trim(toDisplay(nt))} ${unit}` : null].filter(Boolean).join(" · ")}
                  accessory={
                    v ? (
                      <span className={cn("t-body flex shrink-0 items-center gap-1.5 whitespace-nowrap", v.win ? "font-semibold text-gold" : "text-fg-2")}>
                        {v.win && <Trophy className="size-5" strokeWidth={1.9} aria-hidden />}
                        {v.text}
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </ListGroup>
        ) : (
          <p className="t-body text-fg-2">No sets were logged in this workout.</p>
        )}
        {session.notes && <p className="t-body mt-4 whitespace-pre-line text-fg-2">{session.notes}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-(--z-sticky) bg-bg px-5 pt-3" style={{ paddingBottom: "calc(var(--safe-bottom) + 12px)" }}>
        <div className="mx-auto max-w-col">
          <Button variant="primary" size="lg" block onClick={leave}>
            Done
          </Button>
        </div>
      </div>

      <Sheet open={menu} onOpenChange={setMenu} title={<span data-budget-name="">{session.name}</span>} description={gymDate(session.local_date)}>
        <ListGroup className="mb-2">
          <Row
            icon={Info}
            title="Details"
            onClick={() => {
              setMenu(false);
              setDetails(true);
            }}
          />
          <Row
            icon={PencilLine}
            title="Edit sets"
            onClick={() => {
              setMenu(false);
              onEdit();
            }}
          />
          <Row
            icon={NotebookPen}
            title="Notes"
            onClick={() => {
              setMenu(false);
              setNotes(true);
            }}
          />
          <Link href={`/coach?q=${encodeURIComponent(`How did my ${session.name} workout on ${gymDate(session.local_date)} go?`)}`} className="press-soft flex min-h-14 w-full items-center gap-3.5 px-4">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-icon bg-card-3 text-fg">
              <MessageCircle className="size-5" strokeWidth={1.9} />
            </span>
            <span className="t-row flex-1">Ask coach about this workout</span>
          </Link>
        </ListGroup>
      </Sheet>
      <DetailsSheet
        open={details}
        onOpenChange={setDetails}
        title="Details"
        rows={[{ label: "Total lifted", value: volumeLb > 0 ? `${formatInt(toDisplayWeight(volumeLb, unit))} ${unit}` : "—", detail: vsLast }, ...restRows]}
        how={`Total lifted adds weight × reps over your working sets. Rest is the time between one logged set and the next, averaged per lift.${prev.data ? ` Last time is your ${template?.name ?? session.name} on ${gymDate(prev.data.local_date)}.` : ""}`}
      />
      <NoteSheet
        open={notes}
        onOpenChange={setNotes}
        title="Notes"
        initial={session.notes ?? ""}
        placeholder="Energy, sleep, anything that affected today"
        onSave={(text) => ops.updateSession({ notes: text || null })}
      />
    </div>
  );
}

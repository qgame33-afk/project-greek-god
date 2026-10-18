"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import type { DayState, Phase } from "@/lib/now/day-engine";
import { DuskBody, FuelBody, LiveBody, RefuelBody, RestLine, SealBody, TrainBody } from "./bodies";
import { usePageVisible } from "./clock";
import { DawnBody } from "./Dawn";
import { PhaseRail } from "./PhaseRail";
import type { NowData, NowModel, NowMeal } from "./useNowData";

const PHASE_NAME: Record<Phase, string> = { dawn: "Dawn", fuel: "Fuel", train: "Train", live: "Live", refuel: "Refuel", dusk: "Dusk", seal: "Seal" };

/**
 * The Now card (docs/DESIGN-V2.md §3.1.1 item 4, §3.1.2): the one slab on Now. The phase rail on
 * top, then what to do now, with the viewport's one gold control. A phase change Turns (crossfade
 * and an 8 px rise) only while he is looking.
 */
export function NowCard({
  m,
  data,
  state,
  phase,
  now,
  sealed,
  onSeal,
  onLater,
  rites,
  compact,
  className,
}: {
  compact?: boolean;
  m: NowModel;
  data: NowData;
  state: DayState;
  phase: Phase;
  now: number;
  sealed: boolean;
  onSeal: () => void;
  onLater: () => void;
  rites: { done: number; total: number };
  className?: string;
}) {
  const titleId = useId();
  const visible = usePageVisible();
  const [turn, setTurn] = useState(0);
  const [seen, setSeen] = useState(phase);
  if (seen !== phase) {
    setSeen(phase);
    if (visible) setTurn((t) => t + 1);
  }

  const g = data.readiness.guidance;
  const byId = (id: string | undefined): NowMeal | null => (id ? (m.meals.find((x) => x.id === id) ?? null) : null);
  const nextMeal = state.next.kind === "eat" ? byId(state.next.mealId) : null;
  const rest = !m.template;
  const namesPhase = phase === "live" || phase === "refuel" || phase === "dusk" || phase === "seal" || (phase === "fuel" && !nextMeal);

  let body: React.ReactNode;
  switch (phase) {
    case "dawn":
      body = <DawnBody m={m} guidance={g} titleId={titleId} onLater={onLater} compact={compact} />;
      break;
    case "train": {
      const at = m.trainAt;
      const pre = at != null ? (m.meals.find((x) => !x.eaten && x.at <= at && x.at >= at - 90) ?? null) : null;
      body = <TrainBody m={m} guidance={g} now={now} starting={data.workout.starting} onBegin={() => void data.workout.startToday()} titleId={titleId} pre={pre} />;
      break;
    }
    case "live":
      body = <LiveBody m={m} titleId={titleId} />;
      break;
    case "refuel":
      body = <RefuelBody m={m} meal={nextMeal} titleId={titleId} compact={compact} />;
      break;
    case "dusk":
      body = <DuskBody m={m} meal={nextMeal} now={now} titleId={titleId} ritesLeft={Math.max(0, rites.total - rites.done)} />;
      break;
    case "seal":
      body = <SealBody m={m} titleId={titleId} sealed={sealed} onSeal={onSeal} rites={rites} compact={compact} />;
      break;
    default:
      body = <FuelBody m={m} meal={nextMeal} now={now} titleId={titleId} restLine={rest ? <RestLine m={m} /> : null} compact={compact} />;
  }

  return (
    <section role="region" aria-labelledby={titleId} className={cn("slab relative px-4 pb-4 pt-2", className)} data-phase-card={phase}>
      <PhaseRail state={state} phase={phase} now={now} rest={rest} />
      {/* the rail's labels hide at accessibility sizes: the phase moves into an eyebrow, unless the
          card's own eyebrow already starts with it */}
      {!namesPhase && <p className="t-eyebrow mb-1 hidden text-leaf-300 @max-[19rem]:block">{PHASE_NAME[phase]}</p>}
      <div key={turn} className={cn(turn > 0 && "turn-in")}>
        {body}
      </div>
    </section>
  );
}

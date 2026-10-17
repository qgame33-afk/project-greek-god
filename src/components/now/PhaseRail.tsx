"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Moon, TrainColumn } from "@/components/art/icons";
import { cn } from "@/lib/cn";
import type { DayState, Phase, RailPhase } from "@/lib/now/day-engine";

const A0 = 6 * 60;
const A1 = 23 * 60;
const x = (m: number) => Math.min(1, Math.max(0, (m - A0) / (A1 - A0)));

const ORDER: RailPhase[] = ["dawn", "fuel", "train", "refuel", "dusk", "seal"];
const NAME: Record<RailPhase, string> = { dawn: "Dawn", fuel: "Fuel", train: "Train", refuel: "Refuel", dusk: "Dusk", seal: "Seal" };

/** Approximate label width at t-eyebrow (11 px, +.14em tracking), for collision spacing. */
const labelW = (s: string) => s.length * 8.6 + 6;

/**
 * Lays the labels out at their phases' start times, nudged apart so none overlap: a forward pass
 * pushes right, a backward pass from the right edge pulls back.
 */
export function layoutLabels(items: { at: number; w: number }[], width: number, gap = 6): number[] {
  const lefts = items.map((it) => Math.min(Math.max(0, it.at * width - it.w / 2), Math.max(0, width - it.w)));
  for (let i = 1; i < lefts.length; i++) lefts[i] = Math.max(lefts[i], lefts[i - 1] + items[i - 1].w + gap);
  for (let i = lefts.length - 1; i >= 0; i--) {
    const limit = i === lefts.length - 1 ? width - items[i].w : lefts[i + 1] - items[i].w - gap;
    lefts[i] = Math.max(0, Math.min(lefts[i], limit));
  }
  return lefts;
}

/**
 * The phase rail (docs/DESIGN-V2.md §3.1.3): a 06:00–23:00 axis across the top of the Now card,
 * the day's phases at their start times (current in leaf), the meals as small coins (leaf rim =
 * eaten, hollow ivory = planned), the session as a column, lights out as a moon, and a leaf
 * diamond at now. Not interactive and hidden from VoiceOver: the lists below say the same.
 */
export function PhaseRail({ state, phase, now, rest }: { state: DayState; phase: Phase; now: number; rest: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setWidth(el.clientWidth || 300);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const current: RailPhase = phase === "live" ? "train" : phase;
  // one label per phase, at its first start today ("Rest" replaces Train on a rest day)
  const firsts = ORDER.map((p) => state.rail.find((r) => r.phase === p)).filter((r): r is DayState["rail"][number] => !!r);
  const labels = firsts.map((r) => ({ phase: r.phase, text: NAME[r.phase], at: x(r.startsAt), state: r.phase === current ? "now" : r.state }));
  if (rest && !labels.some((l) => l.phase === "train")) {
    const fuel = state.rail.find((r) => r.phase === "fuel");
    const i = labels.findIndex((l) => l.phase === "dusk");
    const restLabel = { phase: "train" as RailPhase, text: "Rest", at: x(fuel ? Math.max(fuel.startsAt + 150, 13 * 60) : 13 * 60), state: "later" as const };
    labels.splice(i < 0 ? labels.length : i, 0, restLabel);
  }
  const lefts = layoutLabels(
    labels.map((l) => ({ at: l.at, w: labelW(l.text) })),
    width,
  );

  return (
    <div aria-hidden ref={ref} className="relative h-11 select-none">
      {/* the axis, and the part of the day already lived */}
      <div className="absolute inset-x-0 top-[9px] h-px bg-vein-2" />
      <div className="absolute left-0 top-[9px] h-px bg-leaf-500/70" style={{ width: `${x(now) * 100}%` }} />

      {/* phase diamonds at their start times */}
      {firsts.map((r) => {
        const on = r.phase === current;
        const done = !on && r.state === "done";
        return (
          <span
            key={r.phase + r.startsAt}
            className={cn(
              "absolute top-[5px] size-[9px] -translate-x-1/2 rotate-45",
              on ? "hidden" : done ? "bg-leaf-500" : "bg-m2 shadow-[inset_0_0_0_1px_var(--ui-line)]",
            )}
            style={{ left: `${x(r.startsAt) * 100}%` }}
          />
        );
      })}

      {/* meals, the session, lights out */}
      {state.marks.map((mk, i) => {
        const left = `${x(mk.at) * 100}%`;
        if (mk.kind === "meal")
          return (
            <span
              key={`m${i}`}
              className={cn(
                "absolute top-[5.5px] size-2 -translate-x-1/2 rounded-full",
                mk.done ? "bg-m2 shadow-[inset_0_0_0_1.5px_var(--leaf-300)]" : "bg-m2 shadow-[inset_0_0_0_1px_var(--ivory)]",
              )}
              style={{ left }}
            />
          );
        if (mk.kind === "session")
          return (
            <span key={`s${i}`} className={cn("absolute top-[3px] grid size-3 -translate-x-1/2 place-items-center bg-m2", mk.done ? "text-leaf-300" : "text-ivory")} style={{ left }}>
              <TrainColumn className="size-3" strokeWidth={1.8} />
            </span>
          );
        return (
          <span key={`l${i}`} className="absolute top-[3px] grid size-3 -translate-x-1/2 place-items-center bg-m2 text-stone" style={{ left }}>
            <Moon className="size-3" strokeWidth={1.8} />
          </span>
        );
      })}

      {/* now */}
      <span
        className="absolute top-[3.5px] size-3 -translate-x-1/2 rotate-45 bg-leaf-200 shadow-[0_0_0_3px_var(--m2),0_0_10px_rgb(255_220_150/.55)]"
        style={{ left: `${x(now) * 100}%` }}
      />

      {/* labels */}
      <div className="absolute inset-x-0 top-[22px] @max-[19rem]:hidden">
        {labels.map((l, i) => (
          <span
            key={l.text}
            className={cn("t-eyebrow absolute whitespace-nowrap", l.state === "now" ? "text-leaf-300" : l.state === "done" ? "text-stone" : "text-ash")}
            style={{ left: lefts[i] }}
          >
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}

"use client";

import { Ellipsis, Plus } from "lucide-react";
import { Laurel } from "@/components/art/Laurel";
import { LaurelSprig, SealTick } from "@/components/art/icons";
import { cn } from "@/lib/cn";
import type { SetTiming } from "@/lib/workout/timing";

export interface TowerCell {
  key: string;
  kind: "set" | "last" | "add" | "empty";
  setId?: string;
  /** "Set 2", "Warm-up", "Last time". */
  label: string;
  load: string | null;
  work: string | null;
  /** Values that are a suggestion or last time's, not this set's logged or typed numbers. */
  ghost: boolean;
  current: boolean;
  logged: boolean;
  timing: SetTiming;
  /** The Gold-Leaf Record plays on this cell (laurel Inscribes, one Sheen). */
  moment?: boolean;
  spoken: string;
}

/** §3.2.4: every mark is a glyph and a word, never red. */
const WORD: Record<Exclude<SetTiming, null>, string> = { record: "record", beat: "beat last", matched: "matched", below: "below last", first: "first benchmark" };

/** The §3.2.4 glyph for a set timing (the word goes beside it). */
export function TimingMark({ timing, logged }: { timing: SetTiming; logged: boolean }) {
  if (!logged) return null;
  if (timing === "record") return <LaurelSprig aria-hidden className="size-4 text-leaf-300" strokeWidth={1.6} />;
  if (timing === "beat")
    return (
      <span aria-hidden className="grid size-4 place-items-center rounded-full bg-leaf-300 text-ink">
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 6.3 2 2 4-4.4" />
        </svg>
      </span>
    );
  if (timing === "matched") return <span aria-hidden className="t-num-s leading-none text-ivory">=</span>;
  if (timing === "below") return <span aria-hidden className="t-num-s leading-none text-stone">–</span>;
  return <SealTick aria-hidden className="size-4 text-leaf-300" strokeWidth={1.6} />;
}

function wordFor(c: TowerCell): { text: string; tone: string } | null {
  if (c.kind === "last") return c.work ? { text: c.spoken.split(" · ")[1] ?? "last session", tone: "text-ash" } : { text: "first time", tone: "text-ash" };
  if (!c.logged) return c.current ? { text: "this set", tone: "text-leaf-300" } : { text: "up next", tone: "text-ash" };
  if (c.timing) return { text: WORD[c.timing], tone: c.timing === "record" || c.timing === "beat" ? "text-leaf-300" : c.timing === "below" ? "text-stone" : "text-ivory" };
  return { text: "logged", tone: "text-stone" };
}

/**
 * The set tower (§3.2.1): the previous, current and next set of this lift. Each cell shows its
 * set, the load × reps and its timing mark (§3.2.4). The current cell — the one the deck logs —
 * has a leaf-line outline. A tap moves the deck to that set; the current cell's ⋯ opens its
 * options (note, warm-up, unlog, remove). On set 1 the first cell is last time's set 1; on the
 * last set the third cell adds a set. `list` is the AX layout.
 */
export function SetTower({ cells, list, onSelect, onOptions, onAdd }: { cells: TowerCell[]; list: boolean; onSelect: (setId: string) => void; onOptions: (setId: string) => void; onAdd: () => void }) {
  return (
    <section aria-label="Sets" className={cn("grid gap-2", list ? "grid-cols-1" : "grid-cols-3")}>
      {cells.map((c) => {
        if (c.kind === "add")
          return (
            <button
              key={c.key}
              type="button"
              onClick={onAdd}
              className={cn(
                "press-soft flex items-center justify-center gap-2 rounded-btn text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] [border-style:dashed] hover:text-ivory",
                list ? "h-14" : "min-h-[76px] flex-col",
              )}
            >
              <Plus className="size-5" strokeWidth={1.6} aria-hidden />
              <span className="t-tag">Add set</span>
            </button>
          );
        if (c.kind === "empty") return <div key={c.key} aria-hidden className={cn("rounded-btn shadow-[inset_0_0_0_1px_var(--vein)]", list ? "hidden" : "min-h-[76px]")} />;
        const word = wordFor(c);
        const record = c.logged && c.timing === "record";
        const body = (
          <>
            {c.moment && (
              <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden rounded-btn">
                <Laurel size={list ? 56 : 88} inscribe delay={120} leaves={9} className="opacity-60" />
                <span className="wk-sheen absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(100deg,transparent_10%,var(--leaf-tint)_35%,var(--leaf-line)_50%,transparent_90%)]" />
              </span>
            )}
            <span className="relative flex items-center justify-between gap-2">
              <span className={cn("t-eyebrow truncate", c.current && "!text-ivory")}>{c.label}</span>
              {list ? (
                word && (
                  <span className={cn("flex shrink-0 items-center gap-1.5", c.current && "mr-10")}>
                    <TimingMark timing={c.timing} logged={c.logged} />
                    <span className={cn("t-tag", word.tone)}>{word.text}</span>
                  </span>
                )
              ) : (
                <TimingMark timing={c.timing} logged={c.logged} />
              )}
            </span>
            <span className={cn("relative block truncate", list ? "mt-1" : "mt-1", c.ghost && !c.current ? "text-stone" : "text-ivory")}>
              {c.load != null || c.work != null ? (
                <>
                  {c.load != null && <span className={cn(c.load.length > 3 && !list ? "t-num-m" : "t-num-l")}>{c.load}</span>}
                  {c.work != null && (
                    <span className={cn(c.load != null && c.load.length > 3 && !list ? "t-num-s" : "t-num-m")}>
                      {c.load != null && <span className="text-ash">×</span>}
                      <span className={c.ghost && !c.current ? "text-stone" : "text-ivory"}>{c.work}</span>
                    </span>
                  )}
                </>
              ) : (
                <span className="t-num-l text-ash">—</span>
              )}
            </span>
            {word && !list && (
              <span className="relative mt-1 flex items-center gap-1.5">
                <span className={cn("t-tag truncate", word.tone)}>{word.text}</span>
              </span>
            )}
          </>
        );
        const cls = cn(
          "relative overflow-hidden rounded-btn text-left transition-[box-shadow,background-color] duration-(--dur-base)",
          list ? "flex min-h-16 flex-col justify-center px-4 py-2.5" : "flex min-h-[76px] flex-col px-3 py-2",
          record ? "bg-leaf-tint shadow-[inset_0_0_0_1px_var(--leaf-line)]" : c.current ? "bg-m2 shadow-[inset_0_0_0_1.5px_var(--leaf-line)]" : "bg-m1 shadow-[inset_0_0_0_1px_var(--vein-2)]",
        );
        if (c.kind === "last" || !c.setId)
          return (
            <div key={c.key} className={cls} aria-label={c.spoken} role="group">
              {body}
            </div>
          );
        return (
          <div key={c.key} className="relative scroll-mb-[calc(var(--gym-deck-h,168px)+12px)] scroll-mt-[calc(var(--gym-head-h,96px)+12px)]" data-set={c.setId}>
            <button type="button" onClick={() => onSelect(c.setId!)} aria-label={c.spoken} aria-current={c.current ? "step" : undefined} className={cn(cls, "press-soft w-full")}>
              {body}
            </button>
            {c.current && (
              <button
                type="button"
                onClick={() => onOptions(c.setId!)}
                aria-label={`${c.label} options`}
                className={cn("press absolute grid size-11 place-items-center rounded-full text-stone hover:text-ivory", list ? "right-1 top-1" : "-bottom-1 -right-1")}
              >
                <Ellipsis className="size-[18px]" strokeWidth={1.6} />
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

"use client";

import { useId, useState, type ReactNode, type Ref } from "react";
import { ArrowLeftRight, ChevronDown, Ellipsis, Info, StickyNote } from "lucide-react";
import { SealTick } from "@/components/art/icons";
import { Collapse } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";

export interface Carrot {
  reps: number;
  e1rm: string;
  best: string;
}

/**
 * The lift header (§3.2.1): `LIFT 1 OF 6 · CHEST · TRICEPS`, the lift in the Voice with ⇄ swap,
 * ⓘ how-to and ⋯ options (44 px each), the target line from the progression rule (RULE), the
 * warm-up as one collapsed line, and the record carrot (§3.2.5) or FIRST BENCHMARK. Tapping the
 * target line opens the rule's reason, last time's sets (tap one to copy it) and the targets.
 */
export function LiftHeader({
  index,
  count,
  muscles,
  modeWord,
  name,
  target,
  targetLoading,
  reason,
  chips,
  lastLabel,
  lastChips,
  onLastChip,
  templateNote,
  note,
  onNote,
  warmup,
  carrot,
  firstBenchmark,
  onSwap,
  onHowTo,
  onMenu,
  titleRef,
}: {
  /** The lift's title, watched so the top bar can name the lift once it scrolls away. */
  titleRef?: Ref<HTMLHeadingElement>;
  index: number;
  count: number;
  muscles: string[];
  modeWord: string | null;
  name: string;
  target: string | null;
  targetLoading: boolean;
  reason: string | null;
  chips: string[];
  lastLabel: string | null;
  lastChips: { key: string; text: string }[];
  onLastChip: (i: number) => void;
  templateNote: string | null;
  note: string | null;
  onNote: () => void;
  warmup: { steps: { label: string; detail: string }[]; done: boolean } | null;
  carrot: Carrot | null;
  firstBenchmark: boolean;
  onSwap: (() => void) | null;
  onHowTo: (() => void) | null;
  onMenu: () => void;
}) {
  const detailsId = useId();
  const warmId = useId();
  const [open, setOpen] = useState(false);
  const [warmOpen, setWarmOpen] = useState(false);
  const eyebrow = [`Lift ${index} of ${count}`, ...(modeWord ? [modeWord] : []), ...muscles.slice(0, 2)].join(" · ");
  return (
    <section aria-label={name} className="pt-1">
      <div className="-mr-1.5 flex items-center gap-1">
        <p className="t-eyebrow line-clamp-2 min-w-0 flex-1">{eyebrow}</p>
        {onSwap && (
          <IconButton label={`Swap ${name}`} onClick={onSwap}>
            <ArrowLeftRight className="size-[19px]" strokeWidth={1.6} />
          </IconButton>
        )}
        {onHowTo && (
          <IconButton label={`How to do ${name}`} onClick={onHowTo}>
            <Info className="size-[20px]" strokeWidth={1.6} />
          </IconButton>
        )}
        <IconButton label={`${name} options`} onClick={onMenu}>
          <Ellipsis className="size-5" strokeWidth={1.6} />
        </IconButton>
      </div>
      <h2 ref={titleRef} className="t-title-1 -mt-0.5 text-ivory [overflow-wrap:anywhere]">
        {name}
      </h2>

      {targetLoading ? (
        <div className="skeleton mt-2 h-6 w-3/4 rounded-tag" aria-hidden />
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="press-soft -mx-1 mt-1 flex min-h-11 w-[calc(100%+8px)] items-center gap-2 rounded-field px-1 text-left"
        >
          <span className="t-callout tnum min-w-0 flex-1 text-stone">
            {target ? <TargetText text={target} /> : <span>Targets</span>}
          </span>
          {target && <Tag kind="RULE" className="pointer-events-none" />}
          <ChevronDown aria-hidden strokeWidth={1.6} className={cn("size-4 shrink-0 text-ash transition-transform duration-(--dur-base)", open && "rotate-180")} />
        </button>
      )}

      <Collapse open={open} id={detailsId}>
        <div className="space-y-3 pb-1 pt-1">
          {reason && <p className="t-callout text-stone">{reason}</p>}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c} className="t-meta tnum inline-flex h-7 items-center rounded-full px-2.5 text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]">
                  {c}
                </span>
              ))}
            </div>
          )}
          {lastChips.length > 0 && (
            <div>
              <p className="t-eyebrow mb-1.5">{lastLabel} · tap to copy</p>
              <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
                {lastChips.map((c, i) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onLastChip(i)}
                    aria-label={`Copy last time's set ${i + 1}, ${c.text}, into set ${i + 1}`}
                    className="press t-num-s inline-flex h-11 shrink-0 items-center rounded-full bg-m2 px-3.5 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory"
                  >
                    {c.text}
                  </button>
                ))}
              </div>
            </div>
          )}
          {templateNote && <p className="t-meta text-stone">{templateNote}</p>}
          {warmup?.done && (
            <div>
              <p className="t-eyebrow mb-1.5 flex items-center gap-1.5">
                <SealTick aria-hidden className="size-3.5 text-leaf-300" strokeWidth={1.8} /> Warm-up done
              </p>
              <WarmSteps steps={warmup.steps} />
            </div>
          )}
        </div>
      </Collapse>

      {note && (
        <button type="button" onClick={onNote} className="press-soft mt-1 flex min-h-11 w-full items-center gap-2 text-left">
          <StickyNote aria-hidden className="size-4 shrink-0 text-ash" strokeWidth={1.6} />
          <span className="t-meta line-clamp-2 min-w-0 text-stone">{note}</span>
        </button>
      )}

      {warmup && !warmup.done && (
        <div className="mt-0.5">
          <button
            type="button"
            onClick={() => setWarmOpen((o) => !o)}
            aria-expanded={warmOpen}
            aria-controls={warmId}
            className="press-soft -mx-1 flex min-h-11 w-[calc(100%+8px)] items-center gap-2 rounded-field px-1 text-left"
          >
            <span aria-hidden className="grid size-[18px] shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--ui-line)]" />
            <span className="t-meta min-w-0 flex-1 truncate text-stone">
              <span className="font-semibold text-ivory">Warm-up</span> · {warmup.steps.map((w) => w.label).join(" · ")}
            </span>
            <ChevronDown aria-hidden strokeWidth={1.6} className={cn("size-4 shrink-0 text-ash transition-transform duration-(--dur-base)", warmOpen && "rotate-180")} />
          </button>
          <Collapse open={warmOpen} id={warmId}>
            <div className="pb-2 pl-7 pt-1">
              <WarmSteps steps={warmup.steps} />
            </div>
          </Collapse>
        </div>
      )}

      {firstBenchmark ? (
        <p className="mt-1.5 flex min-h-6 items-center gap-2">
          <span className="t-tag inline-flex h-5 items-center rounded-tag px-1.5 text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]">First benchmark</span>
          <span className="t-meta text-stone">Today sets the number to beat.</span>
        </p>
      ) : carrot ? (
        <p className="mt-1.5 flex min-h-6 items-center gap-2">
          <span aria-hidden className="size-2 shrink-0 rotate-45 shadow-[inset_0_0_0_1.5px_var(--leaf-line)]" />
          <span className="t-meta tnum min-w-0 text-stone">
            <span className="font-semibold text-ivory">
              {carrot.reps} {carrot.reps === 1 ? "rep" : "reps"}
            </span>{" "}
            sets a record · e1RM {carrot.e1rm}, best {carrot.best}
          </span>
          <Tag kind="CALC" explain={`Estimated 1-rep max = load × (1 + reps ÷ 30). ${carrot.reps} reps at this load makes ${carrot.e1rm}; your best is ${carrot.best}. A record needs at least 1 lb more.`} />
        </p>
      ) : null}
    </section>
  );
}

/** "190 × 5–8 · up 5 from 185 × 6": the prescription in ivory, the reason in stone. */
function TargetText({ text }: { text: string }) {
  const i = text.indexOf(" · ");
  if (i < 0) return <span className="font-semibold text-ivory">{text}</span>;
  return (
    <>
      <span className="font-semibold text-ivory">{text.slice(0, i)}</span>
      {text.slice(i)}
    </>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="press grid size-11 place-items-center rounded-full text-stone hover:bg-m2 hover:text-ivory">
      {children}
    </button>
  );
}

function WarmSteps({ steps }: { steps: { label: string; detail: string }[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((w, i) => (
        <li key={i} className="t-meta text-stone">
          <span className="font-semibold text-ivory">{w.label}.</span> {w.detail}
        </li>
      ))}
      <li className="t-meta text-ash">Sharp or joint pain is a stop sign. Swap or skip the lift — never train through it.</li>
    </ol>
  );
}

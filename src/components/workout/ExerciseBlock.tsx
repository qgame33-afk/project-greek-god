"use client";

import type { ReactNode } from "react";
import { BookOpen, Check, ChevronDown, Ellipsis, Plus, SkipForward, StickyNote } from "lucide-react";
import { LaurelBullet } from "@/components/art/Motifs";
import { SuggestedBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { Suggestion } from "@/lib/training/progression";
import type { LibraryExercise } from "@/lib/training/types";
import { type WeightUnit } from "@/lib/units";
import { musclesLine, suggestionHeadline, suggestionReason } from "@/lib/workout/copy";
import type { ExerciseGroup } from "@/lib/workout/session";
import type { Tracking, WSet } from "@/lib/workout/types";
import { SetGrid, type GridPad, type RowView } from "./SetGrid";

export interface OpenExerciseProps {
  group: ExerciseGroup;
  lib: LibraryExercise | undefined;
  tracking: Tracking;
  unit: WeightUnit;
  chips: string[];
  note: string | null;
  templateNote: string | null;
  suggestion: Suggestion | null;
  suggestionLoading: boolean;
  lastLabel: string | null;
  lastChips: { key: string; text: string }[];
  firstBenchmark: boolean;
  rows: RowView[];
  showPrev: boolean;
  inline: boolean;
  pad: GridPad | null;
  padOpen: boolean;
  fmt: (lb: number) => string;
  onMenu: () => void;
  onHowTo: () => void;
  onNote: () => void;
  onLastChip: (index: number) => void;
  onAddSet: () => void;
  onCell: (set: WSet, field: "weight" | "work" | "rir") => void;
  onCheck: (set: WSet) => void;
  onSetMenu: (set: WSet) => void;
  onPrev: (set: WSet) => void;
  onCommit: (set: WSet, field: "weight" | "work" | "rir", raw: string) => boolean;
  onEnter: (set: WSet, field: "weight" | "work" | "rir") => void;
}

export function OpenExercise(p: OpenExerciseProps) {
  const { group: g, lib } = p;
  const muscles = lib ? musclesLine(lib.primary, lib.secondary) : null;
  const headline = p.suggestion ? suggestionHeadline(p.suggestion, p.fmt, p.unit, p.tracking === "bodyweight_reps") : null;
  return (
    <section
      data-group={g.key}
      aria-label={g.name}
      className="wk-fade card-instrument relative px-3 pb-3 pt-3.5 sm:px-4"
      style={{ scrollMarginTop: "calc(var(--safe-top) + 72px)" }}
    >
      <header className="flex items-start gap-1">
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-[18px] font-bold leading-snug tracking-[-0.01em] text-fg">{g.name}</h2>
          {muscles && (
            <p className="mt-0.5 text-[13px] font-medium text-fg-2">
              {muscles}
            </p>
          )}
        </div>
        {lib && (
          <button type="button" onClick={p.onHowTo} aria-label={`How to do ${g.name}`} className="-mt-1 grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-2 hover:bg-white/[.04] hover:text-fg">
            <BookOpen className="size-[19px]" />
          </button>
        )}
        <button type="button" onClick={p.onMenu} aria-label={`${g.name} options`} className="-mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-2 hover:bg-white/[.04] hover:text-fg">
          <Ellipsis className="size-5" />
        </button>
      </header>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {p.chips.map((c) => (
          <span key={c} className="num inline-flex h-7 items-center rounded-full border border-line bg-s2 px-2.5 text-[14px] font-semibold tracking-[0.02em] text-fg-2">
            {c}
          </span>
        ))}
        {p.firstBenchmark && (
          <span className="inline-flex h-7 items-center rounded-full border border-marble/45 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-marble">First benchmark</span>
        )}
      </div>

      {p.templateNote && <p className="mt-2.5 text-[12.5px] leading-relaxed text-fg-3">{p.templateNote}</p>}

      {p.suggestion ? (
        <div className="mt-3 rounded-[12px] border border-lapis-line bg-lapis-tint px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <SuggestedBadge />
            {headline && <span className="num text-[17px] font-semibold tracking-[0.01em] text-lapis-text">{headline}</span>}
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{suggestionReason(p.suggestion, p.tracking, p.unit)}</p>
        </div>
      ) : p.suggestionLoading ? (
        <div className="skeleton mt-3 h-[66px] rounded-[12px]" aria-hidden />
      ) : null}

      {p.lastChips.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="eyebrow shrink-0">{p.lastLabel}</span>
          <div className="no-scrollbar -my-1 flex min-w-0 gap-1.5 overflow-x-auto py-1">
            {p.lastChips.map((c, i) => (
              <button
                key={c.key}
                type="button"
                onClick={() => p.onLastChip(i)}
                aria-label={`Copy last time's set ${i + 1}, ${c.text}, into set ${i + 1}`}
                className="press num relative inline-flex h-9 shrink-0 items-center rounded-full border border-line bg-s3 px-3 text-[15px] font-medium text-fg-2 before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] hover:text-fg"
              >
                {c.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {p.note && (
        <button type="button" onClick={p.onNote} className="mt-2.5 flex min-h-10 w-full items-start gap-2 rounded-[10px] bg-s2 px-3 py-2 text-left text-[13px] leading-relaxed text-fg-2 hover:text-fg">
          <StickyNote className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden />
          <span className="min-w-0">{p.note}</span>
        </button>
      )}

      <SetGrid
        rows={p.rows}
        tracking={p.tracking}
        unit={p.unit}
        perHand={!!lib?.perHand}
        perSide={!!lib?.perSide || p.rows[0]?.set.target_unit === "each"}
        showPrev={p.showPrev}
        inline={p.inline}
        pad={p.pad}
        padOpen={p.padOpen}
        onCell={p.onCell}
        onCheck={p.onCheck}
        onMenu={p.onSetMenu}
        onPrev={p.onPrev}
        onCommit={p.onCommit}
        onEnter={p.onEnter}
      />

      <button
        type="button"
        onClick={p.onAddSet}
        className="press-soft mt-2 flex h-[52px] w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-line-strong text-[14px] font-bold text-fg-2 hover:border-line-gold hover:text-fg"
      >
        <Plus className="size-4" aria-hidden /> Add set
      </button>
    </section>
  );
}

/* ------------------------------------------------------------ collapsed */

export function CollapsedExercise({
  group,
  state,
  index,
  detail,
  pr,
  onOpen,
  onResume,
}: {
  group: ExerciseGroup;
  state: "done" | "skipped" | "pending";
  index: number;
  detail: ReactNode;
  pr: boolean;
  onOpen: () => void;
  onResume: () => void;
}) {
  if (state === "skipped") {
    return (
      <div data-group={group.key} className="card-instrument flex min-h-[56px] items-center gap-3 py-1.5 pl-3 pr-1.5" style={{ scrollMarginTop: "calc(var(--safe-top) + 72px)" }}>
        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-fg-3">
          <SkipForward className="size-3.5" aria-hidden />
        </span>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[15px] font-semibold text-fg-3 line-through decoration-fg-3/50">{group.name}</span>
          <span className="block text-[12.5px] font-medium text-fg-3">Skipped{group.done ? ` · ${group.done} logged` : ""}</span>
        </button>
        <button type="button" onClick={onResume} className="press h-11 shrink-0 rounded-[12px] px-3.5 text-[14px] font-bold text-gold-300 hover:bg-gold-tint">
          Resume
        </button>
      </div>
    );
  }
  const done = state === "done";
  return (
    <button
      type="button"
      data-group={group.key}
      onClick={onOpen}
      aria-label={`${group.name}${done ? ", done" : ""}. Open`}
      className={cn("card-instrument press-soft flex w-full items-center gap-3 pl-3 pr-3 text-left hover:border-line-strong", done ? "min-h-[64px] py-2.5" : "min-h-[56px] py-2")}
      style={{ scrollMarginTop: "calc(var(--safe-top) + 72px)" }}
    >
      {done ? (
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", pr ? "bg-[image:var(--grad-leaf)] text-ink" : "bg-success text-ink")}>
          <Check className="size-4" strokeWidth={3} aria-hidden />
        </span>
      ) : (
        <span className="num grid size-7 shrink-0 place-items-center rounded-full border border-line text-[14px] font-semibold text-fg-3">{index}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("flex items-center gap-1.5 truncate text-[15px] font-semibold", done ? "text-fg" : "text-fg-2")}>
          <span className="truncate">{group.name}</span>
          {pr && <LaurelBullet size={14} className="shrink-0" />}
        </span>
        <span className="num block truncate text-[14px] font-medium text-fg-3">{detail}</span>
      </span>
      <ChevronDown className="size-4 shrink-0 text-fg-3" aria-hidden />
    </button>
  );
}

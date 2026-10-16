"use client";

// The set grid — the core Instrument. 60px rows, 52px cells, ghost values in dotted text-3
// that only become data when ✓ is tapped. Cells are buttons that drive the NumberPad on
// touch screens, or real inputs on desktop / when the system keyboard is preferred.

import { memo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, NotebookPen } from "lucide-react";
import { PRBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatLoad, type WeightUnit } from "@/lib/units";
import { cellText, hasRir, hasWeight, isTimed, type Ghost } from "@/lib/workout/session";
import type { CellField, Tracking, WSet } from "@/lib/workout/types";

export interface RowView {
  set: WSet;
  label: string;
  ghost: Ghost;
  prev: string | null;
  upNext: boolean;
  pr: boolean;
  sheen: boolean;
  pulse: boolean;
  flash: boolean;
  error: string | null;
  showNote: boolean;
}

export interface GridPad {
  setId: string;
  field: CellField;
  text: string;
}

interface SetGridProps {
  rows: RowView[];
  tracking: Tracking;
  unit: WeightUnit;
  perHand: boolean;
  perSide: boolean;
  showPrev: boolean;
  inline: boolean;
  pad: GridPad | null;
  padOpen: boolean;
  onCell: (set: WSet, field: CellField) => void;
  onCheck: (set: WSet) => void;
  onMenu: (set: WSet) => void;
  onPrev: (set: WSet) => void;
  onCommit: (set: WSet, field: CellField, raw: string) => boolean;
  onEnter: (set: WSet, field: CellField) => void;
}

export function gridColumns(t: Tracking, showPrev: boolean) {
  return ["32px", showPrev && "76px", hasWeight(t) && "minmax(0,1fr)", "minmax(0,1fr)", hasRir(t) && "52px", "52px"].filter(Boolean).join(" ");
}

export function SetGrid(p: SetGridProps) {
  const cols = gridColumns(p.tracking, p.showPrev);
  const weightHead = p.tracking === "bodyweight_reps" ? `+${p.unit}` : p.perHand ? `${p.unit} / hand` : p.unit;
  const workHead = isTimed(p.tracking) ? "Sec" : p.perSide ? "Reps / side" : "Reps";
  return (
    <div className="mt-3">
      <div aria-hidden className="grid h-6 items-end gap-[6px] pb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-fg-3" style={{ gridTemplateColumns: cols }}>
        <span className="text-center">
          Set
        </span>
        {p.showPrev && <span>Previous</span>}
        {hasWeight(p.tracking) && (
          <span className="truncate text-center">
            {weightHead}
          </span>
        )}
        <span className="truncate text-center">
          {workHead}
        </span>
        {hasRir(p.tracking) && (
          <span className="text-center">
            RIR
          </span>
        )}
        <span className="sr-only">
          Done
        </span>
      </div>
      <div className="flex flex-col gap-[6px]">
        {p.rows.map((r) => (
          <SetRowView
            key={r.set.id}
            row={r}
            cols={cols}
            tracking={p.tracking}
            unit={p.unit}
            showPrev={p.showPrev}
            inline={p.inline}
            padField={p.pad?.setId === r.set.id ? p.pad.field : null}
            padText={p.pad?.setId === r.set.id ? p.pad.text : null}
            padOpen={p.padOpen}
            onCell={p.onCell}
            onCheck={p.onCheck}
            onMenu={p.onMenu}
            onPrev={p.onPrev}
            onCommit={p.onCommit}
            onEnter={p.onEnter}
          />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  row: RowView;
  cols: string;
  tracking: Tracking;
  unit: WeightUnit;
  showPrev: boolean;
  inline: boolean;
  padField: CellField | null;
  padText: string | null;
  padOpen: boolean;
  onCell: SetGridProps["onCell"];
  onCheck: SetGridProps["onCheck"];
  onMenu: SetGridProps["onMenu"];
  onPrev: SetGridProps["onPrev"];
  onCommit: SetGridProps["onCommit"];
  onEnter: SetGridProps["onEnter"];
}

const FIELD_WORD: Record<CellField, string> = { weight: "weight", work: "reps", rir: "reps in reserve" };

const SetRowView = memo(function SetRowView(p: RowProps) {
  const { set, label, ghost, upNext, pr, sheen, pulse, flash, error } = p.row;
  const logged = set.completed;
  const warm = set.kind === "warmup";
  const name = warm ? "Warm-up set" : `Set ${label}`;
  const fields: CellField[] = [...(hasWeight(p.tracking) ? (["weight"] as const) : []), "work", ...(hasRir(p.tracking) ? (["rir"] as const) : [])];

  const ghostText = (f: CellField): string | null => {
    if (f === "weight") return ghost.weight == null ? null : formatLoad(ghost.weight, p.unit, false);
    if (f === "work") return ghost.work == null ? null : String(ghost.work);
    return null;
  };

  const style: CSSProperties = { gridTemplateColumns: p.cols, scrollMarginTop: "calc(var(--safe-top) + 84px)", scrollMarginBottom: p.padOpen ? 400 : 128 };

  return (
    <div data-set={set.id}>
      <div
        role="group"
        aria-label={`${name}${logged ? ", logged" : upNext ? ", up next" : ""}`}
        className={cn(
          "relative -mx-1.5 grid h-[60px] items-center gap-[6px] rounded-[12px] px-1.5 transition-colors duration-200",
          logged ? "bg-success-tint" : upNext ? "bg-gold-400/[.06] shadow-[inset_0_0_0_1px_var(--line-gold)]" : "",
        )}
        style={style}
      >
        {sheen && (
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[12px]">
            <span className="wk-sheen absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(100deg,transparent_10%,rgb(243_221_168/.35)_50%,transparent_90%)]" />
          </span>
        )}
        {pulse && <span aria-hidden className="wk-blink pointer-events-none absolute inset-0 rounded-[12px] shadow-[inset_0_0_0_2px_var(--gold-400)]" />}
        {flash && <span aria-hidden className="wk-flash pointer-events-none absolute inset-0 rounded-[12px] bg-gold-400/20" />}

        <button
          type="button"
          onClick={() => p.onMenu(set)}
          aria-label={`${name} options`}
          className="relative flex h-[52px] flex-col items-center justify-center gap-1 rounded-[10px] before:absolute before:-inset-x-[6px] before:inset-y-0 before:content-[''] hover:bg-white/[.03]"
        >
          <span className={cn("num text-[16px] font-semibold leading-none", warm ? "text-gold-600" : upNext ? "text-gold-300" : logged ? "text-fg" : "text-fg-2")}>{label}</span>
          {pr && <PRBadge className="wk-pop h-4 px-1 text-[9px]" />}
        </button>

        {p.showPrev && (
          <button
            type="button"
            onClick={() => p.row.prev && p.onPrev(set)}
            disabled={!p.row.prev || logged}
            aria-label={p.row.prev ? `Copy previous ${p.row.prev} into ${name}` : "No previous set"}
            className="num h-[52px] truncate rounded-[10px] px-1 text-left text-[15px] font-medium text-fg-3 enabled:hover:text-fg-2 disabled:cursor-default"
          >
            {p.row.prev ?? "—"}
          </button>
        )}

        {fields.map((f) =>
          p.inline ? (
            <InlineCell
              key={f}
              set={set}
              field={f}
              tracking={p.tracking}
              unit={p.unit}
              ghost={ghostText(f)}
              label={`${name} ${FIELD_WORD[f]}`}
              invalid={!!error}
              onCommit={p.onCommit}
              onEnter={p.onEnter}
            />
          ) : (
            <PadCell
              key={f}
              set={set}
              field={f}
              tracking={p.tracking}
              unit={p.unit}
              ghost={ghostText(f)}
              ghostSource={f === "weight" ? ghost.weightSource : f === "work" ? ghost.workSource : null}
              name={name}
              target={p.padField === f}
              draft={p.padField === f ? p.padText : null}
              invalid={!!error && p.padField === f}
              onCell={p.onCell}
            />
          ),
        )}

        <button
          type="button"
          onClick={() => p.onCheck(set)}
          aria-pressed={logged}
          aria-label={logged ? `${name} logged. Tap to unlog` : `Log ${name.toLowerCase()}`}
          className={cn(
            "press grid size-[52px] place-items-center rounded-[12px] transition-colors duration-150",
            logged
              ? pr
                ? "wk-check bg-[image:var(--grad-leaf)] text-ink"
                : "wk-check bg-success text-ink"
              : "border border-line-strong bg-s3 text-fg-3 hover:text-fg-2",
          )}
        >
          <Check className="size-[22px]" strokeWidth={logged ? 3 : 2.25} />
        </button>
      </div>
      {error && (
        <p className="px-1 pt-1 text-[12.5px] font-semibold text-danger" role="alert">
          {error}
        </p>
      )}
      {p.row.showNote && set.notes && (
        <button type="button" onClick={() => p.onMenu(set)} className="flex min-h-9 w-full items-center gap-2 px-1 text-left text-[12.5px] font-medium text-fg-2 hover:text-fg">
          <NotebookPen className="size-3.5 shrink-0 text-fg-3" aria-hidden />
          <span className="truncate">{set.notes}</span>
        </button>
      )}
    </div>
  );
});

/* -------------------------------------------------------------- cells */

const UNIT_WORD = (f: CellField, t: Tracking, unit: WeightUnit) => (f === "weight" ? (unit === "kg" ? "kilograms" : "pounds") : f === "rir" ? "" : isTimed(t) ? "seconds" : "reps");
const SOURCE_WORD: Record<string, string> = { suggested: "suggested", last: "from last session", session: "from your last set", ramp: "warm-up ramp", target: "target" };

function PadCell({
  set,
  field,
  tracking,
  unit,
  ghost,
  ghostSource,
  name,
  target,
  draft,
  invalid,
  onCell,
}: {
  set: WSet;
  field: CellField;
  tracking: Tracking;
  unit: WeightUnit;
  ghost: string | null;
  ghostSource: string | null;
  name: string;
  target: boolean;
  draft: string | null;
  invalid: boolean;
  onCell: SetGridProps["onCell"];
}) {
  const stored = cellText(set, field, tracking, unit);
  const value = draft != null ? draft : stored;
  const ghostShown = value === "" && ghost != null;
  const text = value !== "" ? value : (ghost ?? "—");
  const state = value !== "" ? (set.completed ? "logged" : "entered") : ghost ? (SOURCE_WORD[ghostSource ?? ""] ?? "suggested") : "empty";
  return (
    <button
      type="button"
      data-cell={`${set.id}:${field}`}
      onClick={() => onCell(set, field)}
      aria-label={`${name} ${FIELD_WORD[field]}, ${value || ghost || "empty"} ${value || ghost ? UNIT_WORD(field, tracking, unit) : ""}, ${state}`.replace(/\s+,/g, ",")}
      className={cn(
        "relative flex h-[52px] min-w-0 items-center justify-center rounded-[10px] bg-s3 px-1 transition-shadow duration-100",
        target && "shadow-[inset_0_0_0_2px_var(--gold-400)]",
        invalid && "shadow-[inset_0_0_0_2px_var(--danger)]",
      )}
    >
      <span
        className={cn(
          "num-sm whitespace-nowrap pb-[3px] leading-[1.15]",
          value !== "" ? "text-fg" : ghostShown ? "wk-ghost text-fg-3" : "text-fg-dis",
          field === "rir" && "text-[19px]",
        )}
      >
        {text}
      </span>
    </button>
  );
}

function InlineCell({
  set,
  field,
  tracking,
  unit,
  ghost,
  label,
  invalid,
  onCommit,
  onEnter,
}: {
  set: WSet;
  field: CellField;
  tracking: Tracking;
  unit: WeightUnit;
  ghost: string | null;
  label: string;
  invalid: boolean;
  onCommit: SetGridProps["onCommit"];
  onEnter: SetGridProps["onEnter"];
}) {
  const stored = cellText(set, field, tracking, unit);
  const [text, setText] = useState(stored);
  const [focused, setFocused] = useState(false);
  const [prevStored, setPrevStored] = useState(stored);
  if (stored !== prevStored && !focused) {
    setPrevStored(stored);
    setText(stored);
  }

  const commit = () => {
    if (text === stored) return true;
    return onCommit(set, field, text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (commit()) onEnter(set, field);
    } else if (e.key === "Escape") {
      setText(stored);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="relative h-[52px] min-w-0">
      {text === "" && (
        <span aria-hidden className={cn("num-sm pointer-events-none absolute inset-0 grid place-items-center", ghost ? "wk-ghost text-fg-3" : "text-fg-dis", field === "rir" && "text-[19px]")}>
          {ghost ?? "—"}
        </span>
      )}
      <input
        data-cell={`${set.id}:${field}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit(); // an invalid entry stays in the field with its error, never silently lost
        }}
        onKeyDown={onKeyDown}
        inputMode={field === "weight" ? "decimal" : "numeric"}
        enterKeyHint="next"
        autoComplete="off"
        aria-label={`${label}${ghost && text === "" ? `, suggested ${ghost}` : ""}`}
        aria-invalid={invalid || undefined}
        className={cn(
          "num-sm h-full w-full min-w-0 rounded-[10px] border border-transparent bg-s3 px-1 text-center text-fg outline-none transition-[border-color,box-shadow] hover:border-line focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(213_172_103/.18)]",
          invalid && "border-danger",
          field === "rir" && "text-[19px]",
        )}
      />
    </div>
  );
}

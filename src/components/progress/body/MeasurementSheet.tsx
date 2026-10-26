"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useMeasurements, type Measurement } from "@/lib/data/body";
import { useProfile } from "@/lib/data/profile";
import { shortDate, type ISODate } from "@/lib/dates";
import { fromDisplayLength, parseNumber, round, toDisplayLength, type LengthUnit } from "@/lib/units";
import { cn } from "@/lib/cn";
import { BODY_FAT, MEASURE_FIELDS, fmtLen, hasAnyValue, measureStep, snap, type MeasureKey } from "@/lib/progress/measurements";
import { useMeasurementWrite, type MeasurementValues } from "@/lib/progress/hooks";
import { unitsOf } from "../kit";

type Key = MeasureKey | "body_fat_pct";
type Texts = Record<Key, string>;

const EMPTY: Texts = Object.fromEntries([...MEASURE_FIELDS.map((f) => [f.key, ""]), ["body_fat_pct", ""]]) as Texts;

function textsFrom(row: Measurement | null | undefined, unit: LengthUnit): Texts {
  if (!row) return { ...EMPTY };
  const out = { ...EMPTY };
  for (const f of MEASURE_FIELDS) {
    const v = row[f.key];
    if (v != null) out[f.key] = fmt(toDisplayLength(Number(v), unit), unit);
  }
  if (row.body_fat_pct != null) out.body_fat_pct = Number(row.body_fat_pct).toFixed(1);
  return out;
}

const fmt = (v: number, unit: LengthUnit) => (unit === "cm" ? round(v, 1).toFixed(1) : String(round(v, 2)));

/**
 * Log or edit one dated set of tape measurements. Steppers move 0.25 in / 0.5 cm; values are
 * stored in inches. A new entry on a day that already has one adds to that entry.
 */
export function MeasurementSheet({ open, onOpenChange, entry }: { open: boolean; onOpenChange: (o: boolean) => void; entry: Measurement | null }) {
  const today = useToday();
  const { profile } = useProfile();
  const unit = unitsOf(profile).lu;
  const { data: rows = [] } = useMeasurements();
  const { write, del, pending } = useMeasurementWrite();
  const [date, setDate] = useState<ISODate>(today);
  const [texts, setTexts] = useState<Texts>(EMPTY);
  const [notes, setNotes] = useState("");
  // The row the fields were filled from and the text each showed, so untouched fields keep
  // their stored inches exactly (38.7 cm on screen must not turn 15.25 in into 15.24).
  const [seed, setSeed] = useState<{ row: Measurement | null; texts: Texts; notes: string }>({ row: null, texts: EMPTY, notes: "" });
  const [submitted, setSubmitted] = useState(false);
  const busy = useRef(false);
  const inputs = useRef<Partial<Record<Key, HTMLInputElement | null>>>({});

  const seedFrom = (row: Measurement | null) => ({ row, texts: textsFrom(row, unit), notes: row?.notes ?? "" });

  // (Re)initialise every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const d = entry?.local_date ?? today;
      const s = seedFrom(entry ?? rows.find((r) => r.local_date === d) ?? null);
      setDate(d);
      setSeed(s);
      setTexts(s.texts);
      setNotes(s.notes);
      setSubmitted(false);
      busy.current = false;
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A new entry follows the date: show that day's values (or blanks) in every field not yet
  // edited here, so one day's tape numbers and notes are never copied onto another day.
  // Editing an existing entry keeps its values — changing the date moves it.
  const changeDate = (d: ISODate) => {
    setDate(d);
    if (entry) return;
    const s = seedFrom(rows.find((r) => r.local_date === d) ?? null);
    setTexts((t) => Object.fromEntries((Object.keys(t) as Key[]).map((k) => [k, t[k] === seed.texts[k] ? s.texts[k] : t[k]])) as Texts);
    if (notes === seed.notes) setNotes(s.notes);
    setSeed(s);
  };
  const untouched = (k: Key) => seed.row != null && seed.row[k] != null && texts[k] === seed.texts[k];

  const editing = entry ?? null;
  const sameDay = useMemo(() => rows.find((r) => r.local_date === date && r.id !== editing?.id) ?? null, [rows, date, editing]);
  const target = editing ?? sameDay; // the row this save updates (null → new)

  // Most recent value of each field before this entry — the stepper's starting point.
  const lastOf = (k: Key): { v: number; d: ISODate } | null => {
    const prev = [...rows].filter((r) => r.local_date < date && r[k] != null).sort((a, b) => b.local_date.localeCompare(a.local_date))[0];
    return prev ? { v: Number(prev[k]), d: prev.local_date } : null;
  };

  const errors: Partial<Record<Key, string>> = {};
  const values: Partial<Record<Key, number | null>> = {};
  for (const f of MEASURE_FIELDS) {
    const raw = texts[f.key];
    const n = parseNumber(raw);
    if (raw.trim() === "") values[f.key] = null;
    else if (untouched(f.key)) values[f.key] = Number(seed.row![f.key]);
    else if (n == null) errors[f.key] = "Enter a number.";
    else {
      const inches = round(fromDisplayLength(n, unit), 2);
      if (inches < f.min || inches > f.max) errors[f.key] = `Between ${fmt(toDisplayLength(f.min, unit), unit)} and ${fmt(toDisplayLength(f.max, unit), unit)} ${unit}.`;
      else values[f.key] = inches;
    }
  }
  {
    const raw = texts.body_fat_pct;
    const n = parseNumber(raw);
    if (raw.trim() === "") values.body_fat_pct = null;
    else if (n == null || n < BODY_FAT.min || n > BODY_FAT.max) errors.body_fat_pct = `Between ${BODY_FAT.min} and ${BODY_FAT.max}%.`;
    else values.body_fat_pct = round(n, 1);
  }
  const invalid = Object.keys(errors).length > 0;
  const empty = !hasAnyValue(values);
  const future = date > today;
  // Moving an entry onto a day that already has one would collide (one entry per day).
  const collides = !!editing && !!sameDay;

  const step = (k: Key, dir: 1 | -1) => {
    const isFat = k === "body_fat_pct";
    const inc = isFat ? 0.5 : measureStep(unit);
    const cur = parseNumber(texts[k]);
    let next: number;
    if (cur == null) {
      const last = lastOf(k);
      if (!last) {
        inputs.current[k]?.focus();
        return;
      }
      next = isFat ? last.v : toDisplayLength(last.v, unit);
    } else next = cur + dir * inc;
    // Inches sit on the quarter-inch grid; centimetres and body fat just keep one decimal
    // (snapping 36.8 cm to 37.0 would quietly change the starting value).
    next = !isFat && unit === "in" ? snap(next, inc) : round(next, 1);
    setTexts((t) => ({ ...t, [k]: isFat ? next.toFixed(1) : fmt(next, unit) }));
  };

  const submit = () => {
    setSubmitted(true);
    if (busy.current || invalid || empty || future || collides) return;
    busy.current = true;
    let v: MeasurementValues = { local_date: date, notes: notes.trim() || null };
    for (const f of MEASURE_FIELDS) v = { ...v, [f.key]: values[f.key] ?? null };
    v = { ...v, body_fat_pct: values.body_fat_pct ?? null };
    if (!editing && sameDay) {
      // adding to an existing day: keep that day's values for fields left blank here
      for (const f of [...MEASURE_FIELDS.map((x) => x.key), "body_fat_pct" as const]) {
        if (v[f] == null && sameDay[f] != null) v = { ...v, [f]: Number(sameDay[f]) };
      }
      if (!v.notes && sameDay.notes) v = { ...v, notes: sameDay.notes };
    }
    write(v, target, () => onOpenChange(false));
  };

  // Allow another attempt once the request settles (on failure the sheet stays open with the input intact).
  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  const title = editing ? `Edit ${shortDate(editing.local_date, today)}` : "Log measurements";
  const description = sameDay && !editing ? `Adds to your ${shortDate(date, today)} entry.` : `Steps of ${measureStep(unit)} ${unit}.`;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <div className="grid grid-cols-1 gap-2">
          {submitted && empty && <p className="t-label text-center text-danger">Enter at least one measurement.</p>}
          {future && <p className="t-label text-center text-danger">That date is in the future.</p>}
          {collides && sameDay && (
            <p className="t-label text-center text-danger">{shortDate(sameDay.local_date, today)} already has an entry. Pick another date or edit that one.</p>
          )}
          <Button variant="primary" size="lg" block onClick={submit} loading={pending} disabled={invalid || collides}>
            {editing ? "Save changes" : "Save measurements"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 py-2">
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => changeDate(e.target.value || today)} />}</Field>

        <div className="divide-y divide-line rounded-tile-lg bg-surface px-4">
          {MEASURE_FIELDS.map((f) => {
            const last = lastOf(f.key);
            return (
              <MeasureRow
                key={f.key}
                id={`m-${f.key}`}
                label={f.key === "shoulders_in" ? "Shoulders" : f.long}
                hint={last ? `Last ${fmtLen(last.v, unit)} · ${shortDate(last.d, today)}` : f.hint}
                unit={unit}
                value={texts[f.key]}
                error={errors[f.key]}
                onText={(s) => setTexts((t) => ({ ...t, [f.key]: s }))}
                onStep={(d) => step(f.key, d)}
                inputRef={(el) => (inputs.current[f.key] = el)}
              />
            );
          })}
          <MeasureRow
            id="m-body-fat"
            label="Body fat"
            hint="Optional estimate"
            unit="%"
            value={texts.body_fat_pct}
            error={errors.body_fat_pct}
            onText={(s) => setTexts((t) => ({ ...t, body_fat_pct: s }))}
            onStep={(d) => step("body_fat_pct", d)}
            inputRef={(el) => (inputs.current.body_fat_pct = el)}
          />
        </div>

        <Field label="Notes" hint="Optional">
          {(id) => <Textarea id={id} rows={2} maxLength={500} placeholder="e.g. morning, before training" value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>

        {editing && (
          <Button
            variant="destructive"
            className="justify-self-center"
            onClick={() => {
              del(editing, () => onOpenChange(false));
            }}
          >
            Delete this entry
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function MeasureRow({
  id,
  label,
  hint,
  unit,
  value,
  error,
  onText,
  onStep,
  inputRef,
}: {
  id: string;
  label: string;
  hint: string;
  unit: string;
  value: string;
  error?: string;
  onText: (s: string) => void;
  onStep: (dir: 1 | -1) => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const btn = "press grid size-11 shrink-0 place-items-center rounded-full bg-control text-fg";
  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="min-w-0 flex-1">
          <span className="t-row block truncate">{label}</span>
          <span className="t-cap block truncate">{hint}</span>
        </label>
        <div className="flex shrink-0 items-center gap-2" role="group" aria-label={label}>
          <button type="button" className={btn} onClick={() => onStep(-1)} aria-label={`Decrease ${label}`}>
            <Minus className="size-[18px]" />
          </button>
          <div className="relative">
            <input
              ref={inputRef}
              id={id}
              value={value}
              onChange={(e) => onText(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              inputMode="decimal"
              enterKeyHint="next"
              autoComplete="off"
              placeholder="—"
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-err` : undefined}
              className={cn(
                "t-row h-12 w-[84px] rounded-tile border bg-control pr-8 text-center tabular-nums text-fg outline-none placeholder:text-fg-2 focus:border-fg",
                error ? "border-danger" : "border-transparent",
              )}
            />
            <span className="t-cap pointer-events-none absolute inset-y-0 right-2 flex items-center">{unit}</span>
          </div>
          <button type="button" className={btn} onClick={() => onStep(1)} aria-label={`Increase ${label}`}>
            <Plus className="size-[18px]" />
          </button>
        </div>
      </div>
      {error && (
        <p id={`${id}-err`} className="t-cap mt-1.5 text-right text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

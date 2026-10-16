"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/controls";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useWeightMutations, useWeights } from "@/lib/data/body";
import { useProfile } from "@/lib/data/profile";
import { relativeDay } from "@/lib/dates";
import { formatBodyweight, fromDisplayWeight, parseNumber, round, toDisplayWeight, type WeightUnit } from "@/lib/units";

/** What the sheet showed when it was seeded: the stored pounds behind the displayed number. */
interface Seed {
  lb: number;
  unit: WeightUnit;
  text: string;
  notes: string;
}

/** A day-to-day change this large is almost always a typo or the wrong unit. */
const IMPLAUSIBLE_CHANGE = 0.1;

/** Morning weigh-in logger. One entry per day — saving again replaces that day's value. */
export function WeightLogSheet({ open, onOpenChange, date: initialDate }: { open: boolean; onOpenChange: (o: boolean) => void; date?: string }) {
  const today = useToday();
  const { profile } = useProfile();
  const unit = (profile?.weight_unit ?? "lb") as WeightUnit;
  const { weights, loading: weightsLoading } = useWeights();
  const { save, remove } = useWeightMutations();
  const last = weights.at(-1);
  const [date, setDate] = useState(initialDate ?? today);
  const [value, setValue] = useState<number>(0);
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [seed, setSeed] = useState<Seed | null>(null);

  const existing = useMemo(() => weights.find((w) => w.local_date === date), [weights, date]);

  // That day's weigh-in, else the latest one, else the start weight.
  const seedFor = (d: string): Seed | null => {
    if (!profile) return null;
    const ex = weights.find((w) => w.local_date === d);
    const lb = round(ex ? Number(ex.weight_lb) : last ? Number(last.weight_lb) : Number(profile.start_weight_lb), 1);
    return { lb, unit, text: round(toDisplayWeight(lb, unit), 1).toFixed(1), notes: ex?.notes ?? "" };
  };
  const apply = (s: Seed) => {
    setValue(Number(s.text));
    setText(s.text);
  };

  // Each time the sheet opens, start from that day's weigh-in (or the latest one) — once the
  // weigh-ins and profile have loaded, so a deep link (?log=1) doesn't seed a placeholder.
  const ready = !weightsLoading && !!profile;
  const seedKey = open ? (ready ? "ready" : "loading") : "closed";
  const [seeded, setSeeded] = useState("closed");
  if (seedKey !== seeded) {
    setSeeded(seedKey);
    if (seedKey === "ready") {
      const d = initialDate ?? today;
      setDate(d);
      const s = seedFor(d);
      setSeed(s);
      if (s) {
        apply(s);
        setNotes(s.notes);
      }
    }
  }

  // Moving to another day loads that day's entry, unless the field was already edited here —
  // a note written for one morning must never be copied onto another.
  const changeDate = (d: string) => {
    setDate(d);
    const s = seedFor(d);
    if (!s) return;
    if (!seed || text === seed.text) apply(s);
    if (!seed || notes === seed.notes) setNotes(s.notes);
    setSeed(s);
  };

  const step = unit === "kg" ? 0.1 : 0.2;
  const min = unit === "kg" ? 30 : 60;
  const max = unit === "kg" ? 270 : 600;
  const parsed = parseNumber(text);
  const invalid = parsed == null || parsed < min || parsed > max;
  // The number still reads exactly as seeded: keep the stored pounds, so opening a weigh-in in
  // kg to add a note can't nudge 163.0 lb to 162.9 through the 0.1 kg display rounding.
  const lb = parsed == null ? null : seed && seed.unit === unit && parsed.toFixed(1) === seed.text ? seed.lb : round(fromDisplayWeight(parsed, unit), 1);

  // Soft check against the nearest other weigh-in: a 10% swing is a typo or the wrong unit.
  const ref = useMemo(() => [...weights].reverse().find((w) => w.local_date !== date && w.local_date <= date) ?? weights.find((w) => w.local_date !== date), [weights, date]);
  const refLb = ref ? Number(ref.weight_lb) : null;
  const odd = !invalid && lb != null && refLb != null && Math.abs(lb - refLb) / refLb >= IMPLAUSIBLE_CHANGE;

  const submit = () => {
    if (invalid || lb == null) return;
    if (date > today) {
      toast.error("That date is in the future.");
      return;
    }
    const previous = existing ? { local_date: existing.local_date, weight_lb: Number(existing.weight_lb), notes: existing.notes } : null;
    save.mutate(
      { local_date: date, weight_lb: lb, notes: notes.trim() || null },
      {
        onSuccess: (row) => {
          toast.success(`Weigh-in saved · ${formatBodyweight(lb, unit)}`, {
            duration: 6000,
            action: {
              label: "Undo",
              // restore the earlier reading for that day, or remove the new one
              onClick: () => (previous ? save.mutate(previous) : row && remove.mutate(row)),
            },
          });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Log weight"
      description={existing ? `Replaces ${dayRef(date, today)}'s ${formatBodyweight(Number(existing.weight_lb), unit)}` : "Best first thing in the morning, after the bathroom."}
      footer={
        <Button variant="primary" size="lg" block onClick={submit} loading={save.isPending} disabled={invalid}>
          Save weigh-in
        </Button>
      }
    >
      <div className="py-4">
        <Stepper
          size="lg"
          label="Bodyweight"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(v) => {
            setValue(v);
            setText(v.toFixed(1));
          }}
        >
          <label className="block">
            <span className="sr-only">Bodyweight in {unit}</span>
            <input
              value={text}
              inputMode="decimal"
              onChange={(e) => {
                setText(e.target.value);
                const n = parseNumber(e.target.value);
                if (n != null) setValue(n);
              }}
              onFocus={(e) => e.currentTarget.select()}
              className="num-hero w-full bg-transparent text-center text-fg outline-none"
              aria-invalid={invalid}
            />
            <span className="mt-1 block text-[13px] font-semibold uppercase tracking-[0.18em] text-fg-3">{unit}</span>
          </label>
        </Stepper>
        {invalid && <p className="mt-2 text-center text-[13px] text-danger">Enter a weight between {min} and {max} {unit}.</p>}
        {odd && ref && refLb != null && (
          <p className="mt-2 text-center text-[13px] text-warning" role="status">
            {formatBodyweight(Math.abs(lb! - refLb), unit)} {lb! < refLb ? "under" : "over"} {dayRef(ref.local_date, today)}&apos;s {formatBodyweight(refLb, unit)}. Check the number and the unit.
          </p>
        )}
      </div>
      <div className="grid gap-4 pb-2">
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => changeDate(e.target.value || today)} />}</Field>
        <Field label="Notes" hint="Optional">
          {(id) => <Textarea id={id} rows={2} maxLength={500} placeholder="e.g. late dinner, salty meal, poor sleep" value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  );
}

/** "today" / "yesterday" mid-sentence, dates as written ("Oct 12"). */
function dayRef(d: string, today: string) {
  const rel = relativeDay(d, today);
  return rel === "Today" || rel === "Yesterday" ? rel.toLowerCase() : rel;
}

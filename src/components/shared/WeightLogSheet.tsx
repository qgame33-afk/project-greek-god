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
import { formatBodyweight, fromDisplayWeight, parseNumber, round, toDisplayWeight } from "@/lib/units";

/** Morning weigh-in logger. One entry per day — saving again replaces that day's value. */
export function WeightLogSheet({ open, onOpenChange, date: initialDate }: { open: boolean; onOpenChange: (o: boolean) => void; date?: string }) {
  const today = useToday();
  const { profile } = useProfile();
  const unit = (profile?.weight_unit ?? "lb") as "lb" | "kg";
  const { weights, loading: weightsLoading } = useWeights();
  const { save, remove } = useWeightMutations();
  const last = weights.at(-1);
  const [date, setDate] = useState(initialDate ?? today);
  const [value, setValue] = useState<number>(0);
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");

  const existing = useMemo(() => weights.find((w) => w.local_date === date), [weights, date]);

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
      const ex = weights.find((w) => w.local_date === d);
      const start = ex ? Number(ex.weight_lb) : last ? Number(last.weight_lb) : Number(profile!.start_weight_lb);
      const v = round(toDisplayWeight(start, unit), 1);
      setValue(v);
      setText(v.toFixed(1));
      setNotes(ex?.notes ?? "");
    }
  }

  const step = unit === "kg" ? 0.1 : 0.2;
  const min = unit === "kg" ? 30 : 60;
  const max = unit === "kg" ? 270 : 600;
  const parsed = parseNumber(text);
  const invalid = parsed == null || parsed < min || parsed > max;

  const submit = () => {
    if (invalid || parsed == null) return;
    if (date > today) {
      toast.error("That date is in the future.");
      return;
    }
    const previous = existing ? { local_date: existing.local_date, weight_lb: Number(existing.weight_lb), notes: existing.notes } : null;
    save.mutate(
      { local_date: date, weight_lb: round(fromDisplayWeight(parsed, unit), 1), notes: notes.trim() || null },
      {
        onSuccess: (row) => {
          toast.success(`Weigh-in saved · ${formatBodyweight(fromDisplayWeight(parsed, unit), unit)}`, {
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
      description={existing ? `Replaces ${relativeDay(date, today).toLowerCase()}'s ${formatBodyweight(Number(existing.weight_lb), unit)}` : "Best first thing in the morning, after the bathroom."}
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
      </div>
      <div className="grid gap-4 pb-2">
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />}</Field>
        <Field label="Notes" hint="Optional">
          {(id) => <Textarea id={id} rows={2} maxLength={500} placeholder="e.g. late dinner, salty meal, poor sleep" value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  );
}

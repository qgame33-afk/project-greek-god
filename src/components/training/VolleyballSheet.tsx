"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, Scale, Stepper } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { addDays, type ISODate } from "@/lib/dates";
import type { Volleyball } from "@/lib/data/training";
import { VB_KINDS, useVolleyballLog, type VbKind } from "./hooks";
import { VolleyballList } from "./VolleyballList";

/**
 * Log a volleyball practice, game, tournament or open gym (kind, duration, intensity, date).
 * Recent sessions are listed underneath with delete + Undo. The form keeps its values when a
 * save fails.
 */
export function VolleyballSheet({
  open,
  onOpenChange,
  date,
  today,
  recent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: ISODate;
  today: ISODate;
  recent: Volleyball[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Log volleyball" description="On-court load shapes your leg-day advice.">
      {/* Remount the form per opening so it starts from the chosen date. */}
      {open && <VolleyballForm key={date} date={date} today={today} recent={recent} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function VolleyballForm({ date: initialDate, today, recent, onDone }: { date: ISODate; today: ISODate; recent: Volleyball[]; onDone: () => void }) {
  const { add, adding } = useVolleyballLog();
  const [kind, setKind] = useState<VbKind>("practice");
  const [duration, setDuration] = useState(90);
  const [intensity, setIntensity] = useState<number | null>(3);
  const [date, setDate] = useState<ISODate>(initialDate);
  const [notes, setNotes] = useState("");
  const dateError = !date
    ? "Pick a date."
    : date > today
      ? "Volleyball can only be logged for today or earlier."
      : date < addDays(today, -365)
        ? "Pick a date within the last year."
        : null;

  const save = async () => {
    if (dateError) return; // double taps are absorbed by the hook's ref guard
    const ok = await add({ local_date: date, kind, duration_min: duration || null, intensity, notes: notes.trim() || null });
    if (ok) onDone();
  };

  return (
    <div className="space-y-6 pt-1">
      <div>
        <p className="t-eyebrow mb-2 text-stone">Type</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Type">
          {VB_KINDS.map((k) => (
            <Chip key={k.value} selected={kind === k.value} onClick={() => setKind(k.value)} className="justify-center">
              {k.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="t-eyebrow mb-2 text-stone">Duration</p>
        <Stepper value={duration} onChange={setDuration} step={15} min={15} max={480} label="duration in minutes" format={(v) => (
          <>
            {v}
            <span className="t-callout text-stone"> min</span>
          </>
        )} />
      </div>

      <Scale value={intensity} onChange={setIntensity} low="Light" high="All-out" label="Intensity" invert />

      <Field label="Date" error={dateError}>
        {(id) => (
          <div className="flex gap-2">
            <Input id={id} type="date" value={date} max={today} min={addDays(today, -365)} onChange={(e) => setDate(e.target.value)} aria-invalid={!!dateError} className="flex-1" />
            <Chip selected={date === today} onClick={() => setDate(today)} className="h-13 rounded-field">
              Today
            </Chip>
          </div>
        )}
      </Field>

      <Field label="Notes" hint="Optional">
        {(id) => <Input id={id} value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="Lots of jumping, felt heavy…" enterKeyHint="done" autoComplete="off" />}
      </Field>

      <Button variant="primary" size="lg" block onClick={save} loading={adding} disabled={!!dateError}>
        Save volleyball
      </Button>

      <VolleyballList rows={recent} today={today} title="Recent" withDate limit={8} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, Scale, Stepper } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { addDays, relativeDay, type ISODate } from "@/lib/dates";
import type { Volleyball } from "@/lib/data/training";
import { VB_KINDS, useVolleyballLog, vbKindLabel, type VbKind } from "./hooks";

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
  const { add, del, adding } = useVolleyballLog();
  const [kind, setKind] = useState<VbKind>("practice");
  const [duration, setDuration] = useState(90);
  const [intensity, setIntensity] = useState<number | null>(3);
  const [date, setDate] = useState<ISODate>(initialDate);
  const [notes, setNotes] = useState("");
  const dateError = date > today ? "Volleyball can only be logged for today or earlier." : !date ? "Pick a date." : null;

  const save = async () => {
    if (adding || dateError) return;
    const ok = await add({ local_date: date, kind, duration_min: duration || null, intensity, notes: notes.trim() || null });
    if (ok) onDone();
  };

  const list = [...recent].sort((a, b) => b.local_date.localeCompare(a.local_date) || b.created_at.localeCompare(a.created_at)).slice(0, 8);

  return (
    <div className="space-y-6 pt-1">
      <div>
        <p className="mb-2 text-[13px] font-semibold text-fg-2">Type</p>
        <div className="flex flex-wrap gap-2">
          {VB_KINDS.map((k) => (
            <Chip key={k.value} selected={kind === k.value} onClick={() => setKind(k.value)} className="h-11 px-4">
              {k.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[13px] font-semibold text-fg-2">Duration</p>
        <Stepper value={duration} onChange={setDuration} step={15} min={0} max={480} label="duration in minutes" format={(v) => (
          <>
            {v}
            <span className="unit">min</span>
          </>
        )} />
      </div>

      <Scale value={intensity} onChange={setIntensity} low="Light" high="All-out" label="Intensity" invert />

      <Field label="Date" error={dateError}>
        {(id) => (
          <div className="flex gap-2">
            <Input id={id} type="date" value={date} max={today} min={addDays(today, -365)} onChange={(e) => setDate(e.target.value)} aria-invalid={!!dateError} className="flex-1" />
            <Chip selected={date === today} onClick={() => setDate(today)} className="h-[52px] rounded-[12px]">
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

      {list.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Recent</p>
          <ul className="divide-y divide-line-hair overflow-hidden rounded-[14px] bg-s3">
            {list.map((v) => (
              <li key={v.id} className="flex min-h-14 items-center gap-3 pl-3.5">
                <span className="size-2 shrink-0 rounded-full bg-lapis" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">
                    {vbKindLabel(v.kind)} · {relativeDay(v.local_date, today)}
                  </p>
                  <p className="truncate text-[12px] text-fg-3">
                    {[v.duration_min ? `${v.duration_min} min` : null, v.intensity ? `Intensity ${v.intensity}/5` : null, v.notes].filter(Boolean).join(" · ") || "No details"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => del(v)}
                  aria-label={`Delete ${vbKindLabel(v.kind)} on ${relativeDay(v.local_date, today)}`}
                  className="grid size-11 shrink-0 place-items-center text-fg-3 hover:text-danger"
                >
                  <Trash className="size-[18px]" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

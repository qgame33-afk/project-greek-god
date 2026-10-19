"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
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

/**
 * The weigh-in sheet (docs/DESIGN-V2.md §3.9.1 → Weigh-in): the scale stepper with Inscribe. It
 * starts from that day's weigh-in, else the latest one; ∓0.2 lb (0.1 kg) on 56 px keys, or type
 * the number. One entry per day: saving again replaces that day's value, with Undo.
 */
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
  // The very first weigh-in has no other one to compare with: the start weight from
  // onboarding is the reference then (a new lb user typing their kg weight still hears about it).
  const startLb = profile?.start_weight_lb != null && Number(profile.start_weight_lb) > 0 ? Number(profile.start_weight_lb) : null;
  const refLb = ref ? Number(ref.weight_lb) : startLb;
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
          toast(`Inscribed ${formatBodyweight(lb, unit)}`, {
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

  const prev = ref ? `${dayRef(ref.local_date, today)} was ${round(toDisplayWeight(Number(ref.weight_lb), unit), 1).toFixed(1)}` : null;
  const btn =
    "press grid size-14 shrink-0 place-items-center rounded-btn bg-m3 text-ivory shadow-[inset_0_0_0_1px_var(--vein-2)] hover:bg-m4 active:bg-m4 disabled:text-disabled";
  const bump = (dir: 1 | -1) => {
    const v = Math.min(max, Math.max(min, round((parsed ?? value) + dir * step, 1)));
    setValue(v);
    setText(v.toFixed(1));
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Weigh-in"
      description={existing ? `Replaces ${dayRef(date, today)}'s ${formatBodyweight(Number(existing.weight_lb), unit)}` : "Before food, after the bathroom."}
      footer={
        <Button variant="primary" size="lg" block onClick={submit} loading={save.isPending} disabled={invalid}>
          {invalid ? "Inscribe" : `Inscribe ${parsed!.toFixed(1)}`}
        </Button>
      }
    >
      {/* at accessibility sizes the number takes the whole row and the keys sit under it */}
      <div className="@container pb-2 pt-3">
        <div className="flex items-center gap-3 @max-[19rem]:flex-wrap @max-[19rem]:justify-center" role="group" aria-label="Bodyweight">
          <button type="button" className={btn} aria-label={`${step} ${unit} less`} onClick={() => bump(-1)} disabled={parsed == null || parsed <= min}>
            <Minus className="size-6" strokeWidth={1.8} />
          </button>
          <label className="min-w-0 flex-1 text-center @max-[19rem]:order-first @max-[19rem]:basis-full">
            <span className="sr-only">Bodyweight in {unit}</span>
            <input
              value={text}
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              onChange={(e) => {
                setText(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6));
                const n = parseNumber(e.target.value.replace(",", "."));
                if (n != null) setValue(n);
              }}
              onFocus={(e) => e.currentTarget.select()}
              className="t-dial tnum w-full bg-transparent text-center text-ivory outline-none aria-invalid:text-cinnabar"
              aria-invalid={invalid}
            />
            <span className="t-meta mt-1 block text-ash">
              {unit}
              {prev ? ` · ${prev}` : ""}
            </span>
          </label>
          <button type="button" className={btn} aria-label={`${step} ${unit} more`} onClick={() => bump(1)} disabled={parsed == null || parsed >= max}>
            <Plus className="size-6" strokeWidth={1.8} />
          </button>
        </div>
        {invalid && (
          <p className="t-meta mt-3 text-center text-cinnabar" role="alert">
            Enter a weight between {min} and {max} {unit}.
          </p>
        )}
        {odd && refLb != null && (
          <p className="t-meta mt-3 rounded-field bg-m2 px-3.5 py-2.5 text-center text-stone shadow-[inset_0_0_0_1px_var(--ui-line)]" role="status">
            {formatBodyweight(Math.abs(lb! - refLb), unit)} {lb! < refLb ? "under" : "over"}{" "}
            {ref ? `${dayRef(ref.local_date, today)}'s ${formatBodyweight(refLb, unit)}` : `your start weight of ${formatBodyweight(refLb, unit)}`}. Check the number and the unit.
          </p>
        )}
      </div>
      <div className="grid gap-4 pb-2 pt-4">
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => changeDate(e.target.value || today)} />}</Field>
        <Field label="Notes" hint="Optional">
          {(id) => <Textarea id={id} rows={2} maxLength={500} placeholder="Late dinner, salty meal, poor sleep" value={notes} onChange={(e) => setNotes(e.target.value)} />}
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

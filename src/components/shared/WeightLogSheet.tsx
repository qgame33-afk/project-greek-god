"use client";

import { ChevronDown } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BigValue } from "@/components/ui/big-value";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Collapse } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { isOffline, useToday } from "@/lib/data/core";
import { useWeightMutations, useWeights } from "@/lib/data/body";
import { useProfile } from "@/lib/data/profile";
import { relativeDay } from "@/lib/dates";
import { formatBodyweight, fromDisplayWeight, parseNumber, round, toDisplayWeight, type WeightUnit } from "@/lib/units";

/** What the sheet showed when it was seeded: the stored pounds behind the displayed number. */
interface Seed {
  lb: number;
  unit: WeightUnit;
  shown: number;
  notes: string;
}

/** A day-to-day change this large is almost always a typo or the wrong unit. */
const IMPLAUSIBLE_CHANGE = 0.1;
/** One step of the stepper, in the profile's unit (0.1 kg). */
const STEP = 0.1;
/** Bounds and the empty-account starting point, stored in pounds like the database and shown through units.ts. */
const MIN_LB = 66;
const MAX_LB = 600;
const PLACEHOLDER_LB = 160;

/**
 * The weigh-in sheet (docs/DESIGN-V3-SIMPLE.md §4.1.3): "Weigh in", one big number prefilled with
 * that day's weigh-in, else the last one, −0.1 / +0.1, and the gold Save. Tapping the number types
 * it. One entry per day: saving again replaces that day's value, with Undo. The date and a note
 * stay one tap away under "Date and note". Opened from Today's Up next, Add › Weigh in and
 * Progress (`?log=1`); the props are a contract with those streams.
 */
export function WeightLogSheet({ open, onOpenChange, date: initialDate }: { open: boolean; onOpenChange: (o: boolean) => void; date?: string }) {
  const today = useToday();
  const { profile } = useProfile();
  const unit = (profile?.weight_unit as WeightUnit | null | undefined) ?? "kg";
  const { weights, loading: weightsLoading } = useWeights();
  const { save, remove } = useWeightMutations();
  const [date, setDate] = useState(initialDate ?? today);
  const [value, setValue] = useState<number>(0);
  const [typing, setTyping] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [seed, setSeed] = useState<Seed | null>(null);
  const [more, setMore] = useState(false);
  const [offline, setOffline] = useState(false);
  const moreId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const existing = useMemo(() => weights.find((w) => w.local_date === date), [weights, date]);
  const lastBefore = (d: string) => [...weights].reverse().find((w) => w.local_date !== d && w.local_date <= d) ?? null;

  // That day's weigh-in, else the latest one, else the start weight.
  const seedFor = (d: string): Seed | null => {
    if (!profile) return null;
    const ex = weights.find((w) => w.local_date === d);
    const last = weights.at(-1);
    const startLb = profile.start_weight_lb == null ? null : Number(profile.start_weight_lb);
    const lbRaw = ex ? Number(ex.weight_lb) : last ? Number(last.weight_lb) : startLb;
    if (lbRaw == null || !(lbRaw > 0)) return { lb: 0, unit, shown: round(toDisplayWeight(PLACEHOLDER_LB, unit), 1), notes: "" };
    const lb = round(lbRaw, 1);
    return { lb, unit, shown: round(toDisplayWeight(lb, unit), 1), notes: ex?.notes ?? "" };
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
      setTyping(null);
      setMore(false);
      setOffline(false);
      if (s) {
        setValue(s.shown);
        setNotes(s.notes);
      }
    }
  }

  // Moving to another day loads that day's entry, unless the number was already changed here —
  // a note written for one morning must never be copied onto another.
  const changeDate = (d: string) => {
    setDate(d);
    const s = seedFor(d);
    if (!s) return;
    if (!seed || value === seed.shown) setValue(s.shown);
    if (!seed || notes === seed.notes) setNotes(s.notes);
    setSeed(s);
  };

  const min = Math.ceil(toDisplayWeight(MIN_LB, unit));
  const max = Math.floor(toDisplayWeight(MAX_LB, unit));
  const typed = typing == null ? null : parseNumber(typing.replace(",", "."));
  const current = typing == null ? value : typed;
  const invalid = current == null || current < min || current > max;
  // The number still reads exactly as seeded: keep the stored pounds, so opening a weigh-in in
  // kg to add a note can't nudge the stored value through the 0.1 kg display rounding.
  const lb = current == null ? null : seed && seed.lb > 0 && seed.unit === unit && round(current, 1) === seed.shown ? seed.lb : round(fromDisplayWeight(current, unit), 1);

  // Soft check against the nearest other weigh-in (or the start weight): a 10% swing is a typo or the wrong unit.
  const ref = lastBefore(date) ?? weights.find((w) => w.local_date !== date) ?? null;
  const startLb = profile?.start_weight_lb != null && Number(profile.start_weight_lb) > 0 ? Number(profile.start_weight_lb) : null;
  const refLb = ref ? Number(ref.weight_lb) : startLb;
  const odd = !invalid && lb != null && refLb != null && Math.abs(lb - refLb) / refLb >= IMPLAUSIBLE_CHANGE;

  const finishTyping = () => {
    if (typing == null) return;
    if (typed != null && typed >= min && typed <= max) setValue(round(typed, 1));
    setTyping(null);
  };

  const submit = () => {
    if (invalid || lb == null) return;
    if (date > today) {
      toast.error("That date is in the future.");
      return;
    }
    if (isOffline()) {
      setOffline(true);
      return;
    }
    setOffline(false);
    const previous = existing ? { local_date: existing.local_date, weight_lb: Number(existing.weight_lb), notes: existing.notes } : null;
    save.mutate(
      { local_date: date, weight_lb: lb, notes: notes.trim() || null },
      {
        onSuccess: (row) => {
          toast(`Weight saved · ${formatBodyweight(lb, unit)}`, {
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

  const shownRef = ref ? `${round(toDisplayWeight(Number(ref.weight_lb), unit), 1).toFixed(1)} ${unit}` : null;
  const caption = existing
    ? `${cap(dayRef(date, today))} ${formatBodyweight(Number(existing.weight_lb), unit)} · saving replaces it`
    : shownRef
      ? `Last time ${shownRef} · tap the number to type it`
      : "Tap the number to type it";

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Weigh in" description="Before breakfast, after the bathroom.">
      <div className="pb-2 pt-6">
        {typing == null ? (
          <BigValue
            name="Weight"
            value={value}
            onChange={setValue}
            unit={unit}
            spokenUnit={unit}
            step={STEP}
            min={min}
            max={max}
            format={(v) => v.toFixed(1)}
            minusLabel="−0.1"
            plusLabel="+0.1"
            onKeypad={() => {
              setTyping(value.toFixed(1));
              window.setTimeout(() => inputRef.current?.select(), 30);
            }}
          />
        ) : (
          <div className="flex flex-col items-center">
            <label className="w-full text-center">
              <span className="sr-only">Weight in {unit}</span>
              <input
                ref={inputRef}
                autoFocus
                value={typing}
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                aria-invalid={invalid}
                onChange={(e) => setTyping(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && finishTyping()}
                onBlur={finishTyping}
                className="t-big w-full bg-transparent text-center text-fg outline-none"
              />
            </label>
            <span className="t-label mt-1">{unit}</span>
          </div>
        )}
        {invalid && (
          <p className="t-label mt-2 text-center text-danger" role="alert">
            Enter a weight between {min} and {max} {unit}.
          </p>
        )}
        {odd && refLb != null && lb != null && (
          <p className="t-label mt-3 rounded-tile-lg bg-sheet-card px-4 py-3 text-center text-fg" role="status">
            {formatBodyweight(Math.abs(lb - refLb), unit)} {lb < refLb ? "under" : "over"}{" "}
            {ref ? `${dayRef(ref.local_date, today)}'s ${formatBodyweight(refLb, unit)}` : `your start weight of ${formatBodyweight(refLb, unit)}`}. Check the number and the unit.
          </p>
        )}
        <Button variant="primary" size="lg" block className="mt-5" onClick={submit} loading={save.isPending} disabled={invalid}>
          Save
        </Button>
        <p className="t-label mt-3 text-center">{caption}</p>
        {offline && (
          <p role="status" className="t-label mt-2 text-center">
            You&apos;re offline. Try again when you&apos;re back.
          </p>
        )}
        <button
          type="button"
          aria-expanded={more}
          aria-controls={moreId}
          onClick={() => setMore((m) => !m)}
          className="press t-label mx-auto mt-2 flex min-h-11 items-center gap-1 font-semibold"
        >
          {date === today ? "Date and note" : `${cap(dayRef(date, today))} · note`}
          <ChevronDown className={cn("size-4 transition-transform duration-(--dur-fast)", more && "rotate-180")} strokeWidth={2.2} aria-hidden />
        </button>
        <Collapse open={more} id={moreId}>
          <div className="grid gap-4 pb-2 pt-2">
            <Field label="Date">{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => changeDate(e.target.value || today)} />}</Field>
            <Field label="Note" hint="Optional">
              {(id) => <Textarea id={id} rows={2} maxLength={500} placeholder="Late dinner, salty meal, poor sleep" value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
          </div>
        </Collapse>
      </div>
    </Sheet>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "today" / "yesterday" mid-sentence, dates as written ("Oct 12"). */
function dayRef(d: string, today: string) {
  const rel = relativeDay(d, today);
  return rel === "Today" || rel === "Yesterday" ? rel.toLowerCase() : rel;
}

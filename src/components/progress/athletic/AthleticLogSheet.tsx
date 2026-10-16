"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { Field, Input, NumberInput, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import type { ISODate } from "@/lib/dates";
import { fromDisplayLength, parseNumber, round, type LengthUnit } from "@/lib/units";
import { TESTS, TEST_BY_KEY, type TestType } from "@/lib/progress/athletic";
import { useAthleticWrite } from "@/lib/progress/hooks";

/** Plausible ranges (inches / seconds) — catches typos without judging anyone's numbers. */
const RANGE: Record<TestType, [number, number]> = {
  standing_vertical: [1, 60],
  approach_vertical: [1, 70],
  standing_reach: [40, 130],
  broad_jump: [12, 180],
  sprint: [0.8, 60],
};
const DISTANCES = [10, 20, 30, 40, 60];

export function AthleticLogSheet({ open, onOpenChange, type: initial }: { open: boolean; onOpenChange: (o: boolean) => void; type?: TestType }) {
  const today = useToday();
  const { profile } = useProfile();
  const unit = (profile?.length_unit ?? "in") as LengthUnit;
  const { log, pending } = useAthleticWrite();
  const [type, setType] = useState<TestType>(initial ?? "standing_vertical");
  const [text, setText] = useState("");
  const [distance, setDistance] = useState("30");
  const [date, setDate] = useState<ISODate>(today);
  const [conditions, setConditions] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      setType(initial ?? "standing_vertical");
      setText("");
      setDate(today);
      setNotes("");
      setSubmitted(false);
      busy.current = false;
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  const def = TEST_BY_KEY[type];
  const isTime = def.kind === "time";
  const u = isTime ? "s" : unit;
  const n = parseNumber(text);
  const stored = n == null ? null : isTime ? round(n, 2) : round(fromDisplayLength(n, unit), 2);
  const [lo, hi] = RANGE[type];
  const dist = parseNumber(distance);
  let error: string | null = null;
  if (text.trim() === "") error = submitted ? "Enter a result." : null;
  else if (stored == null) error = "Enter a number.";
  else if (stored < lo || stored > hi) error = isTime ? `Between ${lo} and ${hi} seconds.` : `That looks off for ${def.label.toLowerCase()}. Check the unit (${unit}).`;
  const distError = isTime && (dist == null || dist <= 0 || dist > 400) ? "Distance in metres, 1–400." : null;
  const future = date > today;

  const submit = () => {
    setSubmitted(true);
    if (busy.current || stored == null || error || distError || future) return;
    busy.current = true;
    log(
      {
        local_date: date,
        test_type: type,
        value: stored,
        sprint_distance_m: isTime ? dist : null,
        conditions: conditions.trim() || null,
        notes: notes.trim() || null,
      },
      () => onOpenChange(false),
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Log athletic test"
      description="Test fresh, same time, surface and footwear."
      footer={
        <Button variant="primary" size="lg" block onClick={submit} loading={pending} disabled={!!(text.trim() && error) || future}>
          Save result
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 py-2">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-fg-2">Test</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Test">
            {TESTS.map((t) => (
              <Chip key={t.key} selected={type === t.key} onClick={() => setType(t.key)} className="h-11 px-4">
                {t.label}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-3">{def.how}</p>
        </div>

        <Field label={isTime ? "Time" : "Result"} error={error} hint={isTime ? "seconds" : unit === "in" ? "inches" : "centimetres"}>
          {(id) => <NumberInput id={id} value={text} onChange={(e) => setText(e.target.value)} suffix={u} placeholder={isTime ? "4.30" : unit === "in" ? "27.5" : "70"} enterKeyHint="done" aria-invalid={!!error} />}
        </Field>

        {isTime && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-fg-2">Distance</p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sprint distance">
              {DISTANCES.map((d) => (
                <Chip key={d} selected={distance === String(d)} onClick={() => setDistance(String(d))} className="h-11 px-4">
                  {d} m
                </Chip>
              ))}
              <Input value={DISTANCES.map(String).includes(distance) ? "" : distance} onChange={(e) => setDistance(e.target.value)} inputMode="decimal" placeholder="Other" suffix="m" className="h-11 w-28" aria-label="Other distance in metres" />
            </div>
            {distError && <p className="mt-1.5 text-[13px] font-medium text-danger">{distError}</p>}
          </div>
        )}

        <Field label="Date" error={future ? "That date is in the future." : null}>
          {(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} aria-invalid={future} />}
        </Field>
        <Field label="Conditions" hint="Optional">
          {(id) => <Input id={id} value={conditions} maxLength={120} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. gym court, volleyball shoes, 6 pm" autoComplete="off" />}
        </Field>
        <Field label="Notes" hint="Optional">
          {(id) => <Textarea id={id} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Warm-up, attempts, how it felt" />}
        </Field>
      </div>
    </Sheet>
  );
}

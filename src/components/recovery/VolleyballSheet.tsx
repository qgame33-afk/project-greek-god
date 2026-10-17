"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Scale, Segmented } from "@/components/ui/controls";
import { Label, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useVolleyballMutations, type Volleyball } from "@/lib/data/training";
import { shortDate, type ISODate } from "@/lib/dates";
import { OptionalStepper } from "./parts";

type Kind = "practice" | "game" | "tournament" | "open_gym";
const KINDS: { value: Kind; label: string }[] = [
  { value: "practice", label: "Practice" },
  { value: "game", label: "Game" },
  { value: "tournament", label: "Tourney" },
  { value: "open_gym", label: "Open gym" },
];
const KIND_LABEL: Record<string, string> = {
  practice: "Practice",
  game: "Game",
  tournament: "Tournament",
  open_gym: "Open gym",
};

export function describeVolleyball(
  v: Pick<Volleyball, "kind" | "duration_min" | "intensity">,
) {
  return [
    KIND_LABEL[v.kind] ?? "Volleyball",
    v.duration_min != null ? `${v.duration_min} min` : null,
    v.intensity != null ? `Intensity ${v.intensity}/5` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Optional details for a volleyball day. Blank fields stay blank. */
export function VolleyballSheet({
  open,
  onOpenChange,
  date,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: ISODate;
  onAdded?: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Volleyball session"
      description={shortDate(date)}
    >
      {open && (
        <VbForm
          date={date}
          onDone={() => {
            onOpenChange(false);
            onAdded?.();
          }}
        />
      )}
    </Sheet>
  );
}

function VbForm({ date, onDone }: { date: ISODate; onDone: () => void }) {
  const [kind, setKind] = useState<Kind>("practice");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const { add, remove } = useVolleyballMutations();
  const busy = useRef(false);

  const submit = () => {
    if (busy.current) return;
    busy.current = true;
    add.mutate(
      {
        local_date: date,
        kind,
        duration_min: minutes,
        intensity,
        notes: notes.trim() || null,
      },
      {
        onSuccess: (data) => {
          const row = data as unknown as Volleyball | null;
          toast("Volleyball session logged", {
            description: row ? describeVolleyball(row) : undefined,
            duration: 6000,
            action: row
              ? { label: "Undo", onClick: () => remove.mutate(row.id) }
              : undefined,
          });
          onDone();
        },
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };

  return (
    <div className="space-y-5 pt-1">
      <div>
        <Label>Type</Label>
        <Segmented
          value={kind}
          onChange={setKind}
          options={KINDS}
          ariaLabel="Session type"
        />
      </div>
      <div>
        <Label hint="Optional">Duration</Label>
        <OptionalStepper
          label="duration in minutes"
          value={minutes}
          start={60}
          step={15}
          min={15}
          max={300}
          onChange={setMinutes}
        >
          {minutes == null ? (
            <span className="t-num-m text-ash">—</span>
          ) : (
            <span className="t-num-m text-ivory">
              {minutes}
              <span className="t-meta ml-1 text-stone">min</span>
            </span>
          )}
        </OptionalStepper>
        <p className="t-meta mt-1.5 flex min-h-5 items-center justify-center gap-2 text-ash">
          {minutes == null ? (
            "Not logged · ± starts at 60 min"
          ) : (
            <button
              type="button"
              onClick={() => setMinutes(null)}
              className="-my-3 inline-flex h-11 items-center font-semibold text-stone underline decoration-ui-line underline-offset-4 hover:text-ivory"
              aria-label="Clear duration"
            >
              Clear
            </button>
          )}
        </p>
      </div>
      <Scale
        label="Intensity"
        low="Easy"
        high="All-out"
        value={intensity}
        onChange={setIntensity}
      />
      <div>
        <Label htmlFor="vb-notes" hint="Optional">
          Notes
        </Label>
        <Textarea
          id="vb-notes"
          rows={2}
          maxLength={300}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Lots of jumping, played middle"
        />
      </div>
      <Button
        variant="primary"
        size="lg"
        block
        onClick={submit}
        loading={add.isPending}
      >
        Log session
      </Button>
    </div>
  );
}

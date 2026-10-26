"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BigValue } from "@/components/ui/big-value";
import { Sheet } from "@/components/ui/sheet";
import { useSaveProfile } from "@/lib/data/profile";
import { formatHours, formatSleep } from "@/lib/recovery/checkin";

const MIN = 4;
const MAX = 12;
const STEP = 0.25; // DESIGN: sleep to 0.25 h

/** Edit the nightly sleep goal. Saving is the explicit confirmation; the change is recorded. */
export function SleepGoalSheet({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: number;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Sleep goal"
      description="Used for the check-in, the sleep habit and weekly averages."
    >
      {open && (
        <GoalForm current={current} onDone={() => onOpenChange(false)} />
      )}
    </Sheet>
  );
}

function GoalForm({
  current,
  onDone,
}: {
  current: number;
  onDone: () => void;
}) {
  const [value, setValue] = useState(current);
  const save = useSaveProfile();
  const changed = value !== current;
  return (
    <div className="pt-2">
      <BigValue
        name="Sleep goal"
        value={value}
        onChange={setValue}
        unit="h"
        spokenUnit="hours"
        step={STEP}
        min={MIN}
        max={MAX}
        format={(v) => formatHours(v)}
        minusLabel="−15 min"
        plusLabel="+15 min"
        caption={`${formatSleep(value)} a night. Most lifters recover best on 7–9 h.`}
      />
      <Button
        variant="primary"
        size="lg"
        block
        className="mt-6"
        disabled={!changed}
        loading={save.isPending}
        onClick={() =>
          save.mutate(
            { values: { sleep_goal_h: value }, reason: "Edited in Check-ins" },
            {
              onSuccess: () => {
                toast(`Sleep goal set to ${formatHours(value)} h`, {
                  description: `Was ${formatHours(current)} h.`,
                });
                onDone();
              },
            },
          )
        }
      >
        Save
      </Button>
    </div>
  );
}

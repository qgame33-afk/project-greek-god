"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { useSaveProfile } from "@/lib/data/profile";
import { formatHours, formatSleep } from "@/lib/recovery/checkin";

const MIN = 4;
const MAX = 12;
const STEP = 0.5; // sleep_goal_h is numeric(3,1)

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
      description="Used for guidance, the Sleep mission and weekly averages."
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
      <Stepper
        label="sleep goal"
        value={value}
        step={STEP}
        min={MIN}
        max={MAX}
        onChange={setValue}
        size="lg"
      >
        <span className="num-xl">
          {formatHours(value)}
          <span className="unit">h</span>
        </span>
      </Stepper>
      <p className="mt-3 text-center text-[13px] text-fg-2">
        {formatSleep(value)} a night. Most lifters recover best on 7–9 h.
      </p>
      <Button
        variant="primary"
        size="lg"
        block
        className="mt-6"
        disabled={!changed}
        loading={save.isPending}
        onClick={() =>
          save.mutate(
            { values: { sleep_goal_h: value }, reason: "Edited on Recovery" },
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
        Save goal
      </Button>
    </div>
  );
}

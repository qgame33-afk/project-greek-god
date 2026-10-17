"use client";

import { useState, useSyncExternalStore } from "react";
import { Moon } from "@/components/art/icons";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { weekStart, type ISODate } from "@/lib/dates";
import type { DeloadAdvice } from "@/lib/training/schedule";
import { useSetTrainingMode } from "../hooks";

const KEY = "pgg.deload.notyet";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const readSnooze = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/**
 * "A lighter week is due" (§3.4.1 item 3), straight under the block strip. A RULE, never
 * applied on its own: "Plan a light week" switches the training mode after a confirm (with Undo);
 * "Not yet" hides it until next week on this device.
 */
export function DeloadCard({ advice, today, className }: { advice: DeloadAdvice; today: ISODate; className?: string }) {
  const week = weekStart(today);
  const snoozed = useSyncExternalStore(subscribe, readSnooze, () => null) === week;
  const [confirm, setConfirm] = useState(false);
  const { setMode, pending } = useSetTrainingMode();
  if (!advice.suggest || snoozed) return null;

  const notYet = () => {
    try {
      localStorage.setItem(KEY, week);
    } catch {
      /* private mode: it hides for this visit only */
    }
    listeners.forEach((l) => l());
  };

  return (
    <section aria-labelledby="deload-h" className={cn("slab p-4", className)}>
      <div className="flex gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)] @max-[19rem]:hidden">
          <Moon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id="deload-h" className="t-title-3 text-ivory">
              A lighter week is due
            </h2>
            <Tag kind="RULE" />
          </div>
          <ul className="t-callout mt-1 text-stone">
            {advice.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="t-meta mt-1 text-ash">About half the sets, ~10% lighter, then you climb again.</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 @max-[19rem]:grid-cols-1">
        <Button variant="secondary" size="sm" onClick={notYet}>
          Not yet
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirm(true)} disabled={pending}>
          Plan a light week
        </Button>
      </div>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Switch to a deload week?"
        body="Workouts you start from now on use about half the sets, about 10% lighter, with 3–4 reps in reserve. Switch back to Standard under Program after about a week. You can undo right after."
        confirmLabel="Plan a light week"
        cancelLabel="Not now"
        destructive={false}
        onConfirm={() => void setMode("deload")}
      />
    </section>
  );
}

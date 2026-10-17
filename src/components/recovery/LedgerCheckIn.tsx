"use client";

import { Plus, Trash } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { Volleyball as VolleyballIcon } from "@/components/art/icons";
import { CheckIn } from "@/components/now/CheckIn";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useRecoveryDay } from "@/lib/data/recovery";
import { useVolleyball, useVolleyballMutations, type Volleyball } from "@/lib/data/training";
import { relativeDay, shortDate, type ISODate } from "@/lib/dates";
import { formatHours, rowToUpsert } from "@/lib/recovery/checkin";
import { useDeleteRecovery, useSaveCheckin } from "@/lib/recovery/hooks";
import { SleepGoalSheet } from "./SleepGoalSheet";
import { VolleyballSheet, describeVolleyball } from "./VolleyballSheet";

export interface CheckInHandle {
  focus: () => void;
}

/**
 * The check-in for any date on the Recovery ledger (docs/DESIGN-V2.md §3.7): the same questions
 * and detail as Dawn, every answer saved and merged as it is tapped, plus what only the ledger
 * holds — the sleep goal, volleyball session details and deleting a day's check-in (with Undo).
 */
export const LedgerCheckIn = forwardRef<CheckInHandle, { date: ISODate; today: ISODate; sleepGoal: number; className?: string }>(function LedgerCheckIn(
  { date, today, sleepGoal, className },
  ref,
) {
  const { log } = useRecoveryDay(date);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [vbOpen, setVbOpen] = useState(false);
  const vb = useVolleyball(date, date);
  const vbMut = useVolleyballMutations();
  const del = useDeleteRecovery();
  const save = useSaveCheckin();
  useImperativeHandle(ref, () => ({ focus: () => titleRef.current?.focus({ preventScroll: true }) }), []);

  const isToday = date === today;
  const sessions = vb.data ?? [];

  const removeVb = (row: Volleyball) => {
    vbMut.remove.mutate(row.id, {
      onSuccess: () =>
        toast("Volleyball session removed", {
          description: describeVolleyball(row),
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () => vbMut.add.mutate({ local_date: row.local_date, kind: row.kind, duration_min: row.duration_min, intensity: row.intensity, notes: row.notes }),
          },
        }),
    });
  };

  const remove = () => {
    if (!log || del.isPending || log.id.startsWith("optimistic-")) return;
    const row = log;
    del.mutate(row, {
      onSuccess: () =>
        toast("Check-in deleted", {
          id: `checkin-${date}`,
          duration: 6000,
          action: { label: "Undo", onClick: () => save.mutate(rowToUpsert(row), { onError: () => toast.error("Couldn't restore the check-in") }) },
        }),
    });
  };

  return (
    <section id="checkin" aria-labelledby="checkin-title" className={cn("scroll-mt-20", className)}>
      <div className="flex min-h-11 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="t-eyebrow">Check-in · {relativeDay(date, today)}</p>
          <h2 id="checkin-title" ref={titleRef} tabIndex={-1} className="t-title-2 mt-1 text-ivory outline-none">
            {isToday ? "How did you recover?" : `${shortDate(date, today)} check-in`}
          </h2>
        </div>
        {log ? <Tag kind="LOG" /> : <span className="t-meta text-ash">Not logged</span>}
      </div>
      <p className="t-meta mt-1 text-stone">Each answer saves as you tap it. Tap a chosen answer again to clear it.</p>

      <div className="@container mt-4 rounded-card bg-m1 px-4 py-4 shadow-(--e1)">
        <CheckIn date={date} sleepGoal={sleepGoal} variant="ledger" />
        <button
          type="button"
          onClick={() => setGoalOpen(true)}
          className="t-meta mt-3 inline-flex min-h-11 items-center gap-1.5 text-stone hover:text-ivory"
          aria-label={`Sleep goal ${formatHours(sleepGoal)} hours. Edit`}
        >
          Sleep goal <span className="t-num-s text-ivory">{formatHours(sleepGoal)} h</span>
          <span className="underline decoration-ui-line underline-offset-4">Edit</span>
        </button>
      </div>

      {/* volleyball sessions on this day */}
      <div className="mt-4 border-y border-vein">
        <div className="flex min-h-14 items-center justify-between gap-3">
          <span className="t-title-3 flex items-center gap-2 text-ivory">
            <VolleyballIcon className="size-4.5 text-stone" /> Volleyball sessions
          </span>
          <button type="button" onClick={() => setVbOpen(true)} className="press t-callout inline-flex min-h-11 items-center gap-1 font-semibold text-ivory">
            <Plus className="size-4" strokeWidth={1.8} aria-hidden /> Log a session
          </button>
        </div>
        {sessions.length > 0 && (
          <ul className="divide-y divide-vein border-t border-vein">
            {sessions.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="t-callout block truncate text-ivory">{describeVolleyball(r)}</span>
                  {r.notes && <span className="t-meta block truncate text-ash">{r.notes}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => removeVb(r)}
                  disabled={vbMut.remove.isPending}
                  className="press grid size-11 shrink-0 place-items-center rounded-field text-ash hover:text-cinnabar"
                  aria-label={`Remove volleyball session: ${describeVolleyball(r)}`}
                >
                  <Trash className="size-4" strokeWidth={1.6} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="t-meta pb-3 text-ash">{sessions.length ? "How long and how hard you played counts toward leg fatigue in the readiness call." : `None logged ${isToday ? "today" : "this day"}. Add how long and how hard you played; it counts toward leg fatigue.`}</p>
      </div>

      {log && (
        <button type="button" onClick={remove} disabled={del.isPending} className="t-meta mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-stone hover:text-cinnabar">
          <Trash className="size-4" strokeWidth={1.6} aria-hidden /> Delete this day&apos;s check-in
        </button>
      )}

      <SleepGoalSheet open={goalOpen} onOpenChange={setGoalOpen} current={sleepGoal} />
      <VolleyballSheet open={vbOpen} onOpenChange={setVbOpen} date={date} />
    </section>
  );
});

"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CoinMissed } from "@/components/art/icons";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { addDays, dayName, type ISODate } from "@/lib/dates";
import { describeMove, planMove, type MissedWorkout } from "@/lib/training/schedule";
import { useDayPlanWrites, type useTrainingWeek } from "../hooks";

type Week = ReturnType<typeof useTrainingWeek>;

/**
 * A workout that went unlogged (§3.4.1 item 8): one quiet row — "Pull B wasn't logged · Move it"
 * — that opens to Today / Tomorrow / Skip. Never a caution colour. A move that would replace
 * another workout asks again before it writes.
 */
export function MissedRow({ week, missed, className }: { week: Week; missed: MissedWorkout; className?: string }) {
  const { today } = week;
  const id = useId();
  const [open, setOpen] = useState(false);
  const { apply, pending } = useDayPlanWrites();
  const [confirm, setConfirm] = useState<ISODate | null>(null);
  const names = Object.fromEntries(week.templates.map((t) => [t.key, t.name]));
  const moveTo = (to: ISODate) => planMove({ from: missed.date, to, fromKey: missed.key, toKey: week.resolve(to).key, today });
  const go = async (to: ISODate) => {
    if (pending) return;
    const m = moveTo(to);
    if (m.kind === "replace" && confirm !== to) return setConfirm(to);
    if (await apply({ writes: m.writes, message: describeMove(m, names, today) })) {
      setConfirm(null);
      setOpen(false);
    }
  };
  const skip = () =>
    apply({ writes: [{ plan_date: missed.date, template_key: "rest", reason: "rest", moved_from: null }], message: `${missed.name} skipped. Your week moves on.` });
  const others = week.missed.length - 1;
  const todayTaken = week.sessions.some((s) => s.local_date === today && (s.status === "done" || s.status === "active"));
  const when = missed.date === addDays(today, -1) ? "yesterday" : dayName(missed.date);

  return (
    <section className={cn("border-y border-vein", className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="press-soft flex min-h-14 w-full items-center gap-3 py-2 text-left">
        <CoinMissed className="size-6 text-ui-line" />
        <span className="t-callout min-w-0 flex-1 text-stone">
          <span className="text-ivory">{missed.name}</span> wasn&apos;t logged {when}
          {missed.doneInstead ? ` (you did ${missed.doneInstead})` : ""} · <span className="text-ivory">Move it</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-ash transition-transform duration-(--dur-base)", open && "rotate-180")} strokeWidth={1.6} aria-hidden />
      </button>
      <Collapse open={open} id={id} className="pb-3">
        {others > 0 && (
          <p className="t-meta mb-2 text-ash">
            {others === 1 ? "One more session" : `${others} more sessions`} from this week went unlogged. Tap its day in the temple to move it.
          </p>
        )}
        {confirm && <p className="t-callout mb-2 rounded-field bg-m3 px-3.5 py-2.5 text-stone">{describeMove(moveTo(confirm), names, today)} Tap again to confirm.</p>}
        <div className={cn("grid gap-2", todayTaken ? "grid-cols-2" : "grid-cols-3")}>
          {!todayTaken && (
            <Button variant={confirm === today ? "outline" : "secondary"} size="sm" disabled={pending} onClick={() => go(today)}>
              {confirm === today ? "Confirm" : "Today"}
            </Button>
          )}
          <Button variant={confirm === addDays(today, 1) ? "outline" : "secondary"} size="sm" disabled={pending} onClick={() => go(addDays(today, 1))}>
            {confirm === addDays(today, 1) ? "Confirm" : "Tomorrow"}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={skip}>
            Skip it
          </Button>
        </div>
      </Collapse>
    </section>
  );
}

"use client";

import Link from "next/link";
import { ChevronRight, Trash, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Confirm, Sheet } from "@/components/ui/sheet";
import { dayName, monthName, parseISODate } from "@/lib/dates";
import type { Session, SetRow } from "@/lib/data/training";
import { useSessionDetail } from "@/lib/data/workout";
import { sessionVolume } from "@/lib/training/volume";
import type { WeightUnit } from "@/lib/units";
import { fmtLoadValue, fmtSessionMinutes, fmtVolume, plural } from "./format";
import { MODE_LABEL, useSessionDelete } from "./hooks";

/**
 * One finished workout from History (docs/DESIGN-V3-SIMPLE.md §4.3.10): its stored name, the date,
 * time, total lifted and sets, then every logged set grouped by lift, with "New best" on records.
 * "See workout" opens its summary; Delete asks first and can be undone.
 */
export function SessionSheet({ session, open, onOpenChange, prSetIds, unit }: { session: Session | null; open: boolean; onOpenChange: (o: boolean) => void; prSetIds: Set<string>; unit: WeightUnit }) {
  const [confirm, setConfirm] = useState(false);
  const { del, pending } = useSessionDelete();
  const date = session ? `${dayName(session.local_date)} ${parseISODate(session.local_date).getDate()} ${monthName(session.local_date)}` : "";
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={
          <span data-history="" data-budget-name="">
            {session?.name ?? "Workout"}
          </span>
        }
        description={date}
        footer={
          session ? (
            <div className="flex items-center gap-3">
              <Button variant="destructive" size="lg" onClick={() => setConfirm(true)} disabled={pending} className="shrink-0" aria-label="Delete this workout">
                <Trash aria-hidden />
                Delete
              </Button>
              <Button variant="secondary" size="lg" block asChild>
                <Link href={`/workout/${session.id}`}>See workout</Link>
              </Button>
            </div>
          ) : undefined
        }
      >
        {session && <SessionBody session={session} prSetIds={prSetIds} unit={unit} />}
      </Sheet>
      {session && (
        <Confirm
          open={confirm}
          onOpenChange={setConfirm}
          title={`Delete ${session.name}?`}
          body={`${date}. Its sets stop counting toward history, charts and bests. You can undo right after.`}
          confirmLabel="Delete"
          onConfirm={async () => {
            if (await del(session)) onOpenChange(false);
          }}
        />
      )}
    </>
  );
}

function SessionBody({ session, prSetIds, unit }: { session: Session; prSetIds: Set<string>; unit: WeightUnit }) {
  const q = useSessionDetail(session.id);
  const groups = useMemo(() => {
    const sets = (q.data?.sets ?? []).filter((s) => s.completed && s.kind !== "warmup");
    const by = new Map<string, { slug: string; name: string; sets: SetRow[] }>();
    for (const s of sets) {
      const k = `${s.exercise_order}|${s.exercise_slug}`;
      if (!by.has(k)) by.set(k, { slug: s.exercise_slug, name: s.exercise_name, sets: [] });
      by.get(k)!.sets.push(s);
    }
    return [...by.values()];
  }, [q.data]);
  const totals = useMemo(() => sessionVolume(q.data?.sets ?? []), [q.data]);
  const volume = Number(session.total_volume_lb) > 0 ? Number(session.total_volume_lb) : totals.volumeLb;
  const setsDone = session.sets_completed > 0 ? session.sets_completed : totals.sets;
  const facts = [fmtSessionMinutes(session.duration_sec), volume > 0 ? `${fmtVolume(volume, unit)} lifted` : null, plural(setsDone, "set"), session.mode !== "standard" ? MODE_LABEL[session.mode as keyof typeof MODE_LABEL] : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-4 pb-2">
      <p className="t-label">{facts}</p>
      {session.notes && <p className="t-body text-fg">&ldquo;{session.notes}&rdquo;</p>}
      {q.isLoading ? (
        <Skeleton className="h-[260px] rounded-tile-lg" />
      ) : q.error ? (
        <ErrorNote onRetry={() => q.refetch()} />
      ) : groups.length === 0 ? (
        <p className="t-body py-4 text-center text-fg-2">No sets were logged in this workout.</p>
      ) : (
        groups.map((g) => (
          <section key={g.slug + g.name} className="overflow-hidden rounded-tile-lg bg-surface">
            <Link href={`/training/exercise/${encodeURIComponent(g.slug)}`} className="press-soft flex min-h-14 items-center justify-between gap-3 px-4">
              <span className="t-row truncate" data-history="" data-budget-name="">
                {g.name}
              </span>
              <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
            </Link>
            <ol data-budget-group="">
              {g.sets.map((s, i) => {
                const pr = prSetIds.has(s.id);
                const work = s.target_unit === "sec" ? `${s.duration_sec ?? s.reps ?? 0} s` : `${s.reps ?? 0}${s.target_unit === "each" ? " each side" : ""}`;
                const load = s.weight_lb != null && Number(s.weight_lb) > 0 ? `${fmtLoadValue(Number(s.weight_lb), unit)} × ` : "";
                return (
                  <li key={s.id} className="flex min-h-11 items-center gap-3 border-t border-line px-4 py-2">
                    <span className="t-label w-5 shrink-0 tabular-nums">{i + 1}</span>
                    <span className="t-row flex-1 tabular-nums">
                      {load}
                      {work}
                    </span>
                    {s.rir != null && <span className="t-label">{Number(s.rir) === 0 ? "to failure" : `${Number(s.rir)} left`}</span>}
                    {pr && (
                      <span className="t-label inline-flex items-center gap-1 font-semibold text-gold">
                        <Trophy className="size-4" strokeWidth={2.2} aria-hidden />
                        New best
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            {g.sets.some((s) => s.notes) && (
              <div className="t-label border-t border-line px-4 py-3">
                {g.sets
                  .filter((s) => s.notes)
                  .map((s) => (
                    <p key={s.id}>
                      Set {g.sets.indexOf(s) + 1}: {s.notes}
                    </p>
                  ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

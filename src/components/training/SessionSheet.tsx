"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Trash } from "lucide-react";
import { PRBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Confirm, Sheet } from "@/components/ui/sheet";
import { longDate } from "@/lib/dates";
import type { Session, SetRow } from "@/lib/data/training";
import { useSessionDetail } from "@/lib/data/workout";
import { sessionVolume } from "@/lib/training/volume";
import type { WeightUnit } from "@/lib/units";
import { fmtLoadValue, fmtSessionMinutes, fmtVolume, plural } from "./format";
import { MODE_LABEL, useSessionDelete } from "./hooks";

/** Every set of one finished session, grouped by exercise, with PR markers. */
export function SessionSheet({
  session,
  open,
  onOpenChange,
  prSetIds,
  unit,
}: {
  session: Session | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prSetIds: Set<string>;
  unit: WeightUnit;
}) {
  const [confirm, setConfirm] = useState(false);
  const { del, pending } = useSessionDelete();
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={session?.name ?? "Session"}
        description={session ? longDate(session.local_date) : undefined}
        footer={
          session ? (
            <div className="flex items-center gap-3">
              <Button variant="destructive" onClick={() => setConfirm(true)} disabled={pending} className="shrink-0">
                <Trash className="size-4" />
                Delete
              </Button>
              <Button variant="secondary" block asChild>
                <Link href={`/workout/${session.id}`}>Open session</Link>
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
          body={`${longDate(session.local_date)}. Its sets stop counting toward history, charts and records. You can undo right after.`}
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

  return (
    <div className="space-y-5 pt-1">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Time" value={fmtSessionMinutes(session.duration_sec)} />
        <Tile label="Volume" value={fmtVolume(volume, unit)} />
        <Tile label="Sets" value={String(setsDone)} />
      </div>
      {(session.mode !== "standard" || session.notes || session.session_rpe) && (
        <div className="space-y-1 text-[13px] text-fg-2">
          {session.mode !== "standard" && <p>Mode: {MODE_LABEL[session.mode as keyof typeof MODE_LABEL] ?? session.mode}</p>}
          {session.session_rpe && <p>Session effort {session.session_rpe}/10</p>}
          {session.notes && <p className="text-fg">“{session.notes}”</p>}
        </div>
      )}

      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : q.error ? (
        <ErrorNote onRetry={() => q.refetch()}>Couldn&apos;t load the sets.</ErrorNote>
      ) : groups.length === 0 ? (
        <p className="rounded-[14px] bg-s3 px-4 py-5 text-center text-[13px] text-fg-2">No completed sets were logged in this session.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.slug + g.name} className="overflow-hidden rounded-[14px] bg-s3">
              <Link href={`/training/exercise/${encodeURIComponent(g.slug)}`} className="flex min-h-12 items-center justify-between gap-3 px-3.5 pt-1 hover:text-gold-200">
                <span className="t-h3 truncate text-[15px]">{g.name}</span>
                <ChevronRight className="size-4 shrink-0 text-fg-3" />
              </Link>
              <ol className="px-3.5 pb-3">
                {g.sets.map((s, i) => {
                  const pr = prSetIds.has(s.id);
                  const work = s.target_unit === "sec" ? `${s.duration_sec ?? s.reps ?? 0} s` : `${s.reps ?? 0}${s.target_unit === "each" ? " each" : ""}`;
                  return (
                    <li key={s.id} className="flex min-h-9 items-center gap-3 border-t border-line-hair py-1.5 first:border-t-0">
                      <span className="num w-5 shrink-0 text-[13px] text-fg-3">{i + 1}</span>
                      <span className="num flex-1 text-[17px] font-semibold">
                        {s.weight_lb != null && Number(s.weight_lb) > 0 ? (
                          <>
                            {fmtLoadValue(Number(s.weight_lb), unit)}
                            <span className="unit">{unit}</span>
                            <span className="mx-1.5 text-fg-3">×</span>
                          </>
                        ) : null}
                        {work}
                      </span>
                      {s.rir != null && <span className="text-[12px] font-semibold text-fg-3">RIR {Number(s.rir)}</span>}
                      {pr && <PRBadge />}
                    </li>
                  );
                })}
              </ol>
              {g.sets.some((s) => s.notes) && (
                <div className="space-y-1 border-t border-line-hair px-3.5 py-2.5 text-[13px] text-fg-2">
                  {g.sets
                    .filter((s) => s.notes)
                    .map((s) => (
                      <p key={s.id}>
                        <span className="text-fg-3">Set {g.sets.indexOf(s) + 1}: </span>
                        {s.notes}
                      </p>
                    ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {groups.length > 0 && <p className="text-center text-[12px] text-fg-3">{plural(groups.length, "exercise")} · warm-ups not shown</p>}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-s3 px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 truncate text-[20px] font-semibold">{value}</p>
    </div>
  );
}

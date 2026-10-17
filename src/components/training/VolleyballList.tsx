"use client";

import { useEffect, useRef, useState } from "react";
import { Trash } from "lucide-react";
import { toast } from "sonner";
import { Volleyball as BallIcon } from "@/components/art/icons";
import { cn } from "@/lib/cn";
import { relativeDay, type ISODate } from "@/lib/dates";
import type { Volleyball } from "@/lib/data/training";
import { useVolleyballLog, vbKindLabel } from "./hooks";

const order = (a: Volleyball, b: Volleyball) =>
  b.local_date.localeCompare(a.local_date) ||
  b.created_at.localeCompare(a.created_at);

/**
 * Volleyball sessions with delete. A deleted row stays in place as "Deleted · Undo" for 6 s,
 * so Undo works without leaving the sheet (the toast offers it too).
 */
export function VolleyballList({
  rows,
  today,
  title,
  withDate = false,
  limit,
}: {
  rows: Volleyball[];
  today: ISODate;
  /** Eyebrow above the list. The block stays mounted while a deleted row can still be undone. */
  title?: string;
  withDate?: boolean;
  limit?: number;
}) {
  const { del, restore } = useVolleyballLog();
  const [removed, setRemoved] = useState<Volleyball[]>([]);
  const toastIds = useRef(new Map<string, string>());
  // Rows being put back: their delete button waits until the restore lands.
  const [restoring, setRestoring] = useState<string[]>([]);

  useEffect(() => {
    if (!removed.length) return;
    const t = window.setTimeout(() => setRemoved([]), 6000);
    return () => window.clearTimeout(t);
  }, [removed]);

  const drop = (id: string) =>
    setRemoved((rs) => rs.filter((r) => r.id !== id));
  const onDelete = async (v: Volleyball) => {
    if (removed.some((r) => r.id === v.id)) return;
    setRemoved((rs) => [...rs, v]);
    const toastId = await del(v, { onUndone: () => drop(v.id) });
    if (toastId) toastIds.current.set(v.id, toastId);
    else drop(v.id);
  };
  const onUndo = async (v: Volleyball) => {
    drop(v.id);
    const t = toastIds.current.get(v.id);
    if (t) toast.dismiss(t);
    toastIds.current.delete(v.id);
    setRestoring((ids) => [...ids, v.id]);
    await restore(v);
    setRestoring((ids) => ids.filter((x) => x !== v.id));
  };

  const live = new Set(rows.map((r) => r.id));
  const list = [...rows, ...removed.filter((r) => !live.has(r.id))]
    .sort(order)
    .slice(0, limit ?? Infinity);
  if (!list.length) return null;

  return (
    <div>
      {title && <p className="t-eyebrow mb-1 flex min-h-8 items-center">{title}</p>}
      <ul className="divide-y divide-vein border-y border-vein">
        {list.map((v) => {
          const gone = !live.has(v.id);
          const label = `${vbKindLabel(v.kind)}${withDate ? ` · ${relativeDay(v.local_date, today)}` : ""}`;
          const detail =
            [
              v.duration_min ? `${v.duration_min} min` : null,
              v.intensity ? `Intensity ${v.intensity}/5` : null,
              v.notes,
            ]
              .filter(Boolean)
              .join(" · ") || "No details";
          return (
            <li key={v.id} className="flex min-h-14 items-center gap-3">
              <BallIcon className={cn("size-5 shrink-0", gone ? "text-disabled" : "text-stone")} />
              <div className="min-w-0 flex-1">
                <p className={cn("t-title-3 truncate", gone ? "text-ash" : "text-ivory")}>{gone ? `Deleted · ${label}` : label}</p>
                {!gone && <p className="t-meta truncate text-stone">{detail}</p>}
              </div>
              {gone ? (
                <button
                  type="button"
                  onClick={() => onUndo(v)}
                  className="press t-key -mr-1 inline-flex h-11 shrink-0 items-center px-3 text-ivory"
                >
                  Undo
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onDelete(v)}
                  disabled={restoring.includes(v.id)}
                  aria-label={`Delete ${vbKindLabel(v.kind)} on ${relativeDay(v.local_date, today)}`}
                  className="press -mr-2 grid size-11 shrink-0 place-items-center text-ash hover:text-cinnabar disabled:opacity-40"
                >
                  <Trash className="size-5" strokeWidth={1.6} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

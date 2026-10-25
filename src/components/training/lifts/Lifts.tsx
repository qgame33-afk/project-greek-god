"use client";

import { Dumbbell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { ListGroup, Row } from "@/components/ui/list";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { getExercise } from "@/lib/training/library";
import { formatLoad } from "@/lib/units";
import { LibraryPicker, SearchField } from "../LibraryPicker";
import { Caption } from "../parts";
import { useAllSetHistory, useCustomExercises, useUnits } from "../hooks";

interface LiftRow {
  slug: string;
  name: string;
  last: string;
  best: { w: number | null; r: number | null };
  /** Best-set load (or reps) minus the first session's top; null with one session. */
  change: number | null;
  bodyweight: boolean;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ");
const e1 = (w: number, r: number) => w * (1 + r / 30);

/**
 * Lifts (§4.3.10): a search field and every lift he has logged, newest first: "Incline Dumbbell
 * Press · Best 70 × 10 · +10 lb" (the change since his first logged session) → exercise detail.
 * A last row "All exercises" opens the library with its region filter.
 */
export function Lifts() {
  const q = useAllSetHistory();
  const custom = useCustomExercises();
  const { unit } = useUnits();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const deferred = useDeferredValue(query);

  const rows = useMemo<LiftRow[]>(() => {
    const by = new Map<string, { sets: { d: string; w: number | null; r: number | null }[] }>();
    for (const s of q.data ?? []) {
      if (!s.exercise_slug || !s.local_date) continue;
      const x = by.get(s.exercise_slug) ?? { sets: [] };
      x.sets.push({ d: s.local_date, w: s.weight_lb == null ? null : Number(s.weight_lb), r: s.reps });
      by.set(s.exercise_slug, x);
    }
    const names = new Map((custom.data ?? []).map((c) => [c.slug, c.name]));
    const out: LiftRow[] = [];
    for (const [slug, { sets }] of by) {
      const lib = getExercise(slug);
      if (lib?.retired) continue;
      const weighted = sets.some((s) => (s.w ?? 0) > 0);
      const score = (s: { w: number | null; r: number | null }) => (weighted ? e1(s.w ?? 0, s.r ?? 0) : (s.r ?? 0));
      const best = sets.reduce((a, b) => (score(b) > score(a) ? b : a));
      const firstDay = sets.reduce((a, b) => (b.d < a.d ? b : a)).d;
      const lastDay = sets.reduce((a, b) => (b.d > a.d ? b : a)).d;
      const firstTop = sets.filter((s) => s.d === firstDay).reduce((a, b) => (score(b) > score(a) ? b : a));
      const change = firstDay === lastDay ? null : weighted ? (best.w ?? 0) - (firstTop.w ?? 0) : (best.r ?? 0) - (firstTop.r ?? 0);
      out.push({ slug, name: lib?.name ?? names.get(slug) ?? slug, last: lastDay, best: { w: best.w, r: best.r }, change, bodyweight: !weighted });
    }
    return out.sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
  }, [q.data, custom.data]);

  const t = norm(deferred.trim());
  const shown = t ? rows.filter((r) => t.split(/\s+/).every((w) => norm(`${r.name} ${r.slug}`).includes(w))) : rows;
  const fmtChange = (r: LiftRow) => {
    if (r.change == null) return "New";
    if (r.bodyweight) return `${r.change > 0 ? "+" : r.change < 0 ? "−" : ""}${Math.abs(r.change)} ${Math.abs(r.change) === 1 ? "rep" : "reps"}`;
    const v = formatLoad(Math.abs(r.change), unit);
    return r.change === 0 ? `0 ${unit}` : `${r.change > 0 ? "+" : "−"}${v}`;
  };
  const bestText = (r: LiftRow) => (r.bodyweight ? `Best ${r.best.r ?? "—"} reps` : `Best ${formatLoad(r.best.w, unit, false)} × ${r.best.r ?? "—"}`);

  return (
    <div>
      <SearchField value={query} onChange={setQuery} placeholder="Search lifts" label="Search lifts" />
      <div className="mt-4">
        {q.isPending && q.fetchStatus === "paused" ? (
          <ErrorNote onRetry={() => q.refetch()}>You&apos;re offline. Your lifts show when you&apos;re back.</ErrorNote>
        ) : q.isPending ? (
          <Skeleton className="h-[480px] rounded-tile-lg" />
        ) : q.error ? (
          <ErrorNote onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <Empty title="No lifts yet.">Your first workout fills this.</Empty>
        ) : (
          <>
            {shown.length > 0 ? (
              <ListGroup>
                {shown.map((r) => (
                  <Row key={r.slug} title={r.name} dataName subtitle={bestText(r)} value={fmtChange(r)} href={`/training/exercise/${encodeURIComponent(r.slug)}`} ariaLabel={`${r.name}, ${bestText(r).replace("×", "by")}, ${fmtChange(r) === "New" ? "new" : `${fmtChange(r)} since your first session`}`} />
                ))}
              </ListGroup>
            ) : (
              <p className="t-body py-6 text-center text-fg-2">Nothing matches &ldquo;{deferred}&rdquo;.</p>
            )}
            <Caption>Change since your first logged set.</Caption>
          </>
        )}
        <ListGroup className="mt-5">
          <Row icon={Dumbbell} title="All exercises" onClick={() => setAll(true)} />
        </ListGroup>
      </div>
      <LibraryPicker
        open={all}
        onOpenChange={setAll}
        title="All exercises"
        onPick={(e) => {
          setAll(false);
          router.push(`/training/exercise/${encodeURIComponent(e.slug)}`);
        }}
      />
    </div>
  );
}

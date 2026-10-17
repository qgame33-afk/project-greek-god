"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { RecordMark } from "@/components/ui/record-mark";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import type { AthleticTest } from "@/lib/data/body";

import { dayMonth } from "@/lib/progress/pace";
import { TEST_BY_KEY, prIds, sprintDistances, testPR, testSeries, type TestType } from "@/lib/progress/athletic";
import { useAthleticWrite } from "@/lib/progress/hooks";
import { round, toDisplayLength, type LengthUnit } from "@/lib/units";
import { HistoryChart } from "../charts/HistoryChart";
import { BenchmarkBadge, RowMenu, SrTable, StatTile } from "../kit";

/**
 * One athletic test's history (the old test detail, on the Olympus system): latest and best,
 * the results over time with records marked, and every result with ⋯ to delete (with Undo).
 */
export function TestSheet({ type, tests, unit, onClose, onLog }: { type: TestType | null; tests: AthleticTest[]; unit: LengthUnit; onClose: () => void; onLog: (t: TestType) => void }) {
  const today = useToday();
  const { del } = useAthleticWrite();
  const [keep, setKeep] = useState<TestType | null>(type);
  if (type && type !== keep) setKeep(type);
  const t = type ?? keep;
  const distances = t === "sprint" ? sprintDistances(tests) : [];
  const [dist, setDist] = useState<number | null>(null);
  if (!t) return null;
  const def = TEST_BY_KEY[t];
  const d = t === "sprint" ? (dist != null && distances.includes(dist) ? dist : (distances[0] ?? null)) : null;
  const series = testSeries(tests, t, d);
  const prs = prIds(tests, t, d);
  const best = testPR(tests, t, d);
  const conv = (v: number) => (t === "sprint" ? v : toDisplayLength(v, unit));
  const u = t === "sprint" ? "s" : unit;
  const dp = t === "sprint" ? 2 : unit === "cm" ? 1 : 2;
  const points = series.map((r) => ({
    date: r.local_date,
    value: round(conv(Number(r.value)), 2),
    pr: prs.has(r.id),
  }));

  return (
    <Sheet open={!!type} onOpenChange={(o) => !o && onClose()} title={def.label} description={def.how} wide>
      <div className="grid grid-cols-1 gap-6 pb-2 pt-1">
        {t === "sprint" && distances.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Distance">
            {distances.map((x) => (
              <Chip key={x} selected={x === d} onClick={() => setDist(x)}>
                {x} m
              </Chip>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 border-y border-vein py-4">
          <StatTile
            label="Latest"
            value={series.length ? conv(Number(series.at(-1)!.value)).toFixed(dp) : "—"}
            unit={series.length ? u : undefined}
            caption={series.length ? dayMonth(series.at(-1)!.local_date, today) : undefined}
          />
          {def.better ? (
            <StatTile
              label={def.better === "lower" ? "Fastest" : "Best"}
              value={best ? conv(Number(best.value)).toFixed(dp) : "—"}
              unit={best ? u : undefined}
              caption={best ? dayMonth(best.local_date, today) : undefined}
            />
          ) : (
            <StatTile label="Entries" value={series.length} caption="A reference measurement" />
          )}
        </div>
        {points.length >= 2 ? (
          <div>
            <HistoryChart points={points} format={(v) => `${v.toFixed(dp)} ${u}`} invert={def.better === "lower"} decimals={t === "sprint" ? 2 : 1} />
            <SrTable
              caption={`${def.label} results`}
              head={["Date", `Result (${u})`, "Record"]}
              rows={series
                .slice(-7)
                .reverse()
                .map((r) => [dayMonth(r.local_date, today), conv(Number(r.value)).toFixed(dp), prs.has(r.id) ? "yes" : "no"])}
            />
          </div>
        ) : (
          <p className="t-callout text-stone">One result so far. Re-test in 4–6 weeks under the same conditions to see a trend.</p>
        )}

        <div>
          <div className="mb-1 flex min-h-11 items-center justify-between gap-3">
            <h3 className="t-eyebrow">Results</h3>
            <Button variant="ghost" size="sm" className="-mr-2 px-2 text-leaf-300" onClick={() => onLog(t)}>
              Log result
            </Button>
          </div>
          <ul className="divide-y divide-vein border-y border-vein">
            {[...series].reverse().map((r) => (
              <li key={r.id} className="flex min-h-14 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="t-title-3 flex items-center gap-2 text-ivory">
                    {dayMonth(r.local_date, today)}
                    {prs.has(r.id) && <RecordMark compact />}
                    {series[0]?.id === r.id && def.better && <BenchmarkBadge />}
                  </p>
                  {(r.conditions || r.notes) && <p className="t-meta truncate text-stone">{[r.conditions, r.notes].filter(Boolean).join(" · ")}</p>}
                </div>
                <span className="t-num-s tnum text-ivory">
                  {conv(Number(r.value)).toFixed(dp)}
                  <span className="t-meta ml-1 text-stone">{u}</span>
                </span>
                {!r.id.startsWith("optimistic") && <RowMenu label={`${def.label} ${dayMonth(r.local_date, today)}`} onDelete={() => del(r)} />}
              </li>
            ))}
          </ul>
        </div>
        <p className="t-meta text-stone">No projections. Jump height responds to strength, power and bodyweight in ways no chart can promise; these are your logged results only.</p>
      </div>
    </Sheet>
  );
}

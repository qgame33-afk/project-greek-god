"use client";

import { useMemo } from "react";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { useRecovery } from "@/lib/data/recovery";
import { addDays, dateRange, dayName, parseISODate, type ISODate } from "@/lib/dates";
import { storedSleep } from "@/lib/recovery/checkin";
import { ENERGY_CHIPS, LEGS_CHIPS, chipFor, sleepShort } from "@/lib/today/now";

const NIGHTS = 14;
const W = 336;
const H = 132;
const PAD_T = 10;
const PAD_B = 22;
const SLEEP_MAX = 11;

/**
 * Readiness history (docs/DESIGN-V2.md §3.7): the last 14 nights — sleep as stone bars against the
 * goal, energy as a solid ivory line and soreness as a dashed one (both 1–5). Each night is a
 * button that opens that day's check-in. Lines break where nothing was logged; nothing is filled in.
 */
export function ReadinessHistory({ today, selected, sleepGoal, onOpenDay, className }: { today: ISODate; selected: ISODate; sleepGoal: number; onOpenDay: (d: ISODate) => void; className?: string }) {
  const from = addDays(today, -(NIGHTS - 1));
  const q = useRecovery(addDays(today, -13), today);
  const days = useMemo(() => {
    const by = new Map((q.data ?? []).map((r) => [r.local_date, r]));
    return dateRange(from, today).map((d) => {
      const r = by.get(d);
      return { date: d, sleep: storedSleep(r?.sleep_hours), energy: r?.energy ?? null, soreness: r?.soreness ?? null };
    });
  }, [q.data, from, today]);

  const step = W / NIGHTS;
  const x = (i: number) => i * step + step / 2;
  const plotH = H - PAD_T - PAD_B;
  const ySleep = (h: number) => PAD_T + plotH * (1 - Math.min(h, SLEEP_MAX) / SLEEP_MAX);
  const yScale = (v: number) => PAD_T + plotH * (1 - (v - 1) / 4) * 0.86 + plotH * 0.07;
  const path = (key: "energy" | "soreness") => {
    let d = "";
    let pen = false;
    days.forEach((n, i) => {
      const v = n[key];
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${yScale(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const logged = days.filter((d) => d.sleep != null || d.energy != null || d.soreness != null).length;

  return (
    <section aria-labelledby="history-title" className={className}>
      <div className="mb-3 flex min-h-11 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="t-eyebrow">Readiness history</p>
          <h2 id="history-title" className="t-title-2 mt-1 text-ivory">
            Last 14 nights
          </h2>
        </div>
        <span className="t-meta tnum pb-1 text-stone">{logged} of 14 logged</span>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-[132px] w-full" />
      ) : q.error && !q.data ? (
        <ErrorNote onRetry={() => void q.refetch()}>Couldn&apos;t load your check-ins.</ErrorNote>
      ) : (
        <>
          <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Sleep, energy and soreness for the last 14 nights. ${logged} of 14 logged. The table below has every value.`}>
            {days.map((n, i) => n.date === selected && <rect key="sel" x={i * step + 1} y={2} width={step - 2} height={H - PAD_B + 2} rx={6} style={{ fill: "var(--m2)" }} />)}
            {/* sleep goal */}
            <line x1={0} x2={W} y1={ySleep(sleepGoal)} y2={ySleep(sleepGoal)} strokeDasharray="3 4" strokeWidth={1} style={{ stroke: "var(--ui-line)" }} />
            {days.map((n, i) => (
              <g key={n.date}>
                {n.sleep != null && (
                  <rect
                    x={x(i) - step * 0.26}
                    y={ySleep(n.sleep)}
                    width={step * 0.52}
                    height={Math.max(1, PAD_T + plotH - ySleep(n.sleep))}
                    rx={2}
                    style={{ fill: "var(--stone)", opacity: 0.55 }}
                  />
                )}
                <text x={x(i)} y={H - 6} textAnchor="middle" style={{ fill: n.date === today ? "var(--ivory)" : "var(--ash)", fontSize: 11, fontWeight: 600 }}>
                  {dayName(n.date).slice(0, 1)}
                </text>
              </g>
            ))}
            <path d={path("soreness")} fill="none" strokeWidth={1.6} strokeDasharray="4 3" strokeLinecap="round" style={{ stroke: "var(--ash)" }} />
            <path d={path("energy")} fill="none" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--ivory)" }} />
            <text x={2} y={ySleep(sleepGoal) - 4} textAnchor="start" className="tnum" style={{ fill: "var(--ash)", fontSize: 11, paintOrder: "stroke", stroke: "var(--night)", strokeWidth: 3 }}>
              goal {sleepShort(sleepGoal)}
            </text>
            {days.map((n, i) => (
              <g key={`p${n.date}`}>
                {n.soreness != null && <circle cx={x(i)} cy={yScale(n.soreness)} r={2.6} style={{ fill: "var(--night)", stroke: "var(--ash)" }} strokeWidth={1.4} />}
                {n.energy != null && <circle cx={x(i)} cy={yScale(n.energy)} r={2.6} style={{ fill: "var(--ivory)" }} />}
              </g>
            ))}
          </svg>
          {/* each night opens its check-in */}
          <div className="absolute inset-0 grid grid-cols-14" role="group" aria-label="Open a night's check-in">
            {days.map((n) => (
              <button
                key={n.date}
                type="button"
                onClick={() => onOpenDay(n.date)}
                aria-label={`${dayName(n.date)} ${parseISODate(n.date).getDate()}: sleep ${sleepShort(n.sleep)}, energy ${chipFor(ENERGY_CHIPS, n.energy) ?? "not logged"}, legs ${chipFor(LEGS_CHIPS, n.soreness) ?? "not logged"}. Open`}
                aria-pressed={n.date === selected}
                className="min-h-11 rounded-field"
              />
            ))}
          </div>
          </div>
          <div className="t-meta mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-stone" aria-hidden>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-2 rounded-sm bg-stone/55" /> Sleep
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-ivory" /> Energy
            </span>
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 16 2" className="h-0.5 w-4">
                <line x1="0" y1="1" x2="16" y2="1" strokeDasharray="4 3" strokeWidth="2" style={{ stroke: "var(--ash)" }} />
              </svg>
              Legs (soreness)
            </span>
          </div>
          <table className="sr-only">
            <caption>Last 14 nights</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Sleep</th>
                <th>Energy</th>
                <th>Legs</th>
              </tr>
            </thead>
            <tbody>
              {days.map((n) => (
                <tr key={n.date}>
                  <td>{n.date}</td>
                  <td>{sleepShort(n.sleep)}</td>
                  <td>{chipFor(ENERGY_CHIPS, n.energy) ?? "—"}</td>
                  <td>{chipFor(LEGS_CHIPS, n.soreness) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

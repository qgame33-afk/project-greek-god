"use client";

import { useMemo } from "react";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { useRecovery } from "@/lib/data/recovery";
import { addDays, dateRange, dayName, parseISODate, type ISODate } from "@/lib/dates";
import { storedSleep } from "@/lib/recovery/checkin";
import { ENERGY, SORENESS, sleepWords, wordFor } from "@/components/now/CheckIn";

const NIGHTS = 14;
const W = 336;
const H = 132;
const PAD_T = 10;
const PAD_B = 22;
const SLEEP_MAX = 11;

/**
 * The last 14 nights (Check-ins › Sleep, docs/DESIGN-V3-SIMPLE.md §4.6): sleep as grey bars against
 * the goal, energy as a solid white line and soreness as a dashed one (both 1–5). Each night is a
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
    <section aria-label="Last 14 nights" className={className}>
      <p className="t-label mb-3">{logged} of 14 nights logged · tap a night to open it</p>
      {q.isLoading ? (
        <Skeleton className="h-[132px] w-full rounded-tile-lg" />
      ) : q.error && !q.data ? (
        <ErrorNote onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="relative" data-budget-group="">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Sleep, energy and soreness for the last 14 nights. ${logged} of 14 logged. The table below has every value.`}>
            {days.map((n, i) => n.date === selected && <rect key="sel" x={i * step + 1} y={2} width={step - 2} height={H - PAD_B + 2} rx={6} style={{ fill: "var(--card-2)" }} />)}
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
                    style={{ fill: "var(--text-2)", opacity: 0.55 }}
                  />
                )}
                <text x={x(i)} y={H - 6} textAnchor="middle" style={{ fill: n.date === today ? "var(--text)" : "var(--text-2)", fontSize: 11, fontWeight: 600 }}>
                  {dayName(n.date).slice(0, 1)}
                </text>
              </g>
            ))}
            <path d={path("soreness")} fill="none" strokeWidth={1.6} strokeDasharray="4 3" strokeLinecap="round" style={{ stroke: "var(--text-2)" }} />
            <path d={path("energy")} fill="none" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--text)" }} />
            {days.map((n, i) => (
              <g key={`p${n.date}`}>
                {n.soreness != null && <circle cx={x(i)} cy={yScale(n.soreness)} r={2.6} style={{ fill: "var(--bg)", stroke: "var(--text-2)" }} strokeWidth={1.4} />}
                {n.energy != null && <circle cx={x(i)} cy={yScale(n.energy)} r={2.6} style={{ fill: "var(--text)" }} />}
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
                aria-label={`${dayName(n.date)} ${parseISODate(n.date).getDate()}: sleep ${sleepWords(n.sleep)}, energy ${wordFor(ENERGY, n.energy) ?? "not logged"}, soreness ${wordFor(SORENESS, n.soreness) ?? "not logged"}. Open`}
                aria-pressed={n.date === selected}
                className="min-h-11 rounded-tile"
              />
            ))}
          </div>
          </div>
          <div className="t-cap mt-3 flex flex-wrap items-center gap-x-4 gap-y-1" aria-hidden data-budget-group="">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-2 rounded-sm bg-fg-2 opacity-55" /> Sleep
            </span>
            {/* the goal is named here, not in the plot, where the lines would cross it */}
            <span className="flex items-center gap-1.5 tnum">
              <svg viewBox="0 0 16 2" className="h-0.5 w-4">
                <line x1="0" y1="1" x2="16" y2="1" strokeDasharray="3 4" strokeWidth="2" style={{ stroke: "var(--ui-line)" }} />
              </svg>
              Goal {sleepWords(sleepGoal)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-fg" /> Energy
            </span>
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 16 2" className="h-0.5 w-4">
                <line x1="0" y1="1" x2="16" y2="1" strokeDasharray="4 3" strokeWidth="2" style={{ stroke: "var(--text-2)" }} />
              </svg>
              Soreness
            </span>
          </div>
          <div className="sr-only">
            <table>
              <caption>Last 14 nights</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sleep</th>
                  <th>Energy</th>
                  <th>Soreness</th>
                </tr>
              </thead>
              <tbody>
                {days.map((n) => (
                  <tr key={n.date}>
                    <td>{n.date}</td>
                    <td>{sleepWords(n.sleep)}</td>
                    <td>{wordFor(ENERGY, n.energy) ?? "—"}</td>
                    <td>{wordFor(SORENESS, n.soreness) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

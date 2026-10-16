"use client";

import { useEffect, useRef, useState } from "react";
import type { WeighIn } from "@/lib/bodyweight";
import { shortDate, type ISODate } from "@/lib/dates";
import { sparkSeries } from "@/lib/today/spark";
import { formatBodyweight, type WeightUnit } from "@/lib/units";

const H = 56;
const DAYS = 28;

/** Last 28 days: logged weigh-ins (marble dots) and the 7-day average (gold line). */
export function WeightSpark({ weights, today, unit }: { weights: WeighIn[]; today: ISODate; unit: WeightUnit }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const s = sparkSeries(weights, today, DAYS, Math.max(1, w - 8), H, 7);
  const has = s != null;
  // Re-attach when the series appears (e.g. the second-ever weigh-in arrives while mounted).
  useEffect(() => {
    const el = box.current;
    if (!has || !el) return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [has]);

  if (!s) return null;
  const last = s.avg.at(-1);
  const recent = s.dots.slice(-7);

  return (
    <figure className="m-0 mb-5">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">Last {DAYS} days</span>
        <span className="flex items-center gap-3 text-[11px] font-semibold text-fg-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-marble/60" aria-hidden />
            Weigh-ins
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[2px] w-3 rounded-full bg-gold-400" aria-hidden />
            7-day avg
          </span>
        </span>
      </figcaption>
      <div ref={box} className="relative mt-2" style={{ height: H }} aria-hidden>
        {w > 0 && (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="absolute inset-0 overflow-visible">
            <line x1={0} x2={w} y1={7} y2={7} stroke="rgb(255 255 255 / .05)" strokeDasharray="2 4" />
            <line x1={0} x2={w} y1={H - 7} y2={H - 7} stroke="rgb(255 255 255 / .05)" strokeDasharray="2 4" />
            <g transform="translate(4 0)">
              {s.dots.map((d) => (
                <circle key={d.date} cx={d.x} cy={d.y} r={2.25} fill="var(--s-marble)" fillOpacity={0.55} />
              ))}
              {s.avgPath && <path d={s.avgPath} fill="none" stroke="var(--gold-400)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
              {last && <circle cx={last.x} cy={last.y} r={3.5} fill="var(--gold-50)" stroke="var(--gold-400)" strokeWidth={1.5} />}
            </g>
          </svg>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-3" aria-hidden>
        <span>{shortDate(s.from, today)}</span>
        <span className="num normal-case tracking-normal">
          {formatBodyweight(s.min, unit, false)}–{formatBodyweight(s.max, unit)}
        </span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>Last {recent.length} weigh-ins</caption>
        <tbody>
          {recent.map((d) => (
            <tr key={d.date}>
              <th scope="row">{shortDate(d.date, today)}</th>
              <td>{formatBodyweight(d.lb, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

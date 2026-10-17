"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { TempleGlyph } from "@/components/art/icons";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import type { ISODate } from "@/lib/dates";
import { insetGeometry, mountainGeometry, type MountainGeometry, type MountainInput, type Zoom } from "@/lib/progress/mountain";
import type { Pace, Terrace } from "@/lib/progress/pace";
import type { WeightUnit } from "@/lib/units";

export interface MountainChartProps {
  zoom: Zoom;
  today: ISODate;
  start: { date: ISODate; lb: number };
  target: ISODate | null;
  weighIns: { date: ISODate; lb: number }[];
  series: { date: ISODate; lb: number }[];
  pace: Pace;
  terraces: Terrace[];
  unit: WeightUnit;
  /** A terrace being celebrated (the Terrace moment): its contour inscribes and the climber travels to it. */
  celebrate?: { lb: number; fromLb: number } | null;
  className?: string;
}

/** Content width under which the AX layout applies (matches the app's @max-[19rem] rule). */
const AX_REM = 19;

/* Inscribe (stroke-dashoffset) on first show; the Terrace moment's climb (transform only).
   Reduced motion collapses both to their end state (globals.css). */
const CHART_CSS = `
.mtn-inscribe { stroke-dashoffset: 0; animation: inscribe-draw var(--dur-inscribe) var(--ease-out) var(--mtn-delay, 0ms) both; }
.mtn-climb { animation: mtn-climb 800ms var(--ease-gold) both; }
@keyframes mtn-climb { from { transform: translateY(var(--mtn-from, 0px)); } to { transform: none; } }
`;

/**
 * The Mountain (docs/DESIGN-V2.md §3.6.1): history, corridor, projection, the Olympus band,
 * terraces and the climber on one honest SVG. Geometry comes from lib/progress/mountain.ts
 * (tested); this component only draws it. Colours read CSS variables; nothing is hard-coded.
 */
export function MountainChart(props: MountainChartProps) {
  const { zoom, pace, unit, celebrate, className } = props;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; root: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const w = Math.round(el.getBoundingClientRect().width);
      setSize((s) => (s && s.w === w && s.root === root ? s : { w, root }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ax = !!size && size.w / size.root < AX_REM;
  const height = !size ? 320 : ax ? 240 : Math.round(Math.min(380, Math.max(290, size.w * 0.84)));

  const g = useMemo<MountainGeometry | null>(() => {
    if (!size || size.w < 120) return null;
    const input: MountainInput = {
      width: size.w,
      height,
      zoom,
      today: props.today,
      start: props.start,
      target: props.target,
      band: pace.band,
      weighIns: props.weighIns,
      series: props.series,
      pace,
      terraces: props.terraces,
      unit,
      ax,
      measure: measureText,
    };
    return mountainGeometry(input);
  }, [size, height, zoom, props.today, props.start, props.target, props.weighIns, props.series, props.terraces, pace, unit, ax]);

  return (
    <div ref={box} className={cn("relative w-full select-none", className)} style={{ height }}>
      <style>{CHART_CSS}</style>
      {g && <Plot g={g} pace={pace} unit={unit} series={props.series} today={props.today} celebrate={celebrate ?? null} ax={ax} />}
    </div>
  );
}

let canvas: HTMLCanvasElement | null = null;
/** Measures label text in the instrument face so the collision checks use real widths. */
function measureText(text: string, kind: "label" | "tick") {
  try {
    canvas ??= document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error();
    const family = getComputedStyle(document.body).fontFamily || "system-ui";
    const px = Math.max(12, parseFloat(getComputedStyle(document.documentElement).fontSize) * (kind === "label" ? 0.8125 : 0.75));
    ctx.font = `600 ${px}px ${family}`;
    return Math.ceil(ctx.measureText(text).width * 1.08 + (kind === "label" ? 4 : 0));
  } catch {
    return Math.ceil(text.length * 7);
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function Plot({
  g,
  pace,
  unit,
  series,
  today,
  celebrate,
  ax,
}: {
  g: MountainGeometry;
  pace: Pace;
  unit: WeightUnit;
  series: { date: ISODate; lb: number }[];
  today: ISODate;
  celebrate: { lb: number; fromLb: number } | null;
  ax: boolean;
}) {
  const { plot } = g;
  const base = plot.y + plot.h;
  const clipId = `mtn-clip-${g.zoom}`;
  const bandFill = `mtn-band-${g.zoom}`;
  const arrived = pace.verdict === "arrived";
  const climberShift = celebrate && g.climber ? g.y(celebrate.fromLb) - g.climber.y : 0;
  const inset = g.inset ? insetGeometry(series, today, g.inset) : null;
  const todayX = g.climber?.x ?? null;

  return (
    <>
      <svg width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} className="absolute inset-0 overflow-visible" aria-hidden>
        <defs>
          <clipPath id={clipId}>
            <rect x={plot.x} y={plot.y - 2} width={plot.w} height={plot.h + 4} />
          </clipPath>
          <linearGradient id={bandFill} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" style={{ stopColor: arrived ? "var(--leaf-300)" : "var(--ivory)", stopOpacity: 0.02 }} />
            <stop offset="1" style={{ stopColor: arrived ? "var(--leaf-300)" : "var(--ivory)", stopOpacity: arrived ? 0.16 : 0.08 }} />
          </linearGradient>
        </defs>

        {/* decoration first: the ridge, 4%, bottom 30% only (tested never to touch a data line) */}
        <path d={g.ridge.path} style={{ fill: "var(--ivory)", fillOpacity: 0.04 }} />

        {/* lb grid */}
        {g.yTicks.map((t) => (
          <line key={`g${t.lb}`} x1={plot.x} x2={plot.x + plot.w} y1={r1(t.y)} y2={r1(t.y)} style={{ stroke: "var(--vein)" }} strokeWidth={1} />
        ))}

        {/* terraces: a hairline contour each, leaf once reached */}
        {g.terraces.map((t) => {
          const draw = celebrate && Math.abs(celebrate.lb - t.lb) < 1e-6;
          return (
            <line
              key={`t${t.index}`}
              x1={plot.x}
              x2={plot.x + plot.w}
              y1={r1(t.y)}
              y2={r1(t.y)}
              pathLength={draw ? 1 : undefined}
              strokeDasharray={draw ? "1 1" : t.reached ? undefined : "1 4"}
              className={draw ? "mtn-inscribe" : undefined}
              style={{ stroke: t.reached || draw ? "var(--leaf-300)" : "var(--ui-line)", strokeOpacity: t.reached || draw ? 0.55 : 0.6, ...(draw ? ({ "--mtn-delay": "800ms" } as CSSProperties) : null) }}
              strokeWidth={1}
            />
          );
        })}

        {/* the Olympus band */}
        {g.band && (
          <g>
            <rect x={plot.x} y={r1(g.band.y0)} width={plot.w} height={Math.max(1, r1(g.band.y1 - g.band.y0))} fill={`url(#${bandFill})`} />
            <line x1={plot.x} x2={plot.x + plot.w} y1={r1(g.band.y0)} y2={r1(g.band.y0)} style={{ stroke: arrived ? "var(--leaf-line)" : "var(--vein-3)" }} />
            <line x1={plot.x} x2={plot.x + plot.w} y1={r1(g.band.y1)} y2={r1(g.band.y1)} style={{ stroke: arrived ? "var(--leaf-line)" : "var(--vein-3)" }} />
          </g>
        )}

        <g clipPath={`url(#${clipId})`}>
          {/* corridor: the rates that land in the band */}
          {g.corridor && (
            <>
              <path d={g.corridor.path} style={{ fill: "rgb(242 235 221 / .06)" }} />
              <line x1={r1(g.corridor.origin.x)} y1={r1(g.corridor.origin.y)} x2={r1(g.corridor.upper.x)} y2={r1(g.corridor.upper.y)} style={{ stroke: "var(--ui-line)" }} strokeWidth={1} />
              <line x1={r1(g.corridor.origin.x)} y1={r1(g.corridor.origin.y)} x2={r1(g.corridor.lower.x)} y2={r1(g.corridor.lower.y)} style={{ stroke: "var(--ui-line)" }} strokeWidth={1} />
            </>
          )}

          {/* today */}
          {todayX != null && <line x1={r1(todayX)} x2={r1(todayX)} y1={r1(g.climber!.y + 8)} y2={base} style={{ stroke: "var(--ui-line)" }} strokeDasharray="1 3" />}

          {/* raw weigh-ins (LOG) */}
          {g.dots.map((d) => (
            <circle key={d.date} cx={r1(d.x)} cy={r1(d.y)} r={1.6} style={{ fill: "var(--ash)", fillOpacity: 0.75 }} />
          ))}

          {/* the projection (PROJ): dashed, from today's trend */}
          {g.projection && (
            <>
              <path d={g.projection.path} fill="none" style={{ stroke: "var(--ivory)", strokeOpacity: 0.7 }} strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
              {g.projection.endInside && <circle cx={r1(g.projection.end.x)} cy={r1(g.projection.end.y)} r={3.2} style={{ fill: "var(--night)", stroke: "var(--ivory)" }} strokeWidth={1.4} />}
            </>
          )}

          {/* the trend (CALC): leaf, inscribed on first show */}
          {g.trend.length > 1 && (
            <path d={g.trendPath} pathLength={1} strokeDasharray="1 1" className="mtn-inscribe" fill="none" style={{ stroke: "var(--leaf-300)" }} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
          )}
        </g>

        {/* the climber: a leaf diamond at today's trend */}
        {g.climber && (
          <g className={celebrate ? "mtn-climb" : undefined} style={{ "--mtn-from": `${climberShift}px` } as CSSProperties}>
            <rect x={r1(g.climber.x - 5)} y={r1(g.climber.y - 5)} width={10} height={10} transform={`rotate(45 ${r1(g.climber.x)} ${r1(g.climber.y)})`} style={{ fill: "var(--leaf-100)", stroke: "var(--night)" }} strokeWidth={2.5} />
          </g>
        )}

        {/* lb axis */}
        <line x1={plot.x} x2={plot.x} y1={plot.y - 4} y2={base} style={{ stroke: "var(--ui-line)" }} strokeWidth={1} />
        {g.yTicks.map((t) => (
          <text key={`l${t.lb}`} x={plot.x - 7} y={r1(t.y)} dy="0.35em" textAnchor="end" className="t-meta tnum" style={{ fill: "var(--stone)" }}>
            {t.label}
          </text>
        ))}
        <text x={plot.x - 7} y={Math.max(12, plot.y - 18)} textAnchor="end" className="t-meta" style={{ fill: "var(--stone)" }}>
          {unit}
        </text>

        {/* month or week labels */}
        <line x1={plot.x} x2={plot.x + plot.w} y1={base} y2={base} style={{ stroke: "var(--ui-line)" }} strokeWidth={1} />
        {g.xTicks.map((t) => (
          <text key={t.date} x={r1(t.x)} y={base + 17} textAnchor="middle" className="t-meta" style={{ fill: t.date.slice(0, 7) === today.slice(0, 7) ? "var(--ivory)" : "var(--stone)" }}>
            {t.label}
          </text>
        ))}

        {/* terrace numerals at the right edge (stone, 4.5:1; leaf once reached) */}
        {!ax &&
          g.terraces.map((t) => (
            <text key={`n${t.index}`} x={plot.x + plot.w + 6} y={r1(t.y)} dy="0.35em" className="t-meta font-voice" style={{ fill: t.reached ? "var(--leaf-300)" : "var(--stone)", fontWeight: 600 }}>
              {t.numeral}
            </text>
          ))}
      </svg>

      {/* the summit: a temple glyph at the band's right end */}
      {g.summit && (
        <span className={cn("pointer-events-none absolute -translate-x-1/2 -translate-y-full", arrived ? "text-leaf-300" : "text-stone")} style={{ left: g.summit.x, top: g.summit.y }}>
          <TempleGlyph className="size-6" />
        </span>
      )}

      {/* labels as HTML: real type, the PROJ tag, and the boxes the geometry checked for collisions */}
      {g.band?.label && (
        <span className={cn("t-eyebrow pointer-events-none absolute flex items-center whitespace-nowrap", arrived ? "text-leaf-300" : "text-stone")} style={{ left: g.band.label.x, top: g.band.label.y, height: g.band.label.h }}>
          {g.band.label.text}
        </span>
      )}
      {g.projection?.label && (
        <span className="pointer-events-none absolute flex items-center justify-end gap-1.5 whitespace-nowrap" style={{ left: g.projection.label.x, top: g.projection.label.y, width: g.projection.label.w, height: g.projection.label.h }}>
          <span className="t-meta tnum font-semibold text-ivory">{g.projection.label.text}</span>
          <Tag kind="PROJ" />
        </span>
      )}
      {g.climberLabel && (
        <span className="t-meta tnum pointer-events-none absolute flex items-center whitespace-nowrap font-semibold text-ivory" style={{ left: g.climberLabel.x, top: g.climberLabel.y, height: g.climberLabel.h }}>
          {g.climberLabel.text}
        </span>
      )}

      {/* Season inset: the last six weeks, trend only */}
      {g.inset && inset && (
        <div className="pointer-events-none absolute rounded-field bg-m1 shadow-[inset_0_0_0_1px_var(--vein-2)]" style={{ left: g.inset.x, top: g.inset.y, width: g.inset.w, height: g.inset.h }}>
          <span className="t-tag absolute left-2 top-1.5 text-stone">Last 6 weeks</span>
          <svg width={g.inset.w} height={g.inset.h} className="absolute inset-0" aria-hidden>
            <path d={inset.path} fill="none" style={{ stroke: "var(--leaf-300)" }} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={r1(inset.points.at(-1)!.x)} cy={r1(inset.points.at(-1)!.y)} r={2.2} style={{ fill: "var(--leaf-300)" }} />
          </svg>
        </div>
      )}
    </>
  );
}

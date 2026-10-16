"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { meanderGeometry } from "@/components/art/Motifs";
import { cn } from "@/lib/cn";
import { dayName, shortDate } from "@/lib/dates";

/**
 * The Colonnade — the training week as a temple (DESIGN §6.2).
 * Seven 44-unit slots under a pediment: fluted columns for training days, low plinths for
 * rest days. Done columns fill with gold leaf from the base; missed and future days stay as
 * quiet outlines (never red). When every training day of the week is done the pediment gilds
 * and a meander draws beneath it — the draw plays once per week.
 */
export interface ColonnadeProps {
  days: { date: string; kind: "train" | "rest"; label: string; done: boolean; today: boolean; volleyball: boolean; missed?: boolean }[];
  /** Rendered height in px at full size (88 on Today, 112 on Training). Scales down to fit the width. */
  height?: number;
  interactive?: boolean;
  onDayClick?: (date: string) => void;
  className?: string;
}

const VB_W = 320;
const VB_H = 96;
const SLOT = 44;
const X0 = 6;
const cxOf = (i: number) => X0 + SLOT / 2 + SLOT * i;

/** Horizontal position of day slot `i` as percentages of the colonnade's width (for labels laid under it). */
export function colonnadeSlot(i: number): { left: number; width: number } {
  return { left: ((X0 + SLOT * i) / VB_W) * 100, width: (SLOT / VB_W) * 100 };
}

// Column geometry (18 × 52): abacus, tapered-look shaft, base.
const COL_TOP = 30;
const COL_BOTTOM = 82;
const columnPath = (cx: number) =>
  `M${cx - 9} ${COL_TOP}h18v3h-18z` + // abacus
  `M${cx - 7} ${COL_TOP + 3}h14v46h-14z` + // shaft
  `M${cx - 9} ${COL_BOTTOM - 3}h18v3h-18z`; // base
const flutePath = (cx: number) => `M${cx - 3.5} ${COL_TOP + 5}V${COL_BOTTOM - 5}M${cx} ${COL_TOP + 5}V${COL_BOTTOM - 5}M${cx + 3.5} ${COL_TOP + 5}V${COL_BOTTOM - 5}`;
// Rest-day plinth (24 × 8, two steps).
const plinthPath = (cx: number) => `M${cx - 9} ${COL_BOTTOM - 8}h18v4h-18z` + `M${cx - 12} ${COL_BOTTOM - 4}h24v4h-24z`;

const PEDIMENT = "M8 20 160 4 312 20Z";
const FRIEZE_Y = 22;
const FRIEZE_H = 6;

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const STORE_KEY = "pgg.colonnade.gilded";
const RISE_KEY = "pgg.colonnade.risen";

const noopSubscribe = () => () => {};

/** Done dates whose gold-leaf rise already played this session (choreography plays once). */
function readRisen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(RISE_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function writeRisen(dates: string[]) {
  try {
    const all = readRisen();
    dates.forEach((d) => all.add(d));
    sessionStorage.setItem(RISE_KEY, JSON.stringify([...all].slice(-60)));
  } catch {
    /* storage blocked — the rise simply plays again next time */
  }
}

export function Colonnade({ days, height = 112, interactive = false, onDayClick, className }: ColonnadeProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const week = days[0]?.date ?? "";
  const train = days.filter((d) => d.kind === "train");
  const doneCount = train.filter((d) => d.done).length;
  const complete = train.length > 0 && doneCount === train.length;

  // Render empty on the first frame, then fill — columns rise from the base like the rings.
  // Each done column rises once per session; on later visits it is simply gilded.
  const [risen] = useState(() => (typeof window === "undefined" ? new Set<string>() : readRisen()));
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const doneKey = days
    .filter((d) => d.done)
    .map((d) => d.date)
    .join(",");
  useEffect(() => {
    if (!armed || !doneKey) return;
    const t = window.setTimeout(() => writeRisen(doneKey.split(",")), 1200);
    return () => window.clearTimeout(t);
  }, [armed, doneKey]);

  // The pediment draw plays once per week (per device); later visits render it settled.
  const seen = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(STORE_KEY) === week;
      } catch {
        return false;
      }
    },
    () => false,
  );
  const animateGild = complete && !seen;
  const wrote = useRef(false);
  useEffect(() => {
    if (!animateGild || !armed || wrote.current) return;
    wrote.current = true;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, week);
      } catch {
        /* private mode — it will simply play again */
      }
    }, 1600);
    return () => window.clearTimeout(t);
  }, [animateGild, armed, week]);

  const gilded = armed && complete;
  const frieze = meanderGeometry(VB_W - 16 - 2, FRIEZE_H, 0.75);

  const summary = train.length
    ? `This week: ${doneCount} of ${train.length} training ${train.length === 1 ? "day" : "days"} done${complete ? ", week complete" : ""}.`
    : "This week: no training planned.";

  return (
    <div
      className={cn("relative mx-auto w-full select-none", className)}
      style={{ maxWidth: (height * VB_W) / VB_H, aspectRatio: `${VB_W} / ${VB_H}` }}
      role={interactive ? "group" : "img"}
      aria-label={summary}
    >
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`leaf-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#A97E40" />
            <stop offset="0.45" stopColor="#D5AC67" />
            <stop offset="0.85" stopColor="#F3DDA8" />
            <stop offset="1" stopColor="#E2C185" />
          </linearGradient>
          <linearGradient id={`ped-${uid}`} x1="8" y1="0" x2="312" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#A97E40" />
            <stop offset="0.5" stopColor="#F3DDA8" />
            <stop offset="1" stopColor="#A97E40" />
          </linearGradient>
        </defs>

        {/* Pediment: hairline until the week is complete, then gold leaf at 35%. */}
        <path d={PEDIMENT} stroke="var(--line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" strokeLinejoin="round" />
        <path
          d={PEDIMENT}
          fill={`url(#ped-${uid})`}
          stroke={`url(#ped-${uid})`}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          style={{
            opacity: gilded ? 1 : 0,
            fillOpacity: 0.35,
            transition: animateGild ? "opacity 700ms var(--ease-gold) 200ms" : "none",
          }}
        />

        {/* Entablature: two hairlines; the meander draws between them on a complete week. */}
        <path d={`M8 ${FRIEZE_Y}H312M8 ${FRIEZE_Y + FRIEZE_H + 1}H312`} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {complete && (
          <path
            d={frieze.d}
            transform={`translate(9 ${FRIEZE_Y + 0.5})`}
            pathLength={1}
            stroke={`url(#ped-${uid})`}
            strokeWidth={0.75}
            fill="none"
            strokeDasharray="1 1"
            style={{
              strokeDashoffset: gilded ? 0 : 1,
              transition: animateGild ? "stroke-dashoffset 1400ms var(--ease-gold) 500ms" : "none",
            }}
          />
        )}

        {/* Stylobate */}
        <path d={`M8 ${COL_BOTTOM + 1.5}H312`} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />

        {days.map((d, i) => {
          const cx = cxOf(i);
          const wd = new Date(d.date + "T12:00:00").getDay();
          if (d.kind === "rest") {
            return (
              <g key={d.date}>
                <path
                  d={plinthPath(cx)}
                  fill="rgb(255 255 255 / .03)"
                  stroke={d.today ? "var(--gold-400)" : "var(--line-strong)"}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
                <DayLetter cx={cx} letter={LETTERS[wd]} today={d.today} volleyball={d.volleyball} />
              </g>
            );
          }
          const outline = d.today ? "var(--gold-400)" : d.done ? "rgb(213 172 103 / .55)" : d.missed ? "var(--line)" : "var(--line-strong)";
          return (
            <g key={d.date}>
              <clipPath id={`clip-${uid}-${i}`}>
                <path d={columnPath(cx)} />
              </clipPath>
              <path d={columnPath(cx)} fill={d.missed ? "transparent" : "rgb(255 255 255 / .025)"} />
              {d.done && (
                <g clipPath={`url(#clip-${uid}-${i})`}>
                  <rect
                    x={cx - 9}
                    y={COL_TOP}
                    width={18}
                    height={COL_BOTTOM - COL_TOP}
                    fill={`url(#leaf-${uid})`}
                    style={{
                      transform: `scaleY(${armed || risen.has(d.date) ? 1 : 0})`,
                      transformBox: "fill-box",
                      transformOrigin: "50% 100%",
                      transition: risen.has(d.date) ? "none" : `transform 600ms var(--ease-gold) ${i * 60}ms`,
                    }}
                  />
                </g>
              )}
              <path
                d={flutePath(cx)}
                stroke={d.done ? "rgb(8 9 12 / .35)" : "var(--line-hair)"}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                style={
                  d.done
                    ? { opacity: armed || risen.has(d.date) ? 1 : 0, transition: risen.has(d.date) ? "none" : `opacity 300ms ease ${300 + i * 60}ms` }
                    : undefined
                }
              />
              <path d={columnPath(cx)} fill="none" stroke={outline} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              <DayLetter cx={cx} letter={LETTERS[wd]} today={d.today} volleyball={d.volleyball} />
            </g>
          );
        })}
      </svg>

      {interactive &&
        days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            onClick={() => onDayClick?.(d.date)}
            aria-current={d.today ? "date" : undefined}
            aria-label={dayAria(d)}
            className="press absolute top-0 h-full rounded-[10px] transition-colors hover:bg-white/[.03] active:bg-white/[.05]"
            style={{ left: `${((X0 + SLOT * i) / VB_W) * 100}%`, width: `${(SLOT / VB_W) * 100}%`, minWidth: 44 }}
          />
        ))}
    </div>
  );
}

function DayLetter({ cx, letter, today, volleyball }: { cx: number; letter: string; today: boolean; volleyball: boolean }) {
  return (
    <>
      <text
        x={cx}
        y={94.5}
        textAnchor="middle"
        style={{ fontFamily: "var(--font-num)", fontSize: 11, fontWeight: today ? 700 : 600, letterSpacing: "0.04em" }}
        fill={today ? "var(--gold-300)" : "var(--text-3)"}
      >
        {letter}
      </text>
      {volleyball && <circle cx={cx + 8} cy={90.6} r={2} fill="var(--s-lapis)" />}
    </>
  );
}

function dayAria(d: ColonnadeProps["days"][number]) {
  const when = `${dayName(d.date)}, ${shortDate(d.date)}`;
  const parts = [when, d.kind === "rest" ? "Rest day" : d.label];
  if (d.done) parts.push("done");
  else if (d.missed) parts.push("not logged");
  else if (d.today && d.kind === "train") parts.push("today");
  if (d.volleyball) parts.push("volleyball");
  return parts.join(", ");
}

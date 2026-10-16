import { useId, type CSSProperties } from "react";

/**
 * Pantheon motif library — pure SVG, no DOM measuring.
 * Gold leaf: #F3DDA8 → #D5AC67 → #A97E40 → #E2C185 · bronze line #7D5C2E · ground #08090C.
 * Every gradient/clip id is derived from useId() so many instances can share a page.
 */

type Base = { className?: string; style?: CSSProperties };

const sid = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "");
const clamp01 = (v: number) =>
  Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const EASE = "cubic-bezier(.2,.7,.2,1)";

function GoldStops() {
  return (
    <>
      <stop offset="0" stopColor="#F3DDA8" />
      <stop offset="0.4" stopColor="#D5AC67" />
      <stop offset="0.78" stopColor="#A97E40" />
      <stop offset="1" stopColor="#E2C185" />
    </>
  );
}

const LAUREL_LEAVES =
  "M24.84 56.43C23.25 54.08 18.55 54.47 15.38 58.1C19.6 60.42 24.15 59.18 24.84 56.43ZM21.45 55.11C22.7 52.82 20.39 49.15 16.08 48.11C15.97 52.54 18.92 55.72 21.45 55.11ZM17.43 52.69C16.76 50.1 12.45 48.97 8.48 51.2C11.51 54.6 15.95 54.93 17.43 52.69ZM14.68 50.32C16.51 48.68 15.61 44.68 12.1 42.39C10.61 46.3 12.22 50.07 14.68 50.32ZM11.69 46.7C11.91 44.19 8.45 41.83 4.23 42.56C5.84 46.53 9.68 48.22 11.69 46.7ZM9.89 43.55C12.03 42.66 12.48 38.83 10.09 35.7C7.54 38.7 7.79 42.55 9.89 43.55ZM8.28 39.13C9.26 36.98 6.94 33.82 2.98 33.14C3.16 37.16 6.03 39.85 8.28 39.13ZM7.63 35.56C9.81 35.45 11.4 32.21 10.27 28.69C7.08 30.55 6.1 34.02 7.63 35.56ZM7.59 30.86C9.13 29.28 8.07 25.77 4.8 23.94C3.71 27.53 5.39 30.79 7.59 30.86ZM8.18 27.28C10.12 27.86 12.54 25.5 12.64 22.06C9.25 22.69 7.3 25.45 8.18 27.28ZM9.71 22.84C11.54 21.93 11.7 18.53 9.4 15.91C7.34 18.72 7.8 22.09 9.71 22.84ZM11.45 19.66C12.98 20.77 15.82 19.45 16.98 16.47C13.81 15.97 11.25 17.78 11.45 19.66ZM14.38 15.98C16.25 15.75 17.44 12.84 16.25 9.86C13.59 11.66 12.95 14.74 14.38 15.98ZM17.09 13.56C18.07 15 20.95 14.73 22.87 12.49C20.27 11.09 17.49 11.87 17.09 13.56ZM18.3 12.69C19.98 13.74 22.88 12.16 23.87 8.93C20.51 8.65 17.95 10.73 18.3 12.69ZM39.16 56.43C39.85 59.18 44.4 60.42 48.62 58.1C45.45 54.47 40.75 54.08 39.16 56.43ZM42.55 55.11C45.08 55.72 48.03 52.54 47.92 48.11C43.61 49.15 41.3 52.82 42.55 55.11ZM46.57 52.69C48.05 54.93 52.49 54.6 55.52 51.2C51.55 48.97 47.24 50.1 46.57 52.69ZM49.32 50.32C51.78 50.07 53.39 46.3 51.9 42.39C48.39 44.68 47.49 48.68 49.32 50.32ZM52.31 46.7C54.32 48.22 58.16 46.53 59.77 42.56C55.55 41.83 52.09 44.19 52.31 46.7ZM54.11 43.55C56.21 42.55 56.46 38.7 53.91 35.7C51.52 38.83 51.97 42.66 54.11 43.55ZM55.72 39.13C57.97 39.85 60.84 37.16 61.02 33.14C57.06 33.82 54.74 36.98 55.72 39.13ZM56.37 35.56C57.9 34.02 56.92 30.55 53.73 28.69C52.6 32.21 54.19 35.45 56.37 35.56ZM56.41 30.86C58.61 30.79 60.29 27.53 59.2 23.94C55.93 25.77 54.87 29.28 56.41 30.86ZM55.82 27.28C56.7 25.45 54.75 22.69 51.36 22.06C51.46 25.5 53.88 27.86 55.82 27.28ZM54.29 22.84C56.2 22.09 56.66 18.72 54.6 15.91C52.3 18.53 52.46 21.93 54.29 22.84ZM52.55 19.66C52.75 17.78 50.19 15.97 47.02 16.47C48.18 19.45 51.02 20.77 52.55 19.66ZM49.62 15.98C51.05 14.74 50.41 11.66 47.75 9.86C46.56 12.84 47.75 15.75 49.62 15.98ZM46.91 13.56C46.51 11.87 43.73 11.09 41.13 12.49C43.05 14.73 45.93 15 46.91 13.56ZM45.7 12.69C46.05 10.73 43.49 8.65 40.13 8.93C41.12 12.16 44.02 13.74 45.7 12.69Z";
const LAUREL_RIBS =
  "M24.08 56.56L18.03 57.63M21.02 54.55L17.58 50.07M16.71 52.57L10.99 51.62M14.47 49.69L12.82 44.61M11.09 46.37L6.31 43.72M9.9 42.92L10.03 37.9M7.86 38.65L4.46 34.82M7.85 35.01L9.53 30.61M7.37 30.31L5.58 25.88M8.53 26.86L11.39 23.52M9.68 22.29L9.49 17.85M11.89 19.4L15.43 17.36M14.53 15.49L15.72 11.57M17.55 13.48L21.25 12.79M18.75 12.39L22.31 9.98M39.92 56.56L45.97 57.63M42.98 54.55L46.42 50.07M47.29 52.57L53.01 51.62M49.53 49.69L51.18 44.61M52.91 46.37L57.69 43.72M54.1 42.92L53.97 37.9M56.14 38.65L59.54 34.82M56.15 35.01L54.47 30.61M56.63 30.31L58.42 25.88M55.47 26.86L52.61 23.52M54.32 22.29L54.51 17.85M52.11 19.4L48.57 17.36M49.47 15.49L48.28 11.57M46.45 13.48L42.75 12.79M45.25 12.39L41.69 9.98";
const LAUREL_STEMS =
  "M36.2 59.81Q31.37 58.6 28.59 57.26A24.5 24.5 0 0 1 18.3 12.69M27.8 59.81Q32.63 58.6 35.41 57.26A24.5 24.5 0 0 0 45.7 12.69";
const BULLET_LEAF =
  "M3.15 9.53C6.17 10.73 9.57 7.71 9.24 2.36ZM2.65 9.07C1.14 6.2 3.78 2.5 9.14 2.27Z";
const BULLET_STEM = "M1.2 10.9Q2 10.3 3.15 9.05";
const COL_SHAPE =
  "M2.5 2.5H21.5V5.5H2.5ZM3.5 5.5H20.5C20.5 7 19.4 8.1 18.3 8.5H5.7C4.6 8.1 3.5 7 3.5 5.5ZM5.6 8.5H18.4V10H5.6ZM5.9 10L18.1 10L19.1 55.5L4.9 55.5ZM2.5 55.5H21.5V58.5H2.5ZM0.8 58.5H23.2V62H0.8Z";
const COL_FLUTES = "M8.95 11.6L8.45 54.2M12 11.6L12 54.2M15.05 11.6L15.55 54.2";
const PLINTH_SHAPE =
  "M5.5 49.5H18.5V52.5H5.5ZM4 52.5H20V55.5H4ZM2.5 55.5H21.5V58.5H2.5ZM0.8 58.5H23.2V62H0.8Z";
const PLINTH_TOP = "M5.5 49.5L18.5 49.5";
const PED_OUTER = "M2 19.5L60 5.58L118 19.5";
const PED_INNER = "M14.85 19.5L60 8.66L105.15 19.5";
const PED_CORNICE = "M1.5 19.5H118.5V22.5H1.5Z";
const PED_DENTILS =
  "M5.2 24H7.8V26.6H5.2ZM11.2 24H13.8V26.6H11.2ZM17.2 24H19.8V26.6H17.2ZM23.2 24H25.8V26.6H23.2ZM29.2 24H31.8V26.6H29.2ZM35.2 24H37.8V26.6H35.2ZM41.2 24H43.8V26.6H41.2ZM47.2 24H49.8V26.6H47.2ZM53.2 24H55.8V26.6H53.2ZM59.2 24H61.8V26.6H59.2ZM65.2 24H67.8V26.6H65.2ZM71.2 24H73.8V26.6H71.2ZM77.2 24H79.8V26.6H77.2ZM83.2 24H85.8V26.6H83.2ZM89.2 24H91.8V26.6H89.2ZM95.2 24H97.8V26.6H95.2ZM101.2 24H103.8V26.6H101.2ZM107.2 24H109.8V26.6H107.2ZM113.2 24H115.8V26.6H113.2Z";
const PED_ARCHITRAVE = "M4 28.5L116 28.5";

/* ───────────────────────────── Meander ───────────────────────────── */

/**
 * Classic double-turn Greek key on an 10×8 grid per unit. Lines and gaps sit on an
 * even rhythm; units are stretched imperceptibly so the band ends flush at `width`.
 * Length per unit = 24 vertical + 26 horizontal grid steps (+8 for the closing riser).
 */
export function meanderGeometry(
  width: number,
  height = 14,
  strokeWidth = 1.25,
) {
  const pad = strokeWidth / 2;
  const sy = (height - strokeWidth) / 8;
  const n = Math.max(1, Math.round((width - strokeWidth) / (10 * sy)));
  const sx = (width - strokeWidth) / (n * 10);
  const X = (g: number) => r2(pad + g * sx);
  const Y = (g: number) => r2(pad + g * sy);
  let d = `M${X(0)} ${Y(8)}`;
  for (let i = 0; i < n; i++) {
    const o = i * 10;
    d +=
      `V${Y(0)}H${X(o + 8)}V${Y(6)}H${X(o + 4)}V${Y(4)}H${X(o + 6)}` +
      `V${Y(2)}H${X(o + 2)}V${Y(8)}H${X(o + 10)}`;
  }
  d += `V${Y(0)}`;
  const length = n * (24 * sy + 26 * sx) + 8 * sy;
  return { d, length, units: n };
}

export function Meander({
  width,
  height = 14,
  progress,
  strokeWidth = 1.25,
  className,
  style,
}: Base & {
  width: number;
  height?: number;
  progress?: number;
  strokeWidth?: number;
}) {
  const gid = `meander-${sid(useId())}`;
  const { d, length } = meanderGeometry(width, height, strokeWidth);
  const p = progress == null ? null : clamp01(progress);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gid}
          x1="0"
          y1="0"
          x2={width}
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <GoldStops />
        </linearGradient>
      </defs>
      {p == null ? (
        <path
          d={d}
          stroke={`url(#${gid})`}
          strokeWidth={strokeWidth}
          strokeLinejoin="miter"
        />
      ) : (
        <>
          <path
            d={d}
            stroke="#D5AC67"
            strokeOpacity={0.16}
            strokeWidth={strokeWidth}
            strokeLinejoin="miter"
          />
          <path
            d={d}
            stroke={`url(#${gid})`}
            strokeWidth={strokeWidth}
            strokeLinejoin="miter"
            strokeDasharray={`${r2(length)} ${r2(length)}`}
            strokeDashoffset={r2(length * (1 - p))}
            style={{ transition: `stroke-dashoffset 900ms ${EASE}` }}
          />
        </>
      )}
    </svg>
  );
}

/* ───────────────────────────── Laurel ───────────────────────────── */

/** Two-branch laurel wreath, open at the top; hairline strokes stay ~1px at any size. */
export function Laurel({
  size = 96,
  strokeWidth = 1,
  className,
  style,
}: Base & { size?: number; strokeWidth?: number }) {
  const gid = `laurel-${sid(useId())}`;
  const stroke = `url(#${gid})`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gid}
          x1="8"
          y1="6"
          x2="56"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <GoldStops />
        </linearGradient>
      </defs>
      <g
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={LAUREL_STEMS} vectorEffect="non-scaling-stroke" />
        <path d={LAUREL_LEAVES} vectorEffect="non-scaling-stroke" />
        <path
          d={LAUREL_RIBS}
          strokeOpacity={0.5}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

/** A single split laurel leaf — a 12px list bullet. */
export function LaurelBullet({
  size = 12,
  className,
  style,
}: Base & { size?: number }) {
  const gid = `bullet-${sid(useId())}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gid}
          x1="2"
          y1="10"
          x2="10"
          y2="2"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#A97E40" />
          <stop offset="0.55" stopColor="#D5AC67" />
          <stop offset="1" stopColor="#F3DDA8" />
        </linearGradient>
      </defs>
      <path d={BULLET_LEAF} fill={`url(#${gid})`} />
      <path
        d={BULLET_STEM}
        stroke={`url(#${gid})`}
        strokeWidth={0.9}
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─────────────────────────── Colonnade ─────────────────────────── */

/**
 * Fluted Doric column (abacus, echinus, necking, tapered shaft, two-step stylobate).
 * `fill` (0–1) raises gold leaf from the base, clipped to the column silhouette.
 * Width is 3/8 of height. The fill animates via CSS transform when `fill` changes.
 */
export function ColumnFluted({
  height = 64,
  fill = 0,
  className,
  style,
}: Base & { height?: number; fill?: number }) {
  const id = sid(useId());
  const gid = `col-g-${id}`;
  const cid = `col-c-${id}`;
  const f = clamp01(fill);
  return (
    <svg
      width={r2((height * 24) / 64)}
      height={height}
      viewBox="0 0 24 64"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gid}
          x1="0"
          y1="62"
          x2="0"
          y2="2"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#A97E40" />
          <stop offset="0.45" stopColor="#D5AC67" />
          <stop offset="0.85" stopColor="#F3DDA8" />
          <stop offset="1" stopColor="#E2C185" />
        </linearGradient>
        <clipPath id={cid}>
          <path d={COL_SHAPE} />
        </clipPath>
      </defs>
      <path d={COL_SHAPE} fill="#D5AC67" fillOpacity={0.05} />
      <path
        d={COL_FLUTES}
        stroke="#D5AC67"
        strokeOpacity={0.22}
        vectorEffect="non-scaling-stroke"
      />
      <g clipPath={`url(#${cid})`}>
        <rect
          x="0"
          y="0"
          width="24"
          height="64"
          fill={`url(#${gid})`}
          style={{
            transform: `scaleY(${f})`,
            transformBox: "view-box",
            transformOrigin: "0 62px",
            transition: `transform 700ms ${EASE}`,
          }}
        />
        <path
          d={COL_FLUTES}
          stroke="#08090C"
          strokeOpacity={0.32}
          vectorEffect="non-scaling-stroke"
        />
      </g>
      <path
        d={COL_SHAPE}
        stroke="#D5AC67"
        strokeOpacity={f > 0.999 ? 0.95 : 0.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Low stepped plinth — the rest-day stand-in for a column. Same 24×64 box, bottom-aligned. */
export function Plinth({
  height = 64,
  className,
  style,
}: Base & { height?: number }) {
  return (
    <svg
      width={r2((height * 24) / 64)}
      height={height}
      viewBox="0 0 24 64"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={PLINTH_SHAPE} fill="#D5AC67" fillOpacity={0.05} />
      <path
        d={PLINTH_SHAPE}
        stroke="#D5AC67"
        strokeOpacity={0.42}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={PLINTH_TOP}
        stroke="#E2C185"
        strokeOpacity={0.8}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Temple pediment: raking cornice, tympanum, horizontal geison, dentils, architrave. 4:1. */
export function Pediment({
  width = 120,
  className,
  style,
}: Base & { width?: number }) {
  const gid = `ped-${sid(useId())}`;
  const stroke = `url(#${gid})`;
  return (
    <svg
      width={width}
      height={r2(width / 4)}
      viewBox="0 0 120 30"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gid}
          x1="0"
          y1="0"
          x2="120"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#A97E40" />
          <stop offset="0.5" stopColor="#F3DDA8" />
          <stop offset="1" stopColor="#A97E40" />
        </linearGradient>
      </defs>
      <g stroke={stroke} strokeLinejoin="miter">
        <path d={PED_OUTER} vectorEffect="non-scaling-stroke" />
        <path
          d={PED_INNER}
          strokeOpacity={0.55}
          vectorEffect="non-scaling-stroke"
        />
        <path d={PED_CORNICE} vectorEffect="non-scaling-stroke" />
        <path
          d={PED_ARCHITRAVE}
          strokeOpacity={0.55}
          vectorEffect="non-scaling-stroke"
        />
      </g>
      <path d={PED_DENTILS} fill={stroke} fillOpacity={0.45} />
    </svg>
  );
}

/* ─────────────────────────── Empty states ─────────────────────────── */

export type EmptyKind =
  "plinth" | "amphora" | "column" | "frame" | "laurel" | "volute" | "kylix";
type EmptyPaths = {
  dim: string;
  hl: string;
  faint?: string;
  beam?: string;
  floor?: string;
  dots?: string;
  fade?: string;
};

const EMPTY: Record<EmptyKind, EmptyPaths> = {
  plinth: {
    dim: "M21.5 28.5H50.5V31.5H21.5ZM23.5 31.5H48.5V33.5H23.5ZM25.5 33.5H46.5V54.5H25.5ZM23.5 54.5H48.5V56.5H23.5ZM21.5 56.5H50.5V60.5H21.5Z",
    faint: "M28.5 37.5H43.5V50.5H28.5Z",
    hl: "M21.5 28.5L50.5 28.5M23.5 54.5L48.5 54.5",
    beam: "M8 28.5A28 22 0 0 1 64 28.5Z",
    floor: "M8 60.5L64 60.5",
  },
  amphora: {
    dim: "M39 12.5C38.95 13.08 38.68 14.67 38.7 16C38.72 17.33 38.42 19.08 39.1 20.5C39.78 21.92 41.45 23.08 42.8 24.5C44.15 25.92 46.12 27.42 47.2 29C48.28 30.58 49.05 32.25 49.3 34C49.55 35.75 49.27 37.58 48.7 39.5C48.13 41.42 47.02 43.5 45.9 45.5C44.78 47.5 43.08 49.83 42 51.5C40.92 53.17 39.93 54.5 39.4 55.5C38.87 56.5 38.9 57.17 38.8 57.5L33.2 57.5C33.1 57.17 33.13 56.5 32.6 55.5C32.07 54.5 31.08 53.17 30 51.5C28.92 49.83 27.22 47.5 26.1 45.5C24.98 43.5 23.87 41.42 23.3 39.5C22.73 37.58 22.45 35.75 22.7 34C22.95 32.25 23.72 30.58 24.8 29C25.88 27.42 27.85 25.92 29.2 24.5C30.55 23.08 32.22 21.92 32.9 20.5C33.58 19.08 33.28 17.33 33.3 16C33.32 14.67 33.05 13.08 33 12.5ZM31.4 9.5H40.6V12.5H31.4ZM33.2 57.5L38.8 57.5L42 61.5L30 61.5ZM38.9 14.2C46.5 12.6 48.6 19.5 46 27.2M33.1 14.2C25.5 12.6 23.4 19.5 26 27.2",
    faint: "M22.76 35.5L49.24 35.5M23.07 38L48.93 38",
    hl: "M25.8 30.5C24.4 35 24.6 40.5 26.8 45.5M31.4 9.5L40.6 9.5",
    floor: "M14 61.5L58 61.5",
    dots: "M25.6 36.75h0.01M28.2 36.75h0.01M30.8 36.75h0.01M33.4 36.75h0.01M36 36.75h0.01M38.6 36.75h0.01M41.2 36.75h0.01M43.8 36.75h0.01M46.4 36.75h0.01",
  },
  column: {
    dim: "M24.5 10.5H47.5V13.5H24.5ZM25.5 13.5H46.5C46.5 15.2 45.2 16.4 44 16.8H28C26.8 16.4 25.5 15.2 25.5 13.5ZM27.6 16.8H44.4V18.5H27.6ZM28 18.5L44 18.5L45.2 57.5L26.8 57.5ZM23.5 57.5H48.5V60.5H23.5ZM20.5 60.5H51.5V63.5H20.5Z",
    faint:
      "M31.2 20L30.48 56M34.4 20L34.16 56M37.6 20L37.84 56M40.8 20L41.52 56",
    hl: "M24.5 10.5L47.5 10.5M28 19L26.8 57",
    floor: "M10 63.5L62 63.5",
  },
  frame: {
    dim: "M18.5 16.5H53.5V62.5H18.5ZM15.5 16.5L36 6.5L56.5 16.5Z",
    faint:
      "M22.5 20.5H49.5V58.5H22.5ZM20.5 18.5m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M51.5 18.5m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M20.5 60.5m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M51.5 60.5m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0",
    hl: "M22.5 58.5V20.5H49.5M15.5 16.5L36 6.5",
    floor: "M10 62.5L62 62.5",
  },
  laurel: {
    dim: "M28.27 60.78C26.63 58.25 21.64 58.57 18.2 62.37C22.64 64.92 27.5 63.69 28.27 60.78ZM24.26 59.07C25.69 56.7 23.41 52.7 18.88 51.39C18.56 56.09 21.54 59.6 24.26 59.07ZM19.8 56.04C19.28 53.25 14.81 51.74 10.46 53.81C13.41 57.63 18.08 58.29 19.8 56.04ZM16.74 52.94C18.83 51.38 18.28 47.08 14.81 44.32C12.85 48.29 14.18 52.42 16.74 52.94ZM13.76 48.43C14.31 45.82 10.98 42.92 6.47 43.16C7.66 47.52 11.47 49.77 13.76 48.43ZM12.12 44.39C14.49 43.79 15.55 39.87 13.53 36.23C10.41 38.98 10.08 43.03 12.12 44.39ZM11.09 39.09C12.48 37.04 10.64 33.35 6.66 31.95C6.14 36.14 8.63 39.43 11.09 39.09ZM11.1 34.73C13.36 35.06 15.67 32.05 15.22 28.19C11.55 29.45 9.83 32.84 11.1 34.73ZM12.17 29.44C14.1 28.17 13.82 24.35 10.9 21.75C8.97 25.16 9.94 28.86 12.17 29.44ZM13.84 25.42C15.67 26.5 18.72 24.73 19.69 21.26C16.1 21.04 13.42 23.34 13.84 25.42ZM43.73 60.78C44.5 63.69 49.36 64.92 53.8 62.37C50.36 58.57 45.37 58.25 43.73 60.78ZM47.74 59.07C50.46 59.6 53.44 56.09 53.12 51.39C48.59 52.7 46.31 56.7 47.74 59.07ZM52.2 56.04C53.92 58.29 58.59 57.63 61.54 53.81C57.19 51.74 52.72 53.25 52.2 56.04ZM55.26 52.94C57.82 52.42 59.15 48.29 57.19 44.32C53.72 47.08 53.17 51.38 55.26 52.94ZM58.24 48.43C60.53 49.77 64.34 47.52 65.53 43.16C61.02 42.92 57.69 45.82 58.24 48.43ZM59.88 44.39C61.92 43.03 61.59 38.98 58.47 36.23C56.45 39.87 57.51 43.79 59.88 44.39ZM60.91 39.09C63.37 39.43 65.86 36.14 65.34 31.95C61.36 33.35 59.52 37.04 60.91 39.09ZM60.9 34.73C62.17 32.84 60.45 29.45 56.78 28.19C56.33 32.05 58.64 35.06 60.9 34.73ZM59.83 29.44C62.06 28.86 63.03 25.16 61.1 21.75C58.18 24.35 57.9 28.17 59.83 29.44ZM58.16 25.42C58.58 23.34 55.9 21.04 52.31 21.26C53.28 24.73 56.33 26.5 58.16 25.42ZM40.5 64.47Q35.33 63.2 32.09 61.69A25 25 0 0 1 21.31 16.77M31.5 64.47Q36.67 63.2 39.91 61.69A25 25 0 0 0 50.69 16.77",
    faint:
      "M27.47 60.9L21.02 61.93M23.83 58.46L20.39 53.54M19.05 55.86L13.07 54.44M16.58 52.25L15.35 46.73M13.18 48.01L8.51 44.64M12.23 43.74L13.13 38.52M10.73 38.52L7.9 33.95M11.43 34.21L14.07 30.03M12.07 28.83L11.25 23.9M14.31 25.09L18.06 22.42M16.98 20.37L18.02 15.88M20.45 17.73L24.58 16.78M21.79 16.42L25.71 13.58M44.53 60.9L50.98 61.93M48.17 58.46L51.61 53.54M52.95 55.86L58.93 54.44M55.42 52.25L56.65 46.73M58.82 48.01L63.49 44.64M59.77 43.74L58.87 38.52M61.27 38.52L64.1 33.95M60.57 34.21L57.93 30.03M59.93 28.83L60.75 23.9M57.69 25.09L53.94 22.42M55.02 20.37L53.98 15.88M51.55 17.73L47.42 16.78M50.21 16.42L46.29 13.58",
    hl: "M16.85 20.93C18.94 20.53 20.05 17.17 18.47 13.91C15.63 16.15 15.15 19.65 16.85 20.93ZM19.93 17.85C21.11 19.41 24.33 18.97 26.38 16.36C23.39 14.91 20.3 15.93 19.93 17.85ZM21.31 16.77C23.24 17.89 26.43 15.99 27.42 12.33C23.63 12.14 20.84 14.59 21.31 16.77ZM55.15 20.93C56.85 19.65 56.37 16.15 53.53 13.91C51.95 17.17 53.06 20.53 55.15 20.93ZM52.07 17.85C51.7 15.93 48.61 14.91 45.62 16.36C47.67 18.97 50.89 19.41 52.07 17.85ZM50.69 16.77C51.16 14.59 48.37 12.14 44.58 12.33C45.57 15.99 48.76 17.89 50.69 16.77Z",
  },
  volute: {
    dim: "M12.5 22.5H59.5V25.5H12.5ZM18.6 27.5C18.08 27.66 16.42 27.99 15.49 28.47C14.57 28.96 13.72 29.66 13.06 30.41C12.41 31.17 11.89 32.09 11.56 32.98C11.24 33.88 11.09 34.88 11.11 35.79C11.13 36.7 11.34 37.65 11.68 38.45C12.01 39.26 12.53 40.03 13.1 40.63C13.67 41.23 14.4 41.74 15.12 42.08C15.84 42.42 16.66 42.62 17.42 42.68C18.18 42.73 18.98 42.63 19.68 42.42C20.38 42.2 21.06 41.83 21.6 41.4C22.15 40.97 22.63 40.41 22.97 39.84C23.31 39.26 23.54 38.6 23.65 37.97C23.76 37.34 23.73 36.66 23.61 36.07C23.49 35.47 23.23 34.88 22.92 34.39C22.6 33.89 22.17 33.45 21.72 33.12C21.27 32.8 20.73 32.55 20.22 32.41C19.7 32.28 19.14 32.24 18.63 32.3C18.13 32.35 17.61 32.52 17.18 32.74C16.75 32.96 16.35 33.29 16.04 33.64C15.73 33.99 15.48 34.41 15.33 34.83C15.17 35.25 15.1 35.72 15.11 36.14C15.11 36.57 15.21 37.01 15.36 37.39C15.51 37.76 15.75 38.12 16.02 38.41C16.28 38.69 16.62 38.93 16.95 39.09C17.29 39.26 17.67 39.35 18.03 39.38C18.38 39.41 18.76 39.36 19.08 39.27C19.41 39.17 19.73 39 19.99 38.8C20.24 38.6 20.47 38.34 20.63 38.07C20.79 37.81 20.9 37.5 20.95 37.2C21 36.91 21 36.6 20.94 36.32C20.89 36.04 20.77 35.76 20.62 35.53C20.48 35.3 20.28 35.09 20.07 34.94C19.86 34.78 19.61 34.66 19.37 34.6C19.13 34.53 18.87 34.51 18.63 34.54C18.39 34.56 18.15 34.64 17.95 34.74C17.75 34.84 17.56 34.99 17.41 35.15C17.27 35.32 17.15 35.51 17.08 35.71C17 35.9 16.97 36.12 16.97 36.32C16.97 36.52 17.01 36.73 17.08 36.9C17.15 37.08 17.34 37.3 17.39 37.38C17.44 37.46 17.39 37.38 17.39 37.38M53.4 27.5C53.92 27.66 55.58 27.99 56.51 28.47C57.43 28.96 58.28 29.66 58.94 30.41C59.59 31.17 60.11 32.09 60.44 32.98C60.76 33.88 60.91 34.88 60.89 35.79C60.87 36.7 60.66 37.65 60.32 38.45C59.99 39.26 59.47 40.03 58.9 40.63C58.33 41.23 57.6 41.74 56.88 42.08C56.16 42.42 55.34 42.62 54.58 42.68C53.82 42.73 53.02 42.63 52.32 42.42C51.62 42.2 50.94 41.83 50.4 41.4C49.85 40.97 49.37 40.41 49.03 39.84C48.69 39.26 48.46 38.6 48.35 37.97C48.24 37.34 48.27 36.66 48.39 36.07C48.51 35.47 48.77 34.88 49.08 34.39C49.4 33.89 49.83 33.45 50.28 33.12C50.73 32.8 51.27 32.55 51.78 32.41C52.3 32.28 52.86 32.24 53.37 32.3C53.87 32.35 54.39 32.52 54.82 32.74C55.25 32.96 55.65 33.29 55.96 33.64C56.27 33.99 56.52 34.41 56.67 34.83C56.83 35.25 56.9 35.72 56.89 36.14C56.89 36.57 56.79 37.01 56.64 37.39C56.49 37.76 56.25 38.12 55.98 38.41C55.72 38.69 55.38 38.93 55.05 39.09C54.71 39.26 54.33 39.35 53.97 39.38C53.62 39.41 53.24 39.36 52.92 39.27C52.59 39.17 52.27 39 52.01 38.8C51.76 38.6 51.53 38.34 51.37 38.07C51.21 37.81 51.1 37.5 51.05 37.2C51 36.91 51 36.6 51.06 36.32C51.11 36.04 51.23 35.76 51.38 35.53C51.52 35.3 51.72 35.09 51.93 34.94C52.14 34.78 52.39 34.66 52.63 34.6C52.87 34.53 53.13 34.51 53.37 34.54C53.61 34.56 53.85 34.64 54.05 34.74C54.25 34.84 54.44 34.99 54.59 35.15C54.73 35.32 54.85 35.51 54.92 35.71C55 35.9 55.03 36.12 55.03 36.32C55.03 36.52 54.99 36.73 54.92 36.9C54.85 37.08 54.66 37.3 54.61 37.38C54.56 37.46 54.61 37.38 54.61 37.38M18.6 27.5Q36 30.6 53.4 27.5M24.5 33.2Q36 41.5 47.5 33.2M25.5 44.5L46.5 44.5",
    faint:
      "M30.2 33a1.9 2.6 0 1 0 0.01 0ZM36 33a1.9 2.6 0 1 0 0.01 0ZM41.8 33a1.9 2.6 0 1 0 0.01 0Z",
    hl: "M12.5 22.5L59.5 22.5M18.6 36.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M53.4 36.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0",
    fade: "M26 45.5V68M46 45.5V68M31.3 46.5L31.3 68M36 46.5L36 68M40.7 46.5L40.7 68",
  },
  kylix: {
    dim: "M13.5 31.5C15.5 41.5 25 45.5 36 45.5C47 45.5 56.5 41.5 58.5 31.5M17.4 36.6C11.2 37.4 8.6 33.4 10.8 29.6M54.6 36.6C60.8 37.4 63.4 33.4 61.2 29.6M33.6 45.5C34.6 48 34.4 50.5 33.4 53M38.4 45.5C37.4 48 37.6 50.5 38.6 53M25.5 57.5C27.5 54.2 31 53 36 53C41 53 44.5 54.2 46.5 57.5Z",
    faint: "M16.2 35.5C22 38.6 50 38.6 55.8 35.5",
    hl: "M13.5 31.5L58.5 31.5M20.5 39.6C23 42.2 26.5 43.6 30 44.2",
    floor: "M12 57.5L60 57.5",
  },
};

/**
 * 72px line illustrations: bronze (#7D5C2E) hairlines with gold (#D5AC67) highlights.
 * Strokes stay `strokeWidth` px at any `size` (e.g. size={56} strokeWidth={1.25}).
 */
export function EmptyArt({
  kind,
  size = 72,
  strokeWidth = 1,
  className,
  style,
}: Base & { kind: EmptyKind; size?: number; strokeWidth?: number }) {
  const id = sid(useId());
  const art = EMPTY[kind];
  const ns = "non-scaling-stroke" as const;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`ea-floor-${id}`}
          x1="8"
          y1="0"
          x2="64"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#7D5C2E" stopOpacity="0" />
          <stop offset="0.5" stopColor="#7D5C2E" />
          <stop offset="1" stopColor="#7D5C2E" stopOpacity="0" />
        </linearGradient>
        <radialGradient
          id={`ea-beam-${id}`}
          cx="36"
          cy="28.5"
          r="28"
          gradientTransform="translate(0 28.5) scale(1 0.78) translate(0 -28.5)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#E2C185" stopOpacity="0.26" />
          <stop offset="0.45" stopColor="#D5AC67" stopOpacity="0.08" />
          <stop offset="1" stopColor="#D5AC67" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={`ea-fade-${id}`}
          x1="0"
          y1="45"
          x2="0"
          y2="68"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#7D5C2E" />
          <stop offset="1" stopColor="#7D5C2E" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {art.beam && (
          <path d={art.beam} fill={`url(#ea-beam-${id})`} stroke="none" />
        )}
        {art.floor && (
          <path
            d={art.floor}
            stroke={`url(#ea-floor-${id})`}
            vectorEffect={ns}
          />
        )}
        {art.fade && (
          <path d={art.fade} stroke={`url(#ea-fade-${id})`} vectorEffect={ns} />
        )}
        {art.faint && (
          <path
            d={art.faint}
            stroke="#7D5C2E"
            strokeOpacity={0.6}
            vectorEffect={ns}
          />
        )}
        <path d={art.dim} stroke="#7D5C2E" vectorEffect={ns} />
        {art.dots && (
          <path
            d={art.dots}
            stroke="#D5AC67"
            strokeWidth={strokeWidth * 1.2}
            vectorEffect={ns}
          />
        )}
        <path d={art.hl} stroke="#D5AC67" vectorEffect={ns} />
      </g>
    </svg>
  );
}

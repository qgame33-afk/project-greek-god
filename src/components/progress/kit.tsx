"use client";

import { DropdownMenu } from "radix-ui";
import { Ellipsis, Pencil, Trash } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { RISE_IN_PLACE, useSwapIn } from "@/lib/motion";

/* ------------------------------------------------------------- stat tile */

/**
 * A placard stat: eyebrow → value + unit → delta → caption. `tone="earned"` puts the delta in
 * leaf (something he did); everything else stays stone. There is no red or green.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  tone = "neutral",
  caption,
  badge,
  size = "md",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: ReactNode;
  tone?: "earned" | "neutral";
  caption?: ReactNode;
  badge?: ReactNode;
  size?: "lg" | "md" | "sm";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-h-5 items-center gap-1.5">
        <p className="t-eyebrow truncate">{label}</p>
        {badge}
      </div>
      <p className={cn("tnum mt-1.5 truncate text-ivory", size === "lg" ? "t-num-l" : size === "md" ? "t-num-m" : "t-num-s")}>
        {value}
        {unit && <span className="t-meta ml-1 font-medium text-stone">{unit}</span>}
      </p>
      {delta != null && <p className={cn("t-meta mt-1 truncate font-semibold", tone === "earned" ? "text-leaf-300" : "text-stone")}>{delta}</p>}
      {caption != null && <p className="t-meta mt-0.5 line-clamp-2 text-stone">{caption}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- badges */

// Provenance marks come from the shared kit so PLAN / FIRST BENCHMARK look the same app-wide.
export { PlanBadge, FirstBenchmarkBadge as BenchmarkBadge } from "@/components/ui/badge";

/* ------------------------------------------------------------ sparkline */

/**
 * A small trend line (pure SVG). Needs ≥ 2 points; one point renders a dot. Leaf is for his own
 * results (lifts, jumps); ivory for neutral measurements. Colours are CSS variables.
 */
export function Sparkline({
  values,
  width = 64,
  height = 24,
  tone = "leaf",
  className,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: "leaf" | "ivory";
  className?: string;
  label?: string;
}) {
  const color = tone === "leaf" ? "var(--leaf-300)" : "var(--ivory)";
  if (!values.length) return <span className={cn("block shrink-0", className)} style={{ width, height }} aria-hidden />;
  const pad = 3;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? width - pad : pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = hi === lo ? height / 2 : pad + (1 - (v - lo) / span) * (height - pad * 2);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as const;
  });
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("");
  const last = pts.at(-1)!;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {values.length > 1 && <path d={d} fill="none" style={{ stroke: color, strokeOpacity: tone === "leaf" ? 0.9 : 0.7 }} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />}
      <circle cx={last[0]} cy={last[1]} r={2.25} style={{ fill: color }} />
    </svg>
  );
}

/* --------------------------------------------------------- sr-only table */

export function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    // the wrapper is the visually hidden box: a table ignores width: 1px and would widen the page
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={j}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------- chart frame */

/** Fixed-height chart box so lazy charts never shift layout. `swapKey` fades the new chart in. */
export function ChartFrame({ children, className, tall = true, swapKey = "" }: { children: ReactNode; className?: string; tall?: boolean; swapKey?: string }) {
  const ref = useSwapIn<HTMLDivElement, string>(swapKey, {
    direction: RISE_IN_PLACE,
  });
  return (
    <div ref={ref} className={cn("relative w-full touch-pan-y select-none", tall ? "h-56 lg:h-72" : "h-44 lg:h-56", className)}>
      {children}
    </div>
  );
}

export function ChartSkeleton() {
  return <div className="skeleton absolute inset-0 rounded-field" aria-hidden />;
}

/* ------------------------------------------------------------- row menu */

/** ⋯ menu with Edit / Delete — the visible equivalent of swipe actions. */
export function RowMenu({ label, onEdit, onDelete, deleteLabel = "Delete" }: { label: string; onEdit?: () => void; onDelete?: () => void; deleteLabel?: string }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className="press -mr-2 grid size-11 shrink-0 place-items-center rounded-field text-ash transition-colors hover:text-ivory data-[state=open]:bg-m3 data-[state=open]:text-ivory"
        aria-label={`More actions for ${label}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Ellipsis className="size-5" strokeWidth={1.6} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-(--z-confirm) min-w-44 rounded-btn bg-m3 p-1.5 shadow-[inset_0_0_0_1px_var(--vein-3),0_20px_40px_-12px_rgb(0_0_0/.8)] data-[state=open]:animate-[rise_160ms_var(--ease-out)]"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit && (
            <DropdownMenu.Item onSelect={onEdit} className="t-callout flex h-11 cursor-pointer items-center gap-2.5 rounded-field px-3 font-semibold text-ivory outline-none data-[highlighted]:bg-m4">
              <Pencil className="size-4 text-stone" strokeWidth={1.6} /> Edit
            </DropdownMenu.Item>
          )}
          {onDelete && (
            <DropdownMenu.Item
              onSelect={onDelete}
              className="t-callout flex h-11 cursor-pointer items-center gap-2.5 rounded-field px-3 font-semibold text-cinnabar outline-none data-[highlighted]:bg-cinnabar-tint"
            >
              <Trash className="size-4" strokeWidth={1.6} /> {deleteLabel}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* ----------------------------------------------------------- formatting */

/** Signed number with a true minus: +0.42 / −0.30 / 0. */
export function signed(v: number | null | undefined, dp = 1) {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = Math.round(v * 10 ** dp) / 10 ** dp;
  if (r === 0) return (0).toFixed(dp);
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(dp)}`;
}

/** Section eyebrow with an optional trailing control. */
export function SectionHead({ title, children, className, id }: { title: ReactNode; children?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("mb-1 flex min-h-11 items-center justify-between gap-3", className)}>
      <h2 id={id} className="t-eyebrow">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** A section title in the voice (Cormorant) with an optional eyebrow above and a control beside. */
export function SectionTitle({ eyebrow, title, children, id, className }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn("mb-2 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
        <h2 id={id} className="t-title-2 mt-0.5 text-ivory">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

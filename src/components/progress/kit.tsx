"use client";

import { DropdownMenu } from "radix-ui";
import { Ellipsis, Pencil, Trash } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { RISE_IN_PLACE, useSwapIn } from "@/lib/motion";
import type { Tone } from "@/lib/progress/plan";

/* ------------------------------------------------------------- stat tile */

const TONE_CLS: Record<Tone, string> = { success: "text-success", warning: "text-warning", neutral: "text-fg-2" };

/** DESIGN §5.3 stat tile: eyebrow → value + unit → delta (tone follows the plan) → caption. */
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
  tone?: Tone;
  caption?: ReactNode;
  badge?: ReactNode;
  size?: "lg" | "md" | "sm";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-h-5 items-center gap-1.5">
        <p className="eyebrow truncate">{label}</p>
        {badge}
      </div>
      <p className={cn("mt-1.5 truncate", size === "lg" ? "num-lg" : size === "md" ? "num-md" : "num-sm")}>
        {value}
        {unit && <span className="unit [font-size:max(12px,0.4em)]!">{unit}</span>}
      </p>
      {delta != null && <p className={cn("mt-1 truncate text-[12px] font-semibold", TONE_CLS[tone])}>{delta}</p>}
      {caption != null && <p className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug text-fg-3">{caption}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- badges */

// Provenance badges come from the shared kit so PLAN / FIRST BENCHMARK look the same app-wide.
export { PlanBadge, FirstBenchmarkBadge as BenchmarkBadge } from "@/components/ui/badge";

/* ------------------------------------------------------------ sparkline */

/** 24px trend line (pure SVG). Needs ≥2 points; one point renders a dot. */
export function Sparkline({
  values,
  width = 64,
  height = 24,
  tone = "gold",
  className,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: "gold" | "marble" | "verdigris" | "lapis";
  className?: string;
  label?: string;
}) {
  const color = tone === "gold" ? "var(--gold-400)" : tone === "marble" ? "var(--s-marble)" : tone === "verdigris" ? "var(--s-verdigris)" : "var(--s-lapis)";
  if (!values.length) return <span className={cn("block", className)} style={{ width, height }} aria-hidden />;
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
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0 overflow-visible", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {values.length > 1 && <path d={d} fill="none" stroke={color} strokeOpacity={0.9} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />}
      <circle cx={last[0]} cy={last[1]} r={2.25} fill={color} />
    </svg>
  );
}

/* --------------------------------------------------------- sr-only table */

export function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
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
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* --------------------------------------------------------- chart frame */

/** Fixed-height frame so lazy charts never shift layout (220px mobile, 300px desktop). */
/** Fixed-height chart box. `swapKey` (e.g. the range) fades the new chart in when it changes. */
export function ChartFrame({ children, className, tall = true, swapKey = "" }: { children: ReactNode; className?: string; tall?: boolean; swapKey?: string }) {
  const ref = useSwapIn<HTMLDivElement, string>(swapKey, { direction: RISE_IN_PLACE });
  return (
    <div ref={ref} className={cn("relative w-full touch-pan-y select-none", tall ? "h-[220px] lg:h-[300px]" : "h-[180px] lg:h-[220px]", className)}>
      {children}
    </div>
  );
}

export function ChartSkeleton() {
  return <DelayedSkeleton className="absolute inset-0 rounded-[14px]" />;
}

/** Skeleton that only appears after 150ms (DESIGN §5.10), so quick loads never flash. The
 *  delay now lives in the shared `skeleton` utility, so this is a plain skeleton. */
export function DelayedSkeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

/* ------------------------------------------------------------- row menu */

/** ⋯ menu with Edit / Delete — the visible equivalent of swipe actions. */
export function RowMenu({ label, onEdit, onDelete, deleteLabel = "Delete" }: { label: string; onEdit?: () => void; onDelete?: () => void; deleteLabel?: string }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className="-mr-2 grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-3 transition-colors hover:text-fg data-[state=open]:bg-white/5 data-[state=open]:text-fg"
        aria-label={`More actions for ${label}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Ellipsis className="size-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-[55] min-w-44 rounded-[14px] border border-line-strong bg-s3 p-1.5 shadow-[var(--e3)] data-[state=open]:animate-[rise_160ms_var(--ease-out)]"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit && (
            <DropdownMenu.Item onSelect={onEdit} className="flex h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-3 text-[14px] font-semibold text-fg outline-none data-[highlighted]:bg-white/6">
              <Pencil className="size-4 text-fg-2" /> Edit
            </DropdownMenu.Item>
          )}
          {onDelete && (
            <DropdownMenu.Item onSelect={onDelete} className="flex h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-3 text-[14px] font-semibold text-danger outline-none data-[highlighted]:bg-danger-tint">
              <Trash className="size-4" /> {deleteLabel}
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
export function SectionHead({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex min-h-11 items-center justify-between gap-3", className)}>
      <h2 className="eyebrow">{title}</h2>
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A meal coin (docs/DESIGN-V2.md §3.5.2). The glyph (the per-recipe RecipeGlyph) keeps every
 * state distinguishable without colour, and a perfect week reads as rims, never a gold wall:
 *
 *   eaten    beaded leaf rim + leaf-300 glyph on m2 (past days: `past` dims the rim to 70%)
 *   changed  as eaten + a small ≈ notch (portion changed)
 *   planned  ivory glyph in relief, --vein-3 rim
 *   missed   --ui-line dashed rim (3:1) + a "–" overlay
 *   next     a planned coin inside a leaf-line dashed ring
 *
 * Size ≤ 44 px (default 36). With `label` it is an image for VoiceOver ("Monday breakfast,
 * peameal sandwich, eaten"); put it inside a button for taps.
 */
export type CoinState = "eaten" | "changed" | "planned" | "missed" | "next";

export function Coin({
  state,
  glyph,
  size = 36,
  past,
  label,
  className,
}: {
  state: CoinState;
  glyph?: ReactNode;
  size?: number;
  past?: boolean;
  label?: string;
  className?: string;
}) {
  const s = Math.min(44, size);
  const eaten = state === "eaten" || state === "changed";
  const r = 16;
  // beads: 28 dots around the rim
  const beads = 2 * Math.PI * r;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: s, height: s }}
      data-coin={state}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-full" aria-hidden>
        <circle cx="18" cy="18" r="17" style={{ fill: eaten ? "var(--m2)" : state === "missed" ? "transparent" : "var(--m1)" }} />
        {eaten && (
          <>
            <circle cx="18" cy="18" r={r} fill="none" style={{ stroke: "var(--leaf-500)", opacity: past ? 0.7 : 1 }} strokeWidth="1.6" />
            <circle
              cx="18"
              cy="18"
              r={r}
              fill="none"
              style={{ stroke: "var(--leaf-200)", opacity: past ? 0.7 : 1 }}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeDasharray={`0.01 ${beads / 28}`}
            />
          </>
        )}
        {(state === "planned" || state === "next") && <circle cx="18" cy="18" r={r} fill="none" style={{ stroke: "var(--vein-3)" }} strokeWidth="1.4" />}
        {state === "missed" && <circle cx="18" cy="18" r={r} fill="none" style={{ stroke: "var(--ui-line)" }} strokeWidth="1.5" strokeDasharray="3 2.6" />}
      </svg>
      {state === "next" && (
        <span aria-hidden className="absolute -inset-[3px] rounded-full border border-dashed border-leaf-line" />
      )}
      <span
        aria-hidden
        className={cn(
          "relative grid place-items-center [&_svg]:size-[55%]",
          eaten ? "text-leaf-300" : state === "missed" ? "text-ash" : "text-ivory",
          state === "missed" && "opacity-70",
        )}
        style={{ width: s, height: s }}
      >
        {glyph}
      </span>
      {state === "missed" && (
        <span aria-hidden className="absolute left-1/2 top-1/2 h-[1.5px] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone" />
      )}
      {state === "changed" && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center rounded-full bg-m4 text-[length:11px] leading-none font-bold text-leaf-200 shadow-[0_0_0_1.5px_var(--night)]">
          ≈
        </span>
      )}
    </span>
  );
}

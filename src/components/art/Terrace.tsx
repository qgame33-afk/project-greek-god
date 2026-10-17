import { cn } from "@/lib/cn";

/**
 * A terrace mark (docs/DESIGN-V2.md §3.6.1 terraces I–VII): three contour lines like a stepped
 * hillside, with the Roman numeral. `reached` contours are leaf (earned), `next` is a dashed
 * leaf-line (the one ahead), `ahead` is --ui-line (3:1). The summit uses `final` for OLYMPUS.
 * Decorative unless `label` is given ("Terrace three, 170 pounds, projected 14 November").
 */
export function Terrace({
  numeral,
  state,
  size = 44,
  final,
  label,
  className,
}: {
  numeral: string;
  state: "reached" | "next" | "ahead";
  size?: number;
  final?: boolean;
  label?: string;
  className?: string;
}) {
  const stroke = state === "reached" ? "var(--leaf-300)" : state === "next" ? "var(--leaf-line)" : "var(--ui-line)";
  const dash = state === "next" ? "3 2.5" : undefined;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex shrink-0 flex-col items-center", className)}
      style={{ width: size }}
    >
      <svg viewBox="0 0 44 24" width={size} height={(size * 24) / 44} fill="none" style={{ stroke }} strokeWidth={1.4} strokeLinecap="round">
        <path d="M3 21C9 21 12 16.5 18 16.5S27 21 41 21" strokeDasharray={dash} />
        <path d="M7 15.5C12 15.5 14 11 19.5 11S28 15.5 37 15.5" strokeDasharray={dash} opacity={0.85} />
        <path d="M12 10C15.5 10 17 5.5 21 5.5S27 10 32 10" strokeDasharray={dash} opacity={0.7} />
        {final && <path d="M21 1.5l1.3 1.3-1.3 1.3-1.3-1.3z" fill="currentColor" style={{ fill: stroke }} />}
      </svg>
      <span className={cn("t-title-2 mt-0.5 leading-none", state === "reached" ? "text-leaf-300" : state === "next" ? "text-ivory" : "text-stone")}>{numeral}</span>
    </span>
  );
}

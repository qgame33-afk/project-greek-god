import { cn } from "@/lib/cn";

/**
 * Plates on each side, as plain chips (docs/DESIGN-V3-SIMPLE.md §1.7.4, §4.2.7): one chip per
 * plate, heaviest first, and the total a side. The plate that changed since last time has a
 * 1.5 px white outline (never gold). The props are unchanged.
 *
 *   <PlateStack plates={[45, 25, 2.5]} unit="lb" changed={2} />   // 45 · 25 · 2.5 = 72.5 lb a side
 */
export interface PlateStackProps {
  /** Per side, heaviest first (the order they go on). Display units. */
  plates: number[];
  unit: "lb" | "kg";
  /** Index in `plates` of the plate that changed since last session. */
  changed?: number | null;
  /** Kept for old callers; chips have one size. */
  height?: number;
  className?: string;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));

export function PlateStack({ plates, unit, changed = null, className }: PlateStackProps) {
  const total = plates.reduce((s, w) => s + w, 0);
  const label = plates.length
    ? `Plates on each side: ${plates.map(fmt).join(", ")}, ${fmt(total)} ${unit === "lb" ? "pounds" : "kilograms"} a side`
    : "No plates: the bar alone";
  return (
    <div role="img" aria-label={label} className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span aria-hidden className="t-cap">
        Plates on each side
      </span>
      <span aria-hidden className="flex flex-wrap items-center gap-1.5">
        {plates.length === 0 && <span className="t-label">Just the bar</span>}
        {plates.map((w, i) => (
          <span
            key={i}
            className={cn(
              "t-label inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-pill bg-card-2 px-2.5 font-semibold text-fg tabular-nums",
              i === changed && "shadow-[inset_0_0_0_1.5px_var(--text)]",
            )}
          >
            {fmt(w)}
          </span>
        ))}
        {plates.length > 0 && (
          <span className="t-label ml-1 tabular-nums">
            = {fmt(total)} {unit} a side
          </span>
        )}
      </span>
    </div>
  );
}

import { cn } from "@/lib/cn";

/**
 * The plate stack (docs/DESIGN-V2.md §3.2.1): one barbell sleeve drawn per side, plates to scale in
 * height (48 px for a full-size plate), each labelled. The plate that changed since last session is
 * leaf (an earned mark), every other plate ivory on m3. Hidden by the caller for non-barbell work.
 *
 *   <PlateStack plates={[45, 25, 2.5]} unit="lb" changed={2} />   // "2.5 = today's +5 lb"
 */
export interface PlateStackProps {
  /** Per side, heaviest first (the order they go on). Display units. */
  plates: number[];
  unit: "lb" | "kg";
  /** Index in `plates` of the plate that changed since last session. */
  changed?: number | null;
  /** Height of a full-size plate in px. */
  height?: number;
  className?: string;
}

/** Plate diameter relative to a full-size (45 lb / 20 kg) plate. */
function diameter(w: number, unit: "lb" | "kg") {
  const lb = unit === "lb" ? w : w * 2.2046;
  if (lb >= 44) return 1;
  if (lb >= 33) return 0.88;
  if (lb >= 22) return 0.76;
  if (lb >= 14) return 0.64;
  if (lb >= 9) return 0.56;
  if (lb >= 4.5) return 0.45;
  if (lb >= 2.2) return 0.36;
  return 0.3;
}

/** Plate thickness in px (heavier plates are thicker). */
function thickness(w: number, unit: "lb" | "kg") {
  const lb = unit === "lb" ? w : w * 2.2046;
  if (lb >= 44) return 13;
  if (lb >= 33) return 12;
  if (lb >= 22) return 11;
  if (lb >= 9) return 9;
  if (lb >= 4.5) return 7;
  return 6;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));
const SLOT = 26;

export function PlateStack({ plates, unit, changed = null, height = 48, className }: PlateStackProps) {
  const label = plates.length ? `Per side: ${plates.map(fmt).join(", ")} ${unit === "lb" ? "pounds" : "kilograms"}` : "No plates: the bar alone";
  return (
    <div role="img" aria-label={label} className={cn("inline-flex flex-col", className)}>
      <div className="relative flex items-center" style={{ height }}>
        {/* the sleeve, then the collar */}
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-m4 shadow-[inset_0_0_0_1px_var(--ui-line)]" />
        <span aria-hidden className="relative mr-1 h-5 w-2 rounded-[2px] bg-m4 shadow-[inset_0_0_0_1px_var(--ui-line)]" />
        {plates.map((w, i) => {
          const isChanged = i === changed;
          return (
            <span key={i} aria-hidden className="relative grid shrink-0 place-items-center" style={{ width: SLOT, height }}>
              <span
                className={cn("rounded-[3px]", isChanged ? "leaf" : "bg-m3 shadow-[inset_0_0_0_1.5px_var(--ivory)]")}
                style={{ width: thickness(w, unit), height: Math.round(height * diameter(w, unit)) }}
              />
            </span>
          );
        })}
        <span aria-hidden className="relative w-6" />
      </div>
      <div aria-hidden className="ml-3 flex">
        {plates.map((w, i) => (
          <span key={i} className={cn("t-meta tnum text-center", i === changed ? "font-semibold text-leaf-300" : "text-stone")} style={{ width: SLOT }}>
            {fmt(w)}
          </span>
        ))}
      </div>
    </div>
  );
}

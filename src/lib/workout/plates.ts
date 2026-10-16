// Barbell plate math for the keypad's Plates line: "45 bar + 45 · 25 · 5 per side".

const PLATES = {
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
} as const;

export interface PlateLoad {
  bar: number;
  perSide: number[];
  /** Load that standard plates can't make, per side (0 when exact). */
  leftover: number;
}

/** Greedy plate breakdown for a total (in display units). Null when the total is below the bar. */
export function platesFor(total: number, unit: "lb" | "kg"): PlateLoad | null {
  const { bar, plates } = PLATES[unit];
  if (!Number.isFinite(total) || total < bar) return null;
  let side = Math.round(((total - bar) / 2) * 100) / 100;
  const perSide: number[] = [];
  for (const p of plates) {
    while (side + 1e-9 >= p) {
      perSide.push(p);
      side = Math.round((side - p) * 100) / 100;
    }
  }
  return { bar, perSide, leftover: side };
}

export function platesLabel(total: number, unit: "lb" | "kg"): string | null {
  const p = platesFor(total, unit);
  if (!p) return null;
  if (!p.perSide.length) return `Empty ${p.bar} ${unit} bar`;
  const odd = p.leftover > 0 ? ` (+${p.leftover} not loadable)` : "";
  return `${p.bar} bar + ${p.perSide.join(" · ")} per side${odd}`;
}

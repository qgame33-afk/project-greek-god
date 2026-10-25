import { cn } from "@/lib/cn";
import type { Macros } from "@/lib/meals/types";
import { gramsText, kcalText, macroAria } from "./format";

/** Series colours used for macros everywhere in Fuel: protein ivory (leaf only once earned), carbs terracotta, fat porphyry. */
export const MACRO_DOT = { protein: "bg-fg", carbs: "bg-carbs", fat: "bg-fat" } as const;

const MACROS = [
  { key: "protein", short: "P", label: "Protein" },
  { key: "carbs", short: "C", label: "Carbs" },
  { key: "fat", short: "F", label: "Fat" },
] as const;

/**
 * One-line macros for cards and rows: "920 kcal · P 58 · C 80 · F 30". kcal leads;
 * `protein` mode shows only kcal and protein ("920 kcal · 58 g protein") for tight spaces.
 * Always an estimate: the aria-label says so, and callers show the ESTIMATE badge nearby.
 */
export function MacroLine({ macros, mode = "full", className }: { macros: Macros; mode?: "full" | "protein"; className?: string }) {
  return (
    <p className={cn("t-cap flex min-w-0 items-baseline gap-x-2.5 whitespace-nowrap text-fg-2", className)} aria-label={macroAria(macros)}>
      <span className="text-fg" aria-hidden>
        <span className="t-num-s">{kcalText(macros.kcal)}</span>
        <span className="ml-0.5">kcal</span>
      </span>
      {mode === "protein" ? (
        <span aria-hidden>
          <span className="t-num-s text-fg">{gramsText(macros.protein)}</span>
          <span className="ml-0.5">g protein</span>
        </span>
      ) : (
        MACROS.map((m) => (
          <span key={m.key} className="inline-flex items-baseline gap-1" aria-hidden>
            <span className={cn("size-1.5 shrink-0 translate-y-[-1px] self-center rounded-full", MACRO_DOT[m.key])} />
            <span>{m.short}</span>
            <span className="tabular-nums font-semibold text-fg">{gramsText(macros[m.key])}</span>
          </span>
        ))
      )}
    </p>
  );
}

/**
 * kcal / protein / carbs / fat as four pills (recipe headers, sheets). `size="lg"` makes the
 * numbers larger for the recipe screen.
 */
export function MacroChips({ macros, size = "md", className }: { macros: Macros; size?: "md" | "lg"; className?: string }) {
  const lg = size === "lg";
  const cell = cn("flex min-w-0 flex-col justify-center rounded-field bg-control", lg ? "px-3 py-2.5" : "px-2.5 py-2");
  const value = cn("leading-none text-fg", lg ? "t-num-s" : "t-num-s");
  const label = "t-cap mt-1 flex items-center gap-1 text-fg-2";
  return (
    <div className={cn("grid grid-cols-4 gap-1.5", className)} role="group" aria-label={macroAria(macros)}>
      <div className={cell} aria-hidden>
        <span className={value}>{kcalText(macros.kcal)}</span>
        <span className={label}>
          <span className="size-1.5 shrink-0 rounded-full bg-fg" />
          kcal
        </span>
      </div>
      {MACROS.map((m) => (
        <div key={m.key} className={cell} aria-hidden>
          <span className={value}>
            {gramsText(macros[m.key])}
            <span className="t-cap ml-0.5 text-fg-2">g</span>
          </span>
          <span className={label}>
            <span className={cn("size-1.5 shrink-0 rounded-full", MACRO_DOT[m.key])} />
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}

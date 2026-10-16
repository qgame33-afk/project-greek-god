import { cn } from "@/lib/cn";
import type { Macros } from "@/lib/meals/types";
import { gramsText, kcalText, macroAria } from "./format";

/** Series colours used for macros everywhere in Fuel: protein marble, carbs terracotta, fat porphyry. */
export const MACRO_DOT = { protein: "bg-marble", carbs: "bg-terracotta", fat: "bg-porphyry" } as const;

const MACROS = [
  { key: "protein", short: "P", label: "Protein" },
  { key: "carbs", short: "C", label: "Carbs" },
  { key: "fat", short: "F", label: "Fat" },
] as const;

/**
 * One-line macros for cards and rows: "920 kcal · P 58 · C 80 · F 30". kcal leads in Barlow;
 * `protein` mode shows only kcal and protein ("920 kcal · 58 g protein") for tight spaces.
 * Always an estimate: the aria-label says so, and callers show the ESTIMATE badge nearby.
 */
export function MacroLine({ macros, mode = "full", className }: { macros: Macros; mode?: "full" | "protein"; className?: string }) {
  return (
    <p className={cn("flex min-w-0 items-baseline gap-x-2.5 whitespace-nowrap text-[12.5px] font-semibold text-fg-2", className)} aria-label={macroAria(macros)}>
      <span className="text-fg" aria-hidden>
        <span className="num text-[16px] font-semibold">{kcalText(macros.kcal)}</span>
        <span className="ml-0.5 text-[11.5px] font-semibold text-fg-2">kcal</span>
      </span>
      {mode === "protein" ? (
        <span aria-hidden>
          <span className="num text-[15px] font-semibold text-fg">{gramsText(macros.protein)}</span>
          <span className="ml-0.5 text-[11.5px]">g protein</span>
        </span>
      ) : (
        MACROS.map((m) => (
          <span key={m.key} className="inline-flex items-baseline gap-1" aria-hidden>
            <span className={cn("size-1.5 shrink-0 translate-y-[-1px] self-center rounded-full", MACRO_DOT[m.key])} />
            <span className="text-fg-3">{m.short}</span>
            <span className="num text-[14px] font-semibold text-fg">{gramsText(macros[m.key])}</span>
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
  const cell = cn("flex min-w-0 flex-col justify-center rounded-[12px] bg-s3", lg ? "px-3 py-2.5" : "px-2.5 py-2");
  const value = cn("num font-semibold leading-none text-fg", lg ? "text-[24px]" : "text-[18px]");
  const label = "mt-1 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-fg-3";
  return (
    <div className={cn("grid grid-cols-4 gap-1.5", className)} role="group" aria-label={macroAria(macros)}>
      <div className={cell} aria-hidden>
        <span className={value}>{kcalText(macros.kcal)}</span>
        <span className={label}>
          <span className="size-1.5 rounded-full bg-gold-400" />
          kcal
        </span>
      </div>
      {MACROS.map((m) => (
        <div key={m.key} className={cell} aria-hidden>
          <span className={value}>
            {gramsText(macros[m.key])}
            <span className="ml-0.5 font-sans text-[11px] font-semibold text-fg-2">g</span>
          </span>
          <span className={label}>
            <span className={cn("size-1.5 rounded-full", MACRO_DOT[m.key])} />
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}

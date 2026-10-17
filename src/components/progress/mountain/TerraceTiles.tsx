"use client";

import { Terrace as TerraceArt } from "@/components/art/Terrace";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { parseISODate, type ISODate } from "@/lib/dates";
import { dayMonth, type Terrace } from "@/lib/progress/pace";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const spokenDate = (d: ISODate) => parseISODate(d).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/**
 * Terraces I–VII (docs/DESIGN-V2.md §3.6.1 item 6). Reached: numeral, lb and the date the trend
 * first crossed it. Next: its ETA at today's rate (PROJ) or "—" with what it needs. The last one is
 * OLYMPUS. A 4-column grid on phones (the final tile spans what is left of its row); a list at
 * accessibility text sizes.
 */
export function TerraceTiles({ terraces, today, unit, needs }: { terraces: Terrace[]; today: ISODate; unit: WeightUnit; needs: string }) {
  const nextIndex = terraces.find((t) => !t.reachedOn)?.index ?? null;
  const lb = (v: number) => {
    const d = round(toDisplayWeight(v, unit), 1);
    return Number.isInteger(d) ? `${d}` : d.toFixed(1);
  };
  const lastSpan = 4 - ((terraces.length - 1) % 4);
  const reached = terraces.filter((t) => t.reachedOn).length;

  return (
    <section aria-labelledby="terraces-h" className="@container">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="terraces-h" className="t-eyebrow">
          Terraces
        </h2>
        <span className="t-meta tnum text-stone">
          {reached} of {terraces.length} reached
        </span>
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-2 @max-[19rem]:grid-cols-1 @max-[19rem]:gap-0">
        {terraces.map((t, i) => {
          const state = t.reachedOn ? "reached" : t.index === nextIndex ? "next" : "ahead";
          const words = `Terrace ${NUMBER_WORDS[t.index] ?? t.index}${t.final ? ", Olympus" : ""}, ${lb(t.lb)} ${unit === "kg" ? "kilograms" : "pounds"}, ${
            t.reachedOn ? `reached ${spokenDate(t.reachedOn)}` : t.eta ? `projected ${spokenDate(t.eta)}` : "no projection yet"
          }`;
          return (
            <li
              key={t.index}
              aria-label={words}
              className={cn(
                "relative flex min-h-[7.25rem] min-w-0 flex-col items-center justify-between rounded-field px-1 pb-2.5 pt-3 text-center",
                state === "next" ? "bg-m2 shadow-[inset_0_0_0_1px_var(--leaf-line)]" : "shadow-[inset_0_0_0_1px_var(--vein-2)]",
                // AX: a plain list row
                "@max-[19rem]:min-h-14 @max-[19rem]:flex-row @max-[19rem]:justify-start @max-[19rem]:gap-3 @max-[19rem]:rounded-none @max-[19rem]:border-b @max-[19rem]:border-vein @max-[19rem]:bg-transparent @max-[19rem]:px-0 @max-[19rem]:py-2.5 @max-[19rem]:text-left @max-[19rem]:shadow-none",
              )}
              style={t.final && i === terraces.length - 1 && lastSpan > 1 ? { gridColumn: `span ${lastSpan}` } : undefined}
            >
              <TerraceArt numeral={t.numeral} state={state} final={t.final} size={36} />
              <span aria-hidden className="flex min-w-0 flex-col items-center gap-0.5 @max-[19rem]:flex-1 @max-[19rem]:items-start">
                <span className={cn("t-num-s tnum", t.final ? "text-ivory" : state === "reached" ? "text-ivory" : "text-stone")}>
                  {t.final ? `Olympus · ${lb(t.lb)}` : lb(t.lb)}
                </span>
                <span className={cn("t-meta tnum whitespace-nowrap", state === "reached" ? "text-leaf-300" : "text-stone")}>
                  {t.reachedOn ? dayMonth(t.reachedOn, today) : t.eta ? `≈ ${dayMonth(t.eta, today)}` : "—"}
                </span>
                {state === "next" && t.eta && <Tag kind="PROJ" className="mt-0.5" />}
                {state === "next" && !t.eta && <span className="t-meta text-stone">{needs}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="t-meta mt-2.5 text-stone">Leaf dates are when your trend first reached a terrace. Dates with ≈ are projections at today&apos;s rate.</p>
    </section>
  );
}

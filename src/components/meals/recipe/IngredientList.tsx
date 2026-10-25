"use client";

import { cn } from "@/lib/cn";
import type { ScaledIngredient } from "@/lib/meals/recipe";

/**
 * The ingredients (docs/DESIGN-V3-SIMPLE.md §4.4.3): one list group, what it is on the left and
 * the amount (scaled to the servings) on the right. Tapping a row ticks it off while cooking or
 * shopping (struck through, kept on this device per meal). Staples (salt, oil, spices) sit under
 * "From the pantry".
 */
export function IngredientList({
  items,
  checked,
  onToggle,
  dense,
}: {
  items: ScaledIngredient[];
  checked: readonly string[];
  onToggle: (key: string) => void;
  /** Tighter rows (cooking mode's sheet). */
  dense?: boolean;
}) {
  const main = items.filter((i) => !i.staple);
  const pantry = items.filter((i) => i.staple);
  return (
    <div data-food="">
      <ul className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
        {main.map((i) => (
          <Row key={i.key} item={i} on={checked.includes(i.key)} onToggle={onToggle} dense={dense} />
        ))}
      </ul>
      {pantry.length > 0 && (
        <>
          <p className="t-label mb-2 mt-5 px-1">From the pantry</p>
          <ul className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
            {pantry.map((i) => (
              <Row key={i.key} item={i} on={checked.includes(i.key)} onToggle={onToggle} dense={dense} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Row({ item, on, onToggle, dense }: { item: ScaledIngredient; on: boolean; onToggle: (key: string) => void; dense?: boolean }) {
  // "190 g extra-lean ground beef" → "extra-lean ground beef" · "190 g"; self-named counts ("5 eggs") keep their text
  const rest = item.amount && item.text.startsWith(item.amount) ? item.text.slice(item.amount.length).trim() : "";
  const name = rest || item.text;
  const amount = rest ? item.amount : "";
  const name1 = name.charAt(0).toUpperCase() + name.slice(1);
  const note = [item.optional ? "Optional" : null, item.note].filter(Boolean).join(" · ");
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={`${amount ? `${amount} ` : ""}${name}${note ? `, ${note}` : ""}${on ? ", ticked" : ""}`}
        onClick={() => onToggle(item.key)}
        className={cn("press-soft flex w-full items-center gap-3 px-4 text-left", dense ? "min-h-[3.25rem] py-2" : "min-h-14 py-3")}
      >
        <span className="min-w-0 flex-1">
          <span className={cn("t-body block", on && "text-fg-2 line-through")} data-budget-name="">
            {name1}
          </span>
          {note && <span className="t-cap mt-0.5 block">{note}</span>}
        </span>
        {amount && <span className={cn("t-body shrink-0 whitespace-nowrap text-right tabular-nums text-fg-2", on && "line-through")}>{amount}</span>}
      </button>
    </li>
  );
}

"use client";

import { Check } from "lucide-react";
import { OptionalBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { ScaledIngredient } from "@/lib/meals/recipe";

/**
 * The ingredient checklist: amounts already scaled to the servings, the amount in bold so it
 * reads at arm's length, then what it is. Staples (salt, oil, spices) sit under "From the
 * pantry". Ticks are kept on this device per meal.
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
    <div>
      <ul className="divide-y divide-vein">
        {main.map((i) => (
          <Row key={i.key} item={i} on={checked.includes(i.key)} onToggle={onToggle} dense={dense} />
        ))}
      </ul>
      {pantry.length > 0 && (
        <>
          <p className="t-eyebrow mt-5 mb-1">From the pantry</p>
          <ul className="divide-y divide-vein">
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
  // "190 g extra-lean ground beef" → bold "190 g" + the rest; self-named counts ("5 eggs") are all amount
  const rest = item.text.startsWith(item.amount) ? item.text.slice(item.amount.length).trim() : item.text;
  const amountFirst = item.text.startsWith(item.amount);
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={() => onToggle(item.key)}
        className={cn("press-soft group flex w-full items-start gap-3 text-left", dense ? "min-h-[3.25rem] py-2" : "min-h-14 py-2.5")}
      >
        <span aria-hidden className="-my-1 grid size-11 shrink-0 place-items-center">
          <span
            className={cn(
              "grid size-[1.625rem] place-items-center rounded-full transition-[background-color,box-shadow] duration-(--dur-fast)",
              on ? "bg-ivory" : "shadow-[inset_0_0_0_1.5px_var(--ui-line)] group-hover:shadow-[inset_0_0_0_1.5px_var(--stone)]",
            )}
          >
            <Check className={cn("size-4 text-ink transition-[scale,opacity] duration-(--dur-base) ease-pop", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={2.6} />
          </span>
        </span>
        <span className="min-w-0 flex-1 pt-1">
          <span className={cn("t-body block transition-colors duration-(--dur-fast)", on ? "text-stone line-through decoration-ivory" : "text-ivory")}>
            {amountFirst ? (
              <>
                <span className="tnum font-semibold">{item.amount}</span>
                {rest && <span className={cn(!on && "text-stone")}> {rest}</span>}
              </>
            ) : (
              <span className="font-semibold">{item.text}</span>
            )}
          </span>
          {(item.note || item.optional) && (
            <span className="t-meta mt-1 flex flex-wrap items-center gap-2 text-stone">
              {item.optional && <OptionalBadge />}
              {item.note && <span className={cn(on && "line-through")}>{item.note}</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

"use client";

import { Check } from "lucide-react";
import { OptionalBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
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
      <ul className="divide-y divide-line-hair">
        {main.map((i) => (
          <Row key={i.key} item={i} on={checked.includes(i.key)} onToggle={onToggle} dense={dense} />
        ))}
      </ul>
      {pantry.length > 0 && (
        <>
          <p className="eyebrow mt-5 mb-1">From the pantry</p>
          <ul className="divide-y divide-line-hair">
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
        onClick={() => {
          haptic(6);
          onToggle(item.key);
        }}
        className={cn("press-soft group flex w-full items-start gap-3.5 text-left", dense ? "min-h-[52px] py-2.5" : "min-h-[56px] py-3")}
      >
        <span
          aria-hidden
          className={cn(
            "mt-[1px] grid size-[26px] shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,border-color] duration-(--dur-fast)",
            on ? "border-success/0 bg-success" : "border-line-field group-hover:border-fg-3",
          )}
        >
          <Check className={cn("size-4 text-ink transition-[scale,opacity] duration-(--dur-base) ease-bounce", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[16px] leading-[1.35] transition-colors duration-(--dur-fast)", on ? "text-fg-3 line-through decoration-fg-3/60" : "text-fg")}>
            {amountFirst ? (
              <>
                <span className={cn("font-bold", !on && "text-fg")}>{item.amount}</span>
                {rest && <span className={cn("font-medium", !on && "text-fg-2")}> {rest}</span>}
              </>
            ) : (
              <span className="font-semibold">{item.text}</span>
            )}
          </span>
          {(item.note || item.optional) && (
            <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-medium text-fg-3">
              {item.optional && <OptionalBadge />}
              {item.note && <span className={cn(on && "line-through")}>{item.note}</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

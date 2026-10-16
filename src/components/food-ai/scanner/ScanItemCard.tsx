"use client";

import { useState } from "react";
import { Minus, Plus, Trash } from "lucide-react";
import { cn } from "@/lib/cn";
import { MULT_STEP, multLabel, withGrams, withEstimate, withMultiplier, type EditableItem } from "@/lib/ai/food-edit";
import { PREPARATIONS } from "@/lib/ai/food-schemas";
import { ItemBadge, MacroTrio, fmtKcal } from "../parts";

const PREP_LABEL: Record<string, string> = {
  "deep-fried": "Deep-fried",
  sauteed: "Sautéed",
  unknown: "Method?",
};
const prepLabel = (p: string) => PREP_LABEL[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

export function ScanItemCard({
  item,
  onChange,
  onRemove,
  onPrep,
}: {
  item: EditableItem;
  onChange: (next: EditableItem) => void;
  onRemove: () => void;
  /** Preparation changed: the parent offers to update the estimate. */
  onPrep: (prep: string) => void;
}) {
  // text is only "owned" by the input while it's focused; otherwise it mirrors the item
  const [draft, setDraft] = useState<string | null>(null);
  const gramsText = draft ?? (item.grams ? String(item.grams) : "");

  const commitGrams = () => {
    const g = Number((draft ?? "").replace(",", "."));
    setDraft(null);
    if (draft != null && Number.isFinite(g) && g > 0 && g !== item.grams) onChange(withGrams(item, g));
  };

  // items the user added themselves have no AI preparation to correct
  const userAdded = item.provenance === "manual" || item.id.startsWith("db-");
  const step = (dir: 1 | -1) => onChange(withMultiplier(item, item.mult + dir * MULT_STEP));
  const prepOptions = PREPARATIONS.includes(item.preparation as (typeof PREPARATIONS)[number]) ? PREPARATIONS : [item.preparation, ...PREPARATIONS];

  return (
    <article className="card-instrument p-3.5 sm:p-4" aria-label={item.name}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor={`name-${item.key}`}>
            Food name
          </label>
          <input
            id={`name-${item.key}`}
            value={item.name}
            maxLength={80}
            onChange={(e) => onChange({ ...item, name: e.target.value })}
            onBlur={(e) => !e.target.value.trim() && onChange({ ...item, name: "Food item" })}
            className="-mx-1.5 h-10 w-[calc(100%+12px)] rounded-[10px] border border-transparent bg-transparent px-1.5 text-[17px] font-bold text-fg outline-none transition-colors hover:border-line focus:border-gold-400 focus:bg-s3"
            enterKeyHint="done"
            autoComplete="off"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <ItemBadge item={item} />
            {!userAdded && (
              <span className="relative inline-flex">
                <select
                  value={item.preparation}
                  onChange={(e) => onPrep(e.target.value)}
                  aria-label={`How ${item.name} was prepared`}
                  className="h-7 appearance-none rounded-full border border-line bg-s3 pl-2.5 pr-6 text-[12px] font-semibold text-fg-2 outline-none hover:text-fg focus:border-gold-400"
                >
                  {prepOptions.map((p) => (
                    <option key={p} value={p}>
                      {prepLabel(p)}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-fg-3" aria-hidden>
                  ▼
                </span>
              </span>
            )}
            {item.portion && <span className="truncate text-[12px] font-medium text-fg-3">{item.portion}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className="press -mr-1 -mt-0.5 grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-3 hover:bg-white/5 hover:text-fg"
        >
          <Trash className="size-[18px]" />
        </button>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="leading-none" aria-label={`${fmtKcal(item.macros.calories)} calories`}>
          <span className="num-md">{fmtKcal(item.macros.calories)}</span>
          <span className="unit">kcal</span>
        </p>
        <MacroTrio m={item.macros} />
      </div>

      {item.note && <p className="mt-2 text-[12px] font-medium leading-snug text-fg-3">{item.note}</p>}
      {item.source && (
        <p className="mt-2 flex items-center gap-2 text-[12px] font-medium text-fg-3">
          <span className="min-w-0 truncate" title={item.source.label}>
            Matched: {item.source.label}
          </span>
          <button
            type="button"
            onClick={() => onChange(withEstimate(item))}
            className="-my-2 h-9 shrink-0 px-1 font-bold text-fg-2 underline decoration-line-strong underline-offset-2 hover:text-fg"
          >
            Not this
          </button>
        </p>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-line-hair pt-3" role="group" aria-label={`Portion of ${item.name}`}>
        <StepBtn label={`Smaller portion of ${item.name}`} onClick={() => step(-1)} disabled={item.mult <= MULT_STEP}>
          <Minus className="size-5" />
        </StepBtn>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <span className="num-sm min-w-[3ch] text-right" aria-live="polite">
            {multLabel(item.mult)}
          </span>
          <span className="text-fg-3" aria-hidden>
            ·
          </span>
          <label className="flex items-center gap-1">
            <span className="sr-only">Grams of {item.name}</span>
            <input
              value={gramsText}
              placeholder="—"
              onFocus={() => setDraft(gramsText)}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 5))}
              onBlur={commitGrams}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              className={cn(
                "num h-10 w-[68px] rounded-[10px] border border-line-field bg-s3 px-2 text-center text-[17px] text-fg outline-none focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(213_172_103/.18)]",
              )}
            />
            <span className="text-[13px] font-semibold text-fg-3">g</span>
          </label>
        </div>
        <StepBtn label={`Larger portion of ${item.name}`} onClick={() => step(1)} disabled={item.mult >= 8}>
          <Plus className="size-5" />
        </StepBtn>
      </div>
    </article>
  );
}

function StepBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="press grid size-[52px] shrink-0 place-items-center rounded-[12px] bg-s3 text-fg-2 hover:text-fg active:bg-s4 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

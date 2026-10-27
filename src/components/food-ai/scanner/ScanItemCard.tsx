"use client";

import { useState } from "react";
import { ChevronDown, Minus, Plus, Trash } from "lucide-react";
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
    <article className="py-4 first:pt-1" aria-label={item.name}>
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
            className="t-row -mx-1.5 h-11 w-[calc(100%+0.75rem)] rounded-field border border-transparent bg-transparent px-1.5 text-fg outline-none transition-colors duration-(--dur-fast) hover:border-ui-line focus:border-fg-2 focus:bg-sheet"
            enterKeyHint="done"
            autoComplete="off"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <ItemBadge item={item} />
            {!userAdded && (
              // 44px tall hit area around a 28px pill; the native select is the invisible layer on top
              <span className="group relative -my-2 inline-flex h-11 items-center">
                <span
                  className="t-cap pointer-events-none inline-flex h-7 items-center gap-1 rounded-full bg-control pl-2.5 pr-2 font-semibold text-fg-2 transition-colors group-hover:text-fg group-has-[:focus-visible]:shadow-[inset_0_0_0_1.5px_var(--text-2)]"
                  aria-hidden
                >
                  {prepLabel(item.preparation)}
                  <ChevronDown className="size-3.5 text-fg-2" strokeWidth={1.6} />
                </span>
                <select
                  value={item.preparation}
                  onChange={(e) => onPrep(e.target.value)}
                  aria-label={`How ${item.name} was prepared`}
                  className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
                >
                  {prepOptions.map((p) => (
                    <option key={p} value={p}>
                      {prepLabel(p)}
                    </option>
                  ))}
                </select>
              </span>
            )}
            {/* the AI's words describe the portion it saw; once rescaled, the stepper row is the truth */}
            {item.portion && item.mult === 1 && <span className="t-cap min-w-0 truncate text-fg-2">{item.portion}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className="press -mr-2 grid size-11 shrink-0 place-items-center rounded-field text-fg-2 hover:text-fg"
        >
          <Trash className="size-[1.125rem]" strokeWidth={1.6} />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p aria-label={`${fmtKcal(item.macros.calories)} calories`}>
          <span className="t-num-s text-fg">{fmtKcal(item.macros.calories)}</span>
          <span className="t-cap ml-1 text-fg-2">kcal</span>
        </p>
        <MacroTrio m={item.macros} />
      </div>

      {item.note && <p className="t-cap mt-2 text-fg-2">{item.note}</p>}
      {item.source && (
        <p className="t-cap mt-1 flex items-center gap-2 text-fg-2">
          <span className="min-w-0 truncate" title={item.source.label}>
            Matched: {item.source.label}
          </span>
          <button
            type="button"
            onClick={() => onChange(withEstimate(item))}
            className="press inline-flex h-11 shrink-0 items-center px-1 font-semibold text-fg underline decoration-ui-line underline-offset-4 hover:decoration-ui-line"
          >
            Not this
          </button>
        </p>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3" role="group" aria-label={`Portion of ${item.name}`}>
        <StepBtn label={`Smaller portion of ${item.name}`} onClick={() => step(-1)} disabled={item.mult <= MULT_STEP}>
          <Minus className="size-5" strokeWidth={1.6} />
        </StepBtn>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <span className="t-num-s min-w-[3ch] text-right text-fg" aria-live="polite">
            {multLabel(item.mult)}
          </span>
          <span className="text-fg-2" aria-hidden>
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
              className="tabular-nums h-11 w-[4.5rem] rounded-field border border-ui-line bg-sheet px-2 text-center text-[length:max(17px,1.0625rem)] font-semibold text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-2 focus:border-fg-2 focus:shadow-[0_0_0_3px_rgb(255 255 255 / 0.08)]"
            />
            <span className="t-cap font-semibold text-fg-2">g</span>
          </label>
        </div>
        <StepBtn label={`Larger portion of ${item.name}`} onClick={() => step(1)} disabled={item.mult >= 8}>
          <Plus className="size-5" strokeWidth={1.6} />
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
      className="press grid size-12 shrink-0 place-items-center rounded-field bg-control text-fg-2 hover:text-fg active:bg-card-3 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

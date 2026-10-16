"use client";

import { Check } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { newId } from "@/lib/data/core";
import { useSavedMealMutations, type FoodEntry } from "@/lib/data/nutrition";
import { cn } from "@/lib/cn";
import { sumMacros } from "@/lib/nutrition";
import { formatAmount, macroLine } from "@/lib/nutrition-ui/format";
import type { MealSection } from "@/lib/nutrition-ui/group";
import { savedMealItemFromEntry } from "@/lib/nutrition-ui/savedMeal";
import { formatInt } from "@/lib/units";
import { StickyFooter } from "./bits";
import { ToastMark } from "./context";
import { useFocusIntoSheet } from "./hooks";

export interface SaveMealState {
  open: boolean;
  nonce: number;
  section: MealSection<FoodEntry> | null;
}

/** Save some or all of a meal's entries as a reusable meal. */
export function SaveMealSheet({ state, onOpenChange }: { state: SaveMealState; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={state.open} onOpenChange={onOpenChange} title="Save as meal" description="Log it again later in one tap.">
      {state.section && <SaveMealBody key={state.nonce} section={state.section} close={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function SaveMealBody({ section, close }: { section: MealSection<FoodEntry>; close: () => void }) {
  const m = useSavedMealMutations();
  const root = useRef<HTMLDivElement>(null);
  useFocusIntoSheet(root);
  const [name, setName] = useState(() => (section.entries.length === 1 ? section.entries[0].name : `My ${section.label.toLowerCase()}`));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(section.entries.map((e) => e.id)));
  const [touched, setTouched] = useState(false);
  const chosen = section.entries.filter((e) => picked.has(e.id));
  const totals = sumMacros(chosen);
  const nameErr = !name.trim() ? "Name the meal." : name.trim().length > 120 ? "Keep it under 120 characters." : null;

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = () => {
    setTouched(true);
    if (nameErr || !chosen.length || m.create.isPending) return;
    const id = newId();
    m.create.mutate(
      { id, name: name.trim(), items: chosen.map(savedMealItemFromEntry) },
      {
        onSuccess: () => {
          toast(`Saved meal · ${name.trim()}`, {
            description: `${chosen.length} ${chosen.length === 1 ? "item" : "items"} · ${formatInt(totals.calories)} kcal. Find it in Saved.`,
            icon: <ToastMark />,
            duration: 6000,
            action: { label: "Undo", onClick: () => m.remove.mutate(id) },
          });
          close();
        },
      },
    );
  };

  return (
    <div className="pt-2" ref={root}>
      <Field label="Name" error={touched ? nameErr : null}>
        {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" aria-invalid={touched && !!nameErr} />}
      </Field>
      <p className="mb-2 mt-5 text-[13px] font-semibold text-fg-2">Include</p>
      <ul className="rounded-[14px] bg-s3" role="group" aria-label="Items to include">
        {section.entries.map((e) => {
          const on = picked.has(e.id);
          return (
            <li key={e.id} className="border-b border-line-hair last:border-b-0">
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(e.id)} className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-[7px] border transition-colors", on ? "border-line-gold bg-gold-tint text-gold-300" : "border-line-field")}>
                  {on && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-fg">{e.name}</span>
                  <span className="block truncate text-[12px] text-fg-3">{formatAmount(Number(e.amount), e.unit)}</span>
                </span>
                <span className="num shrink-0 text-[15px] text-fg-2">{formatInt(Number(e.calories))}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="num mt-3 text-[13px] text-fg-3">
        {chosen.length ? `${formatInt(totals.calories)} kcal · ${macroLine(totals)}` : "Pick at least one item."}
      </p>
      <StickyFooter>
        <Button variant="primary" size="lg" block onClick={save} loading={m.create.isPending} disabled={!chosen.length}>
          Save meal
        </Button>
      </StickyFooter>
    </div>
  );
}

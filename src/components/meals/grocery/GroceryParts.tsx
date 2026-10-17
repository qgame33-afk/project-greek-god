"use client";

import { Check, ChevronDown, Ellipsis, House, RotateCcw, Trash, Undo2, X } from "lucide-react";
import { memo, useRef, useState, type ReactNode } from "react";
import { SubLabel } from "@/components/nutrition/bits";
import { useFocusIntoSheet } from "@/components/nutrition/hooks";
import { Tag } from "@/components/ui/tag";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { Field, Input, NumberInput } from "@/components/ui/field";
import { Collapse } from "@/components/ui/misc";
import { Sheet, SheetFooterBar } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/data/core";
import type { GroceryUse } from "@/lib/meals/engine";
import { GROCERY_CATEGORY_LABEL, type GroceryCategory } from "@/lib/meals/types";
import { parseNumber } from "../log/draft";
import { cad, rowAmount, rowBuy, type GroceryRow } from "./model";

/* ------------------------------------------------------------------ rows */

/**
 * One line of the list (56 px). The whole row ticks it into the cart with a 44 px check, at arm's
 * length in a store aisle; ticked lines strike through in ivory (shopping is not an achievement,
 * so no gold). The ⋯ button holds "I have this", Remove and what it's for.
 */
export const GroceryLineRow = memo(function GroceryLineRow({
  row,
  onToggle,
  onMore,
  staple,
}: {
  row: GroceryRow;
  /** Stable across renders (memoised rows): ticking one line re-renders only that line. */
  onToggle: (row: GroceryRow) => void;
  onMore: (key: string) => void;
  staple?: boolean;
}) {
  const amount = rowAmount(row);
  const buy = rowBuy(row);
  const on = row.checked;
  const detail = staple ? null : [amount, buy].filter(Boolean).join(" · ");
  return (
    <li className="flex items-stretch">
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={() => onToggle(row)}
        className="press-soft group flex min-h-14 min-w-0 flex-1 items-center gap-3 py-1.5 text-left"
      >
        <span aria-hidden className="grid size-11 shrink-0 place-items-center">
          <span
            className={cn(
              "grid size-[1.625rem] place-items-center rounded-full transition-[background-color,box-shadow] duration-(--dur-fast)",
              on ? "bg-ivory" : "shadow-[inset_0_0_0_1.5px_var(--ui-line)] group-hover:shadow-[inset_0_0_0_1.5px_var(--stone)]",
            )}
          >
            <Check className={cn("size-4 text-ink transition-[scale,opacity] duration-(--dur-base) ease-pop", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={2.6} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("t-title-3 block transition-colors duration-(--dur-fast) [overflow-wrap:anywhere]", on ? "text-stone line-through decoration-ivory" : "text-ivory")}>{row.name}</span>
          {detail && <span className="t-meta mt-0.5 block text-stone">{detail}</span>}
        </span>
      </button>
      <button type="button" onClick={() => onMore(row.key)} aria-label={`More for ${row.name}`} className="press -mr-2 grid w-11 shrink-0 place-items-center text-stone hover:text-ivory">
        <Ellipsis className="size-5" strokeWidth={1.6} aria-hidden />
      </button>
    </li>
  );
});

/** A quiet group (Already have, Removed): collapsed by default, each line one tap from coming back. */
export function SetAsideGroup({ title, rows, action, actionLabel, icon }: { title: string; rows: GroceryRow[]; action: (r: GroceryRow) => void; actionLabel: string; icon: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  const id = `aside-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className="border-y border-vein">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="press-soft flex min-h-14 w-full items-center gap-3 text-left">
        <span className="t-title-3 min-w-0 flex-1 text-stone">
          {title} <span className="tnum">· {rows.length}</span>
        </span>
        <ChevronDown className={cn("size-4 text-ash transition-[rotate] duration-(--dur-base) ease-out", open && "rotate-180")} strokeWidth={1.6} aria-hidden />
      </button>
      <Collapse open={open} id={id}>
        <ul className="divide-y divide-vein border-t border-vein">
          {rows.map((r) => (
            <li key={r.key} className="flex min-h-14 items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="t-callout block truncate text-stone">{r.name}</span>
                {rowAmount(r) && <span className="t-meta block truncate text-stone">{rowAmount(r)}</span>}
              </span>
              <button type="button" onClick={() => action(r)} className="press t-callout -mr-2 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-field px-3 font-semibold text-ivory">
                {icon}
                {actionLabel}
              </button>
            </li>
          ))}
        </ul>
      </Collapse>
    </section>
  );
}

/* ------------------------------------------------------------------ line sheet */

export function LineSheet({
  row,
  uses,
  onOpenChange,
  onHave,
  onRemove,
  onDelete,
  onCheck,
}: {
  row: GroceryRow | null;
  uses: GroceryUse[];
  onOpenChange: (o: boolean) => void;
  onHave: (r: GroceryRow) => void;
  onRemove: (r: GroceryRow) => void;
  onDelete: (r: GroceryRow) => void;
  onCheck: (r: GroceryRow) => void;
}) {
  const amount = row ? rowAmount(row) : "";
  const buy = row ? rowBuy(row) : null;
  const cost = row && !row.custom && row.est_cost_cad != null && Number(row.est_cost_cad) > 0 ? cad(Number(row.est_cost_cad)) : null;
  return (
    <Sheet open={!!row} onOpenChange={onOpenChange} title={row?.name ?? "Item"} description={[amount, buy].filter(Boolean).join(" · ") || undefined}>
      {row && (
        <div className="space-y-5 pb-2">
          {cost && (
            <p className="t-callout flex flex-wrap items-center gap-2 text-stone">
              <span>
                About <span className="tnum font-semibold text-ivory">{cost}</span> at the store
              </span>
              <Tag kind="CALC" explain="Built-in rough Canadian shelf price for the pack (not AI)." />
            </p>
          )}
          {uses.length > 0 && (
            <div>
              <SubLabel>For this week&apos;s meals</SubLabel>
              <ul className="space-y-1.5">
                {uses.map((u) => (
                  <li key={u.recipe_key} className="t-callout flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-ivory">{u.name}</span>
                    <span className="tnum shrink-0 text-stone">{Math.round(u.grams)} g</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-2">
            <ActionRow icon={<Check className="size-5" aria-hidden />} label={row.checked ? "Take out of the cart" : "Put in the cart"} onClick={() => onCheck(row)} />
            <ActionRow icon={<House className="size-5" aria-hidden />} label="I have this" hint="Moves it out of what to buy" onClick={() => onHave(row)} />
            {row.custom ? (
              <ActionRow icon={<Trash className="size-5" aria-hidden />} label="Delete" hint="Your own item" onClick={() => onDelete(row)} tone="danger" />
            ) : (
              <ActionRow icon={<X className="size-5" aria-hidden />} label="Remove from list" hint="Comes back if you restore it" onClick={() => onRemove(row)} />
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function ActionRow({ icon, label, hint, onClick, tone }: { icon: ReactNode; label: string; hint?: string; onClick: () => void; tone?: "danger" }) {
  return (
    <button type="button" onClick={onClick} className="press-soft flex min-h-14 w-full items-center gap-3.5 rounded-btn bg-m3 px-4 py-2.5 text-left shadow-[inset_0_0_0_1px_var(--vein-2)] hover:bg-m4">
      <span className={cn("shrink-0", tone === "danger" ? "text-cinnabar" : "text-stone")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("t-title-3 block", tone === "danger" ? "text-cinnabar" : "text-ivory")}>{label}</span>
        {hint && <span className="t-meta block text-stone">{hint}</span>}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ add item */

const CATEGORIES = Object.keys(GROCERY_CATEGORY_LABEL) as GroceryCategory[];
const SHORT: Record<GroceryCategory, string> = { meat: "Meat", dairy_eggs: "Dairy & eggs", bread_grains: "Bread & grains", fruit: "Fruit", vegetables: "Vegetables", frozen: "Frozen", pantry: "Pantry", other: "Other" };

export function AddItemSheet({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (v: NewGroceryItem) => void }) {
  const [nonce, setNonce] = useState(0);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setNonce((n) => n + 1);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add an item" description="Anything else you need this week">
      <AddItemForm key={nonce} onAdd={(v) => (onAdd(v), onOpenChange(false))} />
    </Sheet>
  );
}

export interface NewGroceryItem {
  /** Fixed per form: a repeated submit (a double click while the sheet closes) upserts the same line. */
  id: string;
  name: string;
  label: string | null;
  category: GroceryCategory;
}

function AddItemForm({ onAdd }: { onAdd: (v: NewGroceryItem) => void }) {
  const ref = useRef<HTMLFormElement>(null);
  useFocusIntoSheet(ref);
  const [id] = useState(() => newId());
  const sent = useRef(false);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<GroceryCategory>("other");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      ref={ref}
      className="space-y-5 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (sent.current) return;
        const n = name.trim();
        if (!n) return setError("Name the item");
        sent.current = true;
        onAdd({ id, name: n.slice(0, 120), label: label.trim() ? label.trim().slice(0, 60) : null, category });
      }}
    >
      <Field label="Item" error={error}>
        {(id) => <Input id={id} value={name} onChange={(e) => (setName(e.target.value), setError(null))} placeholder="Paper towels" maxLength={120} autoComplete="off" enterKeyHint="next" autoCapitalize="sentences" />}
      </Field>
      <Field label="How much" hint="Optional">
        {(id) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="2 rolls" maxLength={60} autoComplete="off" enterKeyHint="done" />}
      </Field>
      <div>
        <SubLabel>Aisle</SubLabel>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
              {SHORT[c]}
            </Chip>
          ))}
        </div>
      </div>
      <SheetFooterBar>
        <Button type="submit" variant="primary" size="lg" block>
          Add to list
        </Button>
      </SheetFooterBar>
    </form>
  );
}

/* ------------------------------------------------------------------ budget */

export function BudgetSheet({ open, onOpenChange, value, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; value: number | null; onSave: (v: number | null) => void }) {
  const [nonce, setNonce] = useState(0);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setNonce((n) => n + 1);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Weekly budget" description="Compared with what you pay at the checkout">
      <BudgetForm key={nonce} value={value} onSave={(v) => (onSave(v), onOpenChange(false))} />
    </Sheet>
  );
}

function BudgetForm({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const ref = useRef<HTMLFormElement>(null);
  useFocusIntoSheet(ref);
  const [text, setText] = useState(value != null ? String(Math.round(value)) : "");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      ref={ref}
      className="space-y-5 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return onSave(null);
        const n = parseNumber(text);
        if (n == null || n <= 0 || n > 5000) return setError("Enter an amount from $1 to $5,000");
        onSave(Math.round(n * 100) / 100);
      }}
    >
      <Field label="Budget for this week" hint="Canadian dollars. Prices are rough estimates." error={error}>
        {(id) => <NumberInput id={id} value={text} onChange={(e) => (setText(e.target.value.replace(/[^\d.,]/g, "").slice(0, 7)), setError(null))} suffix="CAD" placeholder="150" enterKeyHint="done" />}
      </Field>
      <SheetFooterBar className="grid grid-cols-[auto_1fr] gap-3">
        <Button type="button" variant="secondary" size="lg" onClick={() => onSave(null)} disabled={value == null}>
          <RotateCcw className="size-4" aria-hidden />
          No budget
        </Button>
        <Button type="submit" variant="primary" size="lg">
          Save budget
        </Button>
      </SheetFooterBar>
    </form>
  );
}

export const RestoreIcon = <Undo2 className="size-4" aria-hidden />;

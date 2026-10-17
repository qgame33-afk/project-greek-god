"use client";

import { Check, ChevronDown, Ellipsis, House, RotateCcw, Trash, Undo2, X } from "lucide-react";
import { memo, useRef, useState, type ReactNode } from "react";
import { SubLabel } from "@/components/nutrition/bits";
import { useFocusIntoSheet } from "@/components/nutrition/hooks";
import { EstimateBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { Field, Input, NumberInput } from "@/components/ui/field";
import { Collapse } from "@/components/ui/misc";
import { Sheet, SheetFooterBar } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/data/core";
import { haptic } from "@/lib/haptics";
import type { GroceryUse } from "@/lib/meals/engine";
import { GROCERY_CATEGORY_LABEL, type GroceryCategory } from "@/lib/meals/types";
import { parseNumber } from "../log/draft";
import { cad, rowAmount, rowBuy, type GroceryRow } from "./model";

/* ------------------------------------------------------------------ rows */

/**
 * One line of the list. The whole row ticks it into the cart (52px+, big circle, at arm's
 * length in a store aisle); the ⋯ button holds "I have this", Remove and what it's for.
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
        onClick={() => {
          haptic(6);
          onToggle(row);
        }}
        className={cn("press-soft group flex min-w-0 flex-1 items-center gap-3.5 py-2.5 pl-4 pr-2 text-left", staple ? "min-h-[52px]" : "min-h-[60px]")}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-[26px] shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,border-color] duration-(--dur-fast)",
            on ? "border-transparent bg-success" : "border-line-field group-hover:border-fg-3",
          )}
        >
          <Check className={cn("size-4 text-ink transition-[scale,opacity] duration-(--dur-base) ease-bounce", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[16px] font-semibold leading-snug transition-colors duration-(--dur-fast) [overflow-wrap:anywhere]", on ? "text-fg-3 line-through decoration-fg-3/60" : "text-fg")}>{row.name}</span>
          {detail && <span className={cn("mt-0.5 block text-[13px] font-medium leading-snug", on ? "text-fg-3/70" : "text-fg-2")}>{detail}</span>}
        </span>
      </button>
      <button type="button" onClick={() => onMore(row.key)} aria-label={`More for ${row.name}`} className="press grid w-12 shrink-0 place-items-center text-fg-3 hover:text-fg">
        <Ellipsis className="size-5" aria-hidden />
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
    <section className="card-instrument overflow-hidden p-0">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="press-soft flex min-h-[56px] w-full items-center gap-3 px-4 text-left">
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-fg-2">
          {title} <span className="num text-[15px] text-fg-3">· {rows.length}</span>
        </span>
        <ChevronDown className={cn("size-4 text-fg-3 transition-[rotate] duration-(--dur-base) ease-out", open && "rotate-180")} aria-hidden />
      </button>
      <Collapse open={open} id={id}>
        <ul className="divide-y divide-line-hair border-t border-line-hair">
          {rows.map((r) => (
            <li key={r.key} className="flex min-h-[56px] items-center gap-3 py-2 pl-4 pr-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-fg-2">{r.name}</span>
                {rowAmount(r) && <span className="block truncate text-[12.5px] text-fg-3">{rowAmount(r)}</span>}
              </span>
              <button type="button" onClick={() => action(r)} className="press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[13.5px] font-bold text-gold-300 hover:text-gold-200">
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
            <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-fg-2">
              <span>
                About <span className="num text-[16px] text-fg">{cost}</span> at the store
              </span>
              <EstimateBadge />
            </p>
          )}
          {uses.length > 0 && (
            <div>
              <SubLabel>For this week&apos;s meals</SubLabel>
              <ul className="space-y-1.5">
                {uses.map((u) => (
                  <li key={u.recipe_key} className="flex items-baseline justify-between gap-3 text-[14.5px]">
                    <span className="min-w-0 truncate font-medium text-fg">{u.name}</span>
                    <span className="num shrink-0 text-[14px] text-fg-3">{Math.round(u.grams)} g</span>
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
    <button type="button" onClick={onClick} className="press-soft flex min-h-14 w-full items-center gap-3.5 rounded-[14px] border border-line bg-s3 px-4 py-2.5 text-left hover:bg-s4">
      <span className={cn("shrink-0", tone === "danger" ? "text-danger" : "text-gold-300")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[15px] font-bold", tone === "danger" ? "text-danger" : "text-fg")}>{label}</span>
        {hint && <span className="block text-[12.5px] font-medium text-fg-3">{hint}</span>}
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
    <Sheet open={open} onOpenChange={onOpenChange} title="Weekly budget" description="Compared with what this week's meals use">
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

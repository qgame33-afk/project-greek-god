"use client";

import { Check, ChevronDown, Ellipsis, House, RotateCcw, Trash, X } from "lucide-react";
import { memo, useRef, useState } from "react";
import { SubLabel } from "@/components/nutrition/bits";
import { useFocusIntoSheet } from "@/components/nutrition/hooks";
import { Button } from "@/components/ui/button";
import { ListGroup, Row } from "@/components/ui/list";
import { Chip } from "@/components/ui/controls";
import { Field, Input, NumberInput } from "@/components/ui/field";
import { Collapse } from "@/components/ui/misc";
import { Sheet, SheetFooterBar } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/data/core";
import type { GroceryTotals, GroceryUse } from "@/lib/meals/engine";
import { GROCERY_CATEGORY_LABEL, type GroceryCategory } from "@/lib/meals/types";
import { parseNumber } from "../log/draft";
import { budgetLines, cad, rowAmount, rowBuy, type GroceryRow } from "./model";

/* ------------------------------------------------------------------ rows */

/**
 * One line of the list (docs/DESIGN-V3-SIMPLE.md §4.4.5): a 28 px circle, the name and the
 * quantity on the right. The whole row ticks it into the cart, at arm's length in a store aisle;
 * a ticked line dims and strikes through (shopping is not a win, so no gold). While editing, a
 * ⋯ on the line holds "I have this", Remove and what it's for.
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
  onMore?: (key: string) => void;
  staple?: boolean;
}) {
  const amount = staple ? "" : rowAmount(row);
  const buy = staple ? null : rowBuy(row);
  const on = row.checked;
  return (
    <li className="flex items-stretch">
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={`${row.name}${amount ? `, ${amount}` : ""}${buy ? `, ${buy}` : ""}`}
        onClick={() => onToggle(row)}
        className="press-soft flex min-h-14 min-w-0 flex-1 items-center gap-3.5 py-2 pl-4 pr-4 text-left"
      >
        <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-full", on ? "bg-fg text-bg" : "border-2 border-ui-line")}>
          {on && <Check className="size-4" strokeWidth={2.6} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("t-body block [overflow-wrap:anywhere]", on && "text-fg-2 line-through")} data-budget-name="">
            {row.name}
          </span>
          {buy && <span className="t-cap mt-0.5 block">{buy}</span>}
        </span>
        {amount && <span className={cn("t-body shrink-0 whitespace-nowrap text-right tabular-nums text-fg-2", on && "opacity-70")}>{amount}</span>}
      </button>
      {onMore && (
        <button type="button" onClick={() => onMore(row.key)} aria-label={`More for ${row.name}`} className="press grid w-12 shrink-0 place-items-center text-fg-2 hover:text-fg">
          <Ellipsis className="size-5" strokeWidth={1.9} aria-hidden />
        </button>
      )}
    </li>
  );
});

/** A quiet group (Already have, Removed) inside a list group: collapsed, each line one tap from coming back. */
export function SetAsideGroup({ title, rows, action, actionLabel }: { title: string; rows: GroceryRow[]; action: (r: GroceryRow) => void; actionLabel: string }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  const id = `aside-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="press-soft flex min-h-14 w-full items-center gap-3 px-4 text-left">
        <span className="t-row min-w-0 flex-1">{title}</span>
        <span className="t-body tabular-nums text-fg-2">{rows.length}</span>
        <ChevronDown className={cn("size-5 text-fg-3 transition-[rotate] duration-(--dur-base) ease-out", open && "rotate-180")} strokeWidth={1.9} aria-hidden />
      </button>
      <Collapse open={open} id={id}>
        <ul className="border-t border-line [&>*+*]:border-t [&>*+*]:border-line" data-food="">
          {rows.map((r) => (
            <li key={r.key} className="flex min-h-14 items-center gap-3 py-2 pl-4 pr-2">
              <span className="min-w-0 flex-1">
                <span className="t-body block truncate text-fg-2">{r.name}</span>
                {rowAmount(r) && <span className="t-cap block truncate">{rowAmount(r)}</span>}
              </span>
              <button type="button" onClick={() => action(r)} className="press t-label hit-44 inline-flex h-9 shrink-0 items-center rounded-pill bg-control px-3.5 font-semibold text-fg">
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
        <div className="flex flex-col gap-4 pb-2">
          {cost && (
            <p className="t-body text-fg-2">
              About <span className="font-semibold text-fg tabular-nums">{cost}</span> at the store. A rough Canadian shelf price for the pack, built in (not AI).
            </p>
          )}
          {uses.length > 0 && (
            <section aria-label="For this week's meals">
              <p className="t-label mb-2 px-1">For this week&apos;s meals</p>
              <ListGroup>
                {uses.map((u) => (
                  <Row key={u.recipe_key} title={u.name} value={`${Math.round(u.grams)} g`} dataName />
                ))}
              </ListGroup>
            </section>
          )}
          <ListGroup>
            <Row icon={Check} title={row.checked ? "Take out of the cart" : "Put in the cart"} chevron={false} onClick={() => onCheck(row)} />
            <Row icon={House} title="I have this" subtitle="Moves it out of what to buy" chevron={false} onClick={() => onHave(row)} />
            {row.custom ? (
              <Row icon={Trash} title="Delete" subtitle="Your own item" danger chevron={false} onClick={() => onDelete(row)} />
            ) : (
              <Row icon={X} title="Remove from the list" subtitle="You can bring it back" chevron={false} onClick={() => onRemove(row)} />
            )}
          </ListGroup>
        </div>
      )}
    </Sheet>
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

export function BudgetSheet({ open, onOpenChange, value, totals, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; value: number | null; totals?: GroceryTotals; onSave: (v: number | null) => void }) {
  const [nonce, setNonce] = useState(0);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setNonce((n) => n + 1);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="This week's budget" description="Compared with what you pay at the checkout">
      {totals && <BudgetSummary totals={totals} />}
      <BudgetForm key={nonce} value={value} onSave={(v) => (onSave(v), onOpenChange(false))} />
    </Sheet>
  );
}

function BudgetSummary({ totals }: { totals: GroceryTotals }) {
  const money = budgetLines(totals);
  return (
    <div className="mb-5 flex flex-col gap-3">
      <ListGroup>
        <Row title="At the checkout" subtitle="What's left to buy, before tax" value={<span data-derived="">about {cad(totals.checkoutCad)}</span>} />
        <Row title={money.headline} subtitle={money.detail} />
      </ListGroup>
      <p className="t-label px-1" data-how="" data-budget-group="">
        Rough Canadian shelf prices for each pack you buy, built in (not AI).{money.note ? ` ${money.note}` : ""}
      </p>
    </div>
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


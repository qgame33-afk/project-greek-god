"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DatabaseBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/field";
import { Sheet, SheetFooterBar } from "@/components/ui/sheet";
import { isOffline, newId, useToday } from "@/lib/data/core";
import { defaultEatenAt } from "@/lib/data/meals-model";
import { useDeleteFood } from "@/lib/data/nutrition";
import { mealForTime, MEALS, type Meal } from "@/lib/nutrition";
import { formatAmount } from "@/lib/nutrition-ui/format";
import { amountBounds, buildEntry, fromSearchResult, portion, stepFor } from "@/lib/nutrition-ui/portion";
import { parseSearchResponse, type SearchResult } from "@/lib/nutrition-ui/search";
import { formatInt } from "@/lib/units";
import { useInsertEntries } from "../hooks";
import { MacroTrio, MealDatePicker } from "../parts";

/** EAN-13, EAN-8, UPC-A and UPC-E: 8 to 14 digits. */
export function cleanBarcode(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 14 ? d : null;
}

type Detector = { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> };

/** Read a barcode from a photo with the browser's own detector. "unsupported" where there is none (iPhone Safari today). */
export async function detectBarcode(file: File): Promise<string | null | "unsupported"> {
  const Ctor = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (!Ctor) return "unsupported";
  try {
    const det = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    const bmp = await createImageBitmap(file);
    const found = await det.detect(bmp);
    for (const f of found) {
      const c = cleanBarcode(f.rawValue);
      if (c) return c;
    }
    return null;
  } catch {
    return "unsupported";
  }
}

/**
 * The product for a barcode, from Open Food Facts through the existing food search (an exact
 * `code:` match). A database record, never an AI guess; null when it isn't there.
 */
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<SearchResult | null> {
  const res = await fetch(`/api/food/search?q=${encodeURIComponent(`code:${code}`)}&kind=packaged`, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(res.status === 401 ? "Sign in again to look it up." : "The food database didn't answer. Try again.");
  const { results } = parseSearchResponse(await res.json().catch(() => null));
  const want = code.replace(/^0+/, "");
  return results.find((r) => r.id.startsWith("off:") && r.id.slice(4).replace(/^0+/, "") === want) ?? null;
}

/** Type the number under the barcode (every phone; the only way on one without a detector). */
export function TypeBarcodeSheet({ open, onOpenChange, note, onCode }: { open: boolean; onOpenChange: (o: boolean) => void; note?: string | null; onCode: (code: string) => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Type the barcode" description={note ?? "The numbers under the bars."}>
      <form
        className="pb-2 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          const c = cleanBarcode(text);
          if (!c) return setErr("A barcode has 8 to 14 digits.");
          setErr(null);
          onCode(c);
        }}
      >
        <Field label="Barcode" error={err}>
          {(id) => <Input id={id} value={text} onChange={(e) => (setText(e.target.value), setErr(null))} inputMode="numeric" autoComplete="off" enterKeyHint="search" placeholder="0 64200 11589 2" />}
        </Field>
        <SheetFooterBar className="mt-5">
          <Button type="submit" variant="primary" size="lg" block>
            Look it up
          </Button>
        </SheetFooterBar>
      </form>
    </Sheet>
  );
}

/**
 * The product card for a scanned barcode (docs/DESIGN-V3-SIMPLE.md §4.4.7): the name and brand,
 * its database source chip (not AI), a portion stepper with the numbers it adds up to, the meal,
 * and the gold "Add". One entry id per card, so a double tap or a retry never adds it twice.
 */
export function ProductSheet({ product, open, onOpenChange }: { product: SearchResult | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open && !!product} onOpenChange={onOpenChange} title={product?.name ?? "Product"} description={product?.brand ?? undefined}>
      {product && <ProductBody key={product.id} product={product} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function ProductBody({ product, onDone }: { product: SearchResult; onDone: () => void }) {
  const router = useRouter();
  const today = useToday();
  const c = useMemo(() => fromSearchResult(product), [product]);
  const u = c.units[c.defaultUnit] ?? c.units[0];
  const [amount, setAmount] = useState(c.defaultAmount);
  const [meal, setMeal] = useState<Meal>(() => mealForTime());
  const [date, setDate] = useState(today);
  const { insert, pending } = useInsertEntries();
  const del = useDeleteFood();
  const [id] = useState(newId);
  const busy = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const { min, max } = amountBounds(u.unit);
  const p = portion(u, amount);
  const mealName = MEALS.find((m) => m.key === meal)?.label ?? "Snacks";

  const add = async () => {
    if (busy.current) return;
    if (isOffline()) return setErr("You're offline. Nothing was added.");
    busy.current = true;
    setErr(null);
    try {
      const row = buildEntry(c, { id, unitIndex: c.defaultUnit, amount, meal, date, eatenAt: defaultEatenAt(date, today, meal) });
      const [saved] = await insert([row]);
      toast(`${c.name} added`, {
        description: `${mealName} · ${formatInt(p.macros.calories)} kcal`,
        duration: 6000,
        action: saved ? { label: "Undo", onClick: () => del.mutate({ ids: [saved.id], date: saved.local_date, rows: [saved], label: `${c.name} removed` }) } : undefined,
      });
      onDone();
      router.push(date === today ? "/nutrition" : `/nutrition?date=${date}`);
    } catch (e) {
      setErr((e as Error).message || "Couldn't add it. Try again.");
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-2" data-food="">
      <DatabaseBadge name={product.sourceName ?? "Open Food Facts"} url={product.sourceUrl} className="self-start" />
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-sheet-card py-5 pl-5 pr-3">
        <div className="min-w-0">
          <p className="t-hero tabular-nums" data-derived="">
            {formatInt(p.macros.calories)}
            <span className="unit">kcal</span>
          </p>
          <MacroTrio m={p.macros} className="mt-2" />
        </div>
        <Stepper
          value={amount}
          onChange={setAmount}
          step={stepFor(u.unit)}
          min={min}
          max={max}
          label="Portion"
          format={(v) => formatAmount(v, u.unit)}
          valueText={formatAmount(amount, u.unit)}
        />
      </div>
      <MealDatePicker meal={meal} onMeal={setMeal} date={date} onDate={setDate} onInset />
      {err && (
        <p role="alert" className="t-label text-danger">
          {err}
        </p>
      )}
      <SheetFooterBar>
        <Button variant="primary" size="lg" block loading={pending} onClick={() => void add()} aria-label={`Add ${formatAmount(amount, u.unit)} of ${c.name} to ${mealName}`}>
          Add
        </Button>
      </SheetFooterBar>
    </div>
  );
}

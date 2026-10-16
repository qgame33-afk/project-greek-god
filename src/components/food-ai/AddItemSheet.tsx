"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button, Spinner } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, Input, NumberInput } from "@/components/ui/field";
import { DatabaseBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { macrosForGrams, tidyMacros } from "@/lib/food/normalize";
import type { FoodSearchResult, SearchResponse } from "@/lib/food/types";
import type { AIFoodItem } from "@/lib/ai/food-schemas";
import { searchFoodDb } from "./api";
import { MacroTrio, fmtKcal } from "./parts";

type Tab = "search" | "manual";

const parseNum = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** Add a missed item: a real database record (USDA / Open Food Facts) or typed numbers. */
export function AddItemSheet({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (item: AIFoodItem) => void }) {
  const [tab, setTab] = useState<Tab>("search");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<FoodSearchResult | null>(null);
  const [grams, setGrams] = useState("100");
  const [manual, setManual] = useState({ name: "", grams: "", kcal: "", p: "", c: "", f: "" });
  const ctl = useRef<AbortController | null>(null);

  const close = (o: boolean) => {
    if (!o) {
      setPicked(null);
      setErr(null);
    }
    onOpenChange(o);
  };

  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    const t = window.setTimeout(async () => {
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      setLoading(true);
      setErr(null);
      try {
        const r = await searchFoodDb(term, "all", c.signal);
        if (!c.signal.aborted) setRes(r);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr((e as Error).message);
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }, 380);
    return () => window.clearTimeout(t);
  }, [term]);
  const shown = term.length >= 2 ? res : null;
  const busy = term.length >= 2 && loading;

  const g = parseNum(grams);
  const pickedMacros = picked?.per100g && g && g > 0 ? macrosForGrams(picked.per100g, g) : null;

  const addPicked = () => {
    if (!picked?.per100g || !g || g <= 0) return;
    onAdd({
      id: `db-${picked.id}`,
      name: picked.name,
      brand: picked.brand,
      kind: picked.brand ? "packaged" : "generic",
      portion: `${Math.round(g)} g`,
      quantity: 1,
      unit: "serving",
      grams: Math.round(g),
      preparation: "unknown",
      macros: pickedMacros!,
      estimate: pickedMacros!,
      per100g: picked.per100g,
      confidence: 1,
      provenance: "database",
      source: {
        name: picked.source === "usda" ? "USDA" : "Open Food Facts",
        url: picked.sourceUrl,
        id: picked.id,
        label: picked.brand ? `${picked.name} · ${picked.brand}` : picked.name,
      },
      savedFoodId: null,
      searchQuery: q,
      note: null,
      handoff: false,
    });
    close(false);
    setQ("");
  };

  const mKcal = parseNum(manual.kcal);
  const mGrams = parseNum(manual.grams);
  const manualOk = manual.name.trim().length > 0 && mKcal != null && mKcal >= 0 && mKcal <= 8000;
  const addManual = () => {
    if (!manualOk) return;
    const macros = tidyMacros({ calories: mKcal!, protein: parseNum(manual.p) ?? 0, carbs: parseNum(manual.c) ?? 0, fat: parseNum(manual.f) ?? 0 });
    onAdd({
      id: `manual-${Date.now()}`,
      name: manual.name.trim().slice(0, 80),
      brand: null,
      kind: "generic",
      portion: mGrams ? `${Math.round(mGrams)} g` : "",
      quantity: 1,
      unit: "serving",
      grams: mGrams && mGrams > 0 ? Math.round(mGrams) : null,
      preparation: "unknown",
      macros,
      estimate: macros,
      per100g: null,
      confidence: 1,
      provenance: "manual",
      source: null,
      savedFoodId: null,
      searchQuery: manual.name,
      note: null,
      handoff: false,
    });
    setManual({ name: "", grams: "", kcal: "", p: "", c: "", f: "" });
    close(false);
  };

  const footer =
    tab === "search" ? (
      <Button variant="primary" size="lg" block disabled={!pickedMacros} onClick={addPicked}>
        Add item
      </Button>
    ) : (
      <Button variant="primary" size="lg" block disabled={!manualOk} onClick={addManual}>
        Add item
      </Button>
    );

  return (
    <Sheet open={open} onOpenChange={close} title="Add an item" description="Search real food databases or type the numbers." footer={footer}>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        ariaLabel="How to add"
        className="mb-4"
        options={[
          { value: "search", label: "Search" },
          { value: "manual", label: "Manual" },
        ]}
      />

      {tab === "search" ? (
        <div>
          {!picked ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-3" aria-hidden />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search USDA and Open Food Facts"
                  className="pl-10"
                  aria-label="Search foods"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoFocus
                />
                {busy && <Spinner className="absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-3" />}
              </div>
              {shown?.status === "partial" && <p className="mt-2 text-[12px] text-fg-3">One database didn&apos;t answer. Showing what came back.</p>}
              {shown?.status === "unavailable" && <p className="mt-2 text-[12px] text-fg-3">The food databases aren&apos;t answering right now. Use Manual.</p>}
              {shown?.status === "demo_key" && <p className="mt-2 text-[12px] text-fg-3">USDA is on a shared demo key, so lookups may be limited.</p>}
              {err && <p className="mt-2 text-[13px] text-danger">{err}</p>}
              <ul className="mt-3 space-y-1.5">
                {shown?.results.slice(0, 14).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(r);
                        setGrams(String(r.servingGrams && r.servingGrams !== 100 ? r.servingGrams : 100));
                      }}
                      className="press-soft flex w-full items-center gap-3 rounded-[12px] bg-s3 px-3 py-2.5 text-left hover:bg-s4"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-fg">{r.name}</span>
                        <span className="block truncate text-[12px] text-fg-3">
                          {r.brand ? `${r.brand} · ` : ""}
                          {r.sourceName === "USDA FoodData Central" ? "USDA" : "Open Food Facts"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="num block text-[16px] text-fg">{r.per100g ? fmtKcal(r.per100g.calories) : "—"}</span>
                        <span className="block text-[11px] text-fg-3">kcal/100 g</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {shown && !shown.results.length && !busy && (
                <p className="mt-4 text-center text-[13px] text-fg-2">No matches. Try fewer words, or add it manually.</p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="card-inset p-3.5">
                <p className="text-[15px] font-bold text-fg">{picked.name}</p>
                {picked.brand && <p className="text-[13px] text-fg-2">{picked.brand}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DatabaseBadge name={`${picked.sourceName === "USDA FoodData Central" ? "USDA" : "Open Food Facts"} ↗`} url={picked.sourceUrl} />
                  {picked.per100g && <span className="text-[12px] text-fg-3">{fmtKcal(picked.per100g.calories)} kcal per 100 g</span>}
                </div>
              </div>
              <Field label="Amount eaten" hint={picked.servingLabel ?? undefined}>
                {(id) => <NumberInput id={id} value={grams} onChange={(e) => setGrams(e.target.value)} suffix="g" enterKeyHint="done" />}
              </Field>
              {pickedMacros && (
                <div className="flex items-baseline justify-between">
                  <span>
                    <span className="num-md">{fmtKcal(pickedMacros.calories)}</span>
                    <span className="unit">kcal</span>
                  </span>
                  <MacroTrio m={pickedMacros} />
                </div>
              )}
              <button type="button" onClick={() => setPicked(null)} className="h-11 text-[13px] font-bold text-gold-300">
                Choose a different food
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          <Field label="Food">
            {(id) => (
              <Input
                id={id}
                value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })}
                placeholder="e.g. Olive oil"
                autoComplete="off"
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Calories">
              {(id) => (
                <NumberInput id={id} value={manual.kcal} onChange={(e) => setManual({ ...manual, kcal: e.target.value })} suffix="kcal" decimal={false} />
              )}
            </Field>
            <Field label="Weight" hint="optional">
              {(id) => <NumberInput id={id} value={manual.grams} onChange={(e) => setManual({ ...manual, grams: e.target.value })} suffix="g" />}
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {(["p", "c", "f"] as const).map((k) => (
              <Field key={k} label={k === "p" ? "Protein" : k === "c" ? "Carbs" : "Fat"}>
                {(id) => (
                  <NumberInput id={id} value={manual[k]} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} suffix="g" className={cn("px-3")} />
                )}
              </Field>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

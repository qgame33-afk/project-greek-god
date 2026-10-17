"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, Check, House, Pencil, Plus, RefreshCw, Share } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRecipePool } from "@/components/meals/shared";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Meter } from "@/components/ui/meter";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { useToday } from "@/lib/data/core";
import {
  useAddCustomGroceryItem,
  useDeleteGroceryItem,
  useGroceryItems,
  useMealPrefs,
  usePlan,
  useSyncGroceryList,
  useUpdateGroceryItem,
  useUpdatePlan,
  type GroceryItem,
} from "@/lib/data/meals";
import { addDays, shortDate, weekStart } from "@/lib/dates";
import { buildGroceryList, mergeGroceryState, planFrom, toGroceryInput, type GroceryUse } from "@/lib/meals/engine";
import { useSwapIn } from "@/lib/motion";
import { AddItemSheet, BudgetSheet, GroceryLineRow, LineSheet, RestoreIcon, SetAsideGroup } from "./GroceryParts";
import { budgetLines, cad, groceryFrom, groceryText, groceryView, rowTotals, type GroceryRow } from "./model";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "Oct 13 – 19" (or "Oct 27 – Nov 2"). */
function weekRange(ws: string, today: string) {
  const end = addDays(ws, 6);
  const a = shortDate(ws, today);
  const b = shortDate(end, today);
  return a.slice(0, 3) === b.slice(0, 3) ? `${a} – ${b.slice(4)}` : `${a} – ${b}`;
}

/**
 * The week's grocery list (docs/MEALS.md §5–6): generated from the plan by the engine, stored
 * per plan so ticks survive, grouped by aisle. Check off while shopping, "I have this", remove,
 * add your own items, copy it as clean text, and an optional budget against the estimate.
 * When the plan changes after the list was made, a banner offers to update it (ticks and your
 * own items are kept). `?week=YYYY-MM-DD` picks the week (default: this one).
 */
export function GroceryScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = useToday();
  const thisWeek = weekStart(today);
  const nextWeek = addDays(thisWeek, 7);
  const asked = params.get("week");
  const ws = asked && ISO.test(asked) ? weekStart(asked) : thisWeek;
  const setWeek = (w: string) => {
    const sp = new URLSearchParams(window.location.search);
    if (w === thisWeek) sp.delete("week");
    else sp.set("week", w);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const swapRef = useSwapIn<HTMLDivElement, string>(ws);

  return (
    <div className="@container pb-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="t-title-1 text-ivory">The market</h1>
          <p className="t-meta mt-1 text-stone">{weekRange(ws, today)}</p>
        </div>
        {(ws === thisWeek || ws === nextWeek) && (
          <Segmented
            ariaLabel="Week"
            size="sm"
            className="w-[13.5rem]"
            value={ws === thisWeek ? "this" : "next"}
            onChange={(v) => setWeek(v === "this" ? thisWeek : nextWeek)}
            options={[
              { value: "this", label: "This week" },
              { value: "next", label: "Next week" },
            ]}
          />
        )}
      </header>
      <div ref={swapRef} className="mt-5">
        <WeekList key={ws} ws={ws} today={today} />
      </div>
    </div>
  );
}

function WeekList({ ws, today }: { ws: string; today: string }) {
  const { plan, meals, loading, error, hasData } = usePlan(ws);
  const grocery = useGroceryItems(plan?.id);
  const pool = useRecipePool();
  const prefsQ = useMealPrefs();
  const sync = useSyncGroceryList();
  const update = useUpdateGroceryItem();
  const addCustom = useAddCustomGroceryItem();
  const del = useDeleteGroceryItem();
  const updatePlan = useUpdatePlan();

  const ready = hasData && pool.hasData && prefsQ.hasData;
  // The stored list covers the plan days from the day it was made (steady while you shop);
  // "Update list" makes it again from today, leaving the days already past off.
  const listFrom = groceryFrom(ws, today, plan?.grocery_generated_at);
  const shopFrom = planFrom(ws, today);
  const build = useCallback(
    (from: string) => buildGroceryList(meals, pool.lookup, { pantry: prefsQ.prefs.pantry, weeklyBudgetCad: prefsQ.prefs.weeklyBudgetCad }, { from }),
    [meals, pool.lookup, prefsQ.prefs.pantry, prefsQ.prefs.weeklyBudgetCad],
  );
  const generated = useMemo(() => (ready && meals.length ? build(listFrom) : null), [ready, meals.length, build, listFrom]);
  const fresh = useMemo(() => (!generated ? null : shopFrom === listFrom ? generated : build(shopFrom)), [generated, build, shopFrom, listFrom]);
  const input = useMemo(() => (generated ? toGroceryInput(generated.items) : null), [generated]);
  const freshInput = useMemo(() => (fresh ? toGroceryInput(fresh.items) : null), [fresh]);
  const uses = useMemo(() => new Map<string, GroceryUse[]>((generated?.items ?? []).map((l) => [l.key, l.uses])), [generated]);
  const rows = grocery.items;
  const view = useMemo(() => groceryView(rows), [rows]);
  const budget = plan?.grocery_budget_cad != null ? Number(plan.grocery_budget_cad) : prefsQ.prefs.weeklyBudgetCad;
  const totals = useMemo(() => rowTotals(rows, budget), [rows, budget]);
  const diff = useMemo(() => (grocery.hasData && input && rows.some((r) => !r.custom) ? mergeGroceryState(rows, input) : null), [grocery.hasData, input, rows]);
  const changed = !!diff && diff.added.length + diff.dropped.length + diff.changed.length > 0;

  /* first visit: make the list from the plan (nothing to keep yet) */
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !plan || !input || !input.length || !grocery.hasData) return;
    if (rows.length > 0 || plan.grocery_generated_at) return;
    autoRan.current = true;
    sync.mutate({ planId: plan.id, items: input });
  }, [plan, input, grocery.hasData, rows.length, sync]);

  const [lineKey, setLineKey] = useState<string | null>(null);
  // one stable handler for every row, so a tick re-renders only the row that changed
  const planId = plan?.id ?? null;
  const { mutate: patchItem } = update;
  const toggleRow = useCallback(
    (r: GroceryRow) => {
      if (planId) patchItem({ planId, key: r.key, values: { checked: !r.checked } });
    },
    [planId, patchItem],
  );
  // a ticked line keeps its place for a moment before it sinks to the bottom of its aisle, so a
  // quick second tap never lands on the line that slid up under the finger
  const [settling, setSettling] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback(
    (r: GroceryRow) => {
      setSettling((s) => new Set([...s, r.key]));
      window.setTimeout(
        () =>
          setSettling((s) => {
            const n = new Set(s);
            n.delete(r.key);
            return n;
          }),
        SETTLE_MS,
      );
      toggleRow(r);
    },
    [toggleRow],
  );
  const line = lineKey ? (rows.find((r) => r.key === lineKey) ?? null) : null;
  const [addOpen, setAddOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (error || grocery.error) return <ErrorNote>Couldn&apos;t load the list. Check your connection and try again.</ErrorNote>;
  if (loading || !hasData || (plan && (!grocery.hasData || !pool.hasData))) return <GrocerySkeleton />;
  if (!plan || meals.length === 0) {
    return (
      <div className="border-y border-vein px-2 py-9 text-center">
        <p className="t-title-2 text-ivory">Plan a week to build your list</p>
        <p className="t-callout mx-auto mt-1.5 max-w-[30ch] text-stone">The market list is made from the week&apos;s meal plan, grouped by aisle.</p>
        <Button asChild variant="outline" size="md" className="mt-5 rounded-full">
          <Link href={ws === weekStart(today) ? "/nutrition?tab=week" : "/nutrition?tab=week&week=next"}>
            <CalendarPlus className="size-[18px]" strokeWidth={1.6} />
            Plan the week
          </Link>
        </Button>
      </div>
    );
  }
  if (rows.length === 0 && (sync.isPending || (!plan.grocery_generated_at && !!input?.length))) return <GrocerySkeleton label="Making your list" />;

  const set = (r: GroceryItem | { key: string }, values: Parameters<typeof update.mutate>[0]["values"], undo?: boolean) => update.mutate({ planId: plan.id, key: r.key, values, undo });
  const item = (key: string) => rows.find((r) => r.key === key);

  const share = async () => {
    const text = groceryText(rows, { title: `Groceries · ${weekRange(plan.week_start, today)}`, totals });
    // the share sheet on the phone (Messages, Notes); the clipboard where there is none
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Groceries", text });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // older iOS / no permission: the classic textarea route
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
      toast("List copied", { description: "Paste it into Notes or Messages." });
    } else toast.error("Couldn't copy", { description: "Your browser blocked the clipboard." });
  };

  const regenerate = () => {
    if (!freshInput) return;
    sync.mutate({ planId: plan.id, items: freshInput });
    toast("List updated", { description: "Your ticks and your own items were kept." });
  };

  const allIn = view.toBuy > 0 && view.inCart === view.toBuy;
  const money = budgetLines(totals);
  const daysCovered = new Set(meals.filter((m) => m.local_date >= listFrom).map((m) => m.local_date)).size;

  const summary = (
    <section aria-label="Shopping progress">
      <p className="t-meta text-stone">
        {view.toBuy} {view.toBuy === 1 ? "item" : "items"} · {daysCovered} {daysCovered === 1 ? "day" : "days"} covered
      </p>
      <div className="mt-3 flex items-end justify-between gap-4 @max-[19rem]:flex-wrap">
        <div>
          <p className="t-eyebrow">In the cart</p>
          <p className="mt-1.5 whitespace-nowrap">
            <span className="t-dial text-ivory">{view.inCart}</span>
            <span className="t-callout text-stone"> / {view.toBuy}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="t-eyebrow">At the checkout</p>
          <p className="mt-1.5 flex items-center justify-end gap-2">
            <Tag kind="CALC" explain="Built-in rough Canadian shelf prices for each pack you buy (not AI). What's left to buy, before tax." />
            <span className="t-num-m tnum text-ivory">~{cad(totals.checkoutCad)}</span>
          </p>
        </div>
      </div>
      <Meter className="mt-4" size="md" tone="ivory" value={view.inCart} target={view.toBuy || 1} label={`${view.inCart} of ${view.toBuy} in the cart`} />
      <p className="t-meta mt-2 text-stone">{allIn ? "Everything's in the cart." : `${view.toBuy - view.inCart} left to buy`}</p>

      <div className="mt-4 flex items-start justify-between gap-3 border-t border-vein pt-3 @max-[19rem]:flex-col @max-[19rem]:gap-1">
        <div className="min-w-0">
          <p className="t-title-3 text-ivory">{money.headline}</p>
          <p className="t-meta mt-0.5 text-stone">{money.detail}</p>
          {money.note && <p className="t-meta mt-1 text-stone">{money.note}</p>}
        </div>
        <button type="button" onClick={() => setBudgetOpen(true)} className="press t-callout -mr-2 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-field px-2.5 font-semibold text-ivory">
          <Pencil className="size-3.5" strokeWidth={1.6} aria-hidden />
          {budget != null && budget > 0 ? "Edit" : "Set budget"}
        </button>
      </div>
    </section>
  );

  const actions = (
    <div className="grid grid-cols-2 gap-2.5">
      <Button variant="outline" size="md" className="rounded-full" onClick={share} aria-live="polite">
        {copied ? <Check className="size-[18px]" strokeWidth={1.6} aria-hidden /> : <Share className="size-[18px]" strokeWidth={1.6} aria-hidden />}
        {copied ? "Copied" : "Share list"}
      </Button>
      <Button variant="outline" size="md" className="rounded-full" onClick={() => setAddOpen(true)}>
        <Plus className="size-[18px]" strokeWidth={1.6} aria-hidden />
        Add item
      </Button>
    </div>
  );

  return (
    <div>
      <div className="space-y-6">
        {changed && diff && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-card bg-m2 px-4 py-3 shadow-[inset_0_0_0_1px_var(--vein-3)]" role="status">
            <div className="min-w-[min(100%,15rem)] flex-1">
              <p className="t-title-3 text-ivory">Your plan changed</p>
              <p className="t-meta text-stone">
                {[diff.added.length && `${diff.added.length} new`, diff.changed.length && `${diff.changed.length} amounts changed`, diff.dropped.length && `${diff.dropped.length} no longer needed`].filter(Boolean).join(" · ")}
                . Your ticks and own items stay.
              </p>
            </div>
            <Button variant="secondary" size="sm" className="w-full shrink-0 @min-[22rem]:w-auto" onClick={regenerate} loading={sync.isPending}>
              <RefreshCw className="size-4" strokeWidth={1.6} />
              Update list
            </Button>
          </div>
        )}

        {summary}
        {actions}

        {view.groups.length === 0 && view.staples.length === 0 && (
          <div className="border-y border-vein py-8 text-center">
            <p className="t-title-2 text-ivory">Nothing left on the list</p>
            <p className="t-callout mt-1 text-stone">Restore removed items below, or add your own.</p>
          </div>
        )}

        {view.groups.map((g) => {
          const done = g.items.filter((r) => r.checked).length;
          return (
            <section key={g.category} aria-labelledby={`aisle-${g.category}`}>
              <div className="flex min-h-11 items-center justify-between gap-3">
                <h2 id={`aisle-${g.category}`} className="t-eyebrow">
                  {g.label}
                </h2>
                <span className="t-meta tnum text-stone">
                  {done}/{g.items.length}
                </span>
              </div>
              <ul className="divide-y divide-vein border-y border-vein">
                {cartLast(g.items, settling).map((r) => (
                  <GroceryLineRow key={r.key} row={r} onToggle={toggle} onMore={setLineKey} />
                ))}
              </ul>
            </section>
          );
        })}

        {view.staples.length > 0 && (
          <section aria-labelledby="aisle-staples">
            <div className="min-h-11 py-1">
              <h2 id="aisle-staples" className="t-eyebrow">
                Check you have
              </h2>
              <p className="t-meta mt-1 text-stone">Salt, oil and spices: not counted in the total.</p>
            </div>
            <ul className="divide-y divide-vein border-y border-vein">
              {cartLast(view.staples, settling).map((r) => (
                <GroceryLineRow key={r.key} row={r} staple onToggle={toggle} onMore={setLineKey} />
              ))}
            </ul>
          </section>
        )}

        <SetAsideGroup title="Already have" rows={view.have} actionLabel="Need it" icon={<House className="size-4" strokeWidth={1.6} aria-hidden />} action={(r) => set(r, { have: false })} />
        <SetAsideGroup title="Removed" rows={view.removed} actionLabel="Restore" icon={RestoreIcon} action={(r) => set(r, { removed: false })} />

        {generated && generated.missing.length > 0 && (
          <p className="t-meta text-stone">
            {generated.missing.length === 1 ? "One planned recipe" : `${generated.missing.length} planned recipes`} couldn&apos;t be read, so {generated.missing.length === 1 ? "its" : "their"} ingredients aren&apos;t listed.
          </p>
        )}
      </div>

      <LineSheet
        row={line}
        uses={line ? (uses.get(line.key) ?? []) : []}
        onOpenChange={(o) => !o && setLineKey(null)}
        onCheck={(r) => (set(r, { checked: !r.checked }), setLineKey(null))}
        onHave={(r) => {
          set(r, { have: true });
          setLineKey(null);
          toast(`${r.name}: you have it`, { duration: 6000, action: { label: "Undo", onClick: () => set(r, { have: false }) } });
        }}
        onRemove={(r) => (set(r, { removed: true }), setLineKey(null))}
        onDelete={(r) => {
          const full = item(r.key);
          if (full) del.mutate({ item: full });
          setLineKey(null);
        }}
      />
      <AddItemSheet open={addOpen} onOpenChange={setAddOpen} onAdd={(v) => addCustom.mutate({ planId: plan.id, id: v.id, name: v.name, label: v.label, category: v.category })} />
      <BudgetSheet open={budgetOpen} onOpenChange={setBudgetOpen} value={budget} onSave={(v) => updatePlan.mutate({ planId: plan.id, weekStart: plan.week_start, values: { grocery_budget_cad: v } })} />
    </div>
  );
}

const SETTLE_MS = 1200;

/** Lines still to buy first, those in the cart at the bottom of the aisle (a line just ticked stays put while it settles). */
function cartLast(items: GroceryRow[], settling: ReadonlySet<string>): GroceryRow[] {
  const done = (r: GroceryRow) => r.checked && !settling.has(r.key);
  return [...items.filter((r) => !done(r)), ...items.filter(done)];
}

export function GrocerySkeleton({ label = "Loading the list" }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-5">
      <Skeleton className="h-36 w-full rounded-card" />
      <Skeleton className="h-11 w-full rounded-full" />
      <Skeleton className="h-60 w-full rounded-card" />
    </div>
  );
}

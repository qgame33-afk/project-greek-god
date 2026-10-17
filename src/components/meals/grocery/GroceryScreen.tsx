"use client";

import Link from "next/link";
import { BackLink } from "@/components/shell/BackLink";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, Copy, House, Pencil, Plus, RefreshCw, ShoppingBasket } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRecipePool } from "@/components/meals/shared";
import { EstimateBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Bar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
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
  const setWeek = (w: string) => router.replace(w === thisWeek ? pathname : `${pathname}?week=${w}`, { scroll: false });
  const swapRef = useSwapIn<HTMLDivElement, string>(ws);

  return (
    <div className="pb-4">
      <BackLink href="/nutrition/meals" className="press -ml-2 inline-flex h-11 items-center gap-1 rounded-[12px] pr-3 text-[14px] font-semibold text-fg-2 hover:text-fg">
        <ChevronLeft className="size-5" aria-hidden />
        Meal plan
      </BackLink>
      <header className="mt-1 mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow mb-2">Meals · {weekRange(ws, today)}</p>
          <h1 className="t-title">Grocery list</h1>
        </div>
        {(ws === thisWeek || ws === nextWeek) && (
          <Segmented
            ariaLabel="Week"
            className="w-full sm:w-[260px]"
            value={ws === thisWeek ? "this" : "next"}
            onChange={(v) => setWeek(v === "this" ? thisWeek : nextWeek)}
            options={[
              { value: "this", label: "This week" },
              { value: "next", label: "Next week" },
            ]}
          />
        )}
      </header>
      <div ref={swapRef}>
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
  const line = lineKey ? (rows.find((r) => r.key === lineKey) ?? null) : null;
  const [addOpen, setAddOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (error || grocery.error) return <ErrorNote>Couldn&apos;t load the list. Check your connection and try again.</ErrorNote>;
  if (loading || !hasData || (plan && (!grocery.hasData || !pool.hasData))) return <GrocerySkeleton />;
  if (!plan || meals.length === 0) {
    return (
      <Empty
        art={<ShoppingBasket className="size-12 text-gold-600" strokeWidth={1.25} aria-hidden />}
        title="No meals planned for this week"
        action={
          <Button asChild variant="secondary">
            <Link href="/nutrition/meals">Plan the week</Link>
          </Button>
        }
      >
        Your grocery list is made from the week&apos;s meal plan.
      </Empty>
    );
  }
  if (rows.length === 0 && (sync.isPending || (!plan.grocery_generated_at && !!input?.length))) return <GrocerySkeleton label="Making your list" />;

  const set = (r: GroceryItem | { key: string }, values: Parameters<typeof update.mutate>[0]["values"], undo?: boolean) => update.mutate({ planId: plan.id, key: r.key, values, undo });
  const item = (key: string) => rows.find((r) => r.key === key);

  const copy = async () => {
    const text = groceryText(rows, { title: `Groceries · ${weekRange(plan.week_start, today)}`, totals });
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

  const summary = (
    <section className="card p-4 sm:p-5" aria-label="Shopping progress">
      <div className="grid grid-cols-2 items-start gap-4">
        <div>
          <p className="eyebrow">In the cart</p>
          <p className="mt-2 num-lg leading-none">
            {view.inCart}
            <span className="unit">/ {view.toBuy}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">At the checkout</p>
          <p className="mt-2 num-lg leading-none text-fg">
            <span className="unit !ml-0 mr-0.5">≈</span>
            {cad(totals.checkoutCad)}
          </p>
        </div>
      </div>
      <Bar value={view.toBuy ? view.inCart / view.toBuy : 0} className="mt-4" label={`${view.inCart} of ${view.toBuy} in the cart`} />
      <p className={cn("mt-2.5 text-[13px] font-medium", allIn ? "text-success" : "text-fg-3")}>{allIn ? "Everything's in the cart." : `${view.toBuy - view.inCart} left to buy`}</p>

      <div className="mt-4 border-t border-line-hair pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-fg">{money.headline}</p>
            <p className={cn("mt-0.5 text-[13px] font-semibold leading-snug", money.over ? "text-fg" : "text-fg-2")}>{money.detail}</p>
            {money.note && <p className="mt-1 text-[12.5px] font-medium leading-snug text-fg-3">{money.note}</p>}
          </div>
          <button type="button" onClick={() => setBudgetOpen(true)} className="press -mr-2 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[13.5px] font-bold text-gold-300 hover:text-gold-200">
            <Pencil className="size-3.5" aria-hidden />
            {budget != null && budget > 0 ? "Edit" : "Set budget"}
          </button>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-medium leading-snug text-fg-3">
          <EstimateBadge />
          Rough Canadian shelf prices.
        </p>
      </div>
    </section>
  );

  const actions = (
    <div className="grid grid-cols-2 gap-2.5">
      <Button variant="secondary" onClick={copy} aria-live="polite">
        {copied ? <Check className="size-[18px] text-success" aria-hidden /> : <Copy className="size-[18px] text-gold-300" aria-hidden />}
        {copied ? "Copied" : "Copy list"}
      </Button>
      <Button variant="secondary" onClick={() => setAddOpen(true)}>
        <Plus className="size-[18px] text-gold-300" aria-hidden />
        Add item
      </Button>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
      <div className="min-w-0 space-y-4">
        {changed && diff && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-[16px] border border-lapis-line bg-lapis-tint px-4 py-3" role="status">
            <div className="flex min-w-[min(100%,250px)] flex-1 items-start gap-3">
              <RefreshCw className="mt-0.5 size-5 shrink-0 text-lapis-text" aria-hidden />
              <div className="min-w-0">
                <p className="text-[14.5px] font-bold text-fg">Your plan changed</p>
                <p className="text-[12.5px] font-medium leading-snug text-fg-2">
                  {[diff.added.length && `${diff.added.length} new`, diff.changed.length && `${diff.changed.length} amounts changed`, diff.dropped.length && `${diff.dropped.length} no longer needed`].filter(Boolean).join(" · ")}
                  . Your ticks and own items stay.
                </p>
              </div>
            </div>
            <Button variant="secondary" size="md" className="h-11 w-full shrink-0 sm:w-auto" onClick={regenerate} loading={sync.isPending}>
              Update list
            </Button>
          </div>
        )}

        <div className="space-y-4 lg:hidden">
          {summary}
          {actions}
        </div>

        {view.groups.length === 0 && view.staples.length === 0 && (
          <Empty title="Nothing left on the list" action={<Button variant="secondary" onClick={() => setAddOpen(true)}>Add item</Button>}>
            Restore removed items below, or add your own.
          </Empty>
        )}

        {view.groups.map((g) => {
          const done = g.items.filter((r) => r.checked).length;
          return (
            <section key={g.category} className="card-instrument overflow-hidden p-0" aria-labelledby={`aisle-${g.category}`}>
              <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-1.5">
                <h2 id={`aisle-${g.category}`} className="eyebrow">
                  {g.label}
                </h2>
                <span className={cn("text-[12px] font-semibold", done === g.items.length ? "text-success" : "text-fg-3")}>
                  <span className="num text-[13px]">{done}</span>/{g.items.length}
                </span>
              </div>
              <ul className="divide-y divide-line-hair">
                {g.items.map((r) => (
                  <GroceryLineRow key={r.key} row={r} onToggle={toggleRow} onMore={setLineKey} />
                ))}
              </ul>
            </section>
          );
        })}

        {view.staples.length > 0 && (
          <section className="card-instrument overflow-hidden p-0" aria-labelledby="aisle-staples">
            <div className="px-4 pt-3.5 pb-1.5">
              <h2 id="aisle-staples" className="eyebrow">
                Check you have
              </h2>
              <p className="mt-1 text-[12.5px] font-medium text-fg-3">Salt, oil and spices: not counted in the total.</p>
            </div>
            <ul className="divide-y divide-line-hair">
              {view.staples.map((r) => (
                <GroceryLineRow key={r.key} row={r} staple onToggle={toggleRow} onMore={setLineKey} />
              ))}
            </ul>
          </section>
        )}

        <SetAsideGroup title="Already have" rows={view.have} actionLabel="Need it" icon={<House className="size-4" aria-hidden />} action={(r) => set(r, { have: false })} />
        <SetAsideGroup title="Removed" rows={view.removed} actionLabel="Restore" icon={RestoreIcon} action={(r) => set(r, { removed: false })} />

        {generated && generated.missing.length > 0 && (
          <p className="text-[12.5px] font-medium text-fg-3">
            {generated.missing.length === 1 ? "One planned recipe" : `${generated.missing.length} planned recipes`} couldn&apos;t be read, so {generated.missing.length === 1 ? "its" : "their"} ingredients aren&apos;t listed.
          </p>
        )}
      </div>

      <aside className="hidden space-y-4 lg:sticky lg:top-8 lg:block">
        {summary}
        {actions}
      </aside>

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

export function GrocerySkeleton({ label = "Loading the list" }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-4">
      <Skeleton className="h-[188px] w-full rounded-[20px]" />
      <Skeleton className="h-12 w-full rounded-[14px]" />
      <Skeleton className="h-[240px] w-full rounded-[16px]" />
      <Skeleton className="h-[180px] w-full rounded-[16px]" />
    </div>
  );
}

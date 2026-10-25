"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Ellipsis, PencilLine, Plus, RefreshCw, Share, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { weekSpan } from "@/components/meals/week/actions";
import { useOnline, useRecipePool } from "@/components/meals/shared";
import { BackHeader } from "@/components/shell/BackHeader";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/controls";
import { ListGroup, Row } from "@/components/ui/list";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
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
import { addDays, weekStart } from "@/lib/dates";
import { buildGroceryList, mergeGroceryState, planFrom, toGroceryInput, type GroceryUse } from "@/lib/meals/engine";
import { useSwapIn } from "@/lib/motion";
import { AddItemSheet, BudgetSheet, GroceryLineRow, LineSheet, SetAsideGroup } from "./GroceryParts";
import { budgetLines, cad, groceryFrom, groceryText, groceryView, rowTotals, type GroceryRow } from "./model";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The grocery list (docs/DESIGN-V3-SIMPLE.md §4.4.5): made from the week's meal plan by the
 * engine and stored per plan so ticks survive; aisles with a round check per line; a ticked line
 * dims, strikes through and sinks to the bottom of its aisle. "Copy list" copies the text. The ⋯
 * holds update from the plan, this week's budget, add an item, edit the list and share. ‹ › (and
 * `?week=`) change the week. Works offline (the stored list and its ticks).
 */
export function GroceryScreen() {
  const params = useSearchParams();
  const pathname = usePathname();
  const today = useToday();
  const thisWeek = weekStart(today);
  const nextWeek = addDays(thisWeek, 7);
  const asked = params.get("week");
  const askedWs = asked && ISO.test(asked) ? weekStart(asked) : thisWeek;
  const ws = askedWs > nextWeek ? nextWeek : askedWs;
  const setWeek = (w: string) => {
    const sp = new URLSearchParams(window.location.search);
    if (w === thisWeek) sp.delete("week");
    else sp.set("week", w);
    const qs = sp.toString();
    // in place (null state so Next.js syncs the params): no server round trip, works offline
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };
  const swapRef = useSwapIn<HTMLDivElement, string>(ws);
  return (
    <div ref={swapRef} className="mx-auto max-w-col">
      <WeekList key={ws} ws={ws} today={today} onPrev={() => setWeek(addDays(ws, -7))} onNext={ws < nextWeek ? () => setWeek(addDays(ws, 7)) : undefined} />
    </div>
  );
}

function WeekList({ ws, today, onPrev, onNext }: { ws: string; today: string; onPrev: () => void; onNext?: () => void }) {
  const { plan, meals, loading, error, hasData } = usePlan(ws);
  const grocery = useGroceryItems(plan?.id);
  const pool = useRecipePool();
  const prefsQ = useMealPrefs();
  const sync = useSyncGroceryList();
  const update = useUpdateGroceryItem();
  const addCustom = useAddCustomGroceryItem();
  const del = useDeleteGroceryItem();
  const updatePlan = useUpdatePlan();
  const online = useOnline();

  const ready = hasData && pool.hasData && prefsQ.hasData;
  // The stored list covers the plan days from the day it was made (steady while you shop);
  // "Update from the plan" makes it again from today, leaving the days already past off.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const listReady = !!plan && meals.length > 0 && rows.length > 0;
  const text = () => groceryText(rows, { title: `Groceries · ${weekSpan(ws)}`, totals });
  const copy = async () => {
    if (!listReady) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text());
      ok = true;
    } catch {
      // older iOS / no permission: the classic textarea route
      const ta = document.createElement("textarea");
      ta.value = text();
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
    if (ok) toast("List copied", { description: "Paste it into Notes or Messages." });
    else toast.error("Couldn't copy", { description: "Your browser blocked the clipboard." });
  };
  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Groceries", text: text() });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    await copy();
  };
  const regenerate = () => {
    if (!plan || !freshInput) return;
    sync.mutate({ planId: plan.id, items: freshInput });
    toast("List updated", { description: "Your ticks and your own items were kept." });
  };

  const money = budgetLines(totals);
  const summary = listReady ? `${weekSpan(ws)} · ${view.toBuy} ${view.toBuy === 1 ? "item" : "items"} · ${view.inCart} in the cart` : weekSpan(ws);

  const header = (
    <BackHeader
      href="/nutrition"
      parent="Food"
      right={
        <span className="flex items-center gap-2">
          <Pill onClick={() => void copy()} disabled={!listReady}>
            Copy list
          </Pill>
          {plan && (
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="More for the grocery list" aria-haspopup="dialog" className="press grid size-11 shrink-0 place-items-center rounded-full bg-control text-fg">
              <Ellipsis className="size-5" strokeWidth={1.9} />
            </button>
          )}
        </span>
      }
      title="Grocery list"
    />
  );
  const weekLine = (
    <div className="mt-1 flex items-center gap-1">
      <p className="t-label min-w-0 flex-1 tabular-nums" aria-live="polite">
        {summary}
      </p>
      <button type="button" onClick={onPrev} aria-label="Previous week" className="press grid size-11 shrink-0 place-items-center rounded-full text-fg-2 hover:text-fg">
        <ChevronLeft className="size-5" strokeWidth={1.9} />
      </button>
      <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next week" className="press -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-fg-2 hover:text-fg disabled:opacity-30">
        <ChevronRight className="size-5" strokeWidth={1.9} />
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (error || grocery.error) body = <ErrorNote>Couldn&apos;t load the list.</ErrorNote>;
  else if (loading || !hasData || (plan && (!grocery.hasData || !pool.hasData))) {
    // a week never opened on this phone has nothing saved to show offline: say so, never spin
    body = !online ? <Empty title="Offline">This list loads when you&apos;re back online.</Empty> : <GrocerySkeleton />;
  } else if (!plan || meals.length === 0) {
    const thisWeek = ws === weekStart(today);
    body = (
      <Empty title="Plan a week to make your list">
        The list is made from the week&apos;s meals, by aisle.
        <Link href={thisWeek ? "/nutrition?generate=1" : `/nutrition?date=${ws}&generate=1`} className="hit-44 mt-3 block font-semibold text-fg underline underline-offset-4">
          {thisWeek ? "Plan this week" : "Plan that week"}
        </Link>
      </Empty>
    );
  } else if (rows.length === 0 && (sync.isPending || (!plan.grocery_generated_at && !!input?.length))) body = <GrocerySkeleton label="Making your list" />;
  else {
    const set = (r: GroceryItem | { key: string }, values: Parameters<typeof update.mutate>[0]["values"]) => update.mutate({ planId: plan.id, key: r.key, values });
    body = (
      <div className="flex flex-col">
        {changed && diff && (
          <div className="mt-4 rounded-card bg-surface p-5" role="status">
            <p className="t-row">Your meal plan changed</p>
            <p className="t-label mt-1">
              {[diff.added.length && `${diff.added.length} new`, diff.changed.length && `${diff.changed.length} amounts changed`, diff.dropped.length && `${diff.dropped.length} no longer needed`].filter(Boolean).join(" · ")}. Your ticks and own items stay.
            </p>
            <Button variant="secondary" size="md" className="mt-4" onClick={regenerate} loading={sync.isPending}>
              Update the list
            </Button>
          </div>
        )}
        {editing && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-tile-lg bg-surface px-4 py-2">
            <p className="t-label">Tap ⋯ on a line to remove it or say you have it.</p>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Done
            </Button>
          </div>
        )}
        {view.groups.length === 0 && view.staples.length === 0 && (
          <Empty className="mt-4" title="Nothing left on the list">
            Bring back removed items below, or add your own.
          </Empty>
        )}
        {view.groups.map((g) => (
          <section key={g.category} aria-labelledby={`aisle-${g.category}`}>
            <h2 id={`aisle-${g.category}`} className="t-cap mb-2 mt-6 px-1">
              {g.label}
            </h2>
            <ul className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line" data-food="">
              {cartLast(g.items, settling).map((r) => (
                <GroceryLineRow key={r.key} row={r} onToggle={toggle} onMore={editing ? setLineKey : undefined} />
              ))}
            </ul>
          </section>
        ))}
        {view.staples.length > 0 && (
          <section aria-labelledby="aisle-staples">
            <h2 id="aisle-staples" className="t-cap mb-2 mt-6 px-1">
              Check you have · not counted in the total
            </h2>
            <ul className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line" data-food="">
              {cartLast(view.staples, settling).map((r) => (
                <GroceryLineRow key={r.key} row={r} staple onToggle={toggle} onMore={editing ? setLineKey : undefined} />
              ))}
            </ul>
          </section>
        )}
        <ListGroup className="mt-6">
          <Row icon={Plus} title="Add an item" chevron={false} onClick={() => setAddOpen(true)} />
        </ListGroup>
        {(view.have.length > 0 || view.removed.length > 0) && (
          <ListGroup className="mt-3">
            <SetAsideGroup title="Already have" rows={view.have} actionLabel="Need it" action={(r) => set(r, { have: false })} />
            <SetAsideGroup title="Removed" rows={view.removed} actionLabel="Bring back" action={(r) => set(r, { removed: false })} />
          </ListGroup>
        )}
        {generated && generated.missing.length > 0 && (
          <p className="t-label mt-4 px-1">
            {generated.missing.length === 1 ? "One planned recipe" : `${generated.missing.length} planned recipes`} couldn&apos;t be read, so {generated.missing.length === 1 ? "its" : "their"} ingredients aren&apos;t listed.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {header}
      {weekLine}
      {body}

      {plan && (
        <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Grocery list" description={weekSpan(ws)}>
          <div className="pb-2">
            <ListGroup>
              <Row
                icon={RefreshCw}
                title="Update from the plan"
                subtitle={changed ? "Your meal plan changed since the list was made" : "Keeps your ticks and your own items"}
                chevron={false}
                onClick={() => {
                  setMenuOpen(false);
                  regenerate();
                }}
              />
              <Row
                icon={Wallet}
                title="Budget"
                subtitle={`${money.headline} · about ${cad(totals.checkoutCad)} at the checkout`}
                onClick={() => {
                  setMenuOpen(false);
                  setBudgetOpen(true);
                }}
              />
              <Row icon={Plus} title="Add an item" chevron={false} onClick={() => (setMenuOpen(false), setAddOpen(true))} />
              <Row icon={PencilLine} title={editing ? "Done editing" : "Edit the list"} subtitle="Remove lines or mark what you have" chevron={false} onClick={() => (setMenuOpen(false), setEditing((e) => !e))} />
              <Row icon={Share} title="Share list" chevron={false} onClick={() => (setMenuOpen(false), void share())} />
            </ListGroup>
          </div>
        </Sheet>
      )}
      {plan && (
        <>
          <LineSheet
            row={line}
            uses={line ? (uses.get(line.key) ?? []) : []}
            onOpenChange={(o) => !o && setLineKey(null)}
            onCheck={(r) => (update.mutate({ planId: plan.id, key: r.key, values: { checked: !r.checked } }), setLineKey(null))}
            onHave={(r) => {
              update.mutate({ planId: plan.id, key: r.key, values: { have: true } });
              setLineKey(null);
              toast(`${r.name}: you have it`, { duration: 6000, action: { label: "Undo", onClick: () => update.mutate({ planId: plan.id, key: r.key, values: { have: false } }) } });
            }}
            onRemove={(r) => (update.mutate({ planId: plan.id, key: r.key, values: { removed: true } }), setLineKey(null))}
            onDelete={(r) => {
              const full = rows.find((x) => x.key === r.key);
              if (full) del.mutate({ item: full });
              setLineKey(null);
            }}
          />
          <AddItemSheet open={addOpen} onOpenChange={setAddOpen} onAdd={(v) => addCustom.mutate({ planId: plan.id, id: v.id, name: v.name, label: v.label, category: v.category })} />
          <BudgetSheet
            open={budgetOpen}
            onOpenChange={setBudgetOpen}
            value={budget}
            totals={totals}
            onSave={(v) => updatePlan.mutate({ planId: plan.id, weekStart: plan.week_start, values: { grocery_budget_cad: v } })}
          />
        </>
      )}
    </>
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
    <div aria-busy="true" aria-label={label} className="mt-6 flex flex-col gap-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-64 w-full rounded-tile-lg" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-40 w-full rounded-tile-lg" />
    </div>
  );
}

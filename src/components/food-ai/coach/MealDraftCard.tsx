"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleCheck, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { MEALS, mealForTime, type Meal } from "@/lib/nutrition";
import { newId, useToday, useUser } from "@/lib/data/core";
import { useSavedFoodMutations } from "@/lib/data/nutrition";
import { relativeDay } from "@/lib/dates";
import type { AIFoodItem, FoodChatPayload } from "@/lib/ai/food-schemas";
import { entriesFromItems, entryFromHandoff } from "@/lib/ai/food-log";
import { sumMacroSets, unitLabel } from "@/lib/food/normalize";
import { undoChatLog, useLogDraft, type AIMessage } from "../hooks";
import { DevMockBadge, ItemBadge, MacroTrio, MealDatePicker, fmtKcal } from "../parts";
import { HandoffSheet, type HandoffConfirm } from "./HandoffSheet";

const MEAL_HOUR: Record<Meal, [number, number]> = {
  breakfast: [8, 0],
  lunch: [12, 30],
  dinner: [19, 0],
  snacks: [15, 30],
};
const mealLabel = (m: string) => MEALS.find((x) => x.key === m)?.label ?? m;

function eatenAtFor(date: string, todayDate: string, meal: Meal) {
  if (date === todayDate) return new Date().toISOString();
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = MEAL_HOUR[meal];
  return new Date(y, mo - 1, d, h, mi).toISOString();
}

function qtyLabel(i: AIFoodItem) {
  const q = Number.isInteger(i.quantity) ? String(i.quantity) : i.quantity.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  if (i.unit === "serving" && i.portion) return `${i.portion}${i.grams ? ` · ~${i.grams} g` : ""}`;
  const head = `${q} ${unitLabel(i.quantity, i.unit)}`;
  return i.grams && i.unit !== "g" ? `${head} · ~${i.grams} g` : head;
}

/** "Domino's" → "Domino's", "Chipotle" → "Chipotle's", none → "the restaurant's". */
function possessive(brand: string | null) {
  if (!brand) return "the restaurant's";
  return /['’]s$/i.test(brand) ? brand : `${brand}'s`;
}

export interface GroupInfo {
  meal: string;
  date: string;
  ids: string[];
}

export function MealDraftCard({
  message,
  payload,
  conversationId,
  userText,
  superseded,
  replacesGroup,
  group,
  groupsLoaded,
  latest,
  onSend,
}: {
  message: AIMessage;
  payload: FoodChatPayload;
  conversationId: string | null;
  /** The user's words that produced this draft (for the research hand-off). */
  userText: string;
  /** A later draft in this chat revises this one. */
  superseded: boolean;
  /** Logged group of the draft this one revises — confirming replaces it. */
  replacesGroup: string | null;
  /** This message's own logged group, if it still exists in the diary. */
  group: GroupInfo | null;
  groupsLoaded: boolean;
  latest: boolean;
  onSend: (text: string) => void;
}) {
  const qc = useQueryClient();
  const todayDate = useToday();
  const { userId } = useUser();
  const log = useLogDraft(conversationId);
  const saved = useSavedFoodMutations();
  const [confirming, setConfirmingState] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const setConfirming = (v: boolean) => {
    setConfirmingState(v);
    if (v)
      window.setTimeout(
        () =>
          confirmRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          }),
        30,
      );
  };
  const [meal, setMeal] = useState<Meal>(() => (payload.meal_hint !== "unknown" ? payload.meal_hint : mealForTime()));
  const [date, setDate] = useState(todayDate);
  const [handoff, setHandoff] = useState<AIFoodItem[] | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [session, setSession] = useState<{
    groupId: string;
    ids: string[];
    replaced: Parameters<typeof undoChatLog>[1]["replaced"];
    meal: Meal;
    date: string;
    via?: string;
  } | null>(null);

  const items = payload.items;
  const totals = payload.totals;
  const loggedGroup = message.logged_group_id;
  const isLogged = !!loggedGroup && (!!group || !groupsLoaded || session?.groupId === loggedGroup);
  const removedFromDiary = !!loggedGroup && groupsLoaded && !group && session?.groupId !== loggedGroup;
  const handoffItems = items.filter((i) => i.handoff);

  const announce = (
    n: number,
    kcal: number,
    m: Meal,
    res: {
      groupId: string;
      ids: string[];
      replaced: Parameters<typeof undoChatLog>[1]["replaced"];
    },
  ) => {
    haptic([12, 40, 12]);
    toast(`Added to ${mealLabel(m)} · ${fmtKcal(kcal)} kcal`, {
      description: `${n} ${n === 1 ? "item" : "items"}${res.replaced.length ? " · replaced the earlier version" : ""}`,
      duration: 6000,
      action: { label: "Undo", onClick: () => void undo(res) },
    });
  };

  const add = async () => {
    if (log.isPending) return;
    const groupId = newId();
    const rows = entriesFromItems(items, {
      meal,
      localDate: date,
      eatenAt: eatenAtFor(date, todayDate, meal),
      groupId,
      source: "chat_ai",
      newId,
    });
    if (!rows.length) return toast.error("Nothing to add — every row is at 0 kcal.");
    try {
      const res = await log.mutateAsync({
        message,
        rows,
        groupId,
        replaceGroupId: replacesGroup,
        previousGroupId: removedFromDiary ? loggedGroup : null,
      });
      setSession({ ...res, meal, date });
      setConfirming(false);
      announce(rows.length, totals.calories, meal, res);
    } catch (e) {
      toast.error("Not added", { description: (e as Error).message });
    }
  };

  const addFromHandoff = async (c: HandoffConfirm) => {
    const groupId = newId();
    const ctx = {
      meal: c.meal,
      localDate: c.date,
      eatenAt: eatenAtFor(c.date, todayDate, c.meal),
      groupId,
      newId,
    };
    const rows = [
      ...c.items.map((h) =>
        entryFromHandoff(h, c.assistant, c.restaurant, {
          ...ctx,
          source: "assistant_handoff",
        }),
      ),
      ...entriesFromItems(
        items.filter((i) => !(handoff ?? []).includes(i)),
        { ...ctx, source: "chat_ai" },
      ),
    ];
    const replace = isLogged && group ? loggedGroup : replacesGroup;
    try {
      const res = await log.mutateAsync({
        message,
        rows,
        groupId,
        replaceGroupId: replace,
        previousGroupId: loggedGroup ?? null,
      });
      setSession({
        ...res,
        meal: c.meal,
        date: c.date,
        via: c.assistant === "chatgpt" ? "ChatGPT" : "Claude",
      });
      announce(
        rows.length,
        rows.reduce((a, r) => a + Number(r.calories), 0),
        c.meal,
        res,
      );
    } catch (e) {
      toast.error("Not added", { description: (e as Error).message });
      throw e;
    }
  };

  const undo = async (res?: { groupId: string; ids: string[]; replaced: Parameters<typeof undoChatLog>[1]["replaced"] }) => {
    const r = res ?? (session ? session : group && loggedGroup ? { groupId: loggedGroup, ids: group.ids, replaced: [] } : null);
    if (!r) return;
    try {
      await undoChatLog(qc, {
        messageId: message.id,
        groupId: r.groupId,
        ids: r.ids,
        replaced: r.replaced,
        conversationId,
        userId,
      });
      setSession(null);
      toast("Removed from your diary");
    } catch (e) {
      toast.error("Couldn't undo", { description: (e as Error).message });
    }
  };

  const star = (i: AIFoodItem) => {
    if (starred.has(i.id)) return;
    setStarred((s) => new Set(s).add(i.id));
    saved.create.mutate(
      {
        name: i.name.slice(0, 120),
        brand: i.brand,
        serving_amount: i.quantity > 0 ? i.quantity : 1,
        serving_unit: (i.unit || "serving").slice(0, 24),
        grams: i.grams,
        calories: i.macros.calories,
        protein_g: i.macros.protein,
        carbs_g: i.macros.carbs,
        fat_g: i.macros.fat,
        is_favorite: true,
        source: i.provenance === "database" ? (i.source?.name === "USDA" ? "usda" : "off") : "chat_ai",
        source_name: i.source ? (i.source.name === "USDA" ? "USDA FoodData Central" : i.source.name) : null,
        source_url: i.source?.url ?? null,
      },
      {
        onSuccess: () => toast(`Saved ${i.name} to your foods`),
        onError: () =>
          setStarred((s) => {
            const n = new Set(s);
            n.delete(i.id);
            return n;
          }),
      },
    );
  };

  const shownMeal = session?.meal ?? group?.meal;
  const shownDate = session?.date ?? group?.date;

  return (
    <div className={cn("card-inset mt-3 overflow-hidden p-0", superseded && "opacity-60")}>
      <div className="flex items-center justify-between gap-3 px-3.5 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <p className="eyebrow">{payload.revises ? "Updated meal" : "Meal draft"}</p>
          {payload.mock && <DevMockBadge />}
        </div>
        <p className="leading-none">
          <span className="num-sm">{fmtKcal(totals.calories)}</span>
          <span className="unit">kcal</span>
        </p>
      </div>

      <ul className="divide-y divide-line-hair border-y border-line-hair">
        {items.map((i) => (
          <li key={i.id} className="px-3.5 py-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[14px] font-bold leading-snug text-fg">
                  {i.brand && i.kind !== "generic" && !i.name.toLowerCase().includes(i.brand.toLowerCase()) ? `${i.brand} ` : ""}
                  {i.name}
                </p>
                <p className="truncate text-[12px] font-medium text-fg-3">{qtyLabel(i)}</p>
                {i.source && (
                  <p className="truncate text-[11.5px] font-medium text-fg-3" title={i.source.label}>
                    Matched: {i.source.label}
                  </p>
                )}
              </div>
              <p className="shrink-0 pt-0.5 text-right leading-none">
                <span className="num text-[18px] text-fg">{fmtKcal(i.macros.calories)}</span>
                <span className="ml-0.5 text-[11px] font-semibold text-fg-3">kcal</span>
              </p>
            </div>
            <div className="mt-2 flex items-center gap-x-2.5">
              <ItemBadge item={i} />
              <MacroTrio m={i.macros} className="min-w-0 flex-1" />
              <button
                type="button"
                onClick={() => star(i)}
                aria-label={starred.has(i.id) ? `${i.name} saved to your foods` : `Save ${i.name} to your foods`}
                aria-pressed={starred.has(i.id)}
                className="-my-2 -mr-2.5 grid size-11 shrink-0 place-items-center rounded-full text-fg-3 hover:text-gold-300"
              >
                <Star className={cn("size-4", starred.has(i.id) && "fill-gold-400 text-gold-400")} />
              </button>
            </div>
            {i.note && (
              <p className="mt-1.5 text-[12px] leading-snug text-fg-3">
                {i.note}
                {i.handoff && !superseded && (
                  <>
                    {" "}
                    <button type="button" onClick={() => setHandoff([i])} className="font-bold text-lapis-text hover:underline">
                      Research it
                    </button>
                  </>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="px-3.5 pb-3.5 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-fg-2">
            {items.length} {items.length === 1 ? "item" : "items"} · {fmtKcal(totals.calories)} kcal
          </span>
          <MacroTrio m={sumMacroSets(items.map((i) => i.macros))} />
        </div>

        {superseded ? (
          <p className="mt-3 text-[12px] font-semibold text-fg-3">Updated below.</p>
        ) : isLogged ? (
          <>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] bg-success-tint px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-success">
                <CircleCheck className="size-4 shrink-0" />
                <span className="truncate">
                  Logged{shownMeal ? ` · ${mealLabel(shownMeal)}` : ""}
                  {shownDate && shownDate !== todayDate ? ` · ${relativeDay(shownDate, todayDate)}` : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void undo()}
                className="-my-1.5 -mr-2 h-11 shrink-0 px-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-gold-300"
              >
                Undo
              </button>
            </div>
            {session?.via && <p className="mt-1.5 text-[12px] text-fg-3">Published numbers as reported by {session.via}.</p>}
          </>
        ) : confirming ? (
          <div ref={confirmRef} className="mt-3 scroll-mb-28 space-y-3">
            <MealDatePicker onInset meal={meal} onMeal={setMeal} date={date} onDate={setDate} />
            <p className="text-[13px] text-fg-2">
              {items.length} {items.length === 1 ? "item" : "items"} · <span className="num text-[15px] text-fg">{fmtKcal(totals.calories)}</span> kcal →{" "}
              {mealLabel(meal)}
              {replacesGroup ? " · replaces the earlier logged version" : ""}
            </p>
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={add} loading={log.isPending}>
                {replacesGroup ? "Update logged meal" : `Add to ${mealLabel(meal)}`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {removedFromDiary && <p className="text-[12px] text-fg-3">This was logged, then removed from your diary.</p>}
            <Button variant="outline-gold" block onClick={() => setConfirming(true)}>
              {removedFromDiary ? "Add again" : replacesGroup ? "Update logged meal" : "Confirm & add"}
            </Button>
            {handoffItems.length > 0 && (
              <button
                type="button"
                onClick={() => setHandoff(handoffItems)}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[12px] text-[13px] font-bold text-lapis-text hover:bg-lapis-tint"
              >
                <Search className="size-4" />
                Get {possessive(handoffItems.find((h) => h.brand)?.brand ?? null)} published numbers
              </button>
            )}
          </div>
        )}

        {latest && !superseded && payload.corrections.length > 0 && (
          <div className="no-scrollbar -mx-3.5 mt-3 flex gap-2 overflow-x-auto px-3.5" aria-label="Quick corrections">
            {payload.corrections.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onSend(`Correction: ${c}`)}
                className="press relative inline-flex h-9 shrink-0 items-center rounded-full border border-line bg-s2 px-3.5 text-[13px] font-semibold text-fg-2 after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] hover:text-fg"
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {handoff && (
        <HandoffSheet
          open={!!handoff}
          onOpenChange={(o) => !o && setHandoff(null)}
          description={userText}
          restaurant={handoff.find((i) => i.brand)?.brand ?? null}
          items={handoff.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            portion: i.portion,
            restaurant: i.brand,
          }))}
          defaultMeal={meal}
          replacing={isLogged}
          extraItems={items.filter((i) => !handoff.includes(i))}
          onConfirm={addFromHandoff}
        />
      )}
    </div>
  );
}

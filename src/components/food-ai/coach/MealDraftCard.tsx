"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Search, Star } from "lucide-react";
import { estimateTitle } from "@/components/offering/replaces";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { EstimateCard } from "@/components/ui/estimate-card";
import { AiChip } from "@/components/ui/ai-chip";
import { InfoButton } from "@/components/ui/details-sheet";
import { useFoodEntries } from "@/lib/data/nutrition";
import { ifYouAdd } from "@/lib/fuel/consequence";
import { cn } from "@/lib/cn";
import { MEALS, mealForTime, type Meal } from "@/lib/nutrition";
import { newId, useToday, useUser } from "@/lib/data/core";
import { useSavedFoodMutations } from "@/lib/data/nutrition";
import { relativeDay } from "@/lib/dates";
import type { AIFoodItem, FoodChatPayload } from "@/lib/ai/food-schemas";
import { entriesFromItems, entryFromHandoff, isLoggable } from "@/lib/ai/food-log";
import { sumMacroSets, unitLabel } from "@/lib/food/normalize";
import { UNSURE_SAVE, undoChatLog, useLogDraft, type AIMessage } from "../hooks";
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


export interface GroupInfo {
  meal: string;
  date: string;
  ids: string[];
  /** kcal of the rows actually in the diary (may differ from the draft after a hand-off). */
  kcal: number;
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
  const dayFood = useFoodEntries(date);
  const [handoff, setHandoff] = useState<AIFoodItem[] | null>(null);
  /** item id → saved_foods id (or "" while the insert is in flight) */
  const [starred, setStarred] = useState<Map<string, string>>(new Map());
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
  // One group id and one id per row for this draft, kept across retries: if the diary saved
  // a meal but the answer was lost, trying again finishes that save instead of adding a copy.
  const attempt = useRef<{ groupId: string; ids: string[] } | null>(null);
  const [unsure, setUnsure] = useState(false);
  const idsFor = (n: number) => {
    if (!attempt.current || attempt.current.ids.length !== n) attempt.current = { groupId: newId(), ids: Array.from({ length: n }, () => newId()) };
    const ids = [...attempt.current.ids];
    return { groupId: attempt.current.groupId, next: () => ids.shift() ?? newId() };
  };
  const loggedGroup = message.logged_group_id;
  // after a save whose outcome is unknown, "Logged" is never assumed: the card offers Add
  // again, which finishes that same save (it can't add a second copy)
  const known = groupsLoaded || unsure;
  const isLogged = !!loggedGroup && (!!group || !known || session?.groupId === loggedGroup);
  const removedFromDiary = !!loggedGroup && known && !group && session?.groupId !== loggedGroup;
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
    toast(`Added to ${mealLabel(m)} · ${fmtKcal(kcal)} kcal`, {
      description: `${n} ${n === 1 ? "item" : "items"}${res.replaced.length ? " · replaced the earlier version" : ""}`,
      duration: 6000,
      action: { label: "Undo", onClick: () => void undo(res) },
    });
  };

  const add = async () => {
    if (log.isPending) return;
    const { groupId, next } = idsFor(items.filter(isLoggable).length);
    const rows = entriesFromItems(items, {
      meal,
      localDate: date,
      eatenAt: eatenAtFor(date, todayDate, meal),
      groupId,
      source: "chat_ai",
      newId: next,
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
      attempt.current = null;
      setUnsure(false);
      setSession({ ...res, meal, date });
      setConfirming(false);
      announce(rows.length, totals.calories, meal, res);
    } catch (e) {
      setUnsure((e as Error).message === UNSURE_SAVE);
      toast.error("Not added", { description: (e as Error).message });
    }
  };

  const addFromHandoff = async (c: HandoffConfirm) => {
    const rest = items.filter((i) => !(handoff ?? []).includes(i));
    const { groupId, next } = idsFor(c.items.length + rest.filter(isLoggable).length);
    const ctx = {
      meal: c.meal,
      localDate: c.date,
      eatenAt: eatenAtFor(c.date, todayDate, c.meal),
      groupId,
      newId: next,
    };
    const rows = [
      ...c.items.map((h) =>
        entryFromHandoff(h, c.assistant, c.restaurant, {
          ...ctx,
          source: "assistant_handoff",
        }),
      ),
      ...entriesFromItems(rest, { ...ctx, source: "chat_ai" }),
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
      attempt.current = null;
      setUnsure(false);
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
      setUnsure((e as Error).message === UNSURE_SAVE);
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

  const unstar = (itemId: string) =>
    setStarred((m) => {
      const n = new Map(m);
      n.delete(itemId);
      return n;
    });

  const removeSaved = (i: AIFoodItem, savedId: string) => {
    unstar(i.id);
    saved.remove.mutate(savedId, {
      onSuccess: () => toast(`Removed ${i.name} from your foods`),
      onError: () => setStarred((m) => new Map(m).set(i.id, savedId)),
    });
  };

  const star = (i: AIFoodItem) => {
    const current = starred.get(i.id);
    if (current === "") return; // still saving
    if (current) return removeSaved(i, current);
    setStarred((m) => new Map(m).set(i.id, ""));
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
        onSuccess: (data) => {
          // the shared hook's return type infers as null; it is the inserted saved_foods row
          const row = data as unknown as { id: string } | null;
          if (!row?.id) return unstar(i.id);
          setStarred((m) => new Map(m).set(i.id, row.id));
          toast(`Saved ${i.name} to your foods`, {
            duration: 6000,
            action: { label: "Undo", onClick: () => removeSaved(i, row.id) },
          });
        },
        onError: () => unstar(i.id),
      },
    );
  };

  const shownMeal = session?.meal ?? group?.meal;
  const shownDate = session?.date ?? group?.date;
  const status = superseded ? "unsaved" : isLogged ? "saved" : log.isPending ? "saving" : "unsaved";
  const diaryKcal = group?.kcal;
  const differs = diaryKcal != null && Math.abs(diaryKcal - totals.calories) >= 1;
  const consequence = !isLogged && !superseded && dayFood.hasData && date === todayDate ? ifYouAdd({ kcal: dayFood.totals.calories, protein: dayFood.totals.protein }, { kcal: totals.calories, protein: totals.protein }, "add") : null;
  const addLabel = replacesGroup ? "Update logged meal" : `Add as ${mealLabel(meal).toLowerCase()}${date !== todayDate ? `, ${relativeDay(date, todayDate).toLowerCase()}` : ""}`;

  return (
    <div className={cn("mt-4", superseded && "opacity-60")}>
      <EstimateCard
        status={status}
        tag={
          <span className="inline-flex flex-wrap items-center gap-2">
            <AiChip label="AI estimate" status={status === "saved" ? "Saved" : status === "saving" ? "Saving…" : payload.revises ? "Updated · Not saved yet" : "Not saved yet"} />
            {payload.mock && <DevMockBadge />}
          </span>
        }
        title={estimateTitle(items.map((i) => (i.brand && i.kind !== "generic" && !i.name.toLowerCase().includes(i.brand.toLowerCase()) ? `${i.brand} ${i.name}` : i.name)))}
        items={
          <>
            <ul className="[&>li+li]:border-t [&>li+li]:border-line" aria-label="Items">
              {items.map((i) => (
                <li key={i.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="t-row line-clamp-2" data-food="">
                        {i.brand && i.kind !== "generic" && !i.name.toLowerCase().includes(i.brand.toLowerCase()) ? `${i.brand} ` : ""}
                        {i.name}
                      </p>
                      <p className="t-label truncate" data-food="">{qtyLabel(i)}</p>
                      {i.source && (
                        <p className="t-cap truncate" title={i.source.label} data-food="">
                          Matched: {i.source.label}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 pt-0.5 text-right">
                      <span className="t-num-s">{fmtKcal(i.macros.calories)}</span>
                      <span className="t-label ml-1">kcal</span>
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-x-2.5">
                    <ItemBadge item={i} />
                    <MacroTrio m={i.macros} className="min-w-0 flex-1" />
                    {i.provenance === "saved" ? (
                      <span className="-my-2 -mr-2.5 grid size-11 shrink-0 place-items-center" title="Already in your saved foods">
                        <Star className="size-4 fill-fg text-fg" strokeWidth={1.6} aria-hidden />
                        <span className="sr-only">Already in your saved foods</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => star(i)}
                        aria-label={starred.has(i.id) ? `Remove ${i.name} from your foods` : `Save ${i.name} to your foods`}
                        aria-pressed={starred.has(i.id)}
                        className="press -my-2 -mr-2.5 grid size-11 shrink-0 place-items-center rounded-full text-fg-3 hover:text-fg"
                      >
                        <Star className={cn("size-4", starred.has(i.id) && "fill-fg text-fg")} strokeWidth={1.6} />
                      </button>
                    )}
                  </div>
                  {i.note && (
                    <p className="t-cap mt-1.5" data-food="">
                      {i.note}
                      {i.handoff && !superseded && (
                        <>
                          {" "}
                          <button
                            type="button"
                            onClick={() => setHandoff([i])}
                            // inline in the note, so the 44px hit area comes from an invisible overlay
                            className="relative font-semibold text-fg underline decoration-ui-line underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-['']"
                          >
                            Research it
                          </button>
                        </>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p>
                <span className="t-label mr-2">Meal</span>
                <span className="t-num-s">{fmtKcal(totals.calories)}</span>
                <span className="t-label ml-1">kcal</span>
              </p>
              <MacroTrio m={sumMacroSets(items.map((i) => i.macros))} />
            </div>
          </>
        }
        consequence={
          consequence ? (
            <>
              <span className="text-fg" aria-label={consequence.spoken} data-derived="">
                {consequence.text}
              </span>
              <InfoButton how={`${consequence.explain}. From your log; the meal's numbers are the AI's estimate.`} className="m-0 -my-2" />
            </>
          ) : undefined
        }
        actions={
          superseded ? (
            <p className="t-label">Updated below.</p>
          ) : isLogged ? (
            <>
              <div className="flex items-center gap-3">
                <p className="t-row flex min-w-0 flex-1 items-center gap-2">
                  <Check className="size-5 shrink-0" strokeWidth={2.2} aria-hidden />
                  <span className="truncate">
                    Added{shownMeal ? ` to ${mealLabel(shownMeal)}` : ""}
                    {shownDate && shownDate !== todayDate ? ` · ${relativeDay(shownDate, todayDate)}` : ""}
                  </span>
                </p>
                <Button variant="secondary" size="sm" onClick={() => void undo()}>
                  Undo
                </Button>
              </div>
              {(differs || session?.via) && (
                <p className="t-label">
                  {differs ? (
                    <>
                      Your diary has <span className="font-semibold tabular-nums text-fg">{fmtKcal(diaryKcal)}</span> kcal for this meal
                      {session?.via ? `, using published numbers as reported by ${session.via}.` : ", not the draft above."}
                    </>
                  ) : (
                    `Published numbers as reported by ${session?.via}.`
                  )}
                </p>
              )}
            </>
          ) : (
            <>
              {removedFromDiary && (
                <p className="t-label">{unsure ? "The connection dropped while adding this. Add it again: it can't be added twice." : "This was logged, then removed from your diary."}</p>
              )}
              <Button variant={latest ? "primary" : "outline"} size="lg" block onClick={add} loading={log.isPending}>
                {removedFromDiary ? "Add again" : addLabel}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="md" className="flex-1" onClick={() => setConfirming(!confirming)} aria-expanded={confirming}>
                  {confirming ? "Done" : "Meal or day"}
                </Button>
                {handoffItems.length > 0 && (
                  <Button variant="ghost" size="md" className="flex-1" onClick={() => setHandoff(handoffItems)}>
                    <Search className="size-4" strokeWidth={2} aria-hidden />
                    Published numbers
                  </Button>
                )}
              </div>
              {confirming && (
                <div ref={confirmRef} className="scroll-mb-28 pt-1">
                  <MealDatePicker onInset meal={meal} onMeal={setMeal} date={date} onDate={setDate} />
                  {replacesGroup && <p className="t-label mt-2">Replaces the earlier logged version.</p>}
                </div>
              )}
              {latest && payload.corrections.length > 0 && (
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pt-1" aria-label="Quick corrections">
                  {payload.corrections.map((c) => (
                    <Chip key={c} onClick={() => onSend(`Correction: ${c}`)}>
                      {c}
                    </Chip>
                  ))}
                </div>
              )}
            </>
          )
        }
      />

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

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/food-ai/coach/ChatMessage";
import { UNSURE_SAVE, undoChatLog, useLogDraft } from "@/components/food-ai/hooks";
import { DevMockBadge, MealDatePicker, fmtKcal } from "@/components/food-ai/parts";
import { ScanItemCard } from "@/components/food-ai/scanner/ScanItemCard";
import { AiChip } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { InfoButton } from "@/components/ui/details-sheet";
import { EstimateCard } from "@/components/ui/estimate-card";
import { entriesFromItems, isLoggable } from "@/lib/ai/food-log";
import { toEditable, type EditableItem } from "@/lib/ai/food-edit";
import { cn } from "@/lib/cn";
import { newId, useToday, useUser } from "@/lib/data/core";
import { defaultEatenAt } from "@/lib/data/meals-model";
import { relativeDay, type ISODate } from "@/lib/dates";
import { sumMacroSets } from "@/lib/food/normalize";
import { ifYouAdd } from "@/lib/fuel/consequence";
import type { DaySchedule } from "@/lib/prefs";
import { MEALS, type Meal } from "@/lib/nutrition";
import { estimateTitle, inferMeal, type PlannedLite } from "./replaces";
import type { SentenceReply } from "./useFoodSentence";

const mealLabel = (m: Meal) => MEALS.find((x) => x.key === m)?.label ?? "Snacks";
const kcalText = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * "After this: 152 kcal and 23 g protein to go today." (§4.7.2): today's logged totals plus this
 * estimate against his goals. Over a goal reads "over", never red.
 */
export function afterThis(day: { kcal: number; protein: number }, add: { kcal: number; protein: number }, goals: { kcal: number; protein: number }): string {
  const kLeft = Math.round(goals.kcal - day.kcal - add.kcal);
  const pLeft = Math.round(goals.protein - day.protein - add.protein);
  const k = kLeft > 0 ? `${kcalText(kLeft)} kcal` : null;
  const p = pLeft > 0 ? `${pLeft} g protein` : null;
  if (k && p) return `After this: ${k} and ${p} to go today.`;
  if (p) return `After this: ${p} to go today, ${kcalText(-kLeft)} kcal over.`;
  if (k) return `After this: protein done, ${k} to go today.`;
  return `After this: protein done, ${kcalText(-kLeft)} kcal over today.`;
}

/**
 * One sentence's (or photo's) reply as the AI card (docs/DESIGN-V3-SIMPLE.md §4.7.2): the chip
 * "AI estimate · Not saved yet", the food, its portion, the calories, a Protein / Carbs / Fat trio,
 * what it replaces in the plan, and what today looks like after it. Nothing is in the diary until
 * the gold "Add as dinner", which logs through the food coach's idempotent claim (useLogDraft):
 * one row set per draft even on a double tap or a retry after a lost answer. Edit changes portions
 * item by item; Discard drops the draft (nothing was saved).
 */
export function SentenceCard({
  reply,
  date,
  dayTotals,
  goals,
  replaced,
  nowMin,
  schedule,
  onDiscard,
  onFollow,
  following,
  onDone,
  patchMessage,
}: {
  reply: SentenceReply;
  date: ISODate;
  /** Today's logged kcal and protein (null while unknown: the "After this" line hides). */
  dayTotals: { kcal: number; protein: number } | null;
  goals: { kcal: number; protein: number } | null;
  replaced: PlannedLite | null;
  nowMin: number;
  schedule: Pick<DaySchedule, "meals"> | null;
  onDiscard: () => void;
  /** A follow-up in the same conversation: an answer to its question or a quick fix. */
  onFollow: (text: string) => void;
  following: boolean;
  /** The draft was added: the sheet goes back to its tiles. */
  onDone: () => void;
  patchMessage: (m: { logged_group_id: string | null }) => void;
}) {
  const qc = useQueryClient();
  const today = useToday();
  const { userId } = useUser();
  const { payload, message, conversationId } = reply;
  const log = useLogDraft(conversationId);
  const [items, setItems] = useState<EditableItem[]>(() => payload.items.map((it, i) => toEditable(it, `${message.id}-${i}`)));
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<Meal | null>(null);
  const [logDate, setLogDate] = useState(date);
  const [failed, setFailed] = useState<string | null>(null);
  const busy = useRef(false);
  // one group id and one id per row for this draft, kept across retries: a save whose answer was
  // lost finishes on the next tap instead of adding a second copy
  const attempt = useRef<{ groupId: string; ids: string[] } | null>(null);

  const meal = inferMeal({ chosen, replaced, hint: payload.meal_hint, nowMin });
  const totals = useMemo(() => sumMacroSets(items.map((i) => i.macros)), [items]);
  const loggable = items.filter(isLoggable);
  const otherDay = logDate !== today;
  const title = estimateTitle(items.map((i) => i.name));
  const after = dayTotals && goals && !otherDay ? afterThis(dayTotals, { kcal: totals.calories, protein: totals.protein }, goals) : null;
  const how = dayTotals ? `${ifYouAdd(dayTotals, { kcal: totals.calories, protein: totals.protein }, "add").explain}. Your goals are ${goals ? `${kcalText(goals.kcal)} kcal and ${Math.round(goals.protein)} g protein` : "from Settings"}. The meal's numbers are the AI's estimate.` : "";

  const add = async () => {
    if (busy.current || !loggable.length) return;
    busy.current = true;
    setFailed(null);
    if (!attempt.current || attempt.current.ids.length !== loggable.length) attempt.current = { groupId: newId(), ids: loggable.map(() => newId()) };
    const queue = [...attempt.current.ids];
    const groupId = attempt.current.groupId;
    const rows = entriesFromItems(items, {
      meal,
      localDate: logDate,
      eatenAt: defaultEatenAt(logDate, today, meal, new Date(), schedule),
      groupId,
      source: "chat_ai",
      newId: () => queue.shift() ?? newId(),
    });
    try {
      const res = await log.mutateAsync({ message, rows, groupId, replaceGroupId: null, previousGroupId: null });
      attempt.current = null;
      patchMessage({ logged_group_id: groupId });
      const ids = res.ids;
      toast(`${title} added${otherDay ? ` to ${relativeDay(logDate, today).toLowerCase()}` : ""}`, {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () =>
            void undoChatLog(qc, { messageId: message.id, groupId, ids, replaced: [], conversationId, userId })
              .then(() => toast(`${title} removed`))
              .catch((e: Error) => toast.error("Couldn't undo", { description: e.message })),
        },
      });
      onDone();
    } catch (e) {
      const msg = (e as Error).message;
      setFailed(msg === UNSURE_SAVE ? UNSURE_SAVE : msg);
    } finally {
      busy.current = false;
    }
  };

  // a reply with nothing to log: its words (and any questions), labelled AI
  if (!payload.items.length) {
    return (
      <section className="rise rounded-card border border-ai-line bg-surface p-[18px]" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          <AiChip label="AI" />
          {payload.mock && <DevMockBadge />}
        </div>
        <div className="mt-3" data-ai-answer="" data-budget-group="">
          <Markdown text={message.content} />
        </div>
        <Questions payload={payload} onPick={onFollow} disabled={following} />
        <Button variant="ghost" size="sm" className="mt-2 -ml-3" onClick={onDiscard}>
          Start over
        </Button>
      </section>
    );
  }

  const status = log.isPending ? "saving" : failed ? "error" : "unsaved";

  return (
    <EstimateCard
      className="rise"
      status={status}
      tag={
        <span className="inline-flex flex-wrap items-center gap-2">
          <AiChip label="AI estimate" status={status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "Not saved yet"} />
          {payload.mock && <DevMockBadge />}
        </span>
      }
      title={title}
      items={
        <>
          {editing ? (
            <div className="-mt-1 divide-y divide-line" role="group" aria-label="Edit the items">
              {items.map((it) => (
                <ScanItemCard
                  key={it.key}
                  item={it}
                  onChange={(n) => setItems((all) => all.map((x) => (x.key === it.key ? n : x)))}
                  onRemove={() => setItems((all) => all.filter((x) => x.key !== it.key))}
                  onPrep={(p) => setItems((all) => all.map((x) => (x.key === it.key ? { ...x, preparation: p } : x)))}
                />
              ))}
              {!items.length && <p className="t-label py-5 text-center">Every item was removed. Discard this, or describe the meal again.</p>}
              <section className="space-y-2.5 pt-4" aria-label="Where to add it">
                <p className="t-label font-semibold">Add to</p>
                <MealDatePicker meal={meal} onMeal={setChosen} date={logDate} onDate={(d) => setLogDate(d)} onInset />
              </section>
              {payload.corrections.length > 0 && (
                <section className="pt-4" aria-label="Or tell it">
                  <p className="t-label mb-1 font-semibold">Or tell it</p>
                  <div className="-mx-1 flex flex-wrap gap-2 px-1">
                    {payload.corrections.slice(0, 4).map((c) => (
                      <Chip key={c} disabled={following} onClick={() => onFollow(`Correction: ${c}`)}>
                        {c}
                      </Chip>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <>
              {items.length === 1 ? (
                <p className="t-label -mt-2" data-food="">
                  {portionText(items[0])}
                </p>
              ) : (
                <ul className="-mt-1" aria-label="Items">
                  {items.map((it) => (
                    <li key={it.key} className="flex items-baseline justify-between gap-3 py-1">
                      <span className="t-label min-w-0" data-food="">
                        <span className="text-fg">{it.name}</span> · {portionText(it)}
                      </span>
                      <span className="t-label shrink-0 tabular-nums">{fmtKcal(it.macros.calories)} kcal</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="t-hero mt-3" aria-label={`${fmtKcal(totals.calories)} calories`}>
                {fmtKcal(totals.calories)}
                <span className="unit">kcal</span>
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 ax:grid-cols-1" aria-label={`Protein ${Math.round(totals.protein)} grams, carbs ${Math.round(totals.carbs)} grams, fat ${Math.round(totals.fat)} grams`} role="group">
                {(
                  [
                    ["Protein", totals.protein],
                    ["Carbs", totals.carbs],
                    ["Fat", totals.fat],
                  ] as const
                ).map(([label, g]) => (
                  <div key={label} className="rounded-tile-lg bg-control px-3.5 py-3" aria-hidden>
                    <p className="t-num-s">
                      {Math.round(g)}
                      <span className="unit">g</span>
                    </p>
                    <p className="t-cap mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              {replaced && (
                <p className="t-label mt-3">
                  Replaces: <span data-food="">{replaced.name}</span> (planned)
                </p>
              )}
              {payload.notes.length > 0 && (
                <p className="t-cap mt-2" data-food="">
                  {payload.notes.join(" ")}
                </p>
              )}
              {reply.aside && <Aside aside={reply.aside} addLabel={`Add as ${mealLabel(meal).toLowerCase()}`} />}
              <Questions payload={reply.aside?.payload ?? payload} onPick={onFollow} disabled={following} />
            </>
          )}
        </>
      }
      consequence={
        after && !editing ? (
          <span className="flex items-start gap-1 text-fg">
            <span data-derived="">{after}</span>
            <InfoButton how={how} label="How this is worked out" className="m-0 -mr-2 -mt-2.5" />
          </span>
        ) : undefined
      }
      actions={
        <>
          {failed && (
            <p role="alert" className="t-label text-danger">
              Not added. {failed}
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            block
            // "Add as breakfast, yesterday" wraps at accessibility sizes instead of clipping
            className="h-auto min-h-14 whitespace-normal py-3 text-balance"
            onClick={() => void add()}
            loading={log.isPending}
            disabled={!loggable.length || following}
          >
            {failed === UNSURE_SAVE ? "Add again" : `Add as ${mealLabel(meal).toLowerCase()}${otherDay ? `, ${relativeDay(logDate, today).toLowerCase()}` : ""}`}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="md" onClick={() => setEditing((v) => !v)} aria-expanded={editing} disabled={log.isPending}>
              {editing ? "Done" : "Edit"}
            </Button>
            <Button variant="ghost" size="md" className="text-fg-2" onClick={onDiscard} disabled={log.isPending}>
              Discard
            </Button>
          </div>
        </>
      }
    />
  );
}

function portionText(i: EditableItem) {
  if (i.mult !== 1 || !i.portion) {
    const q = Number.isInteger(i.quantity) ? String(i.quantity) : i.quantity.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    const unit = i.unit === "serving" ? (i.quantity === 1 ? "serving" : "servings") : i.unit;
    return `${q} ${unit}${i.grams && i.unit !== "g" ? ` · about ${i.grams} g` : ""}`;
  }
  return `${i.portion}${i.grams && !/\bg\b/.test(i.portion) ? ` · about ${i.grams} g` : ""}`;
}

/**
 * A follow-up's answer that changed nothing in the draft, under the items. "Add it" typed in the
 * field never saves on its own: the gold Add stays the one confirmation.
 */
function Aside({ aside, addLabel }: { aside: NonNullable<SentenceReply["aside"]>; addLabel: string }) {
  return (
    <div className="mt-4 border-t border-line pt-3" aria-live="polite">
      {aside.payload.intent === "add_to_log" ? (
        <p className="t-label">
          Ready when you are: tap <span className="font-semibold text-fg">{addLabel}</span> to put it in your diary.
        </p>
      ) : (
        <div data-ai-answer="" data-budget-group="">
          <Markdown text={aside.content} />
        </div>
      )}
    </div>
  );
}

/** The estimate's clarifying questions as chips; a pick goes back to the same conversation. */
function Questions({ payload, onPick, disabled }: { payload: SentenceReply["payload"]; onPick: (t: string) => void; disabled?: boolean }) {
  if (!payload.questions.length) return null;
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-3">
      {payload.questions.slice(0, 2).map((q) => (
        <div key={q.id}>
          <p className="t-row" data-ai-answer="">
            {q.question}
          </p>
          <div className={cn("mt-2 flex flex-wrap gap-2", disabled && "opacity-60")} role="group" aria-label={q.question}>
            {q.options.map((o) => (
              <Chip key={o} disabled={disabled} onClick={() => onPick(payload.questions.length > 1 ? `${q.question} ${o}.` : o)}>
                {o}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

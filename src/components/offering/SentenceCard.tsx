"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SealTick } from "@/components/art/icons";
import { Markdown } from "@/components/food-ai/coach/ChatMessage";
import { UNSURE_SAVE, undoChatLog, useLogDraft } from "@/components/food-ai/hooks";
import { DevMockBadge, MacroTrio, MealDatePicker, fmtKcal } from "@/components/food-ai/parts";
import { ScanItemCard } from "@/components/food-ai/scanner/ScanItemCard";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { EstimateCard } from "@/components/ui/estimate-card";
import { Tag } from "@/components/ui/tag";
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

interface Saved {
  groupId: string;
  ids: string[];
  meal: Meal;
  date: ISODate;
  kcal: number;
}

/**
 * One sentence's reply as an ESTIMATE card (docs/DESIGN-V2.md §3.9.1): `AI · ESTIMATE · Not saved
 * yet`, the items with portions and macros, what it replaces in the plan, and the consequence line
 * (`If you add it: 3,435 kcal · 190 g`, CALC from the day's log). Nothing is in the diary until
 * `Add as dinner`, which logs through the Food Coach's idempotent claim (useLogDraft): one row set
 * per draft even on a double tap or a retry after a lost answer. Adjust edits portions inline;
 * Discard drops the draft (nothing was saved).
 */
export function SentenceCard({
  reply,
  date,
  dayTotals,
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
  /** Today's logged kcal and protein (null while unknown: the consequence line hides). */
  dayTotals: { kcal: number; protein: number } | null;
  replaced: PlannedLite | null;
  nowMin: number;
  schedule: Pick<DaySchedule, "meals"> | null;
  onDiscard: () => void;
  /** A follow-up in the same conversation: an answer to its question or a quick fix. */
  onFollow: (text: string) => void;
  following: boolean;
  /** Start over for the next thing (after a save). */
  onDone: () => void;
  patchMessage: (m: { logged_group_id: string | null }) => void;
}) {
  const qc = useQueryClient();
  const today = useToday();
  const { userId } = useUser();
  const { payload, message, conversationId } = reply;
  const log = useLogDraft(conversationId);
  const [items, setItems] = useState<EditableItem[]>(() => payload.items.map((it, i) => toEditable(it, `${message.id}-${i}`)));
  const [adjusting, setAdjusting] = useState(false);
  const [chosen, setChosen] = useState<Meal | null>(null);
  const [logDate, setLogDate] = useState(date);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const busy = useRef(false);
  // one group id and one id per row for this draft, kept across retries: a save whose answer was
  // lost finishes on the next tap instead of adding a second copy
  const attempt = useRef<{ groupId: string; ids: string[] } | null>(null);

  const meal = inferMeal({ chosen, replaced, hint: payload.meal_hint, nowMin });
  const totals = useMemo(() => sumMacroSets(items.map((i) => i.macros)), [items]);
  const consequence = dayTotals && !saved ? ifYouAdd(dayTotals, { kcal: totals.calories, protein: totals.protein }, "add") : null;
  const loggable = items.filter(isLoggable);
  const otherDay = logDate !== today;

  const add = async () => {
    if (busy.current || saved || !loggable.length) return;
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
      const kcal = rows.reduce((a, r) => a + Number(r.calories ?? 0), 0);
      setSaved({ groupId, ids: res.ids, meal, date: logDate, kcal });
      setAdjusting(false);
      toast(`Added to ${mealLabel(meal)}${otherDay ? ` · ${relativeDay(logDate, today)}` : ""}`, {
        description: `${rows.length} ${rows.length === 1 ? "item" : "items"} · ${fmtKcal(kcal)} kcal`,
        duration: 6000,
        action: { label: "Undo", onClick: () => void undo(res.ids, groupId) },
      });
    } catch (e) {
      const msg = (e as Error).message;
      setFailed(msg === UNSURE_SAVE ? UNSURE_SAVE : msg);
    } finally {
      busy.current = false;
    }
  };

  const undo = async (ids = saved?.ids ?? [], groupId = saved?.groupId) => {
    if (!groupId) return;
    try {
      await undoChatLog(qc, { messageId: message.id, groupId, ids, replaced: [], conversationId, userId });
      patchMessage({ logged_group_id: null });
      setSaved(null);
      toast("Removed from your diary");
    } catch (e) {
      toast.error("Couldn't undo", { description: (e as Error).message });
    }
  };

  // a reply with nothing to log: its words (and any questions) in the Oracle's voice
  if (!payload.items.length) {
    return (
      <section className="rise rounded-card border border-aegean-line bg-m2 p-4" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          <Tag kind="AI" />
          {payload.mock && <DevMockBadge />}
        </div>
        <div className="mt-2">
          <Markdown text={message.content} />
        </div>
        <Questions payload={payload} onPick={onFollow} disabled={following} />
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            Start over
          </Button>
        </div>
      </section>
    );
  }

  const status = saved ? "saved" : log.isPending ? "saving" : failed ? "error" : "unsaved";

  return (
    <EstimateCard
      className="rise"
      status={status}
      tag={
        <span className="inline-flex items-center gap-1.5">
          <Tag kind="AI" detail="Estimate" />
          {payload.mock && <DevMockBadge />}
        </span>
      }
      title={estimateTitle(items.map((i) => i.name))}
      items={
        <>
          {replaced && (
            <p className="t-callout mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-stone">
              <span>
                Replaces: <span className="font-semibold text-ivory">{replaced.name}</span> (planned)
              </span>
              <Tag kind="PLAN" />
            </p>
          )}
          {adjusting ? (
            <div className="divide-y divide-vein" role="group" aria-label="Adjust the items">
              {items.map((it) => (
                <ScanItemCard
                  key={it.key}
                  item={it}
                  onChange={(n) => setItems((all) => all.map((x) => (x.key === it.key ? n : x)))}
                  onRemove={() => setItems((all) => all.filter((x) => x.key !== it.key))}
                  onPrep={(p) => setItems((all) => all.map((x) => (x.key === it.key ? { ...x, preparation: p } : x)))}
                />
              ))}
              {!items.length && <p className="t-callout py-5 text-center text-stone">Every item was removed. Discard this, or describe the meal again.</p>}
              <section className="space-y-2.5 pt-4" aria-label="Where to log it">
                <p className="t-eyebrow">Log to</p>
                <MealDatePicker
                  meal={meal}
                  onMeal={setChosen}
                  date={logDate}
                  onDate={(d) => setLogDate(d)}
                  onInset
                />
              </section>
              {payload.corrections.length > 0 && (
                <section className="pt-4" aria-label="Or tell the estimate">
                  <p className="t-eyebrow mb-1">Or tell it</p>
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
          ) : items.length === 1 ? (
            <p className="t-callout -mt-2 text-stone">{portionText(items[0])}</p>
          ) : (
            <ul className="divide-y divide-vein border-y border-vein" aria-label="Items">
              {items.map((it) => (
                <li key={it.key} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="t-title-3 text-ivory">{it.name}</p>
                    <p className="t-meta mt-0.5 text-stone">{portionText(it)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p>
                      <span className="t-num-s text-ivory">{fmtKcal(it.macros.calories)}</span>
                      <span className="t-meta ml-1 text-stone">kcal</span>
                    </p>
                    <p className="t-meta text-stone">
                      <span className="tnum font-semibold text-ivory">{Math.round(it.macros.protein)}</span> g protein
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!adjusting && (
            <div className={cn("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1", items.length === 1 ? "mt-3 border-t border-vein pt-3" : "mt-3")}>
              <p>
                <span className="t-eyebrow mr-2">Meal</span>
                <span className="t-num-s text-ivory">{fmtKcal(totals.calories)}</span>
                <span className="t-meta ml-1 text-stone">kcal</span>
              </p>
              <MacroTrio m={totals} />
            </div>
          )}
          {!saved && !adjusting && <Questions payload={payload} onPick={onFollow} disabled={following} />}
        </>
      }
      consequence={
        consequence ? (
          <>
            <span className="text-ivory" aria-label={consequence.spoken}>
              {consequence.text}
            </span>
            <Tag kind="CALC" explain={`${consequence.explain}. From your log${otherDay ? ` for ${relativeDay(logDate, today).toLowerCase()}` : ""}.`} />
          </>
        ) : undefined
      }
      note={
        replaced && !saved ? (
          <>The planned meal stays in your plan, not logged. Nothing in the plan changes.</>
        ) : payload.notes.length ? (
          payload.notes.join(" ")
        ) : undefined
      }
      actions={
        saved ? (
          <>
            {/* the earned mark gets its own line, so "Added to dinner, yesterday" is never cut short */}
            <p className="t-callout flex items-center gap-2 font-semibold text-leaf-300">
              <SealTick className="seal-in size-5 shrink-0" />
              <span>
                Added to {mealLabel(saved.meal).toLowerCase()}
                {saved.date !== today ? `, ${relativeDay(saved.date, today).toLowerCase()}` : ""}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="md" onClick={() => void undo()}>
                Undo
              </Button>
              <Button variant="ghost" size="md" onClick={onDone}>
                Log another
              </Button>
            </div>
          </>
        ) : (
          <>
            {failed && (
              <p role="alert" className="t-meta text-cinnabar">
                Not added. {failed}
              </p>
            )}
            <Button variant="primary" size="lg" block onClick={() => void add()} loading={log.isPending} disabled={!loggable.length || following}>
              {failed === UNSURE_SAVE ? "Add again" : `Add as ${mealLabel(meal).toLowerCase()}${otherDay ? `, ${relativeDay(logDate, today).toLowerCase()}` : ""}`}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="md" onClick={() => setAdjusting((v) => !v)} aria-expanded={adjusting} disabled={log.isPending}>
                {adjusting ? "Done adjusting" : "Adjust"}
              </Button>
              <Button variant="ghost" size="md" onClick={onDiscard} disabled={log.isPending}>
                Discard
              </Button>
            </div>
          </>
        )
      }
    />
  );
}

function portionText(i: EditableItem) {
  if (i.mult !== 1 || !i.portion) {
    const q = Number.isInteger(i.quantity) ? String(i.quantity) : i.quantity.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    const unit = i.unit === "serving" ? (i.quantity === 1 ? "serving" : "servings") : i.unit;
    return `${q} ${unit}${i.grams && i.unit !== "g" ? ` · ~${i.grams} g` : ""}`;
  }
  return `${i.portion}${i.grams && !/\bg\b/.test(i.portion) ? ` · ~${i.grams} g` : ""}`;
}

/** The estimate's clarifying questions as chips; a pick goes back to the same conversation. */
function Questions({ payload, onPick, disabled }: { payload: SentenceReply["payload"]; onPick: (t: string) => void; disabled?: boolean }) {
  if (!payload.questions.length) return null;
  return (
    <div className="mt-4 space-y-3 border-t border-vein pt-3">
      {payload.questions.slice(0, 2).map((q) => (
        <div key={q.id}>
          <p className="t-callout font-semibold text-ivory">{q.question}</p>
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

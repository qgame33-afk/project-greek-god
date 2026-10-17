"use client";

import { ArrowUp, ScanLine, Search, Weight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SealTick, TrainColumn } from "@/components/art/icons";
import { MealAction, mealSpoken } from "@/components/now/MealAction";
import { useDayInput } from "@/components/now/useDayInput";
import { useNowData, type NowModel } from "@/components/now/useNowData";
import { useOnline } from "@/components/workout/stores";
import { Button, Spinner } from "@/components/ui/button";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { useFoodEntries, useWater, useWaterMutations } from "@/lib/data/nutrition";
import { useStartWorkout } from "@/lib/data/workout";
import type { ISODate } from "@/lib/dates";
import type { Meal } from "@/lib/nutrition";
import { formatInt } from "@/lib/units";
import { findReplaced, mealAtMinute, type PlannedLite } from "./replaces";
import { SentenceCard } from "./SentenceCard";
import { retryable, useFoodCapability, useFoodSentence } from "./useFoodSentence";

const MAX_CHARS = 600;

/**
 * Log mode (docs/DESIGN-V2.md §3.9.1): "Suggested now" from the Day Engine, the natural-language
 * field ("What did you eat?") whose reply is an ESTIMATE card that saves nothing until Add, and the
 * quick actions. Every tile and chip is 44 px or taller.
 */
export function LogMode({
  date,
  onWeighIn,
  onSearch,
  onClose,
}: {
  date: ISODate;
  onWeighIn: () => void;
  onSearch: (meal?: Meal) => void;
  onClose: () => void;
}) {
  const now = useNowData();
  const m = now.model;
  const { state, now: nowMin } = useDayInput(m);
  const today = useToday();
  const food = useFoodEntries(date);
  const online = useOnline();
  const cap = useFoodCapability();
  const sentence = useFoodSentence(date);
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  const configured = cap.data?.configured ?? true;
  const disabled = !configured || !online;
  const planned: PlannedLite[] = useMemo(
    () => (date === today ? (m?.meals ?? []).map((x) => ({ id: x.id, slot: x.slot, name: x.name, eaten: x.eaten, at: x.at })) : []),
    [m?.meals, date, today],
  );
  const reply = sentence.reply;
  const replaced = useMemo(() => (reply ? findReplaced(reply.said, planned) : null), [reply, planned]);
  const dayTotals = food.hasData ? { kcal: food.totals.calories, protein: food.totals.protein } : null;
  const busy = !!sentence.pending;

  // the field grows with the sentence (to four lines), then scrolls
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 52), 128)}px`;
  }, [text]);

  const submit = async () => {
    if (disabled || busy) return;
    // a sentence typed while a draft is open corrects that draft; after a save it starts a new one
    const follow = !!reply && reply.payload.items.length > 0 && !reply.message.logged_group_id;
    const ok = await sentence.send(text, { follow, retry: sentence.error });
    if (ok) setText("");
  };

  return (
    <div className="@container space-y-7 pt-1">
      <SuggestedNow model={m} state={state} loading={now.loading && !m} onWeighIn={onWeighIn} onClose={onClose} />

      <section aria-labelledby="offering-what">
        <h2 id="offering-what" className="t-title-2 text-ivory">
          What did you eat?
        </h2>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div
            className={cn(
              "flex items-end gap-2 rounded-card border bg-m2 py-1.5 pl-4 pr-1.5 transition-[border-color,box-shadow] duration-(--dur-fast)",
              disabled ? "border-vein-2" : "border-ui-line focus-within:border-leaf-300 focus-within:shadow-[0_0_0_3px_var(--leaf-tint)]",
            )}
            onClick={(e) => e.target === e.currentTarget && field.current?.focus()}
          >
            <label htmlFor="offering-sentence" className="sr-only">
              Describe what you ate
            </label>
            <textarea
              id="offering-sentence"
              ref={field}
              rows={1}
              value={text}
              disabled={disabled}
              maxLength={MAX_CHARS}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={!configured ? "Needs an AI key on the server" : !online ? "Offline" : reply && !reply.message.logged_group_id && reply.payload.items.length ? "Correct it: “only two slices”" : "3 slices of pizza instead of the salmon"}
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="on"
              spellCheck
              className="min-h-[3.25rem] flex-1 resize-none bg-transparent py-3.5 text-[length:max(16px,1rem)] leading-snug text-ivory outline-none placeholder:text-ash disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={disabled || busy || !text.trim()}
              aria-label={busy ? "Estimating" : "Estimate it"}
              className={cn(
                "press mb-0.5 grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,color] duration-(--dur-fast)",
                text.trim() && !disabled && !busy ? "bg-ivory text-ink" : "bg-m3 text-disabled",
              )}
            >
              {busy ? <Spinner className="size-[1.125rem] text-stone" /> : <ArrowUp className="size-5" strokeWidth={2.2} aria-hidden />}
            </button>
          </div>
        </form>
        <p className="t-meta mt-2 px-1 text-ash" role={disabled ? "status" : undefined}>
          {!configured
            ? "Describing a meal needs an AI key on the server. Search food still works."
            : !online
              ? "Offline. Describing a meal needs a connection; nothing was sent."
              : "Plain words. Portions and brands sharpen it. Nothing is saved until you add it."}
        </p>

        <div className="mt-4" aria-live="polite">
          {sentence.pending && !reply && <Estimating text={sentence.pending} />}
          {sentence.error && (
            <ErrorNote onRetry={retryable(sentence.error.code) ? () => void sentence.send(sentence.error!.text, { follow: !!reply, retry: sentence.error }) : undefined}>
              {sentence.error.message}
            </ErrorNote>
          )}
          {reply && (
            <div className={cn("transition-opacity duration-(--dur-base)", sentence.pending && "opacity-60")}>
              <SentenceCard
                key={reply.message.id}
                reply={reply}
                date={date}
                dayTotals={dayTotals}
                replaced={replaced}
                nowMin={nowMin}
                schedule={m?.appPrefs.day ?? null}
                following={busy}
                onFollow={(t) => void sentence.send(t, { follow: true })}
                onDiscard={() => {
                  sentence.clear();
                  field.current?.focus();
                }}
                onDone={() => {
                  sentence.clear();
                  field.current?.focus();
                }}
                patchMessage={sentence.patchMessage}
              />
            </div>
          )}
        </div>
      </section>

      <QuickActions model={m} date={date} onWeighIn={onWeighIn} onSearch={() => onSearch(date === today ? mealAtMinute(nowMin) : undefined)} onClose={onClose} />
    </div>
  );
}

function Estimating({ text }: { text: string }) {
  return (
    <div className="rounded-card border border-aegean-line bg-m2 p-4" role="status">
      <p className="t-tag text-aegean">AI · Estimating</p>
      <p className="t-callout mt-2 line-clamp-2 text-stone">“{text}”</p>
      <div className="mt-3 space-y-2" aria-hidden>
        <Skeleton className="h-4 w-4/5 rounded-full" />
        <Skeleton className="h-4 w-3/5 rounded-full" />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- suggested now */

/**
 * One row from the Day Engine's next action (docs/DESIGN-V2.md §4.2): eat the next planned meal
 * (one tap, Undo), begin or return to today's session, the check-in, the weigh-in. Nothing when the
 * engine has nothing to suggest.
 */
function SuggestedNow({
  model: m,
  state,
  loading,
  onWeighIn,
  onClose,
}: {
  model: NowModel | null;
  state: ReturnType<typeof useDayInput>["state"];
  loading: boolean;
  onWeighIn: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { startToday, starting } = useStartWorkout();
  if (loading)
    return (
      <div aria-hidden>
        <Skeleton className="h-3 w-28 rounded-full" />
        <Skeleton className="mt-3 h-16 rounded-card" />
      </div>
    );
  const next = state?.next;
  if (!m || !next) return null;

  let body: ReactNode = null;
  if (next.kind === "eat") {
    const meal = m.meals.find((x) => x.id === next.mealId);
    if (!meal) return null;
    body = (
      <Row lead={<Clock min={meal.at} />} title={`Eat as planned: ${meal.name}`} detail={`${formatInt(meal.kcal)} kcal · ${Math.round(meal.protein)} g protein`} label={`Eat as planned: ${mealSpoken(meal)}`}>
        <MealAction meal={meal} compact />
      </Row>
    );
  } else if (next.kind === "begin" && m.template) {
    body = (
      <Row lead={<TrainColumn className="size-6 text-ivory" />} title={`Begin ${m.template.name}`} detail={m.durationMin ? `~${m.durationMin} min · ${m.setCount} sets` : `${m.setCount} sets`}>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full px-4"
          loading={starting}
          onClick={async () => {
            if (await startToday()) onClose();
          }}
        >
          Begin
        </Button>
      </Row>
    );
  } else if (next.kind === "return" && m.active) {
    const id = m.active.id;
    body = (
      <Row lead={<TrainColumn className="size-6 text-leaf-300" />} title={`Return to ${m.active.name}`} detail="Your session is still open">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full px-4"
          onClick={() => {
            onClose();
            router.push(`/workout/${id}`);
          }}
        >
          Return
        </Button>
      </Row>
    );
  } else if (next.kind === "checkin") {
    body = (
      <Row lead={<SealTick className="size-6 text-ivory" />} title="Morning check-in" detail="Three questions: sleep, legs, energy">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full px-4"
          onClick={() => {
            onClose();
            router.push("/?dawn=1");
          }}
        >
          Start
        </Button>
      </Row>
    );
  } else if (next.kind === "weighin") {
    body = (
      <Row lead={<Weight className="size-6 text-ivory" strokeWidth={1.6} />} title="Weigh in" detail="Before food, after the bathroom">
        <Button variant="outline" size="sm" className="rounded-full px-4" onClick={onWeighIn}>
          Weigh in
        </Button>
      </Row>
    );
  }
  if (!body) return null;
  return (
    <section aria-labelledby="offering-suggested">
      <h2 id="offering-suggested" className="t-eyebrow mb-2">
        Suggested now
      </h2>
      {body}
    </section>
  );
}

function Row({ lead, title, detail, label, children }: { lead: ReactNode; title: string; detail: string; label?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-card bg-m2 py-2.5 pl-4 pr-2.5 shadow-(--e1) @max-[19rem]:flex-wrap">
      <span className="grid w-11 shrink-0 place-items-center" aria-hidden>
        {lead}
      </span>
      <div className="min-w-0 flex-1" aria-label={label}>
        <p className="t-title-3 line-clamp-2 text-ivory">{title}</p>
        <p className="t-meta mt-0.5 text-stone">{detail}</p>
      </div>
      <div className="shrink-0 @max-[19rem]:ml-auto">{children}</div>
    </div>
  );
}

/** "6:30" over "PM": the planned time, small enough to sit in the row's lead column. */
function Clock({ min }: { min: number }) {
  const h = Math.floor(min / 60) % 24;
  const mm = String(Math.round(min % 60)).padStart(2, "0");
  return (
    <span className="flex flex-col items-center leading-none">
      <span className="t-num-s text-ivory">{`${h % 12 === 0 ? 12 : h % 12}:${mm}`}</span>
      <span className="t-tag mt-1 text-ash">{h < 12 ? "AM" : "PM"}</span>
    </span>
  );
}

/* --------------------------------------------------------- quick actions */

/** The 3×2 grid of quick actions (88 px tiles; two columns at accessibility text sizes). */
function QuickActions({ model: m, date, onWeighIn, onSearch, onClose }: { model: NowModel | null; date: ISODate; onWeighIn: () => void; onSearch: () => void; onClose: () => void }) {
  const router = useRouter();
  const today = useToday();
  const water = useWater(today);
  const waterMut = useWaterMutations(today);
  const { startToday, starting, active } = useStartWorkout();
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const live = active ?? m?.active ?? null;
  const workoutLabel = live ? `Return to ${live.name}` : starting ? "Starting…" : m?.template ? `Begin ${m.template.name}` : "Start workout";
  const goal = m?.profile.water_goal_ml ?? null;
  const ml = water.hasData ? water.totalMl : null;

  return (
    <section aria-labelledby="offering-quick">
      <h2 id="offering-quick" className="t-eyebrow mb-2">
        Quick
      </h2>
      <div className="grid grid-cols-3 gap-2 @max-[19rem]:grid-cols-2">
        <Tile icon={<Weight className="size-6" strokeWidth={1.6} />} label="Weigh-in" onClick={onWeighIn} />
        <div className="flex min-h-[5.5rem] flex-col justify-between gap-2 rounded-card bg-m2 p-2.5 shadow-(--e1)">
          <p className="t-callout flex items-baseline justify-between gap-1 px-0.5 font-semibold text-ivory">
            Water
            <span className="t-meta tnum truncate font-medium text-stone" aria-label={ml == null ? "Water today unknown" : `${ml} of ${goal ?? "—"} millilitres today`}>
              {ml == null ? "—" : `${(ml / 1000).toFixed(1)} L`}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {[250, 500].map((amount) => (
              <button
                key={amount}
                type="button"
                aria-label={`Add ${amount} millilitres of water`}
                onClick={() => {
                  const id = waterMut.addMl(amount);
                  toast(`+${amount} mL water`, { duration: 6000, action: { label: "Undo", onClick: () => waterMut.remove.mutate(id) } });
                }}
                className="press tnum h-11 rounded-field bg-m3 text-[length:max(14px,0.875rem)] font-semibold text-ivory shadow-[inset_0_0_0_1px_var(--vein-2)] active:bg-m4"
              >
                +{amount}
              </button>
            ))}
          </div>
        </div>
        <Tile icon={<ScanLine className="size-6" strokeWidth={1.6} />} label="Scan" onClick={() => go("/nutrition/scan")} />
        <Tile icon={<Search className="size-6" strokeWidth={1.6} />} label="Search food" detail={date !== today ? "For that day" : undefined} onClick={onSearch} />
        <Tile
          icon={<TrainColumn className={cn("size-6", live && "text-leaf-300")} />}
          label={workoutLabel}
          onClick={async () => {
            if (live) return go(`/workout/${live.id}`);
            if (await startToday()) onClose();
          }}
          disabled={starting}
        />
        <Tile icon={<SealTick className="size-6" />} label="Check-in" onClick={() => go("/?dawn=1")} />
      </div>
    </section>
  );
}

function Tile({ icon, label, detail, onClick, disabled }: { icon: ReactNode; label: string; detail?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press flex min-h-[5.5rem] flex-col justify-between gap-2 rounded-card bg-m2 p-3 text-left text-ivory shadow-(--e1) hover:bg-m3 active:bg-m3 disabled:opacity-60"
    >
      <span aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="t-callout block text-balance font-semibold leading-tight">{label}</span>
        {detail && <span className="t-meta block text-stone">{detail}</span>}
      </span>
    </button>
  );
}

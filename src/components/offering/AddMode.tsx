"use client";

import {
  ArrowUp,
  Camera,
  Dumbbell,
  GlassWater,
  MessageCircle,
  ScanLine,
  Scale,
  Search,
  Sparkle,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePrepError, prepareImage } from "@/components/food-ai/image";
import { useNowData } from "@/components/now/useNowData";
import { useOnline } from "@/components/workout/stores";
import { Button, Spinner } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/field";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { isOffline, useToday, useUser } from "@/lib/data/core";
import { useFoodEntries, useWaterMutations } from "@/lib/data/nutrition";
import { useStartWorkout } from "@/lib/data/workout";
import type { ISODate } from "@/lib/dates";
import type { Meal } from "@/lib/nutrition";
import { templateLabels } from "@/lib/training/programs";
import { formatInt, parseNumber } from "@/lib/units";
import { mealAtMinute, findReplaced, type PlannedLite } from "./replaces";
import { SentenceCard } from "./SentenceCard";
import {
  recalledText,
  rememberText,
  retryable,
  useFoodCapability,
  useFoodSentence,
} from "./useFoodSentence";

const MAX_CHARS = 600;
const LONG_PRESS_MS = 500;

const minuteNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * The Add sheet's content (docs/DESIGN-V3-SIMPLE.md §4.7): the AI field ("Describe what you ate",
 * a camera for a photo estimate, a white send), whose reply is an AI card that saves nothing until
 * the gold "Add as …", then six tiles that are never gold: Scan food, Search food, Weigh in,
 * Water (+250 ml; hold for more), Start workout and Ask coach. While an estimate shows, the tiles
 * step aside so the card is the one thing on screen.
 */
export function AddMode({
  date,
  onWeighIn,
  onSearch,
  onAsk,
  onClose,
}: {
  date: ISODate;
  onWeighIn: () => void;
  onSearch: (meal?: Meal) => void;
  onAsk: () => void;
  onClose: () => void;
}) {
  const now = useNowData();
  const m = now.model;
  const today = useToday();
  const food = useFoodEntries(date);
  const online = useOnline();
  const cap = useFoodCapability();
  const sentence = useFoodSentence(date);
  const { userId } = useUser();
  const [text, setTextState] = useState(() => recalledText(date, userId));
  const setText = (t: string) => {
    setTextState(t);
    rememberText(date, userId, t);
  };
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const [nowMin] = useState(minuteNow);
  // the field keeps the sentence the estimate came from; sending it again unchanged does nothing
  const [sent, setSent] = useState<string | null>(null);

  const configured = cap.data?.configured ?? true;
  const disabled = !configured || !online;
  const planned: PlannedLite[] = useMemo(
    () =>
      date === today
        ? (m?.meals ?? []).map((x) => ({
            id: x.id,
            slot: x.slot,
            name: x.name,
            eaten: x.eaten,
            at: x.at,
          }))
        : [],
    [m?.meals, date, today],
  );
  const reply = sentence.reply;
  const replaced = useMemo(
    () => (reply ? findReplaced(reply.said, planned) : null),
    [reply, planned],
  );
  const dayTotals = food.hasData
    ? { kcal: food.totals.calories, protein: food.totals.protein }
    : null;
  const goals = m
    ? {
        kcal: Number(m.profile.calorie_goal ?? 0),
        protein: Number(m.profile.protein_goal ?? 0),
      }
    : null;
  const busy = !!sentence.pending || preparing;
  const drafting =
    !!reply && reply.payload.items.length > 0 && !reply.message.logged_group_id;

  // the field grows with the sentence (to four lines), then scrolls; sizes follow the text size
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const rem =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 2.75 * rem), 7.5 * rem)}px`;
  }, [text]);

  const submit = async (image?: string | null) => {
    if (disabled || sentence.pending) return;
    // a sentence typed while a draft is open corrects that draft; otherwise a new one starts
    if (!image && text.trim() === sent) return;
    const ok = await sentence.send(text, {
      follow: drafting && !image,
      retry: sentence.error,
      image,
    });
    if (ok) setSent(text.trim());
  };
  const reset = () => {
    sentence.clear();
    setText("");
    setSent(null);
  };

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setPhotoError(null);
    setPreparing(true);
    try {
      const img = await prepareImage(f, 1600, 0.82);
      setPreparing(false);
      await submit(img.dataUrl);
    } catch (e) {
      setPhotoError(
        e instanceof ImagePrepError
          ? e.message
          : "Couldn't read that photo. Try another one.",
      );
    } finally {
      setPreparing(false);
      if (photo.current) photo.current.value = "";
    }
  };

  const caption = !configured
    ? "AI isn't set up yet. Search food instead."
    : !online
      ? "You're offline. Search your recent foods instead."
      : "AI estimates it. Nothing saves until you tap Add.";

  return (
    <div className="space-y-6 pt-1">
      <section aria-label="Describe what you ate">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div
            className={cn(
              "flex min-h-[58px] items-center gap-2 rounded-field bg-surface py-[7px] pl-4 pr-[7px] transition-shadow duration-(--dur-fast) ax:flex-wrap",
              !disabled && "focus-within:shadow-[inset_0_0_0_2px_var(--text)]",
            )}
            onClick={(e) =>
              e.target === e.currentTarget && field.current?.focus()
            }
          >
            <Sparkle
              className="size-5 shrink-0 text-ai"
              strokeWidth={1.9}
              aria-hidden
            />
            <label htmlFor="add-sentence" className="sr-only">
              Describe what you ate
            </label>
            <textarea
              id="add-sentence"
              ref={field}
              rows={1}
              value={text}
              disabled={disabled}
              maxLength={MAX_CHARS}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={
                drafting
                  ? "Correct it: only two slices"
                  : "Describe what you ate"
              }
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="on"
              spellCheck
              className="t-body min-w-0 flex-1 resize-none ax:basis-[calc(100%-2rem)] bg-transparent py-2.5 leading-snug text-fg outline-none placeholder:text-fg-2 disabled:cursor-not-allowed"
            />
            <input
              ref={photo}
              type="file"
              accept="image/*"
              className="hidden"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void pickPhoto(e.target.files?.[0])}
            />
            <span className="flex shrink-0 items-center gap-2 ax:w-full ax:justify-end">
              <button
                type="button"
                onClick={() => photo.current?.click()}
                disabled={disabled || busy}
                aria-label="Take or pick a photo of your food"
                className="press hit-44 grid size-10 shrink-0 place-items-center rounded-full bg-control text-fg-2 hover:text-fg disabled:opacity-40"
              >
                <Camera className="size-5" strokeWidth={1.9} aria-hidden />
              </button>
              <button
                type="submit"
                disabled={
                  disabled || busy || !text.trim() || text.trim() === sent
                }
                aria-label={busy ? "Estimating" : "Estimate it"}
                className={cn(
                  "press hit-44 grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,color] duration-(--dur-fast)",
                  disabled ? "bg-control text-fg-3" : "bg-fg text-bg",
                )}
              >
                {busy ? (
                  <Spinner className="size-[1.125rem]" />
                ) : (
                  <ArrowUp className="size-5" strokeWidth={2.2} aria-hidden />
                )}
              </button>
            </span>
          </div>
        </form>
        <p className="t-label mt-2 px-1" role={disabled ? "status" : undefined}>
          {caption}
        </p>

        <div className="mt-4 empty:hidden" aria-live="polite">
          {(sentence.pending || preparing) && !reply && (
            <Estimating text={preparing ? "Photo" : sentence.pending!} />
          )}
          {photoError && <ErrorNote>{photoError}</ErrorNote>}
          {sentence.error && (
            <ErrorNote
              onRetry={
                retryable(sentence.error.code)
                  ? () =>
                      void sentence.send(sentence.error!.text, {
                        follow: drafting,
                        retry: sentence.error,
                      })
                  : undefined
              }
            >
              {sentence.error.message}
            </ErrorNote>
          )}
          {reply && (
            <div
              className={cn(
                "transition-opacity duration-(--dur-base)",
                sentence.pending && "opacity-60",
              )}
            >
              <SentenceCard
                key={reply.message.id}
                reply={reply}
                date={date}
                dayTotals={dayTotals}
                goals={goals}
                replaced={replaced}
                nowMin={nowMin}
                schedule={m?.appPrefs.day ?? null}
                following={!!sentence.pending}
                onFollow={(t) => void sentence.send(t, { follow: true })}
                onDiscard={() => {
                  reset();
                  field.current?.focus();
                }}
                onDone={reset}
                patchMessage={sentence.patchMessage}
              />
            </div>
          )}
        </div>
      </section>

      {!reply && !sentence.pending && !preparing && (
        <Tiles
          model={m}
          date={date}
          onWeighIn={onWeighIn}
          onSearch={() =>
            onSearch(date === today ? mealAtMinute(nowMin) : undefined)
          }
          onAsk={onAsk}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function Estimating({ text }: { text: string }) {
  return (
    <div
      className="rounded-card border border-ai-line bg-surface p-[18px]"
      role="status"
    >
      <p className="t-label inline-flex items-center gap-1.5 font-semibold text-ai">
        <Sparkle className="size-3.5" strokeWidth={2.2} aria-hidden />
        AI is estimating
      </p>
      <p className="t-label mt-2 line-clamp-2" data-food="">
        {text}
      </p>
      <div className="mt-3 space-y-2" aria-hidden>
        <Skeleton className="h-4 w-4/5 rounded-full" />
        <Skeleton className="h-4 w-3/5 rounded-full" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tiles */

type NowModel = ReturnType<typeof useNowData>["model"];

/** The 2×3 grid of 104 px tiles (§4.7.1). Never gold; one column at accessibility sizes. */
function Tiles({
  model: m,
  date,
  onWeighIn,
  onSearch,
  onAsk,
  onClose,
}: {
  model: NowModel;
  date: ISODate;
  onWeighIn: () => void;
  onSearch: () => void;
  onAsk: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const today = useToday();
  const water = useWaterMutations(today);
  const { startToday, starting, active } = useStartWorkout();
  const [waterMore, setWaterMore] = useState(false);
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const live = active ?? m?.active ?? null;
  const planned = m?.template ?? null;
  const workoutSub = live
    ? `Back to ${templateLabels({ key: live.template_key ?? "", name: live.name }).short}`
    : starting
      ? "Starting…"
      : planned
        ? templateLabels(planned).short
        : m
          ? "Pick a workout"
          : null;

  const addWater = (ml: number) => {
    if (isOffline()) {
      toast.error("You're offline", {
        description: "Water didn't change. Try again when you're back.",
      });
      return;
    }
    const id = water.addMl(ml);
    toast(`Water +${ml} ml`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => water.remove.mutate(id) },
    });
  };
  const endPress = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 ax:grid-cols-1">
        <Tile
          icon={ScanLine}
          title="Scan food"
          subtitle="Photo or barcode"
          onClick={() => go("/nutrition/scan")}
        />
        <Tile
          icon={Search}
          title="Search food"
          subtitle={date !== today ? "For that day" : "Recent and saved too"}
          onClick={onSearch}
        />
        <Tile icon={Scale} title="Weigh in" onClick={onWeighIn} />
        <Tile
          icon={GlassWater}
          title="Water"
          subtitle="+250 ml"
          ariaLabel="Water, add 250 millilitres. Hold for more"
          onClick={() => {
            if (longPressed.current) {
              longPressed.current = false;
              return;
            }
            addWater(250);
          }}
          press={{
            onPointerDown: () => {
              longPressed.current = false;
              timer.current = window.setTimeout(() => {
                longPressed.current = true;
                setWaterMore(true);
              }, LONG_PRESS_MS);
            },
            onPointerUp: endPress,
            onPointerLeave: endPress,
            onPointerCancel: endPress,
            onContextMenu: (e) => e.preventDefault(),
          }}
        />
        <Tile
          icon={Dumbbell}
          title="Start workout"
          subtitle={workoutSub}
          dataName={!!(live || planned)}
          disabled={starting}
          onClick={async () => {
            if (live) return go(`/workout/${live.id}`);
            if (!planned && m) return go("/training");
            if (await startToday()) onClose();
          }}
        />
        <Tile icon={MessageCircle} title="Ask coach" onClick={onAsk} />
      </div>
      <WaterSheet
        open={waterMore}
        onOpenChange={setWaterMore}
        onAdd={addWater}
      />
    </>
  );
}

function Tile({
  icon: Icon,
  title,
  subtitle,
  onClick,
  disabled,
  ariaLabel,
  dataName,
  press,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  dataName?: boolean;
  press?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      {...press}
      className="press flex min-h-[104px] select-none flex-col justify-between gap-3 rounded-tile-lg bg-surface p-4 text-left text-fg [-webkit-touch-callout:none] disabled:opacity-60"
    >
      <Icon className="size-6 shrink-0" strokeWidth={1.9} aria-hidden />
      <span className="min-w-0">
        <span className="t-row block">{title}</span>
        {subtitle && (
          <span
            className="t-label mt-0.5 line-clamp-2 block"
            data-budget-name={dataName ? "" : undefined}
          >
            {subtitle}
          </span>
        )}
      </span>
    </button>
  );
}

/** Hold on the Water tile: +500 ml or another amount. */
function WaterSheet({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (ml: number) => void;
}) {
  const [text, setText] = useState("");
  const ml = parseNumber(text);
  const valid = ml != null && ml >= 10 && ml <= 3000;
  const done = (v: number) => {
    onAdd(Math.round(v));
    setText("");
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add water">
      <div className="grid gap-3 pb-2 pt-2">
        <Button variant="secondary" size="lg" block onClick={() => done(500)}>
          +500 ml
        </Button>
        <label
          className="t-label mt-2 block font-semibold"
          htmlFor="add-water-custom"
        >
          Another amount
        </label>
        <NumberInput
          id="add-water-custom"
          decimal={false}
          placeholder="330"
          suffix="ml"
          value={text}
          onChange={(e) =>
            setText(e.target.value.replace(/[^\d]/g, "").slice(0, 4))
          }
          onKeyDown={(e) => e.key === "Enter" && valid && done(ml!)}
        />
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!valid}
          onClick={() => valid && done(ml!)}
        >
          {valid ? `Add ${formatInt(ml!)} ml` : "Add"}
        </Button>
      </div>
    </Sheet>
  );
}

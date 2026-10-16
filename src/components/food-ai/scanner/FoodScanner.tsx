"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CircleAlert, ImageUp, Info, MessagesSquare, PenLine, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { EstimateBadge, SuggestedBadge } from "@/components/ui/badge";
import { EmptyArt } from "@/components/art/Motifs";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { mealForTime, MEALS, type Meal } from "@/lib/nutrition";
import { newId, useToday, useUser } from "@/lib/data/core";
import type { AIFoodItem, AIQuestion, PhotoAnalysis } from "@/lib/ai/food-schemas";
import { entriesFromItems } from "@/lib/ai/food-log";
import { toEditable, type EditableItem } from "@/lib/ai/food-edit";
import { sumMacroSets } from "@/lib/food/normalize";
import { FoodAIRequestError, analysePhoto, getCapability, type PhotoRequest } from "../api";
import { ImagePrepError, dataUrlToBlob, prepareImage, type PreparedImage } from "../image";
import { deleteLogged, invalidateFood, uploadMealPhoto, useInsertEntries } from "../hooks";
import { DevMockBadge, FocusScreen, MacroTrio, MealDatePicker, fmtKcal } from "../parts";
import { AddItemSheet } from "../AddItemSheet";
import { PhotoFrame } from "./PhotoFrame";
import { ScanItemCard } from "./ScanItemCard";

type Phase = "capture" | "preparing" | "analysing" | "review" | "error" | "saving" | "success";
type Answer = NonNullable<PhotoRequest["answers"]>[number];
interface ScanError {
  code: string;
  message: string;
}
interface Logged {
  ids: string[];
  photoPath: string | null;
  meal: Meal;
  kcal: number;
  count: number;
}

const DRAFT_KEY = "pgg.scan.draft.v1";
const MEAL_HOUR: Record<Meal, [number, number]> = {
  breakfast: [8, 0],
  lunch: [12, 30],
  dinner: [19, 0],
  snacks: [15, 30],
};
const mealLabel = (m: Meal) => MEALS.find((x) => x.key === m)?.label ?? m;

function eatenAtFor(date: string, todayDate: string, meal: Meal) {
  if (date === todayDate) return new Date().toISOString();
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = MEAL_HOUR[meal];
  return new Date(y, mo - 1, d, h, mi).toISOString();
}

interface Draft {
  photo: PreparedImage;
  result: PhotoAnalysis;
  items: EditableItem[];
  answers: Answer[];
  meal: Meal;
  date: string;
  savePhoto: boolean;
  orig: [string, { name: string; prep: string }][];
  removed: string[];
  at: number;
}

export function FoodScanner() {
  const router = useRouter();
  const qc = useQueryClient();
  const todayDate = useToday();
  const { userId } = useUser();
  const { insert } = useInsertEntries();
  const cap = useQuery({
    queryKey: ["food-ai-cap", "photo"],
    queryFn: () => getCapability("photo"),
    staleTime: 5 * 60_000,
    retry: 0,
  });

  const [phase, setPhase] = useState<Phase>("capture");
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [result, setResult] = useState<PhotoAnalysis | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [meal, setMeal] = useState<Meal>(() => mealForTime());
  const [date, setDate] = useState<string>(todayDate);
  const [savePhoto, setSavePhoto] = useState(false);
  const [error, setError] = useState<ScanError | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [logged, setLogged] = useState<Logged | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [prepDirty, setPrepDirty] = useState(false);
  const [mock, setMock] = useState(false);

  const orig = useRef(new Map<string, { name: string; prep: string }>());
  const removed = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const leaveTimer = useRef<number | null>(null);
  const restored = useRef(false);

  const totals = useMemo(() => sumMacroSets(items.map((i) => i.macros)), [items]);
  const configured = cap.data?.configured ?? true;
  const isMock = mock || !!cap.data?.mock;

  /* ------------------------------------------------ draft persistence */

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      if (Date.now() - d.at > 6 * 3600_000 || !d.photo?.dataUrl || !d.result) return sessionStorage.removeItem(DRAFT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of an unsaved review
      setPhoto(d.photo);
      setResult(d.result);
      setItems(d.items);
      setAnswers(d.answers ?? []);
      setMeal(d.meal);
      setDate(d.date);
      setSavePhoto(!!d.savePhoto);
      setMock(!!d.result.mock);
      orig.current = new Map(d.orig ?? []);
      removed.current = d.removed ?? [];
      setPhase("review");
      toast("Restored your unsaved scan");
    } catch {
      /* storage unavailable or corrupt: start fresh */
    }
  }, []);

  useEffect(() => {
    if (phase !== "review" || !photo || !result) return;
    const t = window.setTimeout(() => {
      try {
        const d: Draft = {
          photo,
          result,
          items,
          answers,
          meal,
          date,
          savePhoto,
          orig: [...orig.current],
          removed: removed.current,
          at: Date.now(),
        };
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      } catch {
        /* quota or private mode: the review still works, it just won't survive a reload */
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [phase, photo, result, items, answers, meal, date, savePhoto]);

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  };

  /* --------------------------------------------------------- analysis */

  useEffect(() => {
    if (phase !== "analysing") return;
    const start = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the visible counter for this run
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const corrections = useCallback(() => {
    const notes: string[] = [];
    for (const it of items) {
      const o = orig.current.get(it.key);
      if (!o) continue;
      if (o.name.trim() !== it.name.trim()) notes.push(`"${o.name}" is actually ${it.name}.`);
      if (o.prep !== it.preparation) notes.push(`${it.name} was ${it.preparation}.`);
    }
    for (const r of removed.current) notes.push(`There is no ${r}.`);
    return notes.join(" ").slice(0, 480) || undefined;
  }, [items]);

  const run = useCallback(
    async (img: PreparedImage, nextAnswers: Answer[], context?: string) => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setError(null);
      setPhase("analysing");
      try {
        const res = await analysePhoto(
          {
            image: img.dataUrl,
            localDate: date,
            answers: nextAnswers,
            context,
          },
          ctl.signal,
        );
        if (ctl.signal.aborted) return;
        const kept = items.filter((i) => i.provenance === "manual" || i.id.startsWith("db-"));
        const fresh = res.items.map((i, n) => toEditable(i, `a${Date.now().toString(36)}${n}`));
        orig.current = new Map(fresh.map((i) => [i.key, { name: i.name, prep: i.preparation }]));
        removed.current = [];
        setResult(res);
        setMock(!!res.mock);
        setAnswers(nextAnswers);
        setPicked({});
        setPrepDirty(false);
        setItems([...fresh, ...kept]);
        setPhase("review");
        haptic(10);
      } catch (e) {
        if ((e as Error).name === "AbortError" || ctl.signal.aborted) return;
        const err = e instanceof FoodAIRequestError ? e : new FoodAIRequestError("upstream", "Analysis failed. Try again.", 0);
        setError({ code: err.code, message: err.message });
        setPhase("error");
      }
    },
    [date, items],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setCaptureError(null);
    setPhase("preparing");
    try {
      const img = await prepareImage(file);
      setPhoto(img);
      setResult(null);
      setItems([]);
      setAnswers([]);
      await run(img, []);
    } catch (e) {
      setPhase("capture");
      setCaptureError(e instanceof ImagePrepError ? e.message : "That photo couldn't be read. Try another one.");
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    void onFile(f);
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase(result ? "review" : "capture");
  };

  const retake = () => {
    abortRef.current?.abort();
    clearDraft();
    setPhoto(null);
    setResult(null);
    setItems([]);
    setAnswers([]);
    setPicked({});
    setError(null);
    setPhase("capture");
  };

  /* -------------------------------------------------------- questions */

  const questions = result?.questions ?? [];
  const pick = (q: AIQuestion, option: string) => {
    const next = { ...picked, [q.id]: option };
    setPicked(next);
    haptic(8);
    if (questions.every((x) => next[x.id])) submitAnswers(next);
  };
  const submitAnswers = (sel = picked) => {
    if (!photo) return;
    const fresh: Answer[] = questions
      .filter((q) => sel[q.id])
      .map((q) => ({
        questionId: q.id,
        question: q.question,
        answer: sel[q.id],
      }));
    const merged = [...answers.filter((a) => !fresh.some((f) => f.questionId === a.questionId)), ...fresh];
    void run(photo, merged, corrections());
  };

  /* ------------------------------------------------------------ edits */

  const update = (key: string, next: EditableItem) => setItems((list) => list.map((i) => (i.key === key ? next : i)));
  const remove = (key: string) => {
    const idx = items.findIndex((i) => i.key === key);
    const it = items[idx];
    if (!it) return;
    setItems((list) => list.filter((i) => i.key !== key));
    if (orig.current.has(key)) removed.current = [...removed.current, it.name];
    toast(`Removed ${it.name}`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          removed.current = removed.current.filter((n) => n !== it.name);
          setItems((list) => {
            const copy = [...list];
            copy.splice(Math.min(idx, copy.length), 0, it);
            return copy;
          });
        },
      },
    });
  };
  const addItem = (item: AIFoodItem) => {
    setItems((list) => [...list, toEditable(item, `m${Date.now().toString(36)}`)]);
    toast(`Added ${item.name}`);
  };

  /* ---------------------------------------------------------- confirm */

  const confirm = async () => {
    if (savingRef.current || !items.length) return;
    savingRef.current = true;
    setPhase("saving");
    let photoPath: string | null = null;
    try {
      if (savePhoto && photo && userId) {
        try {
          photoPath = await uploadMealPhoto(userId, date, dataUrlToBlob(photo.dataUrl));
        } catch {
          toast("The photo couldn't be saved. Logging the meal without it.");
        }
      }
      const rows = entriesFromItems(items, {
        meal,
        localDate: date,
        eatenAt: eatenAtFor(date, todayDate, meal),
        groupId: newId(),
        source: "photo_ai",
        photoPath,
        newId,
      });
      if (!rows.length) throw new Error("Every item is at 0 kcal. Adjust a portion or add an item.");
      const inserted = await insert(rows);
      setLogged({
        ids: inserted.map((r) => r.id),
        photoPath,
        meal,
        kcal: totals.calories,
        count: rows.length,
      });
      clearDraft();
      setPhase("success");
      haptic([12, 40, 12]);
    } catch (e) {
      if (photoPath) await deleteLogged([], photoPath).catch(() => {});
      setPhase("review");
      // insert errors are already announced by the shared food hook
      if (!(e as Error).message.includes("Couldn't"))
        toast.error("Nothing was saved. Your review is kept.", {
          description: (e as Error).message,
        });
    } finally {
      savingRef.current = false;
    }
  };

  const undo = async () => {
    if (!logged) return;
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    const l = logged;
    setLogged(null);
    setPhase("review");
    try {
      await deleteLogged(l.ids, l.photoPath);
      invalidateFood(qc);
      toast("Removed from your diary. Your review is still here.");
    } catch (e) {
      setLogged(l);
      setPhase("success");
      toast.error("Couldn't undo", { description: (e as Error).message });
    }
  };

  // success → back to Nutrition, with Undo still available from the toast
  useEffect(() => {
    if (phase !== "success" || !logged) return;
    leaveTimer.current = window.setTimeout(() => {
      const l = logged;
      toast(`Added to ${mealLabel(l.meal)} · ${fmtKcal(l.kcal)} kcal`, {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await deleteLogged(l.ids, l.photoPath);
              invalidateFood(qc);
              toast("Removed");
            } catch (e) {
              toast.error("Couldn't undo", {
                description: (e as Error).message,
              });
            }
          },
        },
      });
      router.push("/nutrition");
    }, 2600);
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, [phase, logged, router, qc]);

  /* ----------------------------------------------------------- render */

  const showReview = phase === "review" || phase === "saving";
  const lookupDown =
    result && ["rate_limited", "error", "timeout"].includes(result.lookup.usda) && items.some((i) => i.provenance === "estimate" && i.kind === "generic");

  const logDetails = (
    <div className="space-y-3">
      <p className="eyebrow">Log to</p>
      <MealDatePicker meal={meal} onMeal={setMeal} date={date} onDate={setDate} />
      <div className="flex items-center justify-between gap-3 pt-1">
        <div>
          <p className="text-[14px] font-semibold text-fg">Save photo privately</p>
          <p className="text-[12px] text-fg-3">Only you can see it. Off means it&apos;s discarded.</p>
        </div>
        <Switch checked={savePhoto} onCheckedChange={setSavePhoto} label="Save photo privately" />
      </div>
    </div>
  );

  const footer =
    showReview && result && !result.not_food ? (
      <div className="chrome z-10 shrink-0 border-t border-line-hair px-4 pt-3 md:hidden" style={{ paddingBottom: "calc(12px + var(--safe-bottom))" }}>
        <ConfirmBar meal={meal} totals={totals} count={items.length} saving={phase === "saving"} onConfirm={confirm} />
      </div>
    ) : null;

  return (
    <FocusScreen
      title="Scan meal"
      eyebrow="Nutrition"
      right={
        <>
          {isMock && <DevMockBadge />}
          {showReview && (
            <Button variant="ghost" size="sm" onClick={retake} className="h-11 px-3 text-[14px]">
              <RotateCcw className="size-4" />
              Retake
            </Button>
          )}
        </>
      }
      footer={footer}
    >
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onInput}
        data-testid="scan-camera"
      />
      <input ref={libraryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={onInput} data-testid="scan-library" />

      {phase === "success" && logged ? (
        <Success logged={logged} onUndo={undo} onView={() => router.push("/nutrition")} />
      ) : (
        <div className={cn("px-4 pb-8 pt-4 md:px-0 md:pt-0", showReview && "lg:grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start lg:gap-8")}>
          {/* ------------------------------------------------ photo column */}
          <div className={cn(showReview ? "hidden lg:sticky lg:top-8 lg:block" : "mx-auto max-w-[560px]")}>
            <PhotoFrame src={photo?.dataUrl} scanning={phase === "analysing" || phase === "preparing"} dim={phase === "error"} />

            {showReview && result && !result.not_food && (
              <section className="card mt-4 hidden space-y-4 p-5 lg:block" aria-label="Where to log it">
                {logDetails}
                <div className="border-t border-line-hair pt-4">
                  <ConfirmBar meal={meal} totals={totals} count={items.length} saving={phase === "saving"} onConfirm={confirm} />
                </div>
              </section>
            )}

            {phase === "capture" && !photo && (
              <CaptureActions
                configured={configured}
                checking={!cap.data && !cap.isError}
                error={captureError}
                onCamera={() => cameraRef.current?.click()}
                onLibrary={() => libraryRef.current?.click()}
                notConfiguredMessage={cap.data && !cap.data.configured ? "Photo analysis isn't connected yet. It needs a Gemini API key on the server." : null}
              />
            )}

            {phase === "capture" && photo && (
              <div className="mt-5 space-y-3">
                <Button variant="primary" size="lg" block onClick={() => run(photo, answers)}>
                  Analyse photo
                </Button>
                <Button variant="secondary" block onClick={retake}>
                  Retake
                </Button>
              </div>
            )}

            {(phase === "analysing" || phase === "preparing") && (
              <div className="mt-6 text-center" role="status" aria-live="polite">
                <p className="t-h3">
                  {phase === "preparing" ? "Preparing your photo" : answers.length && result ? "Updating with your answers" : "Analyzing your meal"}
                </p>
                <p className="mt-1 text-[13px] text-fg-2">
                  <span className="num text-[15px] text-fg">{elapsed}</span> s · usually 5–15 s
                </p>
                <Button variant="secondary" className="mt-5 min-w-40" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            )}

            {phase === "error" && error && <ErrorPanel error={error} onRetry={() => photo && run(photo, answers, corrections())} onRetake={retake} />}
          </div>

          {/* ----------------------------------------------- review column */}
          {showReview && result && (
            <div className="min-w-0">
              <ReviewHeader photo={photo?.dataUrl} result={result} count={items.length} />

              {result.not_food ? (
                <div className="mt-5 card-inset flex flex-col items-center px-5 py-8 text-center">
                  <EmptyArt kind="amphora" size={64} />
                  <p className="mt-3 text-[15px] font-bold">No food found in this photo.</p>
                  <p className="mt-1 max-w-[32ch] text-[13px] text-fg-2">Retake it with the whole plate in the frame, or add the items yourself.</p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="secondary" onClick={retake}>
                      Retake
                    </Button>
                    <Button variant="outline-gold" onClick={() => setAddOpen(true)}>
                      Add an item
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-4 rounded-[14px] bg-s2 px-3.5 py-3">
                    <p className="flex gap-2 text-[13px] leading-relaxed text-fg-2">
                      <Info className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
                      <span>Photos can&apos;t show oils, sauces or exact weights. Adjust anything that looks off.</span>
                    </p>
                    {result.caveats.length > 0 && (
                      <ul className="mt-2 space-y-1 pl-6 text-[13px] text-fg-2">
                        {result.caveats.map((c) => (
                          <li key={c} className="list-disc marker:text-fg-3">
                            {c}
                          </li>
                        ))}
                      </ul>
                    )}
                    {lookupDown && (
                      <p className="mt-2 pl-6 text-[12px] text-fg-3">USDA didn&apos;t answer this time, so generic foods use the photo estimate.</p>
                    )}
                  </div>

                  {questions.length > 0 && (
                    <section className="mt-4 space-y-3" aria-label="Follow-up questions">
                      {questions.map((q) => (
                        <QuestionCard key={q.id} q={q} value={picked[q.id]} onPick={(o) => pick(q, o)} />
                      ))}
                      {Object.keys(picked).length > 0 && !questions.every((q) => picked[q.id]) && (
                        <Button variant="secondary" block className="border-lapis-line text-lapis-text" onClick={() => submitAnswers()}>
                          Update estimate
                        </Button>
                      )}
                    </section>
                  )}

                  {prepDirty && (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-[14px] border border-lapis-line bg-lapis-tint px-3.5 py-2.5">
                      <p className="text-[13px] text-lapis-text">You changed how something was cooked.</p>
                      <button
                        type="button"
                        onClick={() => photo && run(photo, answers, corrections())}
                        className="h-11 shrink-0 text-[13px] font-bold text-lapis-text"
                      >
                        Update estimate
                      </button>
                    </div>
                  )}

                  <section className="mt-5 space-y-3" aria-label="Identified items">
                    {items.map((it) => (
                      <ScanItemCard
                        key={it.key}
                        item={it}
                        onChange={(n) => update(it.key, n)}
                        onRemove={() => remove(it.key)}
                        onPrep={(p) => {
                          update(it.key, { ...it, preparation: p });
                          if (orig.current.has(it.key)) setPrepDirty(true);
                        }}
                      />
                    ))}
                    {!items.length && (
                      <p className="card-inset px-4 py-6 text-center text-[13px] text-fg-2">Every item was removed. Add one, or retake the photo.</p>
                    )}
                    <button
                      type="button"
                      onClick={() => setAddOpen(true)}
                      className="press-soft flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-line-strong text-[14px] font-bold text-fg-2 hover:text-fg"
                    >
                      <Plus className="size-[18px]" />
                      Add an item
                    </button>
                  </section>

                  <section className="mt-5 card-instrument p-3.5 sm:p-4 lg:hidden" aria-label="Where to log it">
                    {logDetails}
                  </section>

                  <div className="mt-5 hidden md:block md:sticky md:bottom-4 lg:hidden">
                    <div className="card p-4">
                      <ConfirmBar meal={meal} totals={totals} count={items.length} saving={phase === "saving"} onConfirm={confirm} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <AddItemSheet open={addOpen} onOpenChange={setAddOpen} onAdd={addItem} />
    </FocusScreen>
  );
}

/* ================================================================ pieces */

function CaptureActions({
  configured,
  checking,
  error,
  onCamera,
  onLibrary,
  notConfiguredMessage,
}: {
  configured: boolean;
  checking: boolean;
  error: string | null;
  onCamera: () => void;
  onLibrary: () => void;
  notConfiguredMessage: string | null;
}) {
  return (
    <div className="mt-4">
      <p className="text-center text-[14px] font-medium text-fg-2">Centre the plate. Include sauces and drinks.</p>
      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-[12px] border border-danger/30 bg-danger-tint px-3.5 py-3 text-[13px] text-fg" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          {error}
        </p>
      )}
      {notConfiguredMessage ? (
        <div className="mt-5 card-inset p-4">
          <p className="text-[15px] font-bold text-fg">AI photo analysis is off</p>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{notConfiguredMessage} Manual logging works without it.</p>
          <Button asChild variant="secondary" block className="mt-4">
            <Link href="/nutrition?add=1">
              <PenLine className="size-[18px]" />
              Log manually
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <Button variant="primary" size="lg" block shine onClick={onCamera} disabled={!configured || checking}>
            <Camera className="size-5" />
            Take photo
          </Button>
          <Button variant="secondary" block onClick={onLibrary} disabled={!configured || checking}>
            <ImageUp className="size-[18px]" />
            Upload from library
          </Button>
        </div>
      )}
      {!notConfiguredMessage && (
        <div className="mt-5 flex items-center justify-center gap-1 text-[13px] font-bold">
          <Link href="/nutrition?add=1" className="inline-flex h-11 items-center gap-1.5 px-3 text-fg-2 hover:text-fg">
            <PenLine className="size-4" />
            Log manually
          </Link>
          <span className="text-fg-dis" aria-hidden>
            ·
          </span>
          <Link href="/nutrition/coach" className="inline-flex h-11 items-center gap-1.5 px-3 text-fg-2 hover:text-fg">
            <MessagesSquare className="size-4" />
            Describe it instead
          </Link>
        </div>
      )}
      <p className="mx-auto mt-3 max-w-[40ch] text-center text-[12px] leading-relaxed text-fg-3">
        You review every item before anything is saved. Photos are analysed, then discarded unless you choose to keep them privately.
      </p>
    </div>
  );
}

function ReviewHeader({ photo, result, count }: { photo?: string; result: PhotoAnalysis; count: number }) {
  return (
    <div className="flex items-center gap-3.5">
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
        <img src={photo} alt="" className="size-16 shrink-0 rounded-[14px] border border-line object-cover lg:hidden" />
      )}
      <div className="min-w-0">
        <h2 className="t-h2 text-[22px]">{result.not_food ? "Nothing found" : `${count} ${count === 1 ? "item" : "items"} found`}</h2>
        {!result.not_food && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <EstimateBadge confidence={result.overall_confidence}>Estimate</EstimateBadge>
            <span className="text-[12px] text-fg-3">Check portions before adding.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionCard({ q, value, onPick }: { q: AIQuestion; value?: string; onPick: (o: string) => void }) {
  return (
    <div className="rounded-[16px] border border-lapis-line bg-lapis-tint p-3.5">
      <div className="flex items-center gap-2">
        <SuggestedBadge>Quick question</SuggestedBadge>
      </div>
      <p className="mt-2 text-[15px] font-semibold leading-snug text-fg">{q.question}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={q.question}>
        {q.options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(o)}
              className={cn(
                "press inline-flex h-11 items-center rounded-full border px-4 text-[14px] font-semibold transition-colors",
                on ? "border-lapis bg-lapis/20 text-fg" : "border-lapis-line bg-bg/40 text-lapis-text hover:bg-lapis/10",
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmBar({
  meal,
  totals,
  count,
  saving,
  onConfirm,
}: {
  meal: Meal;
  totals: { calories: number; protein: number; carbs: number; fat: number };
  count: number;
  saving: boolean;
  onConfirm: () => void;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Meal total · {mealLabel(meal)}</p>
          <MacroTrio m={totals} className="mt-1.5" />
        </div>
        <p className="shrink-0 leading-none">
          <span className="num-md">{fmtKcal(totals.calories)}</span>
          <span className="unit">kcal</span>
        </p>
      </div>
      <Button variant="primary" size="lg" block className="mt-3 px-3 tracking-[0.06em]" onClick={onConfirm} loading={saving} disabled={!count}>
        Confirm &amp; add to daily nutrition
      </Button>
    </div>
  );
}

function ErrorPanel({ error, onRetry, onRetake }: { error: ScanError; onRetry: () => void; onRetake: () => void }) {
  const notConfigured = error.code === "not_configured";
  const quota = error.code === "quota";
  return (
    <div className="mt-5" role="alert">
      <div className="rounded-[16px] border border-danger/30 bg-danger-tint p-4">
        <p className="text-[15px] font-bold text-fg">{notConfigured ? "AI photo analysis is off" : "Analysis failed. Your photo is still here."}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{error.message}</p>
      </div>
      <div className="mt-4 grid gap-3">
        {!notConfigured && !quota && (
          <Button variant="primary" size="lg" block onClick={onRetry}>
            Retry
          </Button>
        )}
        <Button asChild variant="secondary" block>
          <Link href="/nutrition?add=1">
            <PenLine className="size-[18px]" />
            Log manually
          </Link>
        </Button>
        <Button variant="ghost" block onClick={onRetake}>
          Use another photo
        </Button>
      </div>
    </div>
  );
}

function Success({ logged, onUndo, onView }: { logged: Logged; onUndo: () => void; onView: () => void }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center md:min-h-[60dvh]" role="status" aria-live="polite">
      <div className="relative grid size-28 place-items-center">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(closest-side, rgb(213 172 103 / .22), transparent)",
          }}
          aria-hidden
        />
        <svg viewBox="0 0 96 96" className="relative size-24" aria-hidden>
          <defs>
            <linearGradient id="scan-ok" x1="10" y1="10" x2="86" y2="86" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#F3DDA8" />
              <stop offset=".45" stopColor="#D5AC67" />
              <stop offset="1" stopColor="#A97E40" />
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r="40" fill="none" stroke="url(#scan-ok)" strokeWidth="3" strokeLinecap="round" className="ok-ring" />
          <path
            d="M31 49.5 43 61l23-25"
            fill="none"
            stroke="url(#scan-ok)"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ok-check"
          />
        </svg>
        <style>{`.ok-ring{stroke-dasharray:252;stroke-dashoffset:252;transform:rotate(-90deg);transform-origin:center;animation:ok-draw 600ms var(--ease-gold) forwards}.ok-check{stroke-dasharray:56;stroke-dashoffset:56;animation:ok-draw 380ms var(--ease-out) 420ms forwards}@keyframes ok-draw{to{stroke-dashoffset:0}}@media (prefers-reduced-motion:reduce){.ok-ring,.ok-check{animation:none;stroke-dashoffset:0}}`}</style>
      </div>
      <h2 className="t-h2 mt-5 text-[26px]">Added to {mealLabel(logged.meal)}</h2>
      <p className="mt-1.5 text-[14px] text-fg-2">
        <span className="num text-[16px] text-fg">{fmtKcal(logged.kcal)}</span> kcal · {logged.count} {logged.count === 1 ? "item" : "items"}
      </p>
      <div className="mt-7 grid w-full max-w-[320px] grid-cols-2 gap-3">
        <Button variant="outline-gold" onClick={onUndo}>
          Undo
        </Button>
        <Button variant="secondary" onClick={onView}>
          View today
        </Button>
      </div>
      <p className="mt-4 text-[12px] text-fg-3">Returning to Nutrition…</p>
    </div>
  );
}

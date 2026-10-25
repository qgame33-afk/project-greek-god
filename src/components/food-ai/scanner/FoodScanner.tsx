"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ImageIcon, Info, Keyboard, Plus, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiChip, AiMark } from "@/components/ui/ai-chip";
import { Segmented, Switch } from "@/components/ui/controls";
import { InfoButton } from "@/components/ui/details-sheet";
import { EstimateCard } from "@/components/ui/estimate-card";
import { cn } from "@/lib/cn";
import { relativeDay } from "@/lib/dates";
import { defaultEatenAt } from "@/lib/data/meals-model";
import { useFoodEntries } from "@/lib/data/nutrition";
import { useProfile } from "@/lib/data/profile";
import { ifYouAdd } from "@/lib/fuel/consequence";
import { haptic } from "@/lib/haptics";
import { parseAppPrefs } from "@/lib/prefs";
import { mealForTime, MEALS, type Meal } from "@/lib/nutrition";
import { isOffline, newId, saveErrorKind, useToday, useUser } from "@/lib/data/core";
import type { AIFoodItem, AIQuestion, PhotoAnalysis } from "@/lib/ai/food-schemas";
import { entriesFromItems, isLoggable } from "@/lib/ai/food-log";
import { toEditable, type EditableItem } from "@/lib/ai/food-edit";
import { usdaDownNote } from "@/lib/ai/lookup-note";
import { sumMacroSets } from "@/lib/food/normalize";
import { FoodAIRequestError, analysePhoto, getCapability, type PhotoRequest } from "../api";
import { ImagePrepError, dataUrlToBlob, prepareImage, type PreparedImage } from "../image";
import { removeOrphanMealPhotos } from "@/lib/data/nutrition";
import { deleteLogged, groupRows, invalidateFood, uploadMealPhoto, useInsertEntries } from "../hooks";
import { ConfidencePips, DevMockBadge, FocusScreen, MacroTrio, MealDatePicker, fmtKcal } from "../parts";
import { AddItemSheet } from "../AddItemSheet";
import { detectBarcode, lookupBarcode, ProductSheet, TypeBarcodeSheet } from "./Barcode";
import { PhotoFrame } from "./PhotoFrame";
import type { SearchResult } from "@/lib/nutrition-ui/search";
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
/**
 * One save of this review: its group id, a row id per item and the uploaded photo, kept
 * (also across a reload) until the diary confirms the outcome, so a retry after a dropped
 * answer finishes the same save and can never log the meal twice.
 */
interface Attempt {
  groupId: string;
  ids: Record<string, string>;
  photoPath: string | null;
  /** A save was sent; its outcome is unknown until the diary is asked. */
  sent: boolean;
}

const DRAFT_KEY = "pgg.scan.draft.v1";
const mealLabel = (m: Meal) => MEALS.find((x) => x.key === m)?.label ?? m;

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
  attempt?: Attempt | null;
  at: number;
}

export function FoodScanner() {
  const router = useRouter();
  const qc = useQueryClient();
  const todayDate = useToday();
  const { userId } = useUser();
  const { insert } = useInsertEntries();
  // a meal logged for another day is stamped at HIS time for it (profiles.prefs.day, §4.4)
  const { profile } = useProfile();
  const schedule = useMemo(() => parseAppPrefs(profile?.prefs).day, [profile?.prefs]);
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
  const [rerunning, setRerunning] = useState(false);
  const [mode, setMode] = useState<"photo" | "barcode">("photo");
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeNote, setTypeNote] = useState<string | null>(null);
  const [product, setProduct] = useState<SearchResult | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [looking, setLooking] = useState(false);

  const orig = useRef(new Map<string, { name: string; prep: string }>());
  const removed = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const leaveTimer = useRef<number | null>(null);
  const restored = useRef(false);

  const totals = useMemo(() => sumMacroSets(items.map((i) => i.macros)), [items]);
  // the day this meal would be logged to, for the "If you add it" line
  const day = useFoodEntries(date);
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
      attempt.current = d.attempt ?? null;
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
          attempt: attempt.current,
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
      // keep the user's portion edits across a re-analysis
      if (it.grams && it.base.grams && Math.abs(it.grams - it.base.grams) >= 1) notes.push(`The ${it.name} portion is about ${Math.round(it.grams)} g.`);
    }
    for (const r of removed.current) notes.push(`There is no ${r}.`);
    return notes.join(" ").slice(0, 480) || undefined;
  }, [items]);

  const run = useCallback(
    /** `rerun`: refining an existing review (answers, corrections) — a failure keeps that review. */
    async (img: PreparedImage, nextAnswers: Answer[], context?: string, rerun = false) => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setError(null);
      setRerunning(rerun);
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
        if (rerun) {
          // the earlier analysis is still valid: go back to it rather than stranding the user
          setPhase("review");
          toast.error("Couldn't update the estimate. Your review is unchanged.", { description: err.message });
          return;
        }
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
    if (mode === "barcode") void onBarcodeFile(f);
    else void onFile(f);
  };

  /* ---------------------------------------------------------- barcode */

  const findProduct = async (code: string) => {
    if (isOffline()) {
      setCaptureError("You're offline. Looking up a barcode needs a connection.");
      return;
    }
    setTypeOpen(false);
    setLooking(true);
    setCaptureError(null);
    try {
      const hit = await lookupBarcode(code);
      if (!hit) {
        setCaptureError(`No product with barcode ${code} in the food database. Search for it by name instead.`);
        return;
      }
      setProduct(hit);
      setProductOpen(true);
    } catch (e) {
      setCaptureError((e as Error).message);
    } finally {
      setLooking(false);
    }
  };

  const onBarcodeFile = async (file: File | undefined) => {
    if (!file) return;
    setCaptureError(null);
    setLooking(true);
    const code = await detectBarcode(file);
    setLooking(false);
    if (code === "unsupported") {
      setTypeNote("This phone can't read barcodes from a photo. Type the numbers under the bars.");
      setTypeOpen(true);
    } else if (!code) setCaptureError("No barcode found in that photo. Get closer, or type the number.");
    else await findProduct(code);
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase(result ? "review" : "capture");
  };

  const retake = () => {
    abortRef.current?.abort();
    dropAttempt();
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
    void run(photo, merged, corrections(), true);
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

  /** Forget the current save attempt; a photo it uploaded is removed unless a diary row uses it. */
  const dropAttempt = () => {
    const a = attempt.current;
    attempt.current = null;
    if (a?.photoPath) void removeOrphanMealPhotos([a.photoPath]).catch(() => {});
  };

  const succeed = (ids: string[], kcal: number, photoPath: string | null) => {
    attempt.current = null;
    setLogged({ ids, photoPath, meal, kcal, count: ids.length });
    clearDraft();
    setPhase("success");
    haptic([12, 40, 12]);
  };

  const confirm = async (opts: { withoutPhoto?: boolean } = {}) => {
    if (savingRef.current || !items.length) return;
    if (isOffline()) {
      toast.error("You're offline. Nothing was saved.", { description: "Your review is kept. Confirm again once you're back online." });
      return;
    }
    savingRef.current = true;
    setPhase("saving");
    const a = (attempt.current ??= { groupId: newId(), ids: {}, photoPath: null, sent: false });
    try {
      // an earlier try whose answer was lost may already be in the diary: never add it twice
      if (a.sent) {
        const landed = await groupRows(a.groupId);
        if (landed === null) throw new Error("You're offline or the connection dropped.");
        if (landed.length) {
          succeed(
            landed.map((r) => r.id),
            landed.reduce((t, r) => t + r.calories, 0),
            a.photoPath,
          );
          return;
        }
      }
      if (opts.withoutPhoto && a.photoPath) {
        await deleteLogged([], a.photoPath).catch(() => {});
        a.photoPath = null;
      }
      if (savePhoto && !opts.withoutPhoto && photo && userId && !a.photoPath) {
        try {
          a.photoPath = await uploadMealPhoto(userId, date, dataUrlToBlob(photo.dataUrl));
        } catch {
          // the user asked to keep it: ask, never drop it silently
          setPhase("review");
          toast.error("The photo couldn't be saved, so nothing was added yet.", {
            description: "Try Confirm again, or add the meal without the photo.",
            duration: 10_000,
            action: { label: "Add without photo", onClick: () => void confirm({ withoutPhoto: true }) },
          });
          return;
        }
      }
      const keys = items.filter(isLoggable).map((i) => i.key);
      let n = 0;
      const rows = entriesFromItems(items, {
        meal,
        localDate: date,
        eatenAt: defaultEatenAt(date, todayDate, meal, new Date(), schedule),
        groupId: a.groupId,
        source: "photo_ai",
        photoPath: a.photoPath,
        newId: () => {
          const k = keys[n++] ?? `extra-${n}`;
          return (a.ids[k] ??= newId());
        },
      });
      if (!rows.length) throw new Error("Every item is at 0 kcal. Adjust a portion or add an item.");
      a.sent = true;
      const inserted = await insert(rows);
      succeed(
        inserted.map((r) => r.id),
        inserted.reduce((t, r) => t + (Number(r.calories) || 0), 0),
        a.photoPath,
      );
    } catch (e) {
      setPhase("review");
      if (a.sent && saveErrorKind(e) === "offline") {
        // the diary couldn't be asked whether it saved: keep this attempt for the retry
        toast.error("The connection dropped. Your review is kept.", { description: "Confirm again once you're online: the meal can't be added twice." });
      } else {
        // certainly nothing saved
        dropAttempt();
        toast.error("Nothing was saved. Your review is kept.", { description: (e as Error).message });
      }
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

  // success → back to Nutrition (automatically or via "View today"), with Undo still
  // available from the toast once the success screen is gone
  const leave = useCallback(
    (l: Logged) => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
      toast(`Added to ${mealLabel(l.meal)} · ${fmtKcal(l.kcal)} kcal`, {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await deleteLogged(l.ids, l.photoPath);
              invalidateFood(qc);
              toast("Removed from your diary");
            } catch (e) {
              toast.error("Couldn't undo", {
                description: (e as Error).message,
              });
            }
          },
        },
      });
      router.push("/nutrition");
    },
    [qc, router],
  );

  useEffect(() => {
    if (phase !== "success" || !logged) return;
    leaveTimer.current = window.setTimeout(() => leave(logged), 2600);
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, [phase, logged, leave]);

  /* ----------------------------------------------------------- render */

  const showReview = phase === "review" || phase === "saving";
  const saving = phase === "saving";
  const usdaNote = result ? usdaDownNote(result.lookup.usda, items, "photo") : null;
  // what this meal does to the day it's logged to: the day's log + the estimate (CALC, never before the log has loaded)
  const consequence =
    day.hasData && items.length ? ifYouAdd({ kcal: day.totals.calories, protein: day.totals.protein }, { kcal: totals.calories, protein: totals.protein }, "add") : null;
  const dayWord = date === todayDate ? "today" : relativeDay(date, todayDate).toLowerCase();
  const consequenceLine = consequence && (
    <>
      <span aria-hidden>{consequence.text}</span>
      <span className="sr-only">{consequence.spoken.replace("today", dayWord)}</span>
      <InfoButton how={`${consequence.explain} (${dayWord}'s log plus this estimate)`} />
    </>
  );
  const confirmButton = (
    <Button
      variant="primary"
      size="lg"
      block
      onClick={() => void confirm()}
      loading={saving}
      disabled={!items.length}
      aria-label={saving ? "Saving" : `Add ${items.length} ${items.length === 1 ? "item" : "items"} as ${mealLabel(meal).toLowerCase()}`}
    >
      {/* a short label while saving, so the spinner never squeezes the button's padding */}
      {saving ? "Saving" : `Add as ${mealLabel(meal).toLowerCase()}`}
    </Button>
  );

  // phones: the confirm key stays on the bottom edge under the sheet, with the consequence line over it
  const footer =
    showReview && result && !result.not_food ? (
      <div className="z-10 shrink-0 bg-bg px-gutter pt-2.5 md:hidden" style={{ paddingBottom: "calc(12px + var(--safe-bottom))" }}>
        {consequenceLine && <p className="t-label mb-2 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">{consequenceLine}</p>}
        {confirmButton}
      </div>
    ) : null;

  const capturing = !showReview && phase !== "success";

  return (
    <FocusScreen
      title="Scan food"
      close
      backLabel="Close the scanner"
      right={
        <>
          {isMock && <DevMockBadge />}
          {showReview && (
            <button type="button" onClick={retake} className="press t-label inline-flex h-11 items-center gap-1.5 rounded-pill px-3 font-semibold text-fg">
              <RotateCcw className="size-4" strokeWidth={1.9} aria-hidden />
              Retake
            </button>
          )}
        </>
      }
      footer={footer}
      bodyClassName={capturing ? "max-md:flex max-md:flex-col" : undefined}
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
        <Success logged={logged} onUndo={undo} onView={() => leave(logged)} />
      ) : capturing ? (
        /* ------------------------------------------- viewfinder + controls */
        <div className="flex min-h-[calc(100dvh-8rem)] flex-1 flex-col md:mx-auto md:min-h-0 md:max-w-[35rem]">
          <div className="flex min-h-[15rem] flex-1 flex-col items-center justify-center gap-5 px-12">
            <PhotoFrame src={photo?.dataUrl} scanning={phase === "analysing" || phase === "preparing"} dim={phase === "error"} />
            {phase === "capture" && !photo && <p className="t-body text-center text-fg-2">{mode === "barcode" ? "Fit the barcode in the frame" : "Fit the whole plate in the frame"}</p>}
          </div>
          <div className="shrink-0 px-gutter pt-4 md:px-0" style={{ paddingBottom: "calc(16px + var(--safe-bottom))" }}>
            {phase === "capture" && !photo && (
              <CaptureActions
                mode={mode}
                onMode={(m) => {
                  setMode(m);
                  setCaptureError(null);
                }}
                configured={configured}
                checking={!cap.data && !cap.isError}
                busy={looking}
                error={captureError}
                onCamera={() => cameraRef.current?.click()}
                onLibrary={() => libraryRef.current?.click()}
                onType={() => {
                  setTypeNote(null);
                  setTypeOpen(true);
                }}
                notConfiguredMessage={cap.data && !cap.data.configured ? "Photo estimates aren't set up yet. It needs an AI key on the server." : null}
              />
            )}

            {phase === "capture" && photo && (
              <div className="flex flex-col gap-2">
                <Button variant="primary" size="lg" block onClick={() => run(photo, answers)}>
                  Read this photo
                </Button>
                <Button variant="ghost" size="md" block onClick={retake}>
                  Retake
                </Button>
              </div>
            )}

            {(phase === "analysing" || phase === "preparing") && (
              <div className="text-center" role="status" aria-live="polite">
                <p className="t-row">{phase === "preparing" ? "Getting your photo ready" : rerunning ? "Updating with your answers" : "Reading your plate"}</p>
                <p className="t-label mt-1 tabular-nums">{elapsed} s · usually 5–15 s</p>
                <Button variant="secondary" size="lg" className="mt-4 min-w-44" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            )}

            {phase === "error" && error && <ErrorPanel error={error} onRetry={() => photo && run(photo, answers, corrections())} onRetake={retake} />}
          </div>
        </div>
      ) : (
        /* ------------------------------------------------ the result sheet */
        <div className="lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <div className="max-md:sticky max-md:top-0 max-md:h-[min(40dvh,20rem)] md:mb-5 lg:sticky lg:top-8 lg:mb-0">
            <PhotoFrame fill src={photo?.dataUrl} />
          </div>

          {result && (
            <div className="relative z-10 min-w-0 max-md:-mt-7 max-md:rounded-t-sheet max-md:bg-bg max-md:px-3 max-md:pb-6 max-md:pt-3">
              {result.not_food ? (
                <section className="flex flex-col items-center px-5 py-8 text-center" aria-labelledby="scan-nothing">
                  <h2 id="scan-nothing" className="t-section">
                    No food found in this photo
                  </h2>
                  <p className="t-label mt-1 max-w-[32ch]">Retake it with the whole plate in the frame, or add the items yourself.</p>
                  <div className="mt-5 grid w-full max-w-[20rem] grid-cols-2 gap-2">
                    <Button variant="secondary" size="lg" onClick={retake}>
                      Retake
                    </Button>
                    <Button variant="secondary" size="lg" onClick={() => setAddOpen(true)}>
                      Add an item
                    </Button>
                  </div>
                </section>
              ) : (
                <EstimateCard
                  tag={
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <AiChip status={saving ? "Saving" : "Not saved yet"} />
                      {result.overall_confidence != null && <ConfidencePips confidence={result.overall_confidence} />}
                    </span>
                  }
                  status={saving ? "saving" : "unsaved"}
                  title={estimateTitle(items)}
                  items={
                    <>
                      {questions.length > 0 && (
                        <section className="mb-1 space-y-4 border-b border-line pb-4" aria-label="Quick questions">
                          {questions.map((q) => (
                            <QuestionChips key={q.id} q={q} value={picked[q.id]} onPick={(o) => pick(q, o)} />
                          ))}
                          {Object.keys(picked).length > 0 && (
                            <Button variant="secondary" size="md" block onClick={() => submitAnswers()}>
                              Update estimate
                            </Button>
                          )}
                        </section>
                      )}

                      {prepDirty && (
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 rounded-tile bg-control px-3.5 py-1">
                          <p className="t-label py-2">You changed how something was cooked.</p>
                          <button
                            type="button"
                            onClick={() => photo && run(photo, answers, corrections(), true)}
                            className="press t-label h-11 shrink-0 font-semibold text-fg underline underline-offset-4"
                          >
                            Update estimate
                          </button>
                        </div>
                      )}

                      <div className="divide-y divide-line" aria-label="Identified items" role="group">
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
                      </div>
                      {!items.length && <p className="t-label py-6 text-center">Every item was removed. Add one, or retake the photo.</p>}
                      <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="press-soft t-label mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-control font-semibold text-fg"
                      >
                        <Plus className="size-[1.125rem]" strokeWidth={1.9} aria-hidden />
                        Add an item
                      </button>
                    </>
                  }
                  consequence={
                    <div className="w-full">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="t-label">Meal total</p>
                        <p className="t-hero tabular-nums" data-testid="scan-total-kcal">
                          {fmtKcal(totals.calories)}
                          <span className="unit">kcal</span>
                        </p>
                      </div>
                      <MacroTrio m={totals} className="mt-1" />
                      {consequenceLine && <p className="t-label mt-2.5 hidden flex-wrap items-center gap-x-2 gap-y-1 md:flex">{consequenceLine}</p>}
                    </div>
                  }
                  note={
                    <>
                      <p className="flex gap-2">
                        <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.9} aria-hidden />
                        <span>Photos can&apos;t show oils, sauces or exact weights. Adjust anything that looks off.</span>
                      </p>
                      {result.caveats.length > 0 && (
                        <ul className="mt-1.5 space-y-1 pl-6">
                          {result.caveats.map((c) => (
                            <li key={c} className="list-disc">
                              {c}
                            </li>
                          ))}
                        </ul>
                      )}
                      {usdaNote && <p className="mt-1.5 pl-6">{usdaNote}</p>}
                    </>
                  }
                  actions={
                    <>
                      <section className="space-y-2.5 border-t border-line pt-3" aria-label="Where to log it">
                        <p className="t-label">Add to</p>
                        <MealDatePicker meal={meal} onMeal={setMeal} date={date} onDate={setDate} onInset />
                        <div className="flex min-h-11 items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="t-row">Save photo privately</p>
                            <p className="t-label">Only you can see it. Off means it&apos;s thrown away.</p>
                          </div>
                          <Switch checked={savePhoto} onCheckedChange={setSavePhoto} label="Save photo privately" />
                        </div>
                      </section>
                      <div className="mt-2 hidden md:block">{confirmButton}</div>
                    </>
                  }
                />
              )}
            </div>
          )}
        </div>
      )}

      <AddItemSheet open={addOpen} onOpenChange={setAddOpen} onAdd={addItem} />
      <TypeBarcodeSheet open={typeOpen} onOpenChange={setTypeOpen} note={typeNote} onCode={(c) => void findProduct(c)} />
      <ProductSheet product={product} open={productOpen} onOpenChange={setProductOpen} />
    </FocusScreen>
  );
}

/* ================================================================ pieces */

/** "Grilled chicken, rice + 2 more" — the names, so the card says what it is about. */
function estimateTitle(items: readonly EditableItem[]): string {
  if (!items.length) return "No items";
  const names = items.map((i) => i.name.trim() || "Food item");
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} + ${names.length - 2} more`;
}

function CaptureActions({
  mode,
  onMode,
  configured,
  checking,
  busy,
  error,
  onCamera,
  onLibrary,
  onType,
  notConfiguredMessage,
}: {
  mode: "photo" | "barcode";
  onMode: (m: "photo" | "barcode") => void;
  configured: boolean;
  checking: boolean;
  busy: boolean;
  error: string | null;
  onCamera: () => void;
  onLibrary: () => void;
  onType: () => void;
  notConfiguredMessage: string | null;
}) {
  const barcode = mode === "barcode";
  // a barcode is read by the phone and looked up in the food database: no AI key needed
  const off = busy || (!barcode && (!configured || checking));
  return (
    <div className="flex flex-col items-center">
      <Segmented<"photo" | "barcode">
        value={mode}
        onChange={onMode}
        ariaLabel="What to scan"
        className="w-full max-w-[16rem]"
        options={[
          { value: "photo", label: "Photo" },
          { value: "barcode", label: "Barcode" },
        ]}
      />
      {error && (
        <p className="t-label mt-4 w-full rounded-tile-lg bg-card px-4 py-3 text-fg" role="alert">
          {error}
        </p>
      )}
      {!barcode && notConfiguredMessage ? (
        <div className="mt-4 w-full rounded-card bg-card p-5">
          <p className="t-row">{notConfiguredMessage}</p>
          <p className="t-label mt-1">Search, barcodes and typing your food work without it.</p>
          <Button asChild variant="secondary" size="lg" block className="mt-4">
            <Link href="/nutrition?add=1&tab=search">Search food instead</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid w-full grid-cols-[1fr_auto_1fr] items-center">
          <button type="button" onClick={onLibrary} disabled={off} aria-label={barcode ? "Choose a photo of a barcode" : "Choose a photo"} className="press grid size-14 place-items-center justify-self-start rounded-full bg-card text-fg disabled:opacity-40">
            <ImageIcon className="size-6" strokeWidth={1.9} aria-hidden />
          </button>
          {/* the shutter: a 76 px white ring (a camera control, not the gold action) */}
          <button
            type="button"
            onClick={onCamera}
            disabled={off}
            aria-label={barcode ? "Take a photo of the barcode" : "Take a photo"}
            aria-busy={busy || undefined}
            className="press grid size-[76px] place-items-center rounded-full border-4 border-fg disabled:opacity-40"
          >
            <span className="block size-[60px] rounded-full bg-fg" />
          </button>
          {barcode ? (
            <button type="button" onClick={onType} aria-label="Type the barcode instead" className="press grid size-14 place-items-center justify-self-end rounded-full bg-card text-fg">
              <Keyboard className="size-6" strokeWidth={1.9} aria-hidden />
            </button>
          ) : (
            <Link href="/nutrition?add=1&tab=search" aria-label="Type it instead" className="press grid size-14 place-items-center justify-self-end rounded-full bg-card text-fg">
              <Search className="size-6" strokeWidth={1.9} aria-hidden />
            </Link>
          )}
        </div>
      )}
      <p className="t-label mt-4 text-center" aria-live="polite">
        {busy ? "Looking it up" : barcode ? "Looked up in the food database. Nothing saves until you tap Add." : "AI estimates it. Nothing saves until you tap Add."}
      </p>
    </div>
  );
}

/** One of the AI's quick questions (0–2 per scan): the question and its answers as chips. Selection is white. */
function QuestionChips({ q, value, onPick }: { q: AIQuestion; value?: string; onPick: (o: string) => void }) {
  const id = `q-${q.id}`;
  return (
    <div>
      <p id={id} className="t-row">
        {q.question}
      </p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-labelledby={id}>
        {q.options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(o)}
              className={cn("press t-label inline-flex h-11 items-center rounded-pill px-4 font-semibold", on ? "bg-fg text-bg" : "bg-control text-fg")}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ErrorPanel({ error, onRetry, onRetake }: { error: ScanError; onRetry: () => void; onRetake: () => void }) {
  const notConfigured = error.code === "not_configured";
  // sending the same photo again won't fix these
  const canRetry = !["not_configured", "quota", "too_large", "unauthorized"].includes(error.code);
  return (
    <div role="alert">
      <div className="rounded-card bg-card p-5">
        <p className="t-row">{notConfigured ? "Photo estimates aren't set up yet." : "Couldn't read it. Your photo is still here."}</p>
        <p className="t-label mt-1">{error.message}</p>
      </div>
      <div className="mt-3 grid gap-2">
        {canRetry && (
          <Button variant="primary" size="lg" block onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button asChild variant="secondary" size="lg" block>
          <Link href="/nutrition?add=1&tab=search">Search food instead</Link>
        </Button>
        <Button variant="ghost" size="md" block onClick={onRetake}>
          Use another photo
        </Button>
      </div>
    </div>
  );
}

function Success({ logged, onUndo, onView }: { logged: Logged; onUndo: () => void; onView: () => void }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center md:min-h-[60dvh]" role="status" aria-live="polite">
      <span className="grid size-16 place-items-center rounded-full bg-fg text-bg" aria-hidden>
        <Check className="size-8" strokeWidth={2.4} />
      </span>
      <h2 className="t-title mt-5">Added as {mealLabel(logged.meal).toLowerCase()}</h2>
      <p className="t-label mt-1.5 flex flex-wrap items-center justify-center gap-2">
        <span className="tabular-nums">
          {fmtKcal(logged.kcal)} kcal · {logged.count} {logged.count === 1 ? "item" : "items"}
        </span>
        <AiMark />
      </p>
      <div className="mt-7 grid w-full max-w-[20rem] grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" onClick={onUndo}>
          Undo
        </Button>
        <Button variant="secondary" size="lg" onClick={onView}>
          See today
        </Button>
      </div>
      <p className="t-label mt-4">Back to Food in a moment</p>
    </div>
  );
}

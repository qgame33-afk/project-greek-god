"use client";

// The live workout (docs/DESIGN-V3-SIMPLE.md §4.2). This component is the controller: it keeps
// every piece of the workout's state and logic exactly as it was (the outbox-backed set writes,
// the device copy and multi-device resync, the keypad draft and validation, logging, rest,
// finish and discard) and hands plain values and callbacks to the presentational parts in
// ./live/*. One lift is on screen at a time: the set view (NumberCards + "Log set N"), then the
// rest view (the ring, or the win card or the overlap tip in its place) until the next log.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronRight, Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberCard } from "@/components/ui/number-card";
import { useMediaQuery } from "@/components/ui/sheet";
import { WinCard } from "@/components/ui/win-card";
import { useOverlapAdvice } from "@/components/training/hooks";
import { cn } from "@/lib/cn";
import { friendlyError, must, sb, useToday, useUser } from "@/lib/data/core";
import { drained, useOutbox } from "@/lib/data/outbox";
import { useProfile } from "@/lib/data/profile";
import { useTemplates } from "@/lib/data/training";
import { addDays, dayName } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import { useReadiness } from "@/lib/recovery/hooks";
import { getExercise } from "@/lib/training/library";
import { suggestOptional, templateDef, templateLabels, visibleExercises, visibleWarmup } from "@/lib/training/programs";
import { groupSessions, modeRir, plannedSetCount, suggest, type Mode, type PastSet } from "@/lib/training/progression";
import type { LibraryExercise, TemplateExercise } from "@/lib/training/types";
import { formatLoad, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { muscleLabel, repRange } from "@/lib/workout/copy";
import { changedPlate, endsAt as endsAtOf, gymDate, runningBest } from "@/lib/workout/gym";
import { autoAdvances, nudgeStep, padPress, type PadKey } from "@/lib/workout/numpad";
import { platesFor } from "@/lib/workout/plates";
import { classifyLog, prSetIds, sessionRecords, type PriorBest } from "@/lib/workout/pr";
import { parsePrefs } from "@/lib/workout/prefs";
import { defaultRestSec, startRest } from "@/lib/workout/rest";
import {
  cellText,
  columnFor,
  currentGroupKey,
  defaultTargets,
  firstOpenSet,
  ghostFor,
  groupSets,
  groupState,
  hasWeight,
  isGroupComplete,
  isTimed,
  nextPendingGroupKey,
  noteCarrier,
  relocateNotes,
  renumber,
  resolveLog,
  retarget,
  rowErrorFields,
  sessionCounts,
  setLabel,
  setLoadText,
  templateExerciseSets,
  trackingFor,
  upNextSet,
  validateCell,
  withCellError,
  zeroLoadOk,
  type CellErrors,
  type ExerciseGroup,
  type Ghost,
} from "@/lib/workout/session";
import { durationSec, effectiveEnd, isStaleSession, lastCompletedAt, sessionTotals } from "@/lib/workout/summary";
import { emptyJournal, isNetworkError } from "@/lib/workout/sync";
import { recordReps } from "@/lib/workout/timing";
import type { CellField, Tracking, WSession, WSet } from "@/lib/workout/types";
import { unlockAudio } from "./audio";
import { applyPush, fetchPriorBests, fetchPriorHistory, invalidateTraining, liveKey, mergeLive, newSetRow, usePriorBests, usePriorHistory, useSessionOps, useSessionSync, type LiveData } from "./data";
import { useWakeLock } from "./live/wake";
import { rememberPlanned } from "./inscription/flags";
import { Dock, OfflineStrip, TopBar } from "./live/chrome";
import { KeypadSheet, type PlatesInfo } from "./live/KeypadSheet";
import { LiftsSheet, NotesTodaySheet, type LiftRowData, type OptionalRowData } from "./live/LiftsSheet";
import { FinishSheet, SetSheet, StaleSheet, TipCard, TipSheet, type SetRowData } from "./live/panels";
import { CompactRest, RestControls, RestRing, TankRow } from "./live/rest-view";
import { HistorySheet, HowToSheet, MoreSheet, NoteSheet, PickSheet, WarmupSheet } from "./live/sheets";
import { aimLine, finishLine, lastTimeText, rangeText, tipRows, tipTitle, weightUnit, weightUnitSpoken, winSentence, workUnit } from "./live/words";
import { restActions, RestWatcher } from "./rest";
import { clearSessionStores, getDeviceCopy, getRest, markMoment, markTipFired, setDeviceCopy, setRest, setSkipped, useNowMinute, useOnline, useRest, useSkipped, useTipFired } from "./stores";
import { useTypicalMinutes } from "./typical";

const NO_GHOST: Ghost = { weight: null, work: null, weightSource: null, workSource: null };
const nowSec = () => Math.floor(Date.now() / 1000);
// Event-time clocks (taps, guards). Read inside handlers only.
const nowMs = () => Date.now();
/** A second tap on the log button this soon after a log is a double tap, not the next set. */
const LOG_GUARD_MS = 600;
/** The win card collapses after this long (§1.6). */
const WIN_MS = 8000;

interface GroupInfo {
  lib: LibraryExercise | undefined;
  tracking: Tracking;
  last: PastSet[];
  lastDate: string | null;
  tEx: TemplateExercise;
  templateNote: string | null;
}

interface PadState {
  setId: string;
  field: CellField;
  text: string;
  fresh: boolean;
  error: string | null;
}

interface Win {
  setId: string;
  slug: string;
  name: string;
  weight: string;
  reps: number;
  sentence: string;
  spoken: string;
  logged: string;
  undo: () => void;
}

type Snapshot = Partial<Pick<WSet, "weight_lb" | "reps" | "duration_sec" | "rir" | "completed" | "completed_at" | "exercise_order" | "exercise_slug" | "exercise_name" | "set_index" | "target_rep_low" | "target_rep_high" | "target_unit" | "target_rir" | "rest_sec" | "suggested_weight_lb">>;

const SNAP_KEYS = ["weight_lb", "reps", "duration_sec", "rir", "completed", "completed_at", "exercise_order", "exercise_slug", "exercise_name", "set_index", "target_rep_low", "target_rep_high", "target_unit", "target_rir", "rest_sec", "suggested_weight_lb"] as const;
function snap(s: WSet, keys: readonly (keyof Snapshot)[] = SNAP_KEYS): Snapshot {
  const o: Record<string, unknown> = {};
  for (const k of keys) o[k] = s[k];
  return o as Snapshot;
}

const BAR = { lb: 45, kg: 20 } as const;
const PLATE_EQUIPMENT = new Set(["barbell", "smith", "plate_loaded"]);
const trimNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1))));

/** The previous in-app route that isn't the workout (Navigation API), for ⌄. */
function stepsBackToApp(): number | null {
  const nav = (window as unknown as { navigation?: { currentEntry: { index: number } | null; entries: () => { url: string | null }[] } }).navigation;
  if (!nav?.currentEntry || typeof nav.entries !== "function") return null;
  const list = nav.entries();
  for (let i = nav.currentEntry.index - 1; i >= 0; i--) {
    const url = list[i]?.url;
    if (!url) return null;
    const u = new URL(url);
    if (u.origin !== window.location.origin) return null;
    if (!u.pathname.startsWith("/workout")) return nav.currentEntry.index - i;
  }
  return null;
}

export function LiveWorkout({ data, mode, onDoneEditing }: { data: LiveData; mode: "live" | "edit"; onDoneEditing?: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { userId } = useUser();
  const today = useToday();
  const { profile } = useProfile();
  const unit: WeightUnit = profile?.weight_unit === "kg" ? "kg" : "lb";
  const prefs = useMemo(() => parsePrefs(profile?.prefs), [profile?.prefs]);
  const { byKey } = useTemplates();
  const { session, sets } = data;
  const id = session.id;
  const live = mode === "live";
  const sessionMode = (session.mode ?? "standard") as Mode;
  const template = session.template_key ? byKey[session.template_key] : undefined;
  const labels = templateLabels({ key: session.template_key ?? "", name: session.name });
  const ops = useSessionOps(id);
  const outbox = useOutbox();
  const isOnline = useOnline();
  const short = useMediaQuery("(max-height: 700px)");

  const groups = useMemo(() => groupSets(sets), [sets]);
  const slugs = useMemo(() => [...new Set(groups.map((g) => g.slug))], [groups]);
  const historyQ = usePriorHistory(id, slugs, session.local_date);
  const bestsQ = usePriorBests(id, slugs, session.local_date);
  const bests = bestsQ.data;
  const skippedArr = useSkipped(id);
  const skipped = useMemo(() => new Set(skippedArr), [skippedArr]);
  const rest = useRest(live ? id : null);

  const fmt = useCallback((lb: number) => formatLoad(lb, unit, false), [unit]);
  const toDisplay = useCallback((lb: number) => round(toDisplayWeight(lb, unit), 1), [unit]);

  const setMap = useMemo(() => new Map(sets.map((s) => [s.id, s])), [sets]);
  const groupOf = useMemo(() => {
    const m = new Map<string, ExerciseGroup>();
    for (const g of groups) for (const s of g.sets) m.set(s.id, g);
    return m;
  }, [groups]);

  /* ---------------------------------------------- per-exercise context */

  const info = useMemo(() => {
    const m = new Map<string, GroupInfo>();
    const hist = historyQ.data ?? {};
    for (const g of groups) {
      const lib = getExercise(g.slug);
      const first = g.working[0] ?? g.sets[0];
      const tracking = trackingFor(lib, first?.target_unit);
      const sessionsPast = groupSessions(hist[g.slug] ?? []);
      const last = sessionsPast[0] ?? [];
      const fromTemplate = template?.exercises.find((e) => e.slug === g.slug);
      const tEx: TemplateExercise = {
        slug: g.slug,
        name: g.name,
        sets: fromTemplate?.sets ?? Math.max(1, g.total),
        repLow: first?.target_rep_low ?? fromTemplate?.repLow ?? 8,
        repHigh: first?.target_rep_high ?? fromTemplate?.repHigh ?? 12,
        unit: ((first?.target_unit as TemplateExercise["unit"]) ?? fromTemplate?.unit ?? "reps") as TemplateExercise["unit"],
        rir: fromTemplate?.rir ?? first?.target_rir ?? "1–2",
        rest: first?.rest_sec ?? fromTemplate?.rest ?? lib?.rest ?? 90,
      };
      m.set(g.key, { lib, tracking, last, lastDate: last[0]?.local_date ?? null, tEx, templateNote: fromTemplate?.note ?? null });
    }
    return m;
  }, [groups, historyQ.data, template]);

  const ghosts = useMemo(() => {
    const m = new Map<string, Ghost>();
    for (const g of groups) {
      const inf = info.get(g.key)!;
      for (const s of g.sets) m.set(s.id, ghostFor(s, g, inf.last, inf.tracking, inf.lib?.increment ?? 5));
    }
    return m;
  }, [groups, info]);

  /* ----------------------------------------------- the lift on screen */

  // `openRef` (a set id) picks the lift shown; without it, the first lift still to do.
  const [openRef, setOpenRef] = useState<string | null>(null);
  // The set the dock logs: chosen in the set sheet, else the shown lift's first unlogged set.
  const [selId, setSelId] = useState<string | null>(null);
  const currentKey = currentGroupKey(groups, skipped);
  const openGroup = (openRef ? groupOf.get(openRef) : undefined) ?? groups.find((g) => g.key === currentKey) ?? null;
  const upNext = live ? upNextSet(groups, openGroup?.key ?? null, skipped) : null;
  const counts = sessionCounts(groups);
  const anyLogged = sets.some((s) => s.completed);

  const toTop = () => window.setTimeout(() => window.scrollTo({ top: 0 }), 30);
  const openGroupKey = (g: ExerciseGroup) => {
    setOpenRef(g.sets[0]?.id ?? null);
    setSelId(null);
    toTop();
  };

  /* ------------------------------------------------------- transient UI */

  const [win, setWin] = useState<Win | null>(null);
  // One entry per cell (`${setId}:${field}`): fixing one cell never hides another's error.
  const [errors, setErrorsState] = useState<CellErrors>({});
  const errorsRef = useRef(errors);
  const setCellError = (setId: string, field: CellField, error: string | null) => {
    errorsRef.current = withCellError(errorsRef.current, setId, field, error);
    setErrorsState(errorsRef.current);
  };

  // The win card collapses after 8 s (or at the next tap outside it).
  useEffect(() => {
    if (!win) return;
    const t = window.setTimeout(() => setWin(null), WIN_MS);
    return () => window.clearTimeout(t);
  }, [win]);

  /* ------------------------------------------------------------- keypad */

  const [pad, setPad] = useState<PadState | null>(null);
  const taps = useRef(new Map<string, number>());

  const freshSet = useCallback(
    (setId: string): WSet | undefined => qc.getQueryData<LiveData | null>(liveKey(id, userId))?.sets.find((s) => s.id === setId) ?? setMap.get(setId),
    [qc, id, userId, setMap],
  );

  const nameOf = (s: WSet) => {
    const g = groupOf.get(s.id);
    return s.kind === "warmup" ? "Warm-up set" : `Set ${g ? setLabel(g, s) : ""}`;
  };

  /** Validate and write one cell. Returns the reason when the value is rejected. */
  const writeCellError = (set: WSet, field: CellField, raw: string): string | null => {
    const g = groupOf.get(set.id);
    const gi = g ? info.get(g.key) : undefined;
    const t = gi?.tracking ?? "weight_reps";
    const r = validateCell(field, raw, unit, t, zeroLoadOk(gi?.lib, t));
    setCellError(set.id, field, r.ok ? null : r.error);
    if (!r.ok) return r.error;
    const col = columnFor(field, t);
    const cur = set[col] == null ? null : Number(set[col]);
    if (cur !== r.stored) {
      ops.updateSet(set.id, { [col]: r.stored });
      // one toast per set, however many steps it takes
      if (set.completed) toast(`${nameOf(set)} updated`, { id: `wk-upd-${set.id}` });
    }
    return null;
  };
  const writeCell = (set: WSet, field: CellField, raw: string) => writeCellError(set, field, raw) == null;

  const commitPad = (p: PadState | null): boolean => {
    if (!p) return true;
    const set = freshSet(p.setId);
    if (!set) return true;
    const err = writeCellError(set, p.field, p.text);
    if (err) {
      setPad({ ...p, error: err });
      haptic([8, 40, 8]);
      return false;
    }
    return true;
  };

  const openCell = (set: WSet, field: CellField) => {
    if (pad && pad.setId === set.id && pad.field === field) return;
    if (pad && !commitPad(pad)) return;
    const s = freshSet(set.id) ?? set;
    const g = groupOf.get(s.id);
    const t = g ? info.get(g.key)!.tracking : "weight_reps";
    setPad({ setId: s.id, field, text: cellText(s, field, t, unit), fresh: true, error: null });
  };

  const closePad = () => {
    if (!pad) return;
    if (!commitPad(pad)) return;
    setPad(null);
  };

  const padKey = (k: PadKey) => {
    if (!pad) return;
    const next = padPress({ text: pad.text, fresh: pad.fresh }, k, pad.field);
    const np = { ...pad, ...next, error: null };
    if (autoAdvances(pad.field, k, !!freshSet(pad.setId)?.completed)) {
      if (commitPad(np)) setPad(null);
    } else setPad(np);
  };

  const ghostTextFor = (p: PadState): string | null => {
    const g = ghosts.get(p.setId) ?? NO_GHOST;
    if (p.field === "weight") return g.weight == null ? null : formatLoad(g.weight, unit, false);
    if (p.field === "work") return g.work == null ? null : String(g.work);
    return null;
  };

  const lastValueFor = (p: PadState): string | null => {
    const set = setMap.get(p.setId);
    const g = groupOf.get(p.setId);
    if (!set || !g) return null;
    const inf = info.get(g.key)!;
    const pos = g.working.findIndex((s) => s.id === set.id);
    const prevInSession = [...g.working.slice(0, Math.max(0, pos))].reverse().find((s) => s.completed);
    const src = (pos >= 0 ? inf.last[pos] : undefined) ?? prevInSession ?? null;
    if (!src) return null;
    if (p.field === "weight") return src.weight_lb == null ? null : formatLoad(Number(src.weight_lb), unit, false);
    if (p.field === "rir") return src.rir == null ? null : String(Number(src.rir));
    const w = isTimed(inf.tracking) ? src.duration_sec : src.reps;
    return w == null ? null : String(w);
  };

  /* ------------------------------------------------------------ logging */

  const restFor = (set: WSet, inf: GroupInfo) => set.rest_sec ?? defaultRestSec(inf.lib?.category, inf.lib?.rest);

  const unlog = (set: WSet) => {
    const prev = { completed: true, completed_at: set.completed_at };
    ops.updateSet(set.id, { completed: false, completed_at: null });
    if (getRest(id)?.fromSetId === set.id) setRest(id, null);
    if (win?.setId === set.id) setWin(null);
    toast(`${nameOf(set)} unlogged`, { action: { label: "Undo", onClick: () => ops.updateSet(set.id, prev) }, duration: 6000 });
  };

  const logSet = (input: WSet) => {
    // A draft in the keypad (on any set) is written first, so nothing typed is ever lost.
    if (pad && !commitPad(pad)) return;
    const set = freshSet(input.id) ?? input;
    const t0 = nowMs();
    if (t0 - (taps.current.get(set.id) ?? 0) < 450) return; // double-tap guard
    taps.current.set(set.id, t0);
    if (set.completed) return unlog(set);
    // A cell still showing a rejected value would log the old number under the new text.
    const bad = rowErrorFields(errorsRef.current, set.id)[0];
    if (bad) {
      if (prefs.haptics) haptic([8, 40, 8]);
      openCell(set, bad);
      return;
    }

    const g = groupOf.get(set.id);
    if (!g) return;
    const inf = info.get(g.key)!;
    const res = resolveLog(set, ghosts.get(set.id) ?? NO_GHOST, inf.tracking, prefs.tapLogsGhost, new Date().toISOString(), zeroLoadOk(inf.lib, inf.tracking));
    if (!res.ok) {
      openCell(set, res.field);
      return;
    }
    unlockAudio();
    const before = snap(set, ["weight_lb", "reps", "duration_sec", "completed", "completed_at"]);
    ops.updateSet(set.id, res.values);
    setPad(null);
    setSelId(null);
    setWin(null);
    if (prefs.haptics) haptic(10);

    const logged: WSet = { ...set, ...res.values };
    const loadText_ = setLoadText(logged, inf.tracking, fmt, unit);
    const undo = () => {
      ops.updateSet(set.id, before);
      if (getRest(id)?.fromSetId === set.id) setRest(id, null);
      setWin((w) => (w?.setId === set.id ? null : w));
    };

    // New best: the existing one-record rule, once per exercise per session, never on a first log.
    let isWin = false;
    if (live && set.kind === "working" && bests && logged.weight_lb != null && logged.reps != null) {
      const c = classifyLog(logged, g, bests[g.slug]);
      if (c.kind === "pr" && markMoment(id, g.slug)) {
        isWin = true;
        const w = Number(logged.weight_lb);
        const wText = trimNum(toDisplay(w));
        const uWords = inf.lib?.perHand ? "each hand" : "";
        const sentence = winSentence({ weightLb: w, reps: logged.reps }, bests[g.slug], `${wText} ${unit}`, uWords).replace(" .", ".");
        setWin({
          setId: set.id,
          slug: g.slug,
          name: g.name,
          weight: wText,
          reps: logged.reps,
          sentence,
          spoken: `New best. ${wText} ${unit === "kg" ? "kilograms" : "pounds"} times ${logged.reps}. ${sentence}`,
          logged: `${nameOf(set)} logged · ${loadText_}`,
          undo,
        });
        if (prefs.haptics) haptic([12, 50, 18]);
      }
    }
    // The win card carries its own Undo strip; otherwise the usual toast.
    if (!isWin) toast(`${nameOf(set)} logged · ${loadText_}`, { action: { label: "Undo", onClick: undo }, duration: 6000 });

    if (!live) return;
    // What comes next, computed on the post-log state.
    const after = groupSets(sets.map((s) => (s.id === set.id ? logged : s)));
    const ag = after.find((x) => x.sets.some((s) => s.id === set.id));
    let nextKey = ag?.key ?? null;
    if (ag && isGroupComplete(ag)) nextKey = nextPendingGroupKey(after, ag.key, skipped);
    const nx = nextKey ? upNextSet(after, nextKey, skipped) : null;
    const ng = nx ? after.find((x) => x.sets.some((s) => s.id === nx.id)) : undefined;

    if (set.kind === "working") {
      const started = startRest(nowSec(), restFor(set, inf), {
        sessionId: id,
        fromSetId: set.id,
        exercise: g.name,
        next: nx && ng ? { setId: nx.id, exercise: ng.name, set: nx.kind === "warmup" ? "Warm-up" : `Set ${setLabel(ng, nx)}`, load: null } : null,
      });
      setRest(id, started);
      if (!nx) toast("Every set is logged. Finish when you're ready.");
    }
    if (ag && isGroupComplete(ag) && ng && ng.key !== ag.key) {
      setOpenRef(ng.sets[0].id);
      toTop();
    }
  };

  /* ---------------------------------------------------------- rest ±15 */

  const adjustRest = (delta: number) => {
    const r = getRest(id);
    if (!r) return;
    restActions(id).adjust(delta);
    const now = getRest(id);
    const from = r.fromSetId ? setMap.get(r.fromSetId) : undefined;
    const g = from ? groupOf.get(from.id) : undefined;
    if (!now || !g) return;
    // The adjusted rest becomes the prescription for this lift's remaining sets (§3.8), quietly.
    const open = g.working.filter((s) => !s.completed && s.rest_sec !== now.total);
    if (open.length) ops.updateSets(open.map((s) => ({ id: s.id, values: { rest_sec: now.total } })));
  };
  const skipRest = () => {
    restActions(id).skip();
    setWin(null);
  };

  /* ----------------------------------------------------- set operations */

  const addSet = (g: ExerciseGroup, kind: "working" | "warmup" = "working") => {
    if (!userId) return;
    const tmpl = g.working.at(-1) ?? g.sets.at(-1);
    const maxIdx = Math.max(-1, ...g.sets.map((s) => s.set_index));
    const row = newSetRow({
      session_id: id,
      user_id: userId,
      local_date: session.local_date,
      exercise_slug: g.slug,
      exercise_name: g.name,
      exercise_order: g.order,
      set_index: maxIdx + 1,
      kind,
      target_rep_low: kind === "warmup" ? null : (tmpl?.target_rep_low ?? null),
      target_rep_high: kind === "warmup" ? null : (tmpl?.target_rep_high ?? null),
      target_unit: tmpl?.target_unit ?? "reps",
      target_rir: kind === "warmup" ? null : (tmpl?.target_rir ?? null),
      rest_sec: kind === "warmup" ? null : (tmpl?.rest_sec ?? null),
      suggested_weight_lb: kind === "warmup" ? null : (tmpl?.suggested_weight_lb ?? null),
    });
    ops.insertSets([row]);
    if (skipped.size) setSkipped(id, skippedArr.filter((x) => !g.sets.some((s) => s.id === x)));
    setOpenRef(row.id);
    setSelId(row.id);
    toast(kind === "warmup" ? `Warm-up set added · ${g.name}` : `Set ${g.working.length + 1} added`, {
      action: { label: "Undo", onClick: () => ops.deleteSets([row.id]) },
      duration: 6000,
    });
  };

  const removeSet = (set: WSet) => {
    ops.deleteSets([set.id]);
    if (getRest(id)?.fromSetId === set.id) setRest(id, null);
    if (pad?.setId === set.id) setPad(null);
    if (selId === set.id) setSelId(null);
    toast(`${nameOf(set)} removed`, { action: { label: "Undo", onClick: () => ops.insertSets([set]) }, duration: 6000 });
  };

  /** Move a lift to position `to` (the Lifts sheet's drag and Move up / Move down). */
  const moveTo = (key: string, to: number) => {
    const keys = groups.map((x) => x.key).filter((k) => k !== key);
    keys.splice(Math.max(0, Math.min(keys.length, to)), 0, key);
    const changes = renumber(groups, keys);
    if (!changes.length) return;
    const before = changes.map((c) => ({ id: c.id, values: { exercise_order: setMap.get(c.id)!.exercise_order } }));
    ops.updateSets(changes.map((c) => ({ id: c.id, values: { exercise_order: c.exercise_order } })));
    const g = groups.find((x) => x.key === key);
    toast(`${g?.name ?? "Lift"} moved`, { action: { label: "Undo", onClick: () => ops.updateSets(before) }, duration: 6000 });
  };

  const toggleSkip = (g: ExerciseGroup) => {
    if (groupState(g, skipped) === "skipped") {
      setSkipped(
        id,
        skippedArr.filter((x) => !g.sets.some((s) => s.id === x)),
      );
      openGroupKey(g);
      return;
    }
    const ids = g.sets.filter((s) => !s.completed).map((s) => s.id);
    if (!ids.length) return;
    setSkipped(id, [...new Set([...skippedArr, ...ids])]);
    if (pad && ids.includes(pad.setId)) setPad(null);
    if (openGroup?.key === g.key) {
      setOpenRef(null);
      setSelId(null);
    }
    toast(`Skipped ${g.name}`, {
      description: "Its unlogged sets are dropped when you finish.",
      action: { label: "Undo", onClick: () => setSkipped(id, skippedArr) },
      duration: 6000,
    });
  };

  /** "Copy last time's sets": last session's values into this lift's unlogged sets, in order. */
  const copyLast = (g: ExerciseGroup) => {
    const inf = info.get(g.key)!;
    const open = g.working.filter((s) => !s.completed);
    const updates: { id: string; values: Snapshot }[] = [];
    const before: { id: string; values: Snapshot }[] = [];
    open.forEach((target) => {
      const pos = g.working.indexOf(target);
      const src = inf.last[pos];
      if (!src) return;
      before.push({ id: target.id, values: snap(target, ["weight_lb", "reps", "duration_sec"]) });
      updates.push({ id: target.id, values: isTimed(inf.tracking) ? { weight_lb: src.weight_lb, duration_sec: src.duration_sec } : { weight_lb: hasWeight(inf.tracking) ? src.weight_lb : null, reps: src.reps } });
    });
    if (!updates.length) return;
    ops.updateSets(updates);
    toast(`Last time's sets copied`, { action: { label: "Undo", onClick: () => ops.updateSets(before) }, duration: 6000 });
  };

  /* ---------------------------------------------- replace / add exercise */

  const [busySlug, setBusySlug] = useState<string | null>(null);

  const historyFor = async (slug: string): Promise<PastSet[]> => {
    try {
      return (await fetchPriorHistory([slug], id, session.local_date))[slug] ?? [];
    } catch {
      return []; // offline: still swap, just without a suggestion
    }
  };

  const replaceWith = async (g: ExerciseGroup, lib: LibraryExercise) => {
    if (busySlug) return;
    const open = g.sets.filter((s) => !s.completed);
    if (!open.length) {
      toast(`Every set of ${g.name} is logged.`, { description: "Add an exercise instead." });
      return;
    }
    setBusySlug(lib.slug);
    try {
      const hist = await historyFor(lib.slug);
      const first = open.find((s) => s.kind === "working") ?? g.working[0];
      // slug and rest: the swap keeps the rest and effort only within the same effort class
      const tg = retarget({ low: first?.target_rep_low ?? null, high: first?.target_rep_high ?? null, unit: first?.target_unit ?? null, rir: first?.target_rir ?? null, sets: g.total || 3, slug: g.slug, rest: first?.rest_sec ?? null }, lib);
      const tEx: TemplateExercise = { slug: lib.slug, name: lib.name, sets: tg.sets, repLow: tg.low, repHigh: tg.high, unit: tg.unit, rir: tg.rir, rest: tg.rest };
      const sug = suggest(tEx, lib, hist, sessionMode);
      const hasLogged = g.sets.some((s) => s.completed);
      const newOrder = hasLogged ? g.order + 1 : g.order;
      const updates: { id: string; values: Snapshot }[] = [];
      const before: { id: string; values: Snapshot }[] = [];
      if (hasLogged) {
        for (const x of groups)
          if (x.order > g.order)
            for (const s of x.sets) {
              updates.push({ id: s.id, values: { exercise_order: s.exercise_order + 1 } });
              before.push({ id: s.id, values: { exercise_order: s.exercise_order } });
            }
      }
      open.forEach((s, i) => {
        before.push({ id: s.id, values: snap(s) });
        updates.push({
          id: s.id,
          values: {
            exercise_slug: lib.slug,
            exercise_name: lib.name,
            exercise_order: newOrder,
            set_index: i,
            target_rep_low: s.kind === "warmup" ? null : sug.target.low,
            target_rep_high: s.kind === "warmup" ? null : sug.target.high,
            target_unit: tg.unit,
            target_rir: s.kind === "warmup" ? null : modeRir(tEx, sessionMode),
            rest_sec: s.kind === "warmup" ? null : tg.rest,
            suggested_weight_lb: s.kind === "warmup" ? null : sug.weightLb,
            weight_lb: null,
            reps: null,
            duration_sec: null,
            rir: null,
          },
        });
      });
      ops.updateSets(updates);
      setSkipped(
        id,
        skippedArr.filter((x) => !open.some((s) => s.id === x)),
      );
      if (pad && open.some((s) => s.id === pad.setId)) setPad(null);
      setOpenRef(open[0].id);
      setSelId(null);
      setPicker(null);
      toast(`Swapped for ${lib.name}`, {
        description: hasLogged ? `Logged sets stay with ${g.name}.` : undefined,
        action: { label: "Undo", onClick: () => ops.updateSets(before) },
        duration: 6000,
      });
    } finally {
      setBusySlug(null);
    }
  };

  const insertExercise = (lib: LibraryExercise, drafts: ReturnType<typeof templateExerciseSets>) => {
    if (!userId) return null;
    const order = Math.max(-1, ...groups.map((g) => g.order)) + 1;
    const rows = drafts.map((d) => newSetRow({ ...d, session_id: id, user_id: userId, local_date: session.local_date, exercise_order: order }));
    ops.insertSets(rows);
    setOpenRef(rows[0].id);
    setSelId(null);
    setPicker(null);
    setLiftsOpen(false);
    toTop();
    toast(`Added ${lib.name}`, { action: { label: "Undo", onClick: () => ops.deleteSets(rows.map((r) => r.id)) }, duration: 6000 });
    return rows;
  };

  const addExercise = async (lib: LibraryExercise) => {
    if (busySlug || !userId) return;
    setBusySlug(lib.slug);
    try {
      const hist = await historyFor(lib.slug);
      const tg = defaultTargets(lib);
      const tEx: TemplateExercise = { slug: lib.slug, name: lib.name, sets: tg.sets, repLow: tg.low, repHigh: tg.high, unit: tg.unit, rir: tg.rir, rest: tg.rest };
      const sug = suggest(tEx, lib, hist, sessionMode);
      const n = plannedSetCount(tEx, lib, sessionMode);
      insertExercise(lib, templateExerciseSets({ ...tEx, sets: n }, "standard", 0, sug, { rir: modeRir(tEx, sessionMode) }));
    } finally {
      setBusySlug(null);
    }
  };

  /** The optional lift ("Add them", Lifts › Optional › "Add"): the template row's sets, range, effort and rest (PROGRAM §1.4). */
  const addOptional = async (tEx: TemplateExercise) => {
    const lib = getExercise(tEx.slug);
    if (busySlug || !userId || !lib) return;
    setBusySlug(tEx.slug);
    try {
      const hist = await historyFor(tEx.slug);
      insertExercise(lib, templateExerciseSets(tEx, sessionMode, 0, suggest(tEx, lib, hist, sessionMode)));
    } finally {
      setBusySlug(null);
    }
  };

  /* ------------------------------------------------------------ sheets */

  const [moreOpen, setMoreOpen] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [picker, setPicker] = useState<{ mode: "replace" | "add"; key?: string } | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null); // set id
  const [setSheet, setSetSheet] = useState(false);
  const [liftsOpen, setLiftsOpen] = useState(false);
  const [notesToday, setNotesToday] = useState(false);
  const [workoutNote, setWorkoutNote] = useState(false);
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [tipSheet, setTipSheet] = useState(false);
  const [staleClosed, setStaleClosed] = useState(false);
  const pickerGroup = picker?.key ? (groups.find((g) => g.key === picker.key) ?? null) : null;

  /* ------------------------------------------------- finish and discard */

  const [finishOpen, setFinishOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  // A "no connection" note goes stale the moment the connection is back.
  const [seenOnline, setSeenOnline] = useState(isOnline);
  if (seenOnline !== isOnline) {
    setSeenOnline(isOnline);
    if (isOnline && finishError) setFinishError(null);
  }
  const openFinish = () => {
    if (pad && !commitPad(pad)) return;
    setPad(null);
    setFinishError(null);
    setFinishOpen(true);
    void ops.sync(); // the sheet's count includes sets logged on another device
  };
  const busy = useRef(false);

  const finish = async () => {
    if (busy.current) return;
    if (pad && !commitPad(pad)) return;
    busy.current = true;
    setSaving(true);
    setFinishError(null);
    setPad(null);
    // The summary shows "14 of 17" sets — the plan is only known before finishing drops the
    // unlogged sets, so it is noted on this device now.
    if (live) rememberPlanned(id, counts.total);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
      if (!(await drained(10000))) throw new Error("offline");
      // Merge with the server first: sets logged on another device are kept, and only what
      // this device changed (and the server doesn't hold yet) is written.
      const cur = qc.getQueryData<LiveData | null>(liveKey(id, userId)) ?? data;
      const serverSession = must(await sb().from("workout_sessions").select("*").eq("id", id).single()) as WSession;
      const serverSets = must(await sb().from("exercise_sets").select("*").eq("session_id", id).order("exercise_order").order("set_index"));
      if (serverSession.status === "discarded") {
        clearSessionStores(id);
        ops.setData({ session: serverSession, sets: serverSets });
        setFinishOpen(false);
        return;
      }
      // Finished on another device meanwhile: this device's sets still go in and the totals
      // are recounted, but the end time stays the one already saved.
      const endedElsewhere = live && serverSession.status === "done";
      const m = mergeLive({ session: { ...serverSession, status: cur.session.status }, sets: serverSets }, cur, getDeviceCopy<LiveData>(id)?.journal ?? emptyJournal());
      await applyPush(
        id,
        m.push.filter((p) => p.kind !== "notes"),
      );
      // Notes on sets that are about to be dropped move onto a logged set (or the session note).
      const { moves, sessionLines } = relocateNotes(groupSets(m.data.sets));
      for (const mv of moves) must(await sb().from("exercise_sets").update({ notes: mv.notes }).eq("id", mv.id).select("id"));
      const baseNotes = (cur.session.notes ?? "").trim() || null;
      const finalNotes = sessionLines.length ? [baseNotes, ...sessionLines].filter(Boolean).join("\n").slice(0, 2000) : baseNotes;
      // Unlogged sets are dropped — decided by the server's own copy, so a set logged on
      // another device a moment ago is never deleted.
      must(await sb().from("exercise_sets").delete().eq("session_id", id).eq("completed", false).select("id"));
      const fresh = must(await sb().from("exercise_sets").select("*").eq("session_id", id).order("exercise_order").order("set_index"));
      const totals = sessionTotals(fresh);
      const priors: Record<string, PriorBest> | null =
        bests ??
        (await fetchPriorBests(
          [...new Set(fresh.map((s) => s.exercise_slug))],
          id,
          session.local_date,
        ).catch(() => null));
      const prCount = priors ? sessionRecords(groupSets(fresh), priors).length : session.pr_count;
      const endMs = effectiveEnd(session.started_at, nowMs(), lastCompletedAt(fresh));
      const totalsRow = { total_volume_lb: totals.volumeLb, sets_completed: totals.setsCompleted, pr_count: prCount, notes: finalNotes };
      const values = live && !endedElsewhere ? { status: "done", ended_at: new Date(endMs).toISOString(), duration_sec: durationSec(session.started_at, endMs), ...totalsRow } : totalsRow;
      let q = sb().from("workout_sessions").update(values).eq("id", id);
      if (live && !endedElsewhere) q = q.eq("status", "active"); // a second tap can't finish twice
      const updated = must(await q.select("*").maybeSingle());
      const finalSession: WSession = updated ?? (must(await sb().from("workout_sessions").select("*").eq("id", id).single()) as WSession);
      clearSessionStores(id);
      // Undo on a "Set 3 logged" toast still on screen would now unlog a set of a saved
      // session behind its totals: per-set undos end when the session is saved.
      toast.dismiss();
      ops.setData({ session: finalSession, sets: fresh });
      // nothing is open any more: the shell's workout bar and Start know at once (and the
      // offline cache never restores a finished session as the open one)
      if (live) qc.setQueryData(["sessions", "active", userId], null);
      invalidateTraining(qc);
      setFinishOpen(false);
      if (prefs.haptics) haptic([10, 40, 10]);
      window.scrollTo({ top: 0 });
      if (!live) {
        toast("Changes saved");
        onDoneEditing?.();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const offline = msg === "offline" || isNetworkError(msg);
      const text = offline ? "No connection. Every set is safe on this phone. Finish again when you're back online." : `Couldn't save: ${msg} Every set is still on this phone.`;
      setFinishError(text);
      if (live) setFinishOpen(true);
      else toast.error("Couldn't save the changes", { description: text });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const discard = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await drained(5000);
      must(await sb().from("workout_sessions").update({ status: "discarded", ended_at: new Date().toISOString() }).eq("id", id).select("id").single());
      clearSessionStores(id);
      toast.dismiss(); // per-set undos belong to the workout that was just discarded
      ops.setData({ ...data, session: { ...session, status: "discarded" } });
      qc.setQueryData(["sessions", "active", userId], null);
      invalidateTraining(qc);
      setFinishOpen(false);
      setLiftsOpen(false);
      toast("Workout discarded", {
        action: {
          label: "Undo",
          onClick: async () => {
            const { error } = await sb().from("workout_sessions").update({ status: "active", ended_at: null }).eq("id", id);
            if (error) return toast.error("Couldn't bring it back", { description: friendlyError(error.message) });
            invalidateTraining(qc);
            await ops.reload();
            router.push(`/workout/${id}`);
          },
        },
        duration: 6000,
      });
      router.replace("/");
    } catch (e) {
      toast.error("Couldn't discard the workout", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      busy.current = false;
    }
  };

  /* ------------------------------------------------------------ effects */

  // A value typed on the keypad but not yet committed is saved when the screen goes away
  // (browser back/forward, another route, the tab closing) — as the minimise button does.
  const padRef = useRef(pad);
  const commitRef = useRef(commitPad);
  useEffect(() => {
    padRef.current = pad;
    commitRef.current = commitPad;
  });
  useEffect(() => {
    const save = () => {
      const p = padRef.current;
      if (!p || p.fresh || qc.getQueryData<LiveData | null>(liveKey(id, userId))?.session.status === "discarded") return;
      commitRef.current(p);
    };
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [qc, id, userId]);

  // Warn before closing the tab while writes are still queued.
  useEffect(() => {
    if (!outbox.pending) return;
    const on = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", on);
    return () => window.removeEventListener("beforeunload", on);
  }, [outbox.pending]);

  // A write the server rejected (not a dropped connection): reload so the screen is true.
  // Connection failures never reload — the device copy is the truth and is re-sent below.
  const lastErr = useRef<string | null>(null);
  useEffect(() => {
    if (!outbox.error || outbox.error === lastErr.current) return;
    lastErr.current = outbox.error;
    if (isNetworkError(outbox.error)) return;
    toast.error("A change couldn't be saved", { description: `${friendlyError(outbox.error)} The workout was reloaded.` });
    void ops.reload();
  }, [outbox.error, ops]);

  // Safety net under the outbox and the multi-device merge: whenever the outbox goes idle,
  // on focus and every 20 s, the server's copy is merged in (sets logged on another device
  // appear) and only this device's own unconfirmed changes are re-sent.
  useSessionSync(ops, live);

  // A session opened straight from Start (its cache seeded by useStartWorkout) gets the same
  // device copy a first fetch would have written, so a reload with no signal still opens it.
  useEffect(() => {
    if (live && !getDeviceCopy(id)) setDeviceCopy(id, data, emptyJournal());
    // once per session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, live]);

  /* ------------------------------------------------- fatigue-overlap tip */

  // PROGRAM's hook reads this session's sets from its own query; it is fed from this device's
  // copy so the tip follows every tap, offline too.
  useEffect(() => {
    if (!live || !userId) return;
    qc.setQueryData(
      ["overlap-live-sets", id, userId],
      sets.map((s) => ({ id: s.id, session_id: s.session_id, exercise_slug: s.exercise_slug, set_index: s.set_index, weight_lb: s.weight_lb, reps: s.reps, kind: s.kind, completed: s.completed, completed_at: s.completed_at })),
    );
  }, [qc, live, id, userId, sets]);
  const fired = useTipFired(id);
  const overlap = useOverlapAdvice({ date: session.local_date, template: live ? (template ?? null) : null, sessionId: live ? id : undefined, fired });
  const advice = live && overlap.inSession && !(overlap.inSession.muscle !== "both" && fired.includes(overlap.inSession.muscle)) ? overlap.inSession : null;

  /* ----------------------------------------------------------- the view */

  const headRef = useRef<HTMLElement>(null);
  const awake = useWakeLock(live);
  const typical = useTypicalMinutes(session.template_key);
  const minute = useNowMinute();
  const stale = live && isStaleSession(session.local_date, today, session.started_at, lastCompletedAt(sets), minute * 60000);
  const lastLog = useRef(0);
  const readiness = useReadiness(session.local_date);

  // "Screen stays on during your workout": once, the first time the lock holds.
  useEffect(() => {
    if (!awake) return;
    try {
      if (localStorage.getItem("pgg.wakeToast")) return;
      localStorage.setItem("pgg.wakeToast", "1");
    } catch {
      return;
    }
    toast("Screen stays on during your workout");
  }, [awake]);

  // Toasts sit just under the top bar (they never cover ⌄ or Finish).
  useEffect(() => {
    const root = document.documentElement;
    const el = headRef.current;
    if (!el) return;
    const set = () => root.style.setProperty("--gym-toast-top", `${Math.ceil(el.getBoundingClientRect().bottom + 6)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--gym-toast-top");
    };
  }, []);

  // The shown lift moved away (removed, replaced): forget a selection that no longer applies.
  if (selId && !setMap.has(selId)) setSelId(null);

  const lift = openGroup ?? groups.at(-1) ?? null;
  const inf = lift ? info.get(lift.key) : undefined;
  const selSet = selId ? setMap.get(selId) : undefined;
  const selInLift = selSet && lift && groupOf.get(selSet.id)?.key === lift.key ? selSet : undefined;
  // The set the dock logs next.
  const target: WSet | null = live
    ? ((selInLift && !selInLift.completed ? selInLift : undefined) ?? (lift ? firstOpenSet(lift) : null) ?? upNext)
    : (selInLift ?? (lift ? (firstOpenSet(lift) ?? lift.sets.at(-1) ?? null) : null));
  const targetGroup = target ? groupOf.get(target.id) : undefined;
  const tInf = targetGroup ? info.get(targetGroup.key) : undefined;
  const t: Tracking = tInf?.tracking ?? "weight_reps";
  const tGhost = target ? (ghosts.get(target.id) ?? NO_GHOST) : NO_GHOST;
  const allLogged = live && !upNext;

  /* the target's values */
  const typedLoad = target?.weight_lb != null ? Number(target.weight_lb) : null;
  const shownLoadLb = typedLoad ?? (target?.completed ? null : tGhost.weight);
  const typedWork = target ? (isTimed(t) ? target.duration_sec : target.reps) : null;
  const shownWork = typedWork ?? (target?.completed ? null : tGhost.work);
  const displayLoad = shownLoadLb == null ? null : toDisplay(shownLoadLb);
  const loadStep = nudgeStep("weight", { incrementLb: tInf?.lib?.increment ?? 5, unit, timed: isTimed(t) });
  const workStep = nudgeStep("work", { incrementLb: 5, unit, timed: isTimed(t) });
  const perSide = !!tInf?.lib?.perSide || target?.target_unit === "each";
  const wUnit = weightUnit(tInf?.lib, t, unit);
  const rUnit = workUnit(t, perSide);
  const [addWeightFor, setAddWeightFor] = useState<string | null>(null);
  const showWeight = !!target && hasWeight(t) && (t !== "bodyweight_reps" || (shownLoadLb ?? 0) > 0 || addWeightFor === target.id);

  const setWeight = (v: number) => {
    if (!target) return;
    const s = freshSet(target.id) ?? target;
    let next = v;
    // the first + on an empty barbell starts at the bar
    if (displayLoad == null && tInf?.lib?.equipment === "barbell" && v > 0 && v < BAR[unit]) next = BAR[unit];
    writeCell(s, "weight", String(next));
  };
  const setWork = (v: number) => {
    if (!target) return;
    writeCell(freshSet(target.id) ?? target, "work", String(Math.max(workStep, v)));
  };

  // "17 beats your best": the fewest reps at this weight that set a new best, shown when the
  // value is that or one under it (the one record rule).
  let beats: number | null = null;
  if (live && target && targetGroup && target.kind === "working" && !target.completed && t === "weight_reps" && bests?.[targetGroup.slug]?.sets) {
    const rr = recordReps(shownLoadLb, runningBest(bests[targetGroup.slug], targetGroup.working.filter((s) => s.completed), target.id));
    if (rr && shownWork != null && shownWork >= rr.reps - 1) beats = rr.reps;
  }

  const logTarget = () => {
    if (!target) return;
    const now = nowMs();
    if (now - lastLog.current < LOG_GUARD_MS) return;
    lastLog.current = now;
    logSet(target);
  };

  const shownText = (s: WSet | null, g: ExerciseGroup | undefined) => {
    if (!s || !g) return "";
    const gi = info.get(g.key)!;
    const gh = ghosts.get(s.id) ?? NO_GHOST;
    const w = s.weight_lb != null ? Number(s.weight_lb) : gh.weight;
    const work = (isTimed(gi.tracking) ? s.duration_sec : s.reps) ?? gh.work;
    const wu = weightUnit(gi.lib, gi.tracking, unit);
    const ru = workUnit(gi.tracking, !!gi.lib?.perSide || s.target_unit === "each");
    const left = hasWeight(gi.tracking) && w != null && (w > 0 || gi.tracking !== "bodyweight_reps") ? `${trimNum(toDisplay(w))} ${wu}` : null;
    const right = work == null ? null : isTimed(gi.tracking) ? `${work} sec` : left ? String(work) : `${work} ${ru}`;
    return [left, right].filter(Boolean).join(" × ");
  };

  const labelOf = (s: WSet, g: ExerciseGroup) => (s.kind === "warmup" ? "warm-up set" : `set ${setLabel(g, s)}`);
  const logLabel = (() => {
    if (!target || !targetGroup) return "";
    const verb = live ? "Log" : "Save";
    const base = `${verb} ${labelOf(target, targetGroup)}`;
    const cap = base.charAt(0).toUpperCase() + base.slice(1);
    return targetGroup.key !== lift?.key || (rest && targetGroup.slug !== groupOf.get(rest.fromSetId ?? "")?.slug) ? `${cap} · ${targetGroup.name}` : cap;
  })();
  const logSpoken = target && targetGroup ? `${live ? "Log" : "Save"} ${labelOf(target, targetGroup)}${targetGroup.key !== lift?.key ? ` of ${targetGroup.name}` : ""}, ${shownText(target, targetGroup).replace(" × ", " times ")}` : undefined;

  /* rest and the moment */
  const fromSet = rest?.fromSetId ? setMap.get(rest.fromSetId) : undefined;
  const fromGroup = fromSet ? groupOf.get(fromSet.id) : undefined;
  const resting = live && !!rest;
  const showWin = live && !!win;
  const showTip = resting && !showWin && !!advice;

  /* optional lift (PROGRAM §1.4): offered after the last planned set, listed in the Lifts sheet */
  const optionalLeft = useMemo(() => (template ? visibleExercises(template.exercises).filter((e) => e.optional && !groups.some((g) => g.slug === e.slug)) : []), [template, groups]);
  const offer = allLogged && optionalLeft[0] && suggestOptional(sessionMode, readiness.guidance?.level ?? null) ? optionalLeft[0] : null;

  /* the Next card's in-place editor */
  const [editNext, setEditNext] = useState<string | null>(null);
  const editingNext = !!target && editNext === target.id;

  /* the dock */
  const numberCards = target && targetGroup && (
    <>
      {showWeight ? (
        <NumberCard
          name="Weight"
          value={displayLoad ?? 0}
          format={displayLoad == null ? () => "—" : trimNum}
          unit={wUnit}
          spokenUnit={weightUnitSpoken(tInf?.lib, t, unit)}
          step={loadStep}
          min={0}
          max={unit === "kg" ? 680 : 1500}
          onChange={setWeight}
          onKeypad={() => openCell(target, "weight")}
        />
      ) : t === "bodyweight_reps" ? (
        <button type="button" onClick={() => setAddWeightFor(target.id)} className="press t-button h-14 rounded-pill bg-control px-6 text-fg">
          Add weight
        </button>
      ) : null}
      <NumberCard
        name={isTimed(t) ? "Time" : "Reps"}
        value={shownWork ?? 0}
        format={shownWork == null ? () => "—" : String}
        unit={rUnit}
        spokenUnit={isTimed(t) ? "seconds" : rUnit}
        step={workStep}
        min={0}
        max={isTimed(t) ? 900 : 100}
        onChange={setWork}
        onKeypad={() => openCell(target, "work")}
        note={beats != null ? `${beats} beats your best` : undefined}
      />
    </>
  );
  const goldLog = (variant: "primary" | "inverse") =>
    target ? (
      <Button variant={variant} size="xl" block onClick={logTarget} aria-label={logSpoken}>
        <span className="truncate">{logLabel}</span>
      </Button>
    ) : null;
  const finishBtn = (variant: "primary" | "inverse") => (
    <Button variant={variant} size="xl" block onClick={openFinish}>
      Finish workout
    </Button>
  );
  const nextLine = target && targetGroup ? `Next · ${labelOf(target, targetGroup)} · ${shownText(target, targetGroup)}` : null;

  let dock: React.ReactNode;
  if (!live) {
    dock = (
      <>
        {numberCards}
        <Button variant="primary" size="xl" block onClick={() => void finish()} loading={saving}>
          Save changes
        </Button>
      </>
    );
  } else if (allLogged) {
    dock = (
      <>
        {offer && (
          <div className="flex items-center gap-3 rounded-card bg-surface py-3.5 pl-5 pr-3.5">
            <div className="min-w-0 flex-1">
              <p className="t-row truncate">
                Optional · <span data-budget-name="">{offer.name}</span>
              </p>
              <p className="t-label">
                {offer.sets} sets of {repRange(offer.repLow, offer.repHigh, offer.unit).replace(/ each$/, " each side")}
                {getExercise(offer.slug)?.primary[0] ? ` · for ${muscleLabel(getExercise(offer.slug)!.primary[0]).toLowerCase()}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => void addOptional(offer)} disabled={!!busySlug} className="press t-button h-14 shrink-0 rounded-pill bg-control px-5 text-fg disabled:opacity-50">
              Add them
            </button>
          </div>
        )}
        {finishBtn(showWin ? "inverse" : "primary")}
      </>
    );
  } else if (showWin) {
    dock = (
      <>
        {nextLine && (
          <p className="t-label truncate text-center" data-budget-name="">
            {nextLine}
          </p>
        )}
        {goldLog("inverse")}
      </>
    );
  } else if (resting && !editingNext) {
    dock = (
      <>
        {target && targetGroup && (
          <div className="flex items-center gap-3 rounded-card bg-surface py-3.5 pl-5 pr-3.5">
            <div className="min-w-0 flex-1">
              <p className="t-label">
                Next · {labelOf(target, targetGroup)}
                {targetGroup.key !== fromGroup?.key ? <span data-budget-name=""> · {targetGroup.name}</span> : null}
              </p>
              <p className="t-num truncate tabular-nums">{shownText(target, targetGroup) || "—"}</p>
            </div>
            <button type="button" onClick={() => setEditNext(target.id)} className="press t-button h-14 shrink-0 rounded-pill bg-control px-5 text-fg">
              Edit
            </button>
          </div>
        )}
        {goldLog("primary")}
      </>
    );
  } else if (target) {
    dock = (
      <>
        {numberCards}
        {goldLog("primary")}
      </>
    );
  } else if (upNext) {
    const ug = groupOf.get(upNext.id);
    dock = (
      <Button
        variant="primary"
        size="xl"
        block
        onClick={() => {
          setOpenRef(upNext.id);
          setSelId(null);
        }}
      >
        <span className="truncate">Next: {ug?.name}</span>
      </Button>
    );
  }

  /* set dots, set sheet rows */
  const bestIds = lift && bests ? prSetIds(lift, bests[lift.slug]) : new Set<string>();
  const dotsCurrent = target && lift && groupOf.get(target.id)?.key === lift.key ? target.id : null;
  const setRows: SetRowData[] = lift
    ? lift.sets.map((s) => ({
        id: s.id,
        label: s.kind === "warmup" ? "Warm-up" : `Set ${setLabel(lift, s)}`,
        text: shownText(s, lift) || "—",
        logged: s.completed,
        current: s.id === dotsCurrent,
        best: bestIds.has(s.id),
        weight: s.weight_lb == null ? null : toDisplay(Number(s.weight_lb)),
        work: isTimed(inf?.tracking ?? "weight_reps") ? s.duration_sec : s.reps,
        rir: s.rir == null ? null : Number(s.rir),
        notes: s.notes,
      }))
    : [];
  const liftDone = lift ? lift.sets.filter((s) => s.completed).length : 0;

  /* lifts sheet */
  const ends = live && !stale ? endsAtOf(session.started_at, typical) : null;
  const plaques = useMemo(() => (bests ? sessionRecords(groups, bests) : []), [groups, bests]);
  const liftRows: LiftRowData[] = groups.map((g) => {
    const gi = info.get(g.key)!;
    const w = g.working.find((s) => s.weight_lb != null)?.weight_lb ?? g.working.map((s) => ghosts.get(s.id)?.weight).find((x) => x != null) ?? null;
    const first = g.working[0];
    const parts = [`${g.total} ${g.total === 1 ? "set" : "sets"}`, first ? rangeText(first.target_rep_low, first.target_rep_high, first.target_unit) : null, hasWeight(gi.tracking) && w != null && Number(w) > 0 ? `${trimNum(toDisplay(Number(w)))} ${unit}` : null];
    return { key: g.key, name: g.name, detail: parts.filter(Boolean).join(" · "), state: groupState(g, skipped), done: g.done, total: g.total, current: g.key === lift?.key, best: plaques.some((p) => p.slug === g.slug) };
  });
  const optionalRows: OptionalRowData[] = optionalLeft.map((e) => ({ slug: e.slug, name: e.name, detail: `${e.sets} sets · ${rangeText(e.repLow, e.repHigh, e.unit)}` }));
  const minsSoFar = minute ? Math.max(0, Math.floor((minute * 60000 - Date.parse(session.started_at)) / 60000)) : 0;
  const liftsDescription = [`${counts.done} of ${counts.total} sets`, live ? `${minsSoFar} min` : gymDate(session.local_date), ends ? `done about ${new Date(ends).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : null].filter(Boolean).join(" · ");
  const dayNotes = templateDef(session.template_key)?.notes ?? [];
  const warmSteps = live && !stale && !anyLogged && lift && groups.indexOf(lift) === 0 && template ? visibleWarmup(template.warmup ?? []) : [];

  /* tip */
  const tipRowsList = advice ? tipRows(advice, (slug) => groups.find((g) => g.slug === slug)?.name ?? getExercise(slug)?.name ?? slug, (slug) => groups.find((g) => g.slug === slug)?.total ?? 0) : [];
  const ev = advice?.evidence[0];
  const evidenceLine = ev ? `${ev.name} is down ${ev.refReps - ev.reps > 0 ? `${ev.refReps - ev.reps} ${ev.refReps - ev.reps === 1 ? "rep" : "reps"} ` : ""}at ${trimNum(toDisplay(ev.weightLb))} ${unit}.` : null;
  const tipName = advice ? tipTitle(advice, dayName(addDays(session.local_date, -1))) : "";
  const applyTip = () => {
    if (!advice) return;
    const orderBefore: { id: string; values: Snapshot }[] = [];
    let keys = groups.map((g) => g.key);
    for (const a of advice.actions) {
      if (a.kind !== "reorder") continue;
      const mk = groups.find((g) => g.slug === a.move && !g.done)?.key;
      const bk = groups.find((g) => g.slug === a.before)?.key;
      if (!mk || !bk) continue;
      keys = keys.filter((k) => k !== mk);
      keys.splice(keys.indexOf(bk), 0, mk);
    }
    const order = renumber(groups, keys);
    for (const c of order) orderBefore.push({ id: c.id, values: { exercise_order: setMap.get(c.id)!.exercise_order } });
    const removed: WSet[] = [];
    for (const a of advice.actions) {
      if (a.kind !== "drop") continue;
      const g = groups.find((x) => x.slug === a.slug);
      if (!g) continue;
      const open = g.working.filter((s) => !s.completed);
      const n = Math.min(a.sets, open.length, g.working.length - 1);
      removed.push(...open.slice(open.length - n));
    }
    if (order.length) ops.updateSets(order.map((c) => ({ id: c.id, values: { exercise_order: c.exercise_order } })));
    if (removed.length) ops.deleteSets(removed.map((s) => s.id));
    markTipFired(id, advice.muscle);
    toast("Changed for today", {
      action: {
        label: "Undo",
        onClick: () => {
          if (removed.length) ops.insertSets(removed);
          if (orderBefore.length) ops.updateSets(orderBefore);
        },
      },
      duration: 6000,
    });
  };

  const offlineLine = !isOnline || (outbox.pending > 0 && isNetworkError(outbox.error));
  const tankSet = fromSet && fromSet.kind === "working" && fromGroup && ["weight_reps", "bodyweight_reps"].includes(info.get(fromGroup.key)?.tracking ?? "") ? fromSet : null;
  const tankAim = tankSet?.target_rir ?? null;
  const restView = resting && rest;

  /* keypad */
  const padSet = pad ? setMap.get(pad.setId) : undefined;
  const padGroup = pad ? groupOf.get(pad.setId) : undefined;
  const padInfo = padGroup ? info.get(padGroup.key) : undefined;
  let padPlates: PlatesInfo | null = null;
  if (pad && padSet && padInfo && pad.field === "weight" && PLATE_EQUIPMENT.has(padInfo.lib?.equipment ?? "") && !pad.error) {
    const total = Number(pad.text || ghostTextFor(pad) || 0);
    const p = platesFor(total, unit);
    if (p && p.perSide.length <= 10) {
      const pos = padGroup!.working.findIndex((s) => s.id === padSet.id);
      const lastLb = padInfo.last[Math.max(0, pos)]?.weight_lb ?? padInfo.last[0]?.weight_lb ?? null;
      const ch = lastLb != null && padSet.kind === "working" ? changedPlate(total, toDisplay(Number(lastLb)), unit) : null;
      padPlates = { bar: p.bar, perSide: p.perSide, changed: ch?.index ?? null };
    }
  }

  const minimise = () => {
    if (pad) commitPad(pad);
    if (!live) return void finish();
    const back = stepsBackToApp();
    if (back) window.history.go(-back);
    else router.push("/");
  };

  return (
    <div
      className="min-h-dvh bg-bg"
      onPointerDownCapture={(e) => {
        // the win card collapses at the next tap outside it
        if (win && !(e.target as Element).closest("[data-win]")) setWin(null);
      }}
    >
      {live && <RestWatcher sessionId={id} chimeOn={prefs.restChime} hapticsOn={prefs.haptics} keep />}
      <TopBar
        ref={headRef}
        short={labels.short}
        fullName={session.name}
        done={counts.done}
        total={counts.total}
        startedAt={session.started_at}
        dateLabel={live && !stale ? null : gymDate(session.local_date)}
        finishLabel={live ? "Finish" : "Done"}
        minimizeLabel={live ? "Minimise workout" : "Close and save"}
        minimizeIcon={live ? "down" : "close"}
        onMinimize={minimise}
        onFinish={() => (live ? openFinish() : void finish())}
        onLifts={() => setLiftsOpen(true)}
      >
        {offlineLine && <OfflineStrip pending={outbox.pending} />}
      </TopBar>

      <main className="relative mx-auto w-full max-w-col px-4 pt-4" style={{ paddingBottom: pad ? "calc(var(--safe-bottom) + 32px)" : "calc(var(--wk-dock-h, 260px) + 36px)" }} aria-label="Workout">
        {(showWin || showTip || restView) && <h1 className="sr-only">{labels.short}</h1>}
        {showWin && win && (
          <div className="space-y-3">
            <div className="flex min-h-14 items-center gap-3 rounded-card bg-control py-2 pl-5 pr-2" role="status">
              <Check className="size-5 shrink-0" strokeWidth={2.4} aria-hidden />
              <p className="t-body min-w-0 flex-1 truncate tabular-nums">{win.logged}</p>
              <button
                type="button"
                data-win=""
                onClick={() => {
                  win.undo();
                  setWin(null);
                }}
                className="press t-button h-11 shrink-0 rounded-pill px-4 text-fg"
              >
                Undo
              </button>
            </div>
            <div data-win="" onClick={() => setWin(null)} className="wk-rise">
              <WinCard weight={win.weight} unit={unit} reps={win.reps} sentence={win.sentence} lift={win.name} ariaLabel={win.spoken} />
            </div>
            {rest && <CompactRest rest={rest} onAdjust={adjustRest} onSkip={skipRest} />}
          </div>
        )}

        {!showWin && showTip && rest && advice && (
          <div className="space-y-3">
            <TipCard
              title={tipName}
              evidence={evidenceLine}
              rows={tipRowsList}
              short={short}
              onApply={applyTip}
              onSeeChange={() => setTipSheet(true)}
              onKeep={() => markTipFired(id, advice.muscle)}
            />
            <CompactRest rest={rest} onAdjust={adjustRest} onSkip={skipRest} />
          </div>
        )}

        {!showWin && !showTip && restView && (
          <div className="flex flex-col gap-5">
            {fromGroup && (
              <p className="t-row text-center text-fg-2 short:hidden" data-budget-name="">
                {fromGroup.name} · {fromGroup.done} of {fromGroup.total} done
              </p>
            )}
            <RestRing rest={rest!} />
            <RestControls onAdjust={adjustRest} onSkip={skipRest} />
            {tankSet && <TankRow value={tankSet.rir == null ? null : Number(tankSet.rir)} aim={tankAim} onChange={(v) => ops.updateSet(tankSet.id, { rir: v })} className="short:hidden" />}
          </div>
        )}

        {!showWin && !restView && allLogged && (
          <div className="pt-6 text-center">
            <h1 className="t-title">Every set is logged</h1>
            <p className="t-body mt-2 text-fg-2">Finish when you&apos;re ready.</p>
          </div>
        )}

        {!showWin && !restView && !allLogged && lift && inf && (
          <section aria-label="This lift">
            <div className="flex items-start gap-3">
              <h1 className="t-head short:t-sheet min-w-0 flex-1 line-clamp-2 short:line-clamp-1" data-budget-name="">
                {lift.name}
              </h1>
              <button type="button" onClick={() => setMoreOpen(true)} aria-label={`More for ${lift.name}`} className="press grid size-11 shrink-0 place-items-center rounded-full bg-control text-fg">
                <Ellipsis className="size-6" strokeWidth={2.2} aria-hidden />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <p className="t-body min-w-0 flex-1 font-medium text-fg-2">
                {target && groupOf.get(target.id)?.key === lift.key
                  ? [target.kind === "warmup" ? "Warm-up set" : `Set ${setLabel(lift, target)} of ${lift.working.length}`, aimLine(target.target_rep_low, target.target_rep_high, target.target_unit)].filter(Boolean).join(" · ")
                  : `${lift.done} of ${lift.total} sets done`}
              </p>
              <button
                type="button"
                onClick={() => setSetSheet(true)}
                aria-label={`${liftDone} of ${lift.sets.length} sets logged. Edit sets`}
                data-budget-group=""
                className="press flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill px-1.5"
              >
                {lift.sets.map((s) => (
                  <span
                    key={s.id}
                    aria-hidden
                    className={cn("size-2.5 rounded-full", s.completed ? "bg-fg" : s.id === dotsCurrent ? "border-2 border-fg" : "border-[1.5px] border-ui-line")}
                  />
                ))}
              </button>
            </div>
            <p className="t-label mt-2" data-history="">
              {(() => {
                const txt = lastTimeText(inf.last, inf.tracking, toDisplay);
                return txt ? `Last time ${txt}` : historyQ.isLoading ? "Last time …" : "First time";
              })()}
            </p>
            {warmSteps.length > 0 && (
              <button type="button" onClick={() => setWarmupOpen(true)} className="press t-label mt-1 inline-flex min-h-11 items-center gap-1 font-semibold text-fg">
                Warm-up · {warmSteps.length} steps <ChevronRight className="size-4 text-fg-3" aria-hidden />
              </button>
            )}
          </section>
        )}

        {!lift && (
          <div className="py-16 text-center">
            <h1 className="t-title">No lifts in this workout</h1>
            <p className="t-body mt-2 text-fg-2">Add one to start logging.</p>
            <Button variant="secondary" size="lg" className="mt-6" onClick={() => setPicker({ mode: "add" })}>
              Add exercise
            </Button>
          </div>
        )}
      </main>

      {dock && (
        <Dock hidden={finishOpen || !!pad} label={allLogged ? "Finish" : "Log the set"}>
          {editingNext ? (
            <>
              {numberCards}
              {goldLog("primary")}
            </>
          ) : (
            dock
          )}
        </Dock>
      )}

      {/* Sheets */}
      <KeypadSheet
        open={!!pad && !!padSet}
        title={padSet && padGroup ? `${padGroup.name} · ${pad?.field === "weight" ? "weight" : pad?.field === "rir" ? "reps in the tank" : isTimed(padInfo?.tracking ?? "weight_reps") ? "time" : "reps"}` : ""}
        text={pad?.text ?? ""}
        ghost={pad ? ghostTextFor(pad) : null}
        unitLabel={pad?.field === "weight" ? unit : pad?.field === "rir" ? "" : isTimed(padInfo?.tracking ?? "weight_reps") ? "sec" : "reps"}
        field={pad?.field ?? "work"}
        error={pad?.error ?? null}
        lastText={pad ? lastValueFor(pad) : null}
        plates={padPlates}
        unit={unit}
        systemKeyboard={prefs.systemKeyboard}
        onKey={padKey}
        onText={(text) => pad && setPad({ ...pad, text, fresh: false, error: null })}
        onLast={() => {
          if (!pad) return;
          const v = lastValueFor(pad);
          if (v != null) setPad({ ...pad, text: v, fresh: false, error: null });
        }}
        onDone={closePad}
      />

      <LiftsSheet
        open={liftsOpen}
        onOpenChange={setLiftsOpen}
        title={session.name}
        description={liftsDescription}
        progress={counts.total ? counts.done / counts.total : 0}
        rows={liftRows}
        optional={live ? optionalRows : []}
        notesCount={dayNotes.length}
        live={live}
        onPick={(key) => {
          const g = groups.find((x) => x.key === key);
          if (g) {
            if (groupState(g, skipped) === "skipped") toggleSkip(g);
            else openGroupKey(g);
            if (rest) skipRest();
          }
          setLiftsOpen(false);
        }}
        onMove={moveTo}
        onAddOptional={(slug) => {
          const e = optionalLeft.find((x) => x.slug === slug);
          if (e) void addOptional(e);
        }}
        onAdd={() => {
          setLiftsOpen(false);
          setPicker({ mode: "add" });
        }}
        onNotesToday={() => setNotesToday(true)}
        onWorkoutNote={() => setWorkoutNote(true)}
        onDiscard={() => void discard()}
      />
      <NotesTodaySheet open={notesToday} onOpenChange={setNotesToday} notes={dayNotes} />
      <NoteSheet
        open={workoutNote}
        onOpenChange={setWorkoutNote}
        title="Workout note"
        initial={session.notes ?? ""}
        placeholder="Energy, sleep, anything that affected today"
        onSave={(text) => {
          ops.updateSession({ notes: text || null });
          toast(text ? "Note saved" : "Note removed");
        }}
      />
      {lift && (
        <>
          <MoreSheet
            open={moreOpen}
            onOpenChange={setMoreOpen}
            name={lift.name}
            rir={lift.working[0]?.target_rir ?? null}
            skipped={groupState(lift, skipped) === "skipped"}
            hasNote={!!noteCarrier(lift)?.notes}
            onHowTo={() => setHowTo(true)}
            onSwap={() => setPicker({ mode: "replace", key: lift.key })}
            onHistory={() => setHistoryOpen(true)}
            onAddSet={() => addSet(lift)}
            onWarmup={() => addSet(lift, "warmup")}
            onNote={() => {
              const c = noteCarrier(lift);
              if (c) setNoteFor(c.id);
            }}
            onSkip={() => toggleSkip(lift)}
          />
          <HowToSheet open={howTo} onOpenChange={setHowTo} slug={lift.slug} name={lift.name} note={inf?.templateNote ?? null} rir={lift.working[0]?.target_rir ?? null} rest={lift.working[0]?.rest_sec ?? null} />
          <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} slug={lift.slug} name={lift.name} history={historyQ.data?.[lift.slug] ?? []} toDisplay={toDisplay} />
          <SetSheet
            open={setSheet}
            onOpenChange={setSetSheet}
            title={lift.name}
            rows={setRows}
            weight={hasWeight(inf?.tracking ?? "weight_reps") ? { unit: weightUnit(inf?.lib, inf?.tracking ?? "weight_reps", unit), step: nudgeStep("weight", { incrementLb: inf?.lib?.increment ?? 5, unit, timed: false }) } : null}
            work={{ unit: workUnit(inf?.tracking ?? "weight_reps", !!inf?.lib?.perSide), step: isTimed(inf?.tracking ?? "weight_reps") ? 5 : 1 }}
            aim={lift.working[0]?.target_rir ?? null}
            canCopy={!!inf?.last.length && lift.working.some((s) => !s.completed)}
            onPick={(sid) => {
              setOpenRef(sid);
              setSelId(sid);
            }}
            onWeight={(sid, v) => {
              const s = freshSet(sid);
              if (s) writeCell(s, "weight", String(v));
            }}
            onWork={(sid, v) => {
              const s = freshSet(sid);
              if (s) writeCell(s, "work", String(v));
            }}
            onRir={(sid, v) => ops.updateSet(sid, { rir: v })}
            onNote={(sid, text) => {
              ops.updateSet(sid, { notes: text || null });
              toast(text ? "Note saved" : "Note removed");
            }}
            onUnlog={(sid) => {
              const s = freshSet(sid);
              if (s?.completed) unlog(s);
            }}
            onRemove={(sid) => {
              const s = freshSet(sid);
              if (s) removeSet(s);
            }}
            onCopy={() => copyLast(lift)}
            onAdd={() => addSet(lift)}
          />
        </>
      )}
      <PickSheet
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        mode={picker?.mode ?? "add"}
        current={pickerGroup ? { slug: pickerGroup.slug, name: pickerGroup.name, logged: pickerGroup.sets.filter((s) => s.completed).length } : undefined}
        busySlug={busySlug}
        toDisplay={toDisplay}
        onPick={(l) => (picker?.mode === "replace" && pickerGroup ? void replaceWith(pickerGroup, l) : void addExercise(l))}
      />
      {noteFor && setMap.get(noteFor) && (
        <NoteSheet
          open
          onOpenChange={(o) => !o && setNoteFor(null)}
          title={`Note · ${setMap.get(noteFor)!.exercise_name}`}
          initial={setMap.get(noteFor)!.notes ?? ""}
          onSave={(text) => {
            ops.updateSet(noteFor, { notes: text || null });
            toast(text ? "Note saved" : "Note removed");
          }}
        />
      )}
      <WarmupSheet open={warmupOpen} onOpenChange={setWarmupOpen} steps={warmSteps} />
      <TipSheet open={tipSheet} onOpenChange={setTipSheet} title={tipName} rows={tipRowsList} onApply={applyTip} />
      <FinishSheet
        open={finishOpen}
        onOpenChange={setFinishOpen}
        name={session.name}
        line={finishLine(sets.filter((s) => !s.completed).length, sets.filter((s) => s.completed && s.kind === "working").length)}
        none={!sets.some((s) => s.completed)}
        saving={saving}
        error={finishError}
        onFinish={() => void finish()}
        onDiscard={() => void discard()}
      />
      <StaleSheet
        open={stale && !staleClosed && !finishOpen}
        onOpenChange={(o) => !o && setStaleClosed(true)}
        title={`This workout started ${session.local_date === addDays(today, -1) ? "yesterday" : `on ${dayName(session.local_date)}`}`}
        body={counts.done ? `Finish it to keep the ${counts.done} ${counts.done === 1 ? "set" : "sets"} you logged, or discard it.` : "Nothing was logged in it."}
        onFinish={() => {
          setStaleClosed(true);
          if (counts.done) void finish();
          else openFinish();
        }}
        onDiscard={() => void discard()}
      />
    </div>
  );
}

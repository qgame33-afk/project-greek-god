"use client";

// Gym Mode (docs/DESIGN-V2.md §3.2): the live workout. This component is the controller — it
// keeps every piece of the workout's state and logic exactly as it was (the outbox-backed set
// writes, the device copy and multi-device resync, the keypad, logging, rest, finish and
// discard) and hands plain values and callbacks to the presentational parts in ./gym/*.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudOff, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/components/ui/sheet";
import { friendlyError, must, sb, useToday, useUser } from "@/lib/data/core";
import { drained, useOutbox } from "@/lib/data/outbox";
import { useProfile } from "@/lib/data/profile";
import { useTemplates } from "@/lib/data/training";
import { dayName, shortDate } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import { getExercise } from "@/lib/training/library";
import { groupSessions, modeRir, plannedSetCount, suggest, type Mode, type PastSet } from "@/lib/training/progression";
import type { LibraryExercise, TemplateExercise, TemplateKey } from "@/lib/training/types";
import { formatLoad, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { formatGain, modeLabel, muscleLabel, repRange, suggestionReason, targetChips } from "@/lib/workout/copy";
import { changedPlate, endsAt as endsAtOf, friezeSegments, gymDate, lastRealSession, loadText, runningBest, targetLine } from "@/lib/workout/gym";
import { autoAdvances, nextCell, nudgeStep, padNudge, padPress, type PadKey } from "@/lib/workout/numpad";
import { platesFor, platesLabel } from "@/lib/workout/plates";
import { classifyLog, sessionRecords, type PriorBest } from "@/lib/workout/pr";
import { parsePrefs } from "@/lib/workout/prefs";
import { defaultRestSec, startRest } from "@/lib/workout/rest";
import {
  cellText,
  columnFor,
  currentGroupKey,
  defaultTargets,
  fieldsFor,
  firstOpenSet,
  ghostFor,
  groupSets,
  groupState,
  hasWeight,
  isGroupComplete,
  isTimed,
  moveKey,
  nextPendingGroupKey,
  noteCarrier,
  relocateNotes,
  renumber,
  resolveLog,
  retarget,
  rowErrorFields,
  sessionCounts,
  setChip,
  setLabel,
  setLoadText,
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
import { recordReps, timingsForGroup, type SetTiming } from "@/lib/workout/timing";
import type { CellField, Tracking, WSession, WSet } from "@/lib/workout/types";
import { unlockAudio } from "./audio";
import { applyPush, fetchPriorBests, fetchPriorHistory, invalidateTraining, liveKey, mergeLive, newSetRow, usePriorBests, usePriorHistory, useSessionOps, useSessionSync, type LiveData } from "./data";
import { Frieze, GymTopBar } from "./gym/GymTopBar";
import { useHeightVar, useNarrow, useWakeLock } from "./gym/hooks";
import { LiftHeader, type Carrot } from "./gym/LiftHeader";
import { LiftsSheet, type LiftRow } from "./gym/LiftsSheet";
import { Plates } from "./gym/Plates";
import { RecordBanner, type Moment } from "./gym/RecordBanner";
import { RestDial } from "./gym/RestDial";
import { SealPanel } from "./gym/SealPanel";
import { SetTower, type TowerCell } from "./gym/SetTower";
import { ThumbDeck, type DeckField, type DeckKey } from "./gym/ThumbDeck";
import { markInscription, rememberPlanned } from "./inscription/flags";
import { NumberPad } from "./NumberPad";
import { RestWatcher } from "./rest";
import { DiscardSheet, ExerciseMenuSheet, HowToSheet, NoteSheet, PickExerciseSheet, SetSheetActions } from "./sheets";
import { clearSessionStores, getDeviceCopy, getRest, markMoment, setDeviceCopy, setRest, setSkipped, useNowMinute, useOnline, useRest, useSkipped } from "./stores";
import { useTypicalMinutes } from "./typical";

const NO_GHOST: Ghost = { weight: null, work: null, weightSource: null, workSource: null };
const nowSec = () => Math.floor(Date.now() / 1000);
// Event-time clocks (taps, guards). Read inside handlers only; wrapped so the compiler's purity
// check, which cannot see that the deck's callbacks never run during render, stays quiet.
const nowMs = () => Date.now();
const perfMs = () => performance.now();
/** A second tap on the seal key this soon after a seal is a double tap, not the next set. */
const SEAL_GUARD_MS = 600;

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

type Snapshot = Partial<Pick<WSet, "weight_lb" | "reps" | "duration_sec" | "rir" | "completed" | "completed_at" | "exercise_order" | "exercise_slug" | "exercise_name" | "set_index" | "target_rep_low" | "target_rep_high" | "target_unit" | "target_rir" | "rest_sec" | "suggested_weight_lb">>;

const SNAP_KEYS = ["weight_lb", "reps", "duration_sec", "rir", "completed", "completed_at", "exercise_order", "exercise_slug", "exercise_name", "set_index", "target_rep_low", "target_rep_high", "target_unit", "target_rir", "rest_sec", "suggested_weight_lb"] as const;
function snap(s: WSet, keys: readonly (keyof Snapshot)[] = SNAP_KEYS): Snapshot {
  const o: Record<string, unknown> = {};
  for (const k of keys) o[k] = s[k];
  return o as Snapshot;
}

const BAR = { lb: 45, kg: 20 } as const;

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
  const template = session.template_key ? byKey[session.template_key as TemplateKey] : undefined;
  const ops = useSessionOps(id);
  const outbox = useOutbox();
  const isOnline = useOnline();

  const groups = useMemo(() => groupSets(sets), [sets]);
  const slugs = useMemo(() => [...new Set(groups.map((g) => g.slug))], [groups]);
  const historyQ = usePriorHistory(id, slugs, session.local_date);
  const bestsQ = usePriorBests(id, slugs, session.local_date);
  const bests = bestsQ.data;
  const skippedArr = useSkipped(id);
  const skipped = useMemo(() => new Set(skippedArr), [skippedArr]);
  const rest = useRest(live ? id : null);

  const fine = useMediaQuery("(min-width: 768px) and (pointer: fine)");
  const inline = prefs.systemKeyboard || fine;
  const fmt = useCallback((lb: number) => formatLoad(lb, unit, false), [unit]);

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

  const suggestions = useMemo(() => {
    const m = new Map<string, ReturnType<typeof suggest>>();
    if (!historyQ.data) return m;
    for (const g of groups) {
      const inf = info.get(g.key)!;
      const s = suggest(inf.tEx, inf.lib, historyQ.data[g.slug] ?? [], sessionMode);
      // The headline shows the session's own targets (a deload's are already trimmed when
      // the session is built — trimming them again would read "× 5" beside "2 × 5–6").
      const first = g.working[0];
      const stored = first?.target_rep_low != null && first.target_rep_high != null;
      m.set(g.key, stored ? { ...s, target: { ...s.target, low: first.target_rep_low!, high: first.target_rep_high! } } : s);
    }
    return m;
  }, [groups, info, historyQ.data, sessionMode]);

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
  // The set the deck logs: chosen in the tower, else the shown lift's first unlogged set.
  const [selId, setSelId] = useState<string | null>(null);
  const settleUntil = useRef(0);
  const settleGuard = (e: React.MouseEvent) => {
    if (perfMs() < settleUntil.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const currentKey = currentGroupKey(groups, skipped);
  const openGroup = (openRef ? groupOf.get(openRef) : undefined) ?? groups.find((g) => g.key === currentKey) ?? null;
  const upNext = live ? upNextSet(groups, openGroup?.key ?? null, skipped) : null;
  const counts = sessionCounts(groups);
  const anyLogged = sets.some((s) => s.completed);

  const scrollToGroup = useCallback((key: string) => {
    void key; // one lift is on screen at a time: bring its header back into view
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 60);
  }, []);

  const openGroupKey = (g: ExerciseGroup) => {
    setOpenRef(g.sets[0]?.id ?? null);
    setSelId(null);
    scrollToGroup(g.key);
  };

  /* ------------------------------------------------------- transient UI */

  const [momentSetId, setMomentSetId] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [keyPulse, setKeyPulse] = useState(0);
  const [, setPulseId] = useState<string | null>(null);
  const [, setFlashId] = useState<string | null>(null);
  // One entry per cell (`${setId}:${field}`): fixing one cell never hides another's error.
  const [errors, setErrorsState] = useState<CellErrors>({});
  const errorsRef = useRef(errors);
  const setCellError = (setId: string, field: CellField, error: string | null) => {
    errorsRef.current = withCellError(errorsRef.current, setId, field, error);
    setErrorsState(errorsRef.current);
  };
  const blink = (setter: (v: string | null) => void, value: string, ms: number) => {
    setter(value);
    window.setTimeout(() => setter(null), ms);
  };

  /* ------------------------------------------------------------- keypad */

  const [pad, setPad] = useState<PadState | null>(null);
  const padOpen = !!pad && !inline;
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

  const scrollRow = (setId: string) => {
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-set="${CSS.escape(setId)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  const openCell = (set: WSet, field: CellField) => {
    if (inline) {
      (document.querySelector(`[data-cell="${CSS.escape(`${set.id}:${field}`)}"]`) as HTMLInputElement | null)?.focus();
      return;
    }
    if (pad && pad.setId === set.id && pad.field === field) return;
    if (pad && !commitPad(pad)) return;
    const s = freshSet(set.id) ?? set;
    const g = groupOf.get(s.id);
    const t = g ? info.get(g.key)!.tracking : "weight_reps";
    // the deck follows the keypad's row, so the seal key logs what was typed
    if (g && g.key === openGroup?.key) setSelId(s.id);
    setPad({ setId: s.id, field, text: cellText(s, field, t, unit), fresh: true, error: null });
    scrollRow(s.id);
  };

  const closePad = () => {
    if (!pad) return;
    if (!commitPad(pad)) return;
    setPad(null);
  };

  const rowsOf = (g: ExerciseGroup) => g.sets.map((s) => s.id);
  const fieldsOfSet = (setId: string) => {
    const g = groupOf.get(setId);
    return g ? fieldsFor(info.get(g.key)!.tracking) : (["work"] as CellField[]);
  };

  const advance = (p: PadState) => {
    if (!commitPad(p)) return;
    const g = groupOf.get(p.setId);
    const target = g ? nextCell(rowsOf(g), { setId: p.setId, field: p.field }, fieldsOfSet) : null;
    if (!target) {
      setPad(null);
      return;
    }
    const s = freshSet(target.setId);
    if (!s) return setPad(null);
    const t = info.get(groupOf.get(s.id)!.key)!.tracking;
    if (s.id !== p.setId) setSelId(s.id);
    setPad({ setId: s.id, field: target.field, text: cellText(s, target.field, t, unit), fresh: true, error: null });
    scrollRow(s.id);
  };

  const padKey = (k: PadKey) => {
    if (!pad) return;
    const next = padPress({ text: pad.text, fresh: pad.fresh }, k, pad.field);
    const np = { ...pad, ...next, error: null };
    if (autoAdvances(pad.field, k, !!freshSet(pad.setId)?.completed)) advance(np);
    else setPad(np);
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
    toast(`${nameOf(set)} unlogged`, { action: { label: "Undo", onClick: () => ops.updateSet(set.id, prev) }, duration: 6000 });
  };

  const logSet = (input: WSet) => {
    // A draft in the keypad (on any row) is written first, so nothing typed is ever lost.
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
    if (prefs.haptics) haptic(10);

    const logged: WSet = { ...set, ...res.values };
    const loadText_ = setLoadText(logged, inf.tracking, fmt, unit);
    toast(`${nameOf(set)} logged · ${loadText_}`, {
      action: {
        label: "Undo",
        onClick: () => {
          ops.updateSet(set.id, before);
          if (getRest(id)?.fromSetId === set.id) setRest(id, null);
        },
      },
      duration: 6000,
    });

    // Records: only against real prior history, once per exercise per session (§3.2.6).
    if (live && set.kind === "working" && bests) {
      const c = classifyLog(logged, g, bests[g.slug]);
      if (c.kind === "pr" && markMoment(id, g.slug)) {
        const e = Math.round(toDisplayWeight(c.e1rm!, unit));
        const gain = formatGain(c.gain ?? 1, unit);
        const unitWord = unit === "kg" ? "kilograms" : "pounds";
        setMoment({ kind: "record", id: t0, name: g.name, e1rm: String(e), gain, spoken: `New record. ${g.name} ${loadText_.replace(" × ", " for ")}, estimated max ${e} ${unitWord}, up ${gain.replace("+", "")}.` });
        blink(setMomentSetId, set.id, 1300);
        if (prefs.haptics) haptic([12, 50, 18]);
      } else if (c.kind === "first" && markMoment(id, g.slug)) {
        setMoment({ kind: "first", id: t0, name: g.name, spoken: `First benchmark. ${g.name} ${loadText_.replace(" × ", " for ")}. Next time, this is the number to beat.` });
      }
    }

    if (!live) return;
    // What comes next, computed on the post-log state.
    const after = groupSets(sets.map((s) => (s.id === set.id ? logged : s)));
    const ag = after.find((x) => x.sets.some((s) => s.id === set.id));
    let nextKey = ag?.key ?? null;
    if (ag && isGroupComplete(ag)) nextKey = nextPendingGroupKey(after, ag.key, skipped);
    const nx = nextKey ? upNextSet(after, nextKey, skipped) : null;
    const ng = nx ? after.find((x) => x.sets.some((s) => s.id === nx.id)) : undefined;

    if (set.kind === "working") {
      if (nx && ng) {
        const ninf = info.get(ng.key) ?? info.get(g.key)!;
        const gh = ghostFor(nx, ng, ninf.last, ninf.tracking, ninf.lib?.increment ?? 5);
        const shown = { weight_lb: nx.weight_lb ?? gh.weight, reps: isTimed(ninf.tracking) ? null : (nx.reps ?? gh.work), duration_sec: isTimed(ninf.tracking) ? (nx.duration_sec ?? gh.work) : null };
        const hasLoad = (hasWeight(ninf.tracking) && shown.weight_lb != null) || (isTimed(ninf.tracking) ? shown.duration_sec != null : shown.reps != null);
        const started = startRest(nowSec(), restFor(set, inf), {
          sessionId: id,
          fromSetId: set.id,
          exercise: g.name,
          next: { setId: nx.id, exercise: ng.name, set: nx.kind === "warmup" ? "Warm-up" : `Set ${setLabel(ng, nx)}`, load: hasLoad ? setLoadText(shown, ninf.tracking, fmt, unit) : null },
        });
        setRest(id, started);
      } else {
        setRest(id, null);
        toast("Every set is logged. Seal when you're ready.");
      }
    }
    if (ag && isGroupComplete(ag) && ng && ng.key !== ag.key) {
      // The next lift takes the screen; a quick second tap must not land on a control that
      // just moved under the thumb.
      settleUntil.current = perfMs() + 800;
      setOpenRef(ng.sets[0].id);
      scrollToGroup(ng.key);
    }
  };

  const padLog = () => {
    if (!pad) return;
    if (!commitPad(pad)) return;
    const s = freshSet(pad.setId);
    if (!s) return;
    if (s.completed) {
      setPad(null);
      return;
    }
    taps.current.delete(s.id);
    lastSeal.current = nowMs();
    logSet(s);
  };

  /* ----------------------------------------------------- rest finished */

  const onRestDone = useCallback((r: { next: { setId: string | null } | null }) => {
    const target = r.next?.setId;
    if (!target) return;
    window.setTimeout(() => document.querySelector(`[data-set="${CSS.escape(target)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
    setPulseId(target);
    window.setTimeout(() => setPulseId(null), 1300);
  }, []);
  const onRestZero = useCallback(() => setKeyPulse((n) => n + 1), []);

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
    scrollRow(row.id);
  };

  const removeSet = (set: WSet) => {
    ops.deleteSets([set.id]);
    if (getRest(id)?.fromSetId === set.id) setRest(id, null);
    if (pad?.setId === set.id) setPad(null);
    if (selId === set.id) setSelId(null);
    toast(`${nameOf(set)} removed`, { action: { label: "Undo", onClick: () => ops.insertSets([set]) }, duration: 6000 });
  };

  const removeLastOpen = (g: ExerciseGroup) => {
    const s = [...g.working].reverse().find((x) => !x.completed);
    if (s) removeSet(s);
  };

  const move = (g: ExerciseGroup, dir: -1 | 1) => {
    const keys = moveKey(
      groups.map((x) => x.key),
      g.key,
      dir,
    );
    const changes = renumber(groups, keys);
    if (!changes.length) return;
    const before = changes.map((c) => ({ id: c.id, values: { exercise_order: setMap.get(c.id)!.exercise_order } }));
    ops.updateSets(changes.map((c) => ({ id: c.id, values: { exercise_order: c.exercise_order } })));
    toast(`${g.name} moved ${dir < 0 ? "up" : "down"}`, { action: { label: "Undo", onClick: () => ops.updateSets(before) }, duration: 6000 });
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
      description: "Its unlogged sets are dropped when you seal.",
      action: { label: "Undo", onClick: () => setSkipped(id, skippedArr) },
      duration: 6000,
    });
  };

  const copyPast = (g: ExerciseGroup, index: number) => {
    const inf = info.get(g.key)!;
    const src = inf.last[index];
    if (!src) return;
    const target = (g.working[index] && !g.working[index].completed ? g.working[index] : undefined) ?? g.working.find((s) => !s.completed);
    if (!target) return;
    ops.updateSet(target.id, isTimed(inf.tracking) ? { weight_lb: src.weight_lb, duration_sec: src.duration_sec } : { weight_lb: hasWeight(inf.tracking) ? src.weight_lb : null, reps: src.reps });
    blink(setFlashId, target.id, 420);
    if (pad?.setId === target.id) setPad(null);
    setSelId(target.id);
    toast(`Last time's set ${index + 1} copied into ${nameOf(target)}`, { id: `wk-copy-${target.id}` });
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
      const tg = retarget({ low: first?.target_rep_low ?? null, high: first?.target_rep_high ?? null, unit: first?.target_unit ?? null, rir: first?.target_rir ?? null, sets: g.total || 3 }, lib);
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
      toast(`Replaced with ${lib.name}`, {
        description: hasLogged ? `Logged sets stay with ${g.name}.` : undefined,
        action: { label: "Undo", onClick: () => ops.updateSets(before) },
        duration: 6000,
      });
    } finally {
      setBusySlug(null);
    }
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
      const order = Math.max(-1, ...groups.map((g) => g.order)) + 1;
      const rows = Array.from({ length: n }, (_, i) =>
        newSetRow({
          session_id: id,
          user_id: userId,
          local_date: session.local_date,
          exercise_slug: lib.slug,
          exercise_name: lib.name,
          exercise_order: order,
          set_index: i,
          target_rep_low: sug.target.low,
          target_rep_high: sug.target.high,
          target_unit: tg.unit,
          target_rir: modeRir(tEx, sessionMode),
          rest_sec: tg.rest,
          suggested_weight_lb: sug.weightLb,
        }),
      );
      ops.insertSets(rows);
      setOpenRef(rows[0].id);
      setSelId(null);
      setPicker(null);
      setLiftsOpen(false);
      scrollToGroup(`${order}:${lib.slug}`);
      toast(`Added ${lib.name}`, { action: { label: "Undo", onClick: () => ops.deleteSets(rows.map((r) => r.id)) }, duration: 6000 });
    } finally {
      setBusySlug(null);
    }
  };

  /* ------------------------------------------------------------ sheets */

  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [howTo, setHowTo] = useState<{ slug: string; name: string; note: string | null } | null>(null);
  const [picker, setPicker] = useState<{ mode: "replace" | "add"; key?: string } | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null); // set id
  const [setMenu, setSetMenu] = useState<string | null>(null); // set id
  const [liftsOpen, setLiftsOpen] = useState(false);
  const menuGroup = groups.find((g) => g.key === menuKey) ?? null;
  const pickerGroup = picker?.key ? (groups.find((g) => g.key === picker.key) ?? null) : null;

  /* ------------------------------------------------------- session notes */

  const [notes, setNotes] = useState(session.notes ?? "");
  // A note changed on another device (merged in by a sync) replaces the text here unless
  // this device has unsaved typing of its own.
  const [notesSeen, setNotesSeen] = useState(session.notes ?? null);
  if ((session.notes ?? null) !== notesSeen) {
    setNotesSeen(session.notes ?? null);
    if ((notes.trim() || null) === notesSeen) setNotes(session.notes ?? "");
  }
  useEffect(() => {
    const want = notes.trim() || null;
    if (want === (session.notes ?? null)) return;
    const t = window.setTimeout(() => ops.updateSession({ notes: want }), 800);
    return () => window.clearTimeout(t);
  }, [notes, session.notes, ops]);

  /* ------------------------------------------------- finish and discard */

  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  // A "no connection" note goes stale the moment the connection is back.
  const [seenOnline, setSeenOnline] = useState(isOnline);
  if (seenOnline !== isOnline) {
    setSeenOnline(isOnline);
    if (isOnline && finishError) setFinishError(null);
  }
  const openFinish = () => {
    setFinishError(null);
    setFinishOpen(true);
    void ops.sync(); // the panel's count includes sets logged on another device
  };
  const busy = useRef(false);

  const finish = async () => {
    if (busy.current) return;
    if (pad && !commitPad(pad)) return;
    busy.current = true;
    setSaving(true);
    setFinishError(null);
    setPad(null);
    // The Inscription shows "14 of 17 planned sets" — the plan is only known before the seal
    // drops the unlogged sets, so it is noted on this device now.
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
      const baseNotes = notes.trim() || null;
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
      const counts = { total_volume_lb: totals.volumeLb, sets_completed: totals.setsCompleted, pr_count: prCount, notes: finalNotes };
      const values = live && !endedElsewhere ? { status: "done", ended_at: new Date(endMs).toISOString(), duration_sec: durationSec(session.started_at, endMs), ...counts } : counts;
      let q = sb().from("workout_sessions").update(values).eq("id", id);
      if (live && !endedElsewhere) q = q.eq("status", "active"); // a second tap can't finish twice
      const updated = must(await q.select("*").maybeSingle());
      const finalSession: WSession = updated ?? (must(await sb().from("workout_sessions").select("*").eq("id", id).single()) as WSession);
      clearSessionStores(id);
      // Undo on a "Set 3 logged" toast still on screen would now unlog a set of a saved
      // session behind its totals: per-set undos end when the session is saved.
      toast.dismiss();
      // The Inscription plays its moment once, for the seal that just happened.
      if (live && !endedElsewhere) markInscription(id);
      ops.setData({ session: finalSession, sets: fresh });
      // nothing is open any more: the shell's live slot and Begin know at once (and the offline
      // cache never restores a sealed session as the open one)
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
      const text = offline ? "No connection. Every set is safe on this device — seal again when you're back online." : `Couldn't save: ${msg} Every set is still on this device.`;
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
    setDiscarding(true);
    try {
      await drained(5000);
      must(await sb().from("workout_sessions").update({ status: "discarded", ended_at: new Date().toISOString() }).eq("id", id).select("id").single());
      clearSessionStores(id);
      toast.dismiss(); // per-set undos belong to the session that was just discarded
      ops.setData({ ...data, session: { ...session, status: "discarded" } });
      qc.setQueryData(["sessions", "active", userId], null);
      invalidateTraining(qc);
      setDiscardOpen(false);
      setFinishOpen(false);
      toast("Workout discarded", {
        action: {
          label: "Undo",
          onClick: async () => {
            const { error } = await sb().from("workout_sessions").update({ status: "active", ended_at: null }).eq("id", id);
            if (error) return toast.error("Couldn't restore it", { description: friendlyError(error.message) });
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
      setDiscarding(false);
    }
  };

  /* ------------------------------------------------------------ effects */

  // Keep the targeted row clear of the keypad when the browser scrolls it into view.
  useEffect(() => {
    if (!pad || inline) return;
    const html = document.documentElement;
    html.style.scrollPaddingBottom = "400px";
    return () => {
      html.style.scrollPaddingBottom = "";
    };
  }, [pad, inline]);

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
    toast.error("A change couldn't be saved", { description: `${friendlyError(outbox.error)} The workout was reloaded from the server.` });
    void ops.reload();
  }, [outbox.error, ops]);

  // Safety net under the outbox and the multi-device merge: whenever the outbox goes idle,
  // on focus and every 20 s, the server's copy is merged in (sets logged on another device
  // appear) and only this device's own unconfirmed changes are re-sent.
  useSessionSync(ops, live);

  // A session opened straight from Begin (its cache seeded by useStartWorkout) gets the same
  // device copy a first fetch would have written, so a reload with no signal still opens it.
  useEffect(() => {
    if (live && !getDeviceCopy(id)) setDeviceCopy(id, data, emptyJournal());
    // once per session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, live]);

  /* ----------------------------------------------------------- the view */

  const rootRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  // 20rem on the full Gym Mode width: a 375–390 px phone at the default and Large text sizes
  // keeps the side-by-side deck; from Extra Large (and every AX size) it stacks.
  const narrow = useNarrow(rootRef, 20);
  const awake = useWakeLock(live);
  const typical = useTypicalMinutes(session.template_key);
  const minute = useNowMinute();
  const stale = live && isStaleSession(session.local_date, today, session.started_at, lastCompletedAt(sets), minute * 60000);
  const lastSeal = useRef(0);

  const lift = openGroup ?? groups.at(-1) ?? null;
  const inf = lift ? info.get(lift.key) : undefined;
  const t: Tracking = inf?.tracking ?? "weight_reps";
  const selSet = selId ? setMap.get(selId) : undefined;
  const deckSet: WSet | null = (selSet && lift && groupOf.get(selSet.id)?.key === lift.key ? selSet : undefined) ?? (lift ? (firstOpenSet(lift) ?? lift.sets.at(-1) ?? null) : null);
  const deckGhost = deckSet ? (ghosts.get(deckSet.id) ?? NO_GHOST) : NO_GHOST;
  const plaques = useMemo(() => (bests ? sessionRecords(groups, bests) : []), [groups, bests]);

  useHeightVar(headRef, "--gym-head-h");
  useHeightVar(deckRef, "--gym-deck-h", !!deckSet && !padOpen);
  // Toasts ("Set 1 logged · Undo") sit just under the top bar, over the frieze; while a record
  // banner shows they drop below it, so the moment and its Undo never cover each other.
  useEffect(() => {
    const root = document.documentElement;
    const el = bannerRef.current;
    if (!moment || !el) {
      root.style.setProperty("--gym-toast-top", "calc(var(--safe-top) + var(--topbar-h) + 4px)");
      return;
    }
    const set = () => root.style.setProperty("--gym-toast-top", `${Math.ceil(el.getBoundingClientRect().bottom + 8)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [moment]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--gym-toast-top");
    },
    [],
  );

  // A new current set always sits in view, never under the deck (§3.2.1). Checked once the
  // screen settles and again after late content (the target line, a toast) has moved it.
  const deckId = deckSet?.id ?? null;
  useEffect(() => {
    if (!deckId) return;
    const reveal = (smooth: boolean) => {
      const el = document.querySelector(`[data-set="${CSS.escape(deckId)}"]`);
      const r = el?.getBoundingClientRect();
      if (!r) return;
      const deck = deckRef.current?.getBoundingClientRect().top ?? window.innerHeight;
      const head = headRef.current?.getBoundingClientRect().bottom ?? 0;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const by = r.bottom > deck - 8 ? r.bottom - deck + 12 : r.top < head ? r.top - head - 12 : 0;
      if (by) window.scrollBy({ top: by, behavior: smooth && !reduced ? "smooth" : "auto" });
    };
    const a = window.setTimeout(() => reveal(true), 80);
    const b = window.setTimeout(() => reveal(false), 900);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [deckId]);

  // The shown lift moved away (removed, replaced): forget a selection that no longer applies.
  if (selId && !setMap.has(selId)) setSelId(null);

  /* deck values */
  const typedLoad = deckSet?.weight_lb != null ? Number(deckSet.weight_lb) : null;
  const shownLoadLb = typedLoad ?? deckGhost.weight;
  const typedWork = deckSet ? (isTimed(t) ? deckSet.duration_sec : deckSet.reps) : null;
  const shownWork = typedWork ?? deckGhost.work;
  const displayLoad = shownLoadLb == null ? null : round(toDisplayWeight(shownLoadLb, unit), 1);
  const loadStep = nudgeStep("weight", { incrementLb: inf?.lib?.increment ?? 5, unit, timed: isTimed(t) });
  const workStep = nudgeStep("work", { incrementLb: 5, unit, timed: isTimed(t) });

  const stepLoad = (dir: 1 | -1) => {
    if (!deckSet) return;
    const s = freshSet(deckSet.id) ?? deckSet;
    const g = ghosts.get(s.id) ?? NO_GHOST;
    const curLb = s.weight_lb != null ? Number(s.weight_lb) : g.weight;
    const base = curLb == null ? null : round(toDisplayWeight(curLb, unit), 1);
    const start = inf?.lib?.equipment === "barbell" ? BAR[unit] : 0;
    const next = base == null ? (dir > 0 ? Math.max(start, loadStep) : start) : Math.max(0, round(base + dir * loadStep, 1));
    if (base != null && next === base) return;
    writeCell(s, "weight", String(next));
  };
  const stepWork = (dir: 1 | -1) => {
    if (!deckSet) return;
    const s = freshSet(deckSet.id) ?? deckSet;
    const g = ghosts.get(s.id) ?? NO_GHOST;
    const cur = (isTimed(t) ? s.duration_sec : s.reps) ?? g.work;
    const base = cur == null ? null : Number(cur);
    const next = base == null ? (s.target_rep_low ?? workStep) : Math.max(workStep, base + dir * workStep);
    if (base != null && next === base) return;
    writeCell(s, "work", String(next));
  };

  const loadField: DeckField | null =
    deckSet && hasWeight(t)
      ? {
          text: displayLoad == null ? "—" : loadText(shownLoadLb, unit),
          value: displayLoad,
          ghost: typedLoad == null,
          unitLabel: t === "bodyweight_reps" ? `+${unit}` : inf?.lib?.perHand ? `${unit} / hand` : unit,
          unitWord: unit === "kg" ? "kilograms" : "pounds",
          name: t === "bodyweight_reps" ? "Added load" : "Load",
          step: loadStep,
          min: 0,
          max: unit === "kg" ? 680 : 1500,
          onStep: stepLoad,
          onOpen: () => openCell(deckSet, "weight"),
          onCommit: inline ? (raw) => writeCell(freshSet(deckSet.id) ?? deckSet, "weight", raw) : undefined,
          editText: cellText(deckSet, "weight", t, unit),
          invalid: !!errors[`${deckSet.id}:weight`],
        }
      : null;
  const workField: DeckField = {
    text: shownWork == null ? "—" : String(shownWork),
    value: shownWork == null ? null : Number(shownWork),
    ghost: typedWork == null,
    unitLabel: isTimed(t) ? "sec" : inf?.lib?.perSide || deckSet?.target_unit === "each" ? "reps / side" : "reps",
    unitWord: isTimed(t) ? "seconds" : "reps",
    name: isTimed(t) ? "Seconds" : "Reps",
    step: workStep,
    min: 1,
    max: isTimed(t) ? 900 : 100,
    onStep: stepWork,
    onOpen: () => deckSet && openCell(deckSet, "work"),
    onCommit: inline && deckSet ? (raw) => writeCell(freshSet(deckSet.id) ?? deckSet, "work", raw) : undefined,
    editText: deckSet ? cellText(deckSet, "work", t, unit) : "",
    invalid: !!(deckSet && errors[`${deckSet.id}:work`]),
  };
  const deckError = deckSet ? (rowErrorFields(errors, deckSet.id).map((f) => errors[`${deckSet.id}:${f}`])[0] ?? null) : null;

  const deckLabel = deckSet && lift ? (deckSet.kind === "warmup" ? "warm-up" : `set ${setLabel(lift, deckSet)}`) : "";
  const shownText = deckSet && (shownLoadLb != null || shownWork != null) ? setLoadText({ weight_lb: shownLoadLb, reps: isTimed(t) ? null : shownWork, duration_sec: isTimed(t) ? shownWork : null }, t, fmt, unit) : null;
  const sealDeck = () => {
    if (!deckSet) return;
    const now = nowMs();
    if (now - lastSeal.current < SEAL_GUARD_MS) return;
    lastSeal.current = now;
    logSet(deckSet);
  };
  const toUpNext = () => {
    if (!upNext) return;
    setOpenRef(upNext.id);
    setSelId(null);
    scrollToGroup("");
  };
  const allLogged = live && !upNext;
  const upNextGroup = upNext ? groupOf.get(upNext.id) : undefined;
  let deckKey: DeckKey;
  // At AX sizes the values are already in the steppers right above: the key keeps to its verb.
  if (deckSet && !deckSet.completed) deckKey = { kind: "seal", label: `${live ? "Seal" : "Save"} ${deckLabel}`, detail: narrow ? null : shownText, onPress: sealDeck, pulse: keyPulse };
  else if (allLogged) deckKey = { kind: "hold", label: `Hold to seal ${session.name}`, onHold: () => void finish(), onTap: openFinish, pulse: keyPulse };
  else if (live && upNext && upNextGroup)
    deckKey = {
      kind: "nav",
      label: upNextGroup.key === lift?.key ? `Back to ${upNext.kind === "warmup" ? "warm-up" : `set ${setLabel(upNextGroup, upNext)}`}` : `Up next · ${upNextGroup.name}`,
      onPress: toUpNext,
    };
  else {
    // editing a past session: walk the sets, then save
    const order = groups.flatMap((g) => g.sets);
    const i = deckSet ? order.findIndex((s) => s.id === deckSet.id) : -1;
    const nextSet = i >= 0 ? order[i + 1] : undefined;
    deckKey = nextSet
      ? {
          kind: "nav",
          label: "Next set",
          onPress: () => {
            setOpenRef(nextSet.id);
            setSelId(nextSet.id);
          },
        }
      : { kind: "seal", label: "Save changes", detail: null, onPress: () => void finish(), pulse: keyPulse, disabled: saving };
  }

  /* tower */
  const timings = lift ? timingsForGroup(lift.working, bests?.[lift.slug], historyQ.data?.[lift.slug] ?? [], sessionMode) : new Map<string, { timing: SetTiming }>();
  const cellFor = (s: WSet): TowerCell => {
    const g = ghosts.get(s.id) ?? NO_GHOST;
    const w = s.weight_lb != null ? Number(s.weight_lb) : s.completed ? null : g.weight;
    const work = (isTimed(t) ? s.duration_sec : s.reps) ?? (s.completed ? null : g.work);
    const ghost = !s.completed && s.weight_lb == null && (isTimed(t) ? s.duration_sec : s.reps) == null;
    const label = s.kind === "warmup" ? "Warm-up" : `Set ${lift ? setLabel(lift, s) : ""}`;
    const timing = s.completed && s.kind === "working" ? (timings.get(s.id)?.timing ?? null) : null;
    const loadStr = hasWeight(t) && w != null && (w > 0 || t !== "bodyweight_reps") ? `${t === "bodyweight_reps" ? "+" : ""}${loadText(w, unit)}` : null;
    const workStr = work == null ? null : isTimed(t) ? `${work} s` : String(work);
    const current = s.id === deckSet?.id;
    const word = s.completed ? (timing ? { record: "record", beat: "beat last time", matched: "matched last time", below: "below last time", first: "first benchmark" }[timing as string] : "logged") : current ? "this set" : "up next";
    const spokenLoad = loadStr ? `${loadStr} ${unit === "kg" ? "kilograms" : "pounds"}${workStr ? ` for ${workStr}` : ""}` : (workStr ?? "no values yet");
    return {
      key: s.id,
      kind: "set",
      setId: s.id,
      label,
      load: loadStr,
      work: workStr,
      ghost,
      current,
      logged: s.completed,
      timing,
      moment: momentSetId === s.id,
      spoken: `${label}, ${spokenLoad}${ghost && !s.completed ? ", suggested" : ""}, ${word}`,
    };
  };
  const towerCells: TowerCell[] = (() => {
    if (!lift || !deckSet) return [];
    const list = lift.sets;
    const di = list.findIndex((s) => s.id === deckSet.id);
    const add: TowerCell = { key: "add", kind: "add", label: "Add set", load: null, work: null, ghost: false, current: false, logged: false, timing: null, spoken: "Add set" };
    if (di <= 0) {
      const past = inf?.last[0];
      const lastCell: TowerCell = {
        key: "last",
        kind: "last",
        label: "Last time",
        load: past && hasWeight(t) && past.weight_lb ? `${t === "bodyweight_reps" ? "+" : ""}${loadText(past.weight_lb, unit)}` : null,
        work: past ? (isTimed(t) ? `${past.duration_sec ?? 0} s` : String(past.reps ?? 0)) : null,
        ghost: true,
        current: false,
        logged: false,
        timing: null,
        spoken: past ? `Last time, set 1, ${setChip(past, t, fmt)} · ${gymDate(past.local_date).slice(4)}` : "No previous session",
      };
      return [lastCell, cellFor(list[0]), list[1] ? cellFor(list[1]) : add];
    }
    return [cellFor(list[di - 1]), cellFor(list[di]), list[di + 1] ? cellFor(list[di + 1]) : add];
  })();

  /* lift header */
  const suggestion = lift ? (suggestions.get(lift.key) ?? null) : null;
  const target = suggestion && lift ? targetLine(suggestion, lastRealSession(historyQ.data?.[lift.slug] ?? []), fmt, t) : null;
  const prior = lift ? bests?.[lift.slug] : undefined;
  const firstBenchmark = !!prior && prior.sets === 0 && lift?.working.length !== 0 && deckSet?.kind === "working";
  let carrot: Carrot | null = null;
  if (lift && deckSet && deckSet.kind === "working" && !deckSet.completed && t === "weight_reps" && prior && prior.sets > 0) {
    const rr = recordReps(shownLoadLb, runningBest(prior, lift.working.filter((s) => s.completed), deckSet.id));
    if (rr) carrot = { reps: rr.reps, e1rm: String(Math.round(toDisplayWeight(rr.e1rm, unit))), best: String(Math.round(toDisplayWeight(rr.best, unit))) };
  }
  const carrier = lift ? noteCarrier(lift) : null;

  /* plates */
  const barbell = inf?.lib?.equipment === "barbell" && hasWeight(t);
  const plateLoad = barbell && displayLoad != null ? platesFor(displayLoad, unit) : null;
  const posInWorking = lift && deckSet ? lift.working.findIndex((s) => s.id === deckSet.id) : -1;
  const lastSameLb = inf?.last[Math.max(0, posInWorking)]?.weight_lb ?? inf?.last[0]?.weight_lb ?? null;
  const plateChange = plateLoad && deckSet?.kind === "working" && lastSameLb != null ? changedPlate(displayLoad, round(toDisplayWeight(Number(lastSameLb), unit), 1), unit) : null;
  const plateOk = plateLoad && platesLabel(displayLoad!, unit) != null;

  /* frieze */
  const segments = friezeSegments(groups, deckSet?.kind === "working" ? deckSet.id : null, skipped);
  const ends = live && !stale ? endsAtOf(session.started_at, typical) : null;

  /* lifts sheet */
  const liftRows: LiftRow[] = groups.map((g, i) => {
    const gi = info.get(g.key)!;
    const state = groupState(g, skipped);
    const doneLine = g.working.filter((s) => s.completed).map((s) => setChip(s, gi.tracking, fmt));
    return {
      key: g.key,
      index: i + 1,
      name: g.name,
      state,
      current: g.key === lift?.key,
      detail: g.done ? `${g.done}/${g.total} · ${doneLine.join(" · ")}` : `${g.total} × ${repRange(g.working[0]?.target_rep_low ?? null, g.working[0]?.target_rep_high ?? null, g.working[0]?.target_unit ?? null)}`,
      record: plaques.some((p) => p.slug === g.slug),
    };
  });

  const setMenuSet = setMenu ? setMap.get(setMenu) : undefined;
  const noteSet = noteFor ? setMap.get(noteFor) : undefined;
  const plannedRest = deckSet && inf && deckSet.kind === "working" && !deckSet.completed ? restFor(deckSet, inf) : null;
  const offlineLine = !isOnline || (outbox.pending > 0 && isNetworkError(outbox.error));
  const showDeck = !!deckSet && !padOpen;

  return (
    // overflow-anchor:none — scroll adjustments are made explicitly, so the browser's own
    // anchoring must not apply a second one.
    <div ref={rootRef} data-mode="gym" className="min-h-dvh bg-obsidian [overflow-anchor:none]">
      {live && <RestWatcher sessionId={id} chimeOn={prefs.restChime} hapticsOn={prefs.haptics} onDone={onRestDone} />}
      <GymTopBar
        ref={headRef}
        name={session.name}
        startedAt={session.started_at}
        dateLabel={live && !stale ? null : gymDate(session.local_date)}
        awake={awake}
        finishLabel={live ? "Finish" : "Done"}
        minimizeLabel={live ? "Minimise workout" : "Back to the session"}
        minimizeIcon={live ? "down" : "close"}
        onMinimize={() => {
          if (pad) commitPad(pad);
          if (live) router.push("/");
          else void finish();
        }}
        onFinish={() => {
          if (pad && !commitPad(pad)) return;
          setPad(null);
          if (live) openFinish();
          else void finish();
        }}
        frieze={
          groups.length > 0 && (
            <Frieze
              segments={segments}
              done={counts.done}
              total={counts.total}
              endsAt={ends}
              typicalMin={typical}
              templateName={template?.name ?? session.name}
              onOpen={() => setLiftsOpen(true)}
            />
          )
        }
      />

      <main
        className="relative mx-auto w-full max-w-col px-4"
        style={{ paddingBottom: padOpen ? "calc(412px + var(--safe-bottom))" : showDeck ? "calc(var(--gym-deck-h, 168px) + 20px)" : "calc(var(--safe-bottom) + 32px)" }}
        aria-label="Workout"
        onClickCapture={settleGuard}
      >
        {moment && (
          <div ref={bannerRef} className="absolute inset-x-4 top-2 z-10">
            <RecordBanner moment={moment} rest={rest} onDismiss={() => setMoment(null)} />
          </div>
        )}

        {offlineLine && (
          <p className="t-meta flex min-h-8 items-center gap-2 text-stone" role="status">
            <CloudOff className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
            Offline · {outbox.pending > 0 ? `${outbox.pending} ${outbox.pending === 1 ? "change" : "changes"} waiting to sync` : "sets are kept on this phone"}
          </p>
        )}

        {stale && (
          <div className="mt-3 rounded-card bg-m1 p-4 shadow-[inset_0_0_0_1px_var(--vein-3)]" role="status">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-stone" strokeWidth={1.6} aria-hidden />
              <div>
                <p className="t-title-3 text-ivory">
                  This session is from {dayName(session.local_date)}, {shortDate(session.local_date)}
                </p>
                <p className="t-callout mt-1 text-stone">
                  {counts.done ? `Seal it to keep the ${counts.done} ${counts.done === 1 ? "set" : "sets"} you logged, or discard it.` : "Nothing was logged. Discard it, or seal what you did."}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={openFinish}>
                Seal
              </Button>
              <Button variant="ghost" onClick={() => setDiscardOpen(true)}>
                Discard
              </Button>
            </div>
          </div>
        )}

        {lift && inf ? (
          <>
            <LiftHeader
              index={groups.indexOf(lift) + 1}
              count={groups.length}
              muscles={(inf.lib?.primary ?? []).map(muscleLabel)}
              modeWord={sessionMode !== "standard" ? modeLabel(sessionMode) : null}
              name={lift.name}
              target={target}
              targetLoading={historyQ.isLoading}
              reason={suggestion ? suggestionReason(suggestion, t, unit) : null}
              chips={targetChips({ sets: lift.total, low: lift.working[0]?.target_rep_low ?? null, high: lift.working[0]?.target_rep_high ?? null, unit: lift.working[0]?.target_unit ?? null, rir: lift.working[0]?.target_rir ?? null, restSec: lift.working[0]?.rest_sec ?? null })}
              lastLabel={inf.lastDate ? `Last · ${shortDate(inf.lastDate)}` : null}
              lastChips={inf.last.map((s, j) => ({ key: `${s.session_id}:${j}`, text: setChip(s, inf.tracking, fmt) }))}
              onLastChip={(j) => copyPast(lift, j)}
              templateNote={inf.templateNote}
              note={carrier?.notes ?? null}
              onNote={() => carrier && setNoteFor(carrier.id)}
              warmup={live && !stale && groups.indexOf(lift) === 0 && template?.warmup?.length ? { steps: template.warmup, done: anyLogged } : null}
              carrot={carrot}
              firstBenchmark={firstBenchmark}
              onSwap={() => setPicker({ mode: "replace", key: lift.key })}
              onHowTo={inf.lib ? () => setHowTo({ slug: lift.slug, name: lift.name, note: inf.templateNote }) : null}
              onMenu={() => setMenuKey(lift.key)}
            />

            {live && <RestDial sessionId={id} rest={rest} plannedSec={plannedRest} variant={narrow ? "bar" : "arc"} onZero={onRestZero} />}

            <div className="mt-3 space-y-4">
              <SetTower
                cells={towerCells}
                list={narrow}
                onSelect={(sid) => {
                  if (pad && !commitPad(pad)) return;
                  setPad(null);
                  setSelId(sid);
                }}
                onOptions={(sid) => setSetMenu(sid)}
                onAdd={() => addSet(lift)}
              />
              {plateLoad && plateOk && <Plates load={plateLoad} unit={unit} change={plateChange} drawing={!narrow && plateLoad.perSide.length <= 6} />}
            </div>
          </>
        ) : (
          <div className="py-16 text-center">
            <p className="t-title-2 text-ivory">No lifts in this session</p>
            <p className="t-callout mt-2 text-stone">Add one from the library to start logging.</p>
            <Button variant="secondary" size="lg" className="mt-6" onClick={() => setPicker({ mode: "add" })}>
              <Plus className="size-4" aria-hidden /> Add exercise
            </Button>
          </div>
        )}
      </main>

      {showDeck && (
        <ThumbDeck
          ref={deckRef}
          load={loadField}
          work={workField}
          stacked={narrow}
          error={deckError}
          deckKey={deckKey}
          hidden={finishOpen}
          inputId={deckSet ? deckSet.id : ""}
        />
      )}

      {padOpen && pad && (() => {
        const padSet = setMap.get(pad.setId);
        const padGroup = groupOf.get(pad.setId);
        const padInfo = padGroup ? info.get(padGroup.key) : undefined;
        if (!padSet || !padGroup || !padInfo) return null;
        return (
          <NumberPad
            title={`${pad.field === "weight" ? (padInfo.tracking === "bodyweight_reps" ? "Added load" : "Weight") : pad.field === "rir" ? "RIR" : isTimed(padInfo.tracking) ? "Seconds" : "Reps"} · ${padSet.kind === "warmup" ? "Warm-up" : `Set ${setLabel(padGroup, padSet)}`} · ${padGroup.name}`}
            text={pad.text}
            ghost={ghostTextFor(pad)}
            unitLabel={pad.field === "weight" ? unit : pad.field === "rir" ? "RIR" : isTimed(padInfo.tracking) ? "s" : "reps"}
            field={pad.field}
            error={pad.error}
            step={nudgeStep(pad.field, { incrementLb: padInfo.lib?.increment ?? 5, unit, timed: isTimed(padInfo.tracking) })}
            lastText={lastValueFor(pad)}
            plates={pad.field === "weight" && padInfo.lib?.equipment === "barbell" && !pad.error ? platesLabel(Number(pad.text || ghostTextFor(pad) || 0), unit) : null}
            logLabel={padSet.completed ? "Save" : live ? "Seal set" : "Save set"}
            onKey={padKey}
            onNudge={(d) => {
              const base = pad.text !== "" && !pad.fresh ? pad.text : pad.text || ghostTextFor(pad) || "0";
              setPad({ ...pad, text: padNudge(base, d, pad.field), fresh: false, error: null });
            }}
            onLast={() => {
              const v = lastValueFor(pad);
              if (v != null) setPad({ ...pad, text: v, fresh: false, error: null });
            }}
            onNext={() => advance(pad)}
            onLog={padLog}
            onClose={closePad}
          />
        );
      })()}

      {/* Sheets */}
      <LiftsSheet
        open={liftsOpen}
        onOpenChange={setLiftsOpen}
        title={session.name}
        description={`${groups.length} ${groups.length === 1 ? "lift" : "lifts"} · ${counts.done} of ${counts.total} sets`}
        rows={liftRows}
        live={live}
        notes={notes}
        onNotes={setNotes}
        onNotesBlur={() => ops.updateSession({ notes: notes.trim() || null })}
        onPick={(key) => {
          const g = groups.find((x) => x.key === key);
          if (g) openGroupKey(g);
          setLiftsOpen(false);
        }}
        onResume={(key) => {
          const g = groups.find((x) => x.key === key);
          if (g) toggleSkip(g);
          setLiftsOpen(false);
        }}
        onAdd={() => {
          setLiftsOpen(false);
          setPicker({ mode: "add" });
        }}
        onDiscard={() => {
          setLiftsOpen(false);
          setDiscardOpen(true);
        }}
      />
      {menuGroup && (
        <ExerciseMenuSheet
          open={!!menuGroup}
          onOpenChange={(o) => !o && setMenuKey(null)}
          name={menuGroup.name}
          slug={menuGroup.slug}
          first={groups[0]?.key === menuGroup.key}
          last={groups.at(-1)?.key === menuGroup.key}
          skipped={groupState(menuGroup, skipped) === "skipped"}
          hasNote={!!noteCarrier(menuGroup)?.notes}
          canRemove={menuGroup.working.some((s) => !s.completed)}
          onHowTo={() => setHowTo({ slug: menuGroup.slug, name: menuGroup.name, note: info.get(menuGroup.key)?.templateNote ?? null })}
          onReplace={() => setPicker({ mode: "replace", key: menuGroup.key })}
          onMove={(d) => move(menuGroup, d)}
          onWarmup={() => addSet(menuGroup, "warmup")}
          onAddSet={() => addSet(menuGroup)}
          onRemoveSet={() => removeLastOpen(menuGroup)}
          onNote={() => {
            const c = noteCarrier(menuGroup);
            if (c) setNoteFor(c.id);
          }}
          onSkip={() => toggleSkip(menuGroup)}
        />
      )}
      {howTo && <HowToSheet open={!!howTo} onOpenChange={(o) => !o && setHowTo(null)} slug={howTo.slug} name={howTo.name} note={howTo.note} />}
      <PickExerciseSheet
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        mode={picker?.mode ?? "add"}
        current={pickerGroup ? { slug: pickerGroup.slug, name: pickerGroup.name, logged: pickerGroup.sets.filter((s) => s.completed).length, open: pickerGroup.sets.filter((s) => !s.completed).length } : undefined}
        busySlug={busySlug}
        onPick={(lib) => (picker?.mode === "replace" && pickerGroup ? void replaceWith(pickerGroup, lib) : void addExercise(lib))}
      />
      {noteSet && (
        <NoteSheet
          open={!!noteSet}
          onOpenChange={(o) => !o && setNoteFor(null)}
          title={`Note · ${noteSet.exercise_name}`}
          description="Saved with this exercise in your history"
          initial={noteSet.notes ?? ""}
          onSave={(t) => {
            ops.updateSet(noteSet.id, { notes: t || null });
            toast(t ? "Note saved" : "Note removed");
          }}
        />
      )}
      {setMenuSet && (
        <NoteSheet
          open={!!setMenuSet}
          onOpenChange={(o) => !o && setSetMenu(null)}
          title={`${nameOf(setMenuSet)} · ${setMenuSet.exercise_name}`}
          description={groupOf.get(setMenuSet.id) && noteCarrier(groupOf.get(setMenuSet.id)!)?.id === setMenuSet.id ? "This note also shows under the exercise" : "Optional note for this set"}
          initial={setMenuSet.notes ?? ""}
          onSave={(t) => {
            ops.updateSet(setMenuSet.id, { notes: t || null });
            toast(t ? "Note saved" : "Note removed");
          }}
          extra={
            <SetSheetActions
              warm={setMenuSet.kind === "warmup"}
              canToggle
              logged={setMenuSet.completed}
              onUnlog={() => {
                setSetMenu(null);
                unlog(setMenuSet);
              }}
              onToggleKind={() => {
                const k = setMenuSet.kind === "warmup" ? "working" : "warmup";
                ops.updateSet(setMenuSet.id, { kind: k });
                setSetMenu(null);
                toast(k === "warmup" ? "Marked as a warm-up set" : "Marked as a working set", {
                  action: { label: "Undo", onClick: () => ops.updateSet(setMenuSet.id, { kind: setMenuSet.kind }) },
                });
              }}
              onRemove={() => {
                setSetMenu(null);
                removeSet(setMenuSet);
              }}
            />
          }
        />
      )}
      <SealPanel
        open={finishOpen}
        onOpenChange={setFinishOpen}
        name={session.name}
        logged={sets.filter((s) => s.completed && s.kind === "working").length}
        planned={counts.total}
        unlogged={sets.filter((s) => !s.completed).length}
        saving={saving}
        error={finishError}
        onSeal={() => void finish()}
        onLogFirst={() => {
          setFinishOpen(false);
          toUpNext();
        }}
        onDiscard={() => {
          setFinishOpen(false);
          setDiscardOpen(true);
        }}
      />
      <DiscardSheet open={discardOpen} onOpenChange={setDiscardOpen} logged={counts.done} busy={discarding} onConfirm={discard} />
    </div>
  );
}

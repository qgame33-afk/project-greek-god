"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Plus, TriangleAlert } from "lucide-react";
import { LaurelBullet } from "@/components/art/Motifs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useMediaQuery } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { friendlyError, must, sb, useToday, useUser } from "@/lib/data/core";
import { drained, useOutbox } from "@/lib/data/outbox";
import { useProfile } from "@/lib/data/profile";
import { useTemplates } from "@/lib/data/training";
import { dayName, shortDate } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import { getExercise } from "@/lib/training/library";
import { groupSessions, modeRir, plannedSetCount, suggest, type Mode, type PastSet } from "@/lib/training/progression";
import type { LibraryExercise, TemplateExercise, TemplateKey } from "@/lib/training/types";
import { formatInt, formatLoad, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { formatGain, modeLabel, repRange, targetChips } from "@/lib/workout/copy";
import { autoAdvances, nextCell, nudgeStep, padNudge, padPress, type PadKey } from "@/lib/workout/numpad";
import { platesLabel } from "@/lib/workout/plates";
import { classifyLog, prSetIds, sessionRecords, type PriorBest } from "@/lib/workout/pr";
import { parsePrefs } from "@/lib/workout/prefs";
import { defaultRestSec, startRest } from "@/lib/workout/rest";
import {
  cellText,
  columnFor,
  currentGroupKey,
  defaultTargets,
  fieldsFor,
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
  sessionCounts,
  setChip,
  setLabel,
  setLoadText,
  trackingFor,
  upNextSet,
  validateCell,
  type ExerciseGroup,
  type Ghost,
} from "@/lib/workout/session";
import { durationSec, effectiveEnd, lastCompletedAt, sessionTotals } from "@/lib/workout/summary";
import { diffSets, isNetworkError, setPayload } from "@/lib/workout/sync";
import type { CellField, Tracking, WSession, WSet } from "@/lib/workout/types";
import { unlockAudio } from "./audio";
import { fetchPriorBests, fetchPriorHistory, invalidateTraining, liveKey, newSetRow, resyncSession, usePriorBests, usePriorHistory, useSessionOps, type LiveData } from "./data";
import { CollapsedExercise, OpenExercise } from "./ExerciseBlock";
import { NumberPad } from "./NumberPad";
import { RestDock, RestFocus, RestPanel, RestWatcher, useClockSec } from "./rest";
import type { RowView } from "./SetGrid";
import { DiscardSheet, ExerciseMenuSheet, FinishSheet, HowToSheet, NoteSheet, PickExerciseSheet, SetSheetActions } from "./sheets";
import { clearSessionStores, getDeviceCopy, getRest, markDeviceCopyClean, markMoment, setRest, setSkipped, useOnline, useRest, useSkipped } from "./stores";
import { WorkoutTopBar } from "./TopBar";

const NO_GHOST: Ghost = { weight: null, work: null, weightSource: null, workSource: null };
const nowSec = () => Math.floor(Date.now() / 1000);

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

  const desktop = useMediaQuery("(min-width: 1024px)");
  const fine = useMediaQuery("(min-width: 768px) and (pointer: fine)");
  const showPrev = useMediaQuery("(min-width: 400px)");
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
      m.set(g.key, suggest(inf.tEx, inf.lib, historyQ.data[g.slug] ?? [], sessionMode));
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

  const prIds = useMemo(() => {
    const out = new Set<string>();
    if (!bests) return out;
    for (const g of groups) for (const x of prSetIds(g, bests[g.slug])) out.add(x);
    return out;
  }, [groups, bests]);

  /* ----------------------------------------------------- accordion state */

  const [openRef, setOpenRef] = useState<string | null>(null);
  const currentKey = currentGroupKey(groups, skipped);
  const openGroup = (openRef ? groupOf.get(openRef) : undefined) ?? groups.find((g) => g.key === currentKey) ?? null;
  const upNext = live ? upNextSet(groups, openGroup?.key ?? null, skipped) : null;
  const counts = sessionCounts(groups);
  const anyLogged = sets.some((s) => s.completed);

  /* ------------------------------------------------ warm-up card collapse */

  // The warm-up card collapses after the first logged set. Collapsing ~350px of steps above
  // the set grid would yank the next ✓ out from under the thumb (a quick second tap then hits
  // a different control), so the collapse is paired with an equal scroll adjustment. When the
  // page isn't scrolled far enough to absorb it, the collapse waits until it can happen
  // invisibly (more scrolling, or the next programmatic scroll to an exercise).
  const [warmOpen, setWarmOpen] = useState<boolean | null>(null);
  const [warmAutoClosed, setWarmAutoClosed] = useState(anyLogged);
  const warmRef = useRef<HTMLElement>(null);
  const warmShift = useRef<{ before: number; compensate: boolean } | null>(null);

  const collapseWarm = useCallback((compensate: boolean) => {
    const el = warmRef.current;
    warmShift.current = el ? { before: el.getBoundingClientRect().height, compensate } : null;
    setWarmAutoClosed(true);
  }, []);

  useLayoutEffect(() => {
    const shift = warmShift.current;
    const el = warmRef.current;
    warmShift.current = null;
    if (!shift || !el || !shift.compensate) return;
    const delta = shift.before - el.getBoundingClientRect().height;
    if (delta > 0) window.scrollBy({ top: -delta, behavior: "instant" });
  }, [warmAutoClosed]);

  const warmPending = anyLogged && !warmAutoClosed;
  useEffect(() => {
    if (!warmPending) return;
    const el = warmRef.current;
    // Nothing on screen changes when the card isn't rendered or the user chose its state.
    if (!el || warmOpen !== null) {
      setWarmAutoClosed(true);
      return;
    }
    const delta = () => el.getBoundingClientRect().height - 56;
    const tryCollapse = () => {
      if (window.scrollY < delta()) return false;
      collapseWarm(true);
      return true;
    };
    if (tryCollapse()) return;
    const onScroll = () => {
      if (tryCollapse()) window.removeEventListener("scroll", onScroll);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [warmPending, warmOpen, collapseWarm]);

  /** Before scrolling to an exercise, settle a pending collapse so the target doesn't move. */
  const settleWarm = useCallback(() => {
    if (warmPending) collapseWarm(false);
  }, [warmPending, collapseWarm]);

  const scrollToGroup = useCallback((key: string) => {
    settleWarm();
    window.setTimeout(() => {
      const el = document.querySelector(`[data-group="${CSS.escape(key)}"]`);
      el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }, 60);
  }, [settleWarm]);

  const openGroupKey = (g: ExerciseGroup) => {
    setOpenRef(g.sets[0]?.id ?? null);
    scrollToGroup(g.key);
  };

  /* ------------------------------------------------------- transient UI */

  const [sheenId, setSheenId] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Focus mode belongs to one rest period (keyed by its start), so it never reopens by itself.
  const [focusFor, setFocusFor] = useState<number | null>(null);
  const setFocus = (on: boolean) => setFocusFor(on ? (getRest(id)?.startSec ?? null) : null);
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
    const t = g ? info.get(g.key)!.tracking : "weight_reps";
    const r = validateCell(field, raw, unit, t);
    if (!r.ok) {
      setErrors((e) => ({ ...e, [set.id]: r.error }));
      return r.error;
    }
    setErrors((e) => {
      if (!(set.id in e)) return e;
      const n = { ...e };
      delete n[set.id];
      return n;
    });
    const col = columnFor(field, t);
    const cur = set[col] == null ? null : Number(set[col]);
    if (cur !== r.stored) {
      ops.updateSet(set.id, { [col]: r.stored });
      if (set.completed) toast(`${nameOf(set)} updated`);
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
    setPad({ setId: s.id, field, text: cellText(s, field, t, unit), fresh: true, error: null });
    scrollRow(s.id);
  };

  const closePad = () => {
    if (!pad) return;
    if (!commitPad(pad)) return;
    const key = `${pad.setId}:${pad.field}`;
    setPad(null);
    window.requestAnimationFrame(() => (document.querySelector(`[data-cell="${CSS.escape(key)}"]`) as HTMLElement | null)?.focus({ preventScroll: true }));
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
    setPad({ setId: s.id, field: target.field, text: cellText(s, target.field, t, unit), fresh: true, error: null });
    scrollRow(s.id);
  };

  const padKey = (k: PadKey) => {
    if (!pad) return;
    const next = padPress({ text: pad.text, fresh: pad.fresh }, k, pad.field);
    const np = { ...pad, ...next, error: null };
    if (autoAdvances(pad.field, k)) advance(np);
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
    const t0 = Date.now();
    if (t0 - (taps.current.get(set.id) ?? 0) < 450) return; // double-tap guard
    taps.current.set(set.id, t0);
    if (set.completed) return unlog(set);

    const g = groupOf.get(set.id);
    if (!g) return;
    const inf = info.get(g.key)!;
    const res = resolveLog(set, ghosts.get(set.id) ?? NO_GHOST, inf.tracking, prefs.tapLogsGhost, new Date().toISOString());
    if (!res.ok) {
      openCell(set, res.field);
      return;
    }
    unlockAudio();
    const before = snap(set, ["weight_lb", "reps", "duration_sec", "completed", "completed_at"]);
    ops.updateSet(set.id, res.values);
    setPad(null);
    if (prefs.haptics) haptic(10);

    const logged: WSet = { ...set, ...res.values };
    const loadText = setLoadText(logged, inf.tracking, fmt, unit);
    toast(`${nameOf(set)} logged · ${loadText}`, {
      action: {
        label: "Undo",
        onClick: () => {
          ops.updateSet(set.id, before);
          if (getRest(id)?.fromSetId === set.id) setRest(id, null);
        },
      },
      duration: 6000,
    });

    // Records: only against real prior history, once per exercise per session.
    if (live && set.kind === "working" && bests) {
      const c = classifyLog(logged, g, bests[g.slug]);
      if (c.kind === "pr" && markMoment(id, g.slug)) {
        blink(setSheenId, set.id, 900);
        if (prefs.haptics) haptic([12, 50, 18]);
        toast(`New record · ${g.name} · ${loadText}`, {
          description: `e1RM ${Math.round(toDisplayWeight(c.e1rm!, unit))} ${unit}${c.gain ? ` · ${formatGain(c.gain, unit)} over your best` : ""}`,
          icon: <LaurelBullet size={16} />,
          duration: 5000,
        });
      } else if (c.kind === "first" && markMoment(id, g.slug)) {
        toast(`First benchmark · ${g.name}`, { description: `${loadText}. Next time, this is the number to beat.`, duration: 5000 });
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
        setFocusFor(prefs.restFocus && !desktop ? started.startSec : null);
      } else {
        setRest(id, null);
        toast("Every set is logged. Finish when you're ready.");
      }
    }
    if (ag && isGroupComplete(ag) && ng && ng.key !== ag.key) {
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
    logSet(s);
  };

  /* ----------------------------------------------------- rest finished */

  const onRestDone = useCallback(
    (r: { next: { setId: string | null } | null }) => {
      const target = r.next?.setId;
      if (!target) return;
      settleWarm();
      window.setTimeout(() => document.querySelector(`[data-set="${CSS.escape(target)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
      setPulseId(target);
      window.setTimeout(() => setPulseId(null), 1300);
    },
    [settleWarm],
  );

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
    window.setTimeout(() => document.querySelector(`[data-set="${CSS.escape(g.sets[0].id)}"]`)?.closest("[data-group]")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
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
    if (openGroup?.key === g.key) setOpenRef(null);
    toast(`Skipped ${g.name}`, {
      description: "Its unlogged sets are dropped when you finish.",
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
      setPicker(null);
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
  const menuGroup = groups.find((g) => g.key === menuKey) ?? null;
  const pickerGroup = picker?.key ? (groups.find((g) => g.key === picker.key) ?? null) : null;

  /* ------------------------------------------------------- session notes */

  const [notes, setNotes] = useState(session.notes ?? "");
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
  const busy = useRef(false);

  const finish = async () => {
    if (busy.current) return;
    if (pad && !commitPad(pad)) return;
    busy.current = true;
    setSaving(true);
    setFinishError(null);
    setPad(null);
    try {
      const cur = qc.getQueryData<LiveData | null>(liveKey(id, userId)) ?? data;
      const { moves, sessionLines } = relocateNotes(groupSets(cur.sets));
      if (moves.length) ops.updateSets(moves.map((m) => ({ id: m.id, values: { notes: m.notes } })));
      const baseNotes = notes.trim() || null;
      const finalNotes = sessionLines.length ? [baseNotes, ...sessionLines].filter(Boolean).join("\n").slice(0, 2000) : baseNotes;
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
      if (!(await drained(10000))) throw new Error("offline");
      // The server ends up holding exactly the sets logged on this device: anything the
      // outbox couldn't deliver is re-sent, unlogged and removed sets are deleted.
      const logged = (qc.getQueryData<LiveData | null>(liveKey(id, userId)) ?? cur).sets.filter((s) => s.completed);
      const before = must(await sb().from("exercise_sets").select("*").eq("session_id", id));
      const fix = diffSets(logged, before);
      if (fix.upserts.length) must(await sb().from("exercise_sets").upsert(fix.upserts.map(setPayload) as never, { onConflict: "id" }).select("id"));
      if (fix.deletes.length) must(await sb().from("exercise_sets").delete().in("id", fix.deletes).select("id"));
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
      const endMs = effectiveEnd(session.started_at, Date.now(), lastCompletedAt(fresh));
      const values = live
        ? {
            status: "done",
            ended_at: new Date(endMs).toISOString(),
            duration_sec: durationSec(session.started_at, endMs),
            total_volume_lb: totals.volumeLb,
            sets_completed: totals.setsCompleted,
            pr_count: prCount,
            notes: finalNotes,
          }
        : { total_volume_lb: totals.volumeLb, sets_completed: totals.setsCompleted, pr_count: prCount, notes: finalNotes };
      let q = sb().from("workout_sessions").update(values).eq("id", id);
      if (live) q = q.eq("status", "active"); // a second tap or another device can't finish twice
      const updated = must(await q.select("*").maybeSingle());
      const finalSession: WSession = updated ?? (must(await sb().from("workout_sessions").select("*").eq("id", id).single()) as WSession);
      clearSessionStores(id);
      ops.setData({ session: finalSession, sets: fresh });
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
      const text = offline ? "No connection. Every set is safe on this device — save again when you're back online." : `Couldn't save: ${msg} Every set is still on this device.`;
      setFinishError(text);
      if (!live) toast.error("Couldn't save the changes", { description: text });
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
      ops.setData({ ...data, session: { ...session, status: "discarded" } });
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

  // Safety net under the outbox: whenever it goes idle while this device holds changes the
  // server hasn't confirmed (including a write it gave up on after a long dead spell), compare
  // with the server and re-send the difference. Retries every 15 s while there is no signal.
  const outboxRef = useRef(outbox);
  useEffect(() => {
    outboxRef.current = outbox;
  });
  const resyncs = useRef(0);
  useEffect(() => {
    if (outbox.pending > 0) return;
    let cancelled = false;
    const run = async () => {
      const ob = outboxRef.current;
      if (cancelled || ob.pending > 0 || !getDeviceCopy(id)?.dirty || resyncs.current > 8) return;
      if (ob.error && !isNetworkError(ob.error)) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const cur = qc.getQueryData<LiveData | null>(liveKey(id, userId));
      if (!cur) return;
      try {
        const r = await resyncSession(id, cur);
        // Only call it clean if nothing was tapped while the server was being checked.
        if (r === "clean" && qc.getQueryData(liveKey(id, userId)) === cur) {
          markDeviceCopyClean(id);
          resyncs.current = 0;
        } else if (r === "queued") resyncs.current++;
      } catch {
        /* still no signal — the interval tries again */
      }
    };
    const first = window.setTimeout(run, 1500);
    const every = window.setInterval(run, 15000);
    window.addEventListener("online", run);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(every);
      window.removeEventListener("online", run);
    };
  }, [outbox.pending, outbox.error, id, qc, userId]);

  /* -------------------------------------------------------------- render */

  const stale = live && session.local_date !== today;
  const warmupShown = live && !stale && !!template?.warmup?.length;
  const warmExpanded = warmOpen ?? !warmAutoClosed;
  const restShown = live && !!rest && !padOpen && !desktop;
  const totals = sessionTotals(sets);
  const plaques = bests ? sessionRecords(groups, bests) : [];

  const segments = groups.map((g) => ({ key: g.key, state: groupState(g, skipped), current: g.key === openGroup?.key }));
  const padSet = pad ? setMap.get(pad.setId) : undefined;
  const padGroup = pad ? groupOf.get(pad.setId) : undefined;
  const padInfo = padGroup ? info.get(padGroup.key) : undefined;

  const bottomPad = padOpen ? 412 : restShown ? 140 : 48;

  const renderGroup = (g: ExerciseGroup, i: number) => {
    const inf = info.get(g.key)!;
    const state = groupState(g, skipped);
    const isOpen = openGroup?.key === g.key && state !== "skipped";
    const hasPR = g.working.some((s) => prIds.has(s.id));
    if (!isOpen) {
      const doneLine = g.working.filter((s) => s.completed).map((s) => setChip(s, inf.tracking, fmt));
      const warmLine = g.warmups.filter((s) => s.completed).map((s) => setChip(s, inf.tracking, fmt));
      const detail =
        state === "done" && g.total === 0
          ? `Warm-up · ${warmLine.join(" · ")}`
          : state === "done"
            ? `${g.done}/${g.total} · ${doneLine.join(" · ")}`
            : `${g.done ? `${g.done}/${g.total} logged · ` : ""}${g.total} × ${repRange(g.working[0]?.target_rep_low ?? null, g.working[0]?.target_rep_high ?? null, g.working[0]?.target_unit ?? null)}`;
      return (
        <CollapsedExercise
          key={g.key}
          group={g}
          state={state}
          index={i + 1}
          detail={detail}
          pr={hasPR}
          onOpen={() => openGroupKey(g)}
          onResume={() => toggleSkip(g)}
        />
      );
    }
    const carrier = noteCarrier(g);
    const rows: RowView[] = g.sets.map((s) => {
      const pos = g.working.findIndex((x) => x.id === s.id);
      const past = pos >= 0 ? inf.last[pos] : undefined;
      return {
        set: s,
        label: setLabel(g, s),
        ghost: ghosts.get(s.id) ?? NO_GHOST,
        prev: past ? setChip(past, inf.tracking, fmt) : null,
        upNext: upNext?.id === s.id,
        pr: prIds.has(s.id),
        sheen: sheenId === s.id,
        pulse: pulseId === s.id,
        flash: flashId === s.id,
        error: errors[s.id] ?? null,
        showNote: s.id !== carrier?.id,
      };
    });
    const first = g.working[0] ?? g.sets[0];
    const prior = bests?.[g.slug];
    return (
      <OpenExercise
        key={g.key}
        group={g}
        lib={inf.lib}
        tracking={inf.tracking}
        unit={unit}
        chips={targetChips({ sets: g.total, low: first?.target_rep_low ?? null, high: first?.target_rep_high ?? null, unit: first?.target_unit ?? null, rir: first?.target_rir ?? null, restSec: first?.rest_sec ?? null })}
        note={carrier?.notes ?? null}
        templateNote={inf.templateNote}
        suggestion={suggestions.get(g.key) ?? null}
        suggestionLoading={historyQ.isLoading}
        lastLabel={inf.lastDate ? `Last · ${shortDate(inf.lastDate)}` : null}
        lastChips={inf.last.map((s, j) => ({ key: `${s.session_id}:${j}`, text: setChip(s, inf.tracking, fmt) }))}
        firstBenchmark={!!prior && prior.sets === 0 && g.done > 0}
        rows={rows}
        showPrev={showPrev}
        inline={inline}
        pad={pad && !inline && groupOf.get(pad.setId)?.key === g.key ? { setId: pad.setId, field: pad.field, text: pad.text } : null}
        padOpen={padOpen}
        fmt={fmt}
        onMenu={() => setMenuKey(g.key)}
        onHowTo={() => setHowTo({ slug: g.slug, name: g.name, note: inf.templateNote })}
        onNote={() => carrier && setNoteFor(carrier.id)}
        onLastChip={(j) => copyPast(g, j)}
        onAddSet={() => addSet(g)}
        onCell={openCell}
        onCheck={logSet}
        onSetMenu={(s) => setSetMenu(s.id)}
        onPrev={(s) => copyPast(g, g.working.findIndex((x) => x.id === s.id))}
        onCommit={writeCell}
        onEnter={(s, f) => {
          const target = nextCell(rowsOf(g), { setId: s.id, field: f }, fieldsOfSet);
          if (target) (document.querySelector(`[data-cell="${CSS.escape(`${target.setId}:${target.field}`)}"]`) as HTMLInputElement | null)?.focus();
        }}
      />
    );
  };

  const setMenuSet = setMenu ? setMap.get(setMenu) : undefined;
  const noteSet = noteFor ? setMap.get(noteFor) : undefined;
  const upNextGroup = upNext ? groupOf.get(upNext.id) : undefined;
  const idleNext =
    upNext && upNextGroup
      ? `${upNextGroup.name} · ${upNext.kind === "warmup" ? "Warm-up" : `Set ${setLabel(upNextGroup, upNext)}`}`
      : null;

  return (
    // overflow-anchor:none — scroll adjustments are made explicitly (see the warm-up collapse),
    // so the browser's own anchoring must not apply a second one.
    <div className="min-h-dvh bg-bg [overflow-anchor:none]">
      {live && <RestWatcher sessionId={id} chimeOn={prefs.restChime} hapticsOn={prefs.haptics} onDone={onRestDone} />}
      <WorkoutTopBar
        name={session.name}
        startedAt={session.started_at}
        dateLabel={live && !stale ? null : `${dayName(session.local_date, true)} · ${shortDate(session.local_date)}`}
        segments={segments}
        finishLabel={live ? "Finish" : "Done"}
        minimizeLabel={live ? "Minimise workout" : "Back to summary"}
        minimizeIcon={live ? "down" : "close"}
        onMinimize={() => {
          if (pad) commitPad(pad);
          if (live) router.push("/");
          else void finish();
        }}
        onFinish={() => {
          if (pad && !commitPad(pad)) return;
          setPad(null);
          if (live) setFinishOpen(true);
          else void finish();
        }}
        sync={{ pending: outbox.pending, offline: !isOnline || (outbox.pending > 0 && isNetworkError(outbox.error)), error: outbox.error }}
      />

      <div className="mx-auto w-full max-w-[1120px] px-3 pt-3 sm:px-4 lg:grid lg:grid-cols-[minmax(0,720px)_320px] lg:justify-center lg:gap-8 lg:px-6 lg:pt-6" style={{ paddingBottom: `calc(${bottomPad}px + var(--safe-bottom))` }}>
        <main className="min-w-0 space-y-3" aria-label="Exercises">
          {stale && (
            <div className="card-inset flex flex-col gap-3 border border-line-strong p-4" role="status">
              <div className="flex gap-3">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-gold-300" aria-hidden />
                <div>
                  <p className="text-[15px] font-bold text-fg">This session is from {dayName(session.local_date)}, {shortDate(session.local_date)}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
                    {counts.done ? `Finish it to save the ${counts.done} ${counts.done === 1 ? "set" : "sets"} you logged, or discard it.` : "Nothing was logged. Discard it, or finish what you did."}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline-gold" onClick={() => setFinishOpen(true)}>
                  Finish
                </Button>
                <Button variant="ghost" onClick={() => setDiscardOpen(true)}>
                  Discard
                </Button>
              </div>
            </div>
          )}

          {live && (
            <div className="flex items-center gap-2 px-1 pb-0.5 pt-1 text-[13px] font-medium text-fg-2">
              <span
                className={cn(
                  "inline-flex h-6 shrink-0 items-center rounded-[6px] border px-2 text-[10.5px] font-bold uppercase tracking-[0.1em]",
                  sessionMode === "standard" ? "border-line text-fg-3" : "border-lapis-line text-lapis-text",
                )}
              >
                {modeLabel(sessionMode)}
              </span>
              <span className="min-w-0 flex-1 truncate">{template?.subtitle || "Custom session"}</span>
              <span className="num shrink-0 text-[15px] text-fg">
                {counts.done}
                <span className="text-fg-3">/{counts.total} sets</span>
              </span>
            </div>
          )}

          {warmupShown && (
            <section ref={warmRef} className="card-instrument overflow-hidden" aria-label="Warm-up">
              <button type="button" onClick={() => setWarmOpen(!warmExpanded)} aria-expanded={warmExpanded} className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left">
                <span className="min-w-0 flex-1">
                  <span className="eyebrow block">Warm-up</span>
                  <span className="mt-0.5 block text-[14px] font-semibold text-fg">
                    {template!.warmup.length} steps · about 10 min{anyLogged ? " · done" : ""}
                  </span>
                </span>
                <ChevronDown className={cn("size-5 text-fg-3 transition-transform duration-200", warmExpanded && "rotate-180")} aria-hidden />
              </button>
              {warmExpanded && (
                <ol className="wk-fade space-y-2.5 border-t border-line-hair px-4 pb-4 pt-3.5">
                  {template!.warmup.map((w, i) => (
                    <li key={i} className="flex gap-3 text-[13.5px] leading-[1.45]">
                      <span className="num w-4 shrink-0 pt-px text-[14px] font-semibold text-gold-600">{i + 1}</span>
                      <p className="min-w-0 text-fg-2">
                        <span className="font-bold text-fg">{w.label}.</span> {w.detail}
                      </p>
                    </li>
                  ))}
                  <li className="pl-7 pt-0.5 text-[12.5px] leading-relaxed text-fg-3">Sharp or joint pain is a stop sign. Swap or skip the exercise — never train through it.</li>
                </ol>
              )}
            </section>
          )}

          {groups.length ? (
            groups.map(renderGroup)
          ) : (
            <div className="card-inset px-5 py-8 text-center">
              <p className="text-[15px] font-bold text-fg">No exercises in this session</p>
              <p className="mt-1 text-[13px] text-fg-2">Add one from the library to start logging.</p>
            </div>
          )}

          <Button variant="secondary" block className="h-[52px]" onClick={() => setPicker({ mode: "add" })}>
            <Plus className="size-4" aria-hidden /> Add exercise
          </Button>

          {!desktop && <SessionNotes notes={notes} onChange={setNotes} onBlur={() => ops.updateSession({ notes: notes.trim() || null })} />}

          {live && (
            <div className="flex justify-center pt-2">
              <button type="button" onClick={() => setDiscardOpen(true)} className="h-12 rounded-[12px] px-4 text-[14px] font-bold text-fg-3 hover:text-danger">
                Discard workout
              </button>
            </div>
          )}
        </main>

        {desktop && (
          <aside className="hidden lg:block" aria-label="Session">
            <div className="sticky top-[calc(var(--safe-top)+80px)] space-y-4">
              {live && <RestPanel sessionId={id} rest={rest} idleNext={idleNext} onFocus={() => setFocus(true)} />}
              <section className="card-instrument grid grid-cols-2 gap-x-4 gap-y-5 p-5" aria-label="Session stats">
                <DeskStat label="Elapsed">{live && !stale ? <ElapsedValue startedAt={session.started_at} /> : <span>{session.duration_sec ? Math.round(session.duration_sec / 60) : "—"}<span className="unit">min</span></span>}</DeskStat>
                <DeskStat label="Sets">
                  {counts.done}
                  <span className="unit">/ {counts.total}</span>
                </DeskStat>
                <DeskStat label="Volume">
                  {totals.volumeLb ? formatInt(toDisplayWeight(totals.volumeLb, unit)) : "—"}
                  {totals.volumeLb > 0 && <span className="unit">{unit}</span>}
                </DeskStat>
                <DeskStat label="Records">{plaques.length || "—"}</DeskStat>
              </section>
              <SessionNotes notes={notes} onChange={setNotes} onBlur={() => ops.updateSession({ notes: notes.trim() || null })} />
            </div>
          </aside>
        )}
      </div>

      {/* Docks: the keypad and the rest dock never overlap. */}
      {padOpen && pad && padSet && padGroup && padInfo && (
        <NumberPad
          title={`${pad.field === "weight" ? (padInfo.tracking === "bodyweight_reps" ? "Added load" : "Weight") : pad.field === "rir" ? "RIR" : isTimed(padInfo.tracking) ? "Seconds" : "Reps"} · ${padSet.kind === "warmup" ? "Warm-up" : `Set ${setLabel(padGroup, padSet)}`} · ${padGroup.name}`}
          text={pad.text}
          ghost={ghostTextFor(pad)}
          unitLabel={pad.field === "weight" ? unit : pad.field === "rir" ? "RIR" : isTimed(padInfo.tracking) ? "s" : "reps"}
          field={pad.field}
          error={pad.error}
          step={nudgeStep(pad.field, { incrementLb: padInfo.lib?.increment ?? 5, unit, timed: isTimed(padInfo.tracking) })}
          lastText={lastValueFor(pad)}
          plates={
            pad.field === "weight" && padInfo.lib?.equipment === "barbell" && !pad.error
              ? platesLabel(Number(pad.text || ghostTextFor(pad) || 0), unit)
              : null
          }
          logLabel={padSet.completed ? "Save" : "Log set"}
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
      )}
      {restShown && rest && <RestDock sessionId={id} rest={rest} onFocus={() => setFocus(true)} />}
      {live && rest && focusFor === rest.startSec && <RestFocus sessionId={id} rest={rest} onClose={() => setFocus(false)} />}

      {/* Sheets */}
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
      <FinishSheet
        open={finishOpen}
        onOpenChange={setFinishOpen}
        logged={sets.filter((s) => s.completed && s.kind === "working").length}
        unlogged={sets.filter((s) => !s.completed).length}
        saving={saving}
        error={finishError}
        onSave={finish}
        onDiscard={() => {
          setFinishOpen(false);
          setDiscardOpen(true);
        }}
      />
      <DiscardSheet open={discardOpen} onOpenChange={setDiscardOpen} logged={counts.done} busy={discarding} onConfirm={discard} />
    </div>
  );
}

function ElapsedValue({ startedAt }: { startedAt: string }) {
  const now = useClockSec();
  const m = Math.max(0, Math.floor((now - Math.floor(Date.parse(startedAt) / 1000)) / 60));
  return (
    <span>
      {m}
      <span className="unit">min</span>
    </span>
  );
}

function DeskStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="num-md mt-1.5 truncate text-fg">{children}</p>
    </div>
  );
}

function SessionNotes({ notes, onChange, onBlur }: { notes: string; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <section className="card-instrument p-4" aria-label="Session notes">
      <label htmlFor="session-notes" className="eyebrow mb-2 block">
        Session notes
      </label>
      <Textarea
        id="session-notes"
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="Energy, sleep, anything that affected today"
        rows={3}
        maxLength={2000}
        className="min-h-20 bg-s2"
      />
    </section>
  );
}

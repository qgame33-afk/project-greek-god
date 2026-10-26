"use client";

import { Activity, CalendarDays, Info, Moon, Repeat, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { SuggestionRow } from "@/components/ui/suggestion-row";
import { addDays, dayName, parseISODate, type ISODate } from "@/lib/dates";
import { useSavePrefs } from "@/lib/data/profile";
import { useActiveProgram } from "@/lib/data/program";
import { useSaveTemplate, useTemplates, type StoredTemplate } from "@/lib/data/training";
import { parseAppPrefs } from "@/lib/prefs";
import { getExercise } from "@/lib/training/library";
import { carriedSwaps, PROGRAMS, templateLabels } from "@/lib/training/programs";
import type { Mode } from "@/lib/training/progression";
import type { ProgramId } from "@/lib/training/types";
import { substituteExercise } from "@/lib/training/volume";
import { GROUP_LABEL, type VolumeSuggestion } from "@/lib/training/volume-zones";
import { programInSentence } from "../format";
import { MODE_LABEL, offlineNoChange, useLighterSnooze, useSetTrainingMode, type useTrainingWeek } from "../hooks";
import { useNewPlanNotice } from "../NewPlanNotice";
import { Caption, CheckedList, SheetActions, SheetReason } from "../parts";

type Week = ReturnType<typeof useTrainingWeek>;

/**
 * Train's one SuggestionRow (docs/DESIGN-V3-SIMPLE.md §4.3.1 item 4), in this priority: the
 * one-time new-plan notice › a carried swap › a missed workout › the lighter-week advice
 * (`deload`, `lighter`, `standard`) › the first-week ease-in › a volume suggestion. Only the
 * highest shows. Fatigue overlap and rest today are today-only and live in Options for today.
 */
export type TrainSuggestion =
  | { kind: "notice"; icon: LucideIcon; title: string; reason: string }
  | { kind: "swap"; icon: LucideIcon; title: string; reason: string; swaps: Swap[]; from: ProgramId }
  | { kind: "missed"; icon: LucideIcon; title: string; reason: string; date: ISODate }
  | { kind: "deload" | "lighter" | "standard" | "ease"; icon: LucideIcon; title: string; reason: string; reasons: string[] }
  | { kind: "volume"; icon: LucideIcon; title: string; reason: string; suggestion: VolumeSuggestion };

export interface Swap {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  templates: StoredTemplate[];
}

const fmtDay = (d: ISODate) => `${dayName(d, true)} ${parseISODate(d).getDate()}`;

export function volumeTitle(s: VolumeSuggestion) {
  const g = GROUP_LABEL[s.group];
  if (s.kind === "add") return `${g} · add ${s.sets} ${s.sets === 1 ? "set" : "sets"} a week?`;
  if (s.kind === "trim") return `${g} · ${s.sets} fewer ${s.sets === 1 ? "set" : "sets"} a week?`;
  return `${g} · keep the sets as they are?`;
}

export function useTrainSuggestion(week: Week, volume: VolumeSuggestion[]): TrainSuggestion | null {
  const notice = useNewPlanNotice();
  const { all } = useTemplates();
  const prefs = parseAppPrefs(week.profile?.prefs);
  return useMemo(() => {
    if (notice.show) return { kind: "notice", icon: Info, title: `Your plan is now ${programInSentence(week.program)}`, reason: "See what changed" };

    // a swap he made in the program he came from, offered once in the active one (§3.7)
    const from = prefs.programSwitch?.from as ProgramId | undefined;
    if (!prefs.swapsOffered && from && from !== week.program && all[from] && all[week.program]) {
      const raw = carriedSwaps(all[from], all[week.program]);
      const swaps: Swap[] = raw
        .map((s) => ({
          from: s.from,
          to: s.to,
          fromName: getExercise(s.from)?.name ?? s.from,
          toName: getExercise(s.to)?.name ?? s.to,
          templates: (s.keys as string[]).map((k) => all[week.program].find((t) => t.key === k)).filter((t): t is StoredTemplate => !!t),
        }))
        .filter((s) => s.templates.length && getExercise(s.to));
      if (swaps.length) return { kind: "swap", icon: Repeat, title: "Use the same swap?", reason: `${swaps[0].toName} instead of ${swaps[0].fromName}`, swaps, from };
    }

    const missed = week.missed[0];
    if (missed) {
      const t = week.byKey[missed.key];
      const name = t ? templateLabels(t).short : missed.name;
      const when = missed.date === addDays(week.today, -1) ? "yesterday's" : `${dayName(missed.date)}'s`;
      return { kind: "missed", icon: CalendarDays, title: `Missed ${when} ${name}`, reason: "Move it or let it go", date: missed.date };
    }

    const l = week.lighter;
    if (l.kind === "deload") return { kind: "deload", icon: Moon, title: "Light week suggested", reason: firstReason(l.reasons), reasons: l.reasons };
    if (l.kind === "lighter") return { kind: "lighter", icon: Moon, title: "Fewer sets this week?", reason: firstReason(l.reasons), reasons: l.reasons };
    if (l.kind === "standard") {
      const since = prefs.modeSetAt as ISODate | undefined;
      const reason = `${MODE_LABEL[week.mode]}${since ? ` since ${fmtDay(since)}` : " is on"}`;
      return { kind: "standard", icon: Moon, title: "Back to the full plan?", reason, reasons: [`${reason}.`] };
    }
    if (week.easeIn) return { kind: "ease", icon: Moon, title: "Ease into the new split?", reason: "One set fewer this week", reasons: [] };

    const v = volume[0];
    if (v) return { kind: "volume", icon: Activity, title: volumeTitle(v), reason: v.reason, suggestion: v };
    return null;
  }, [notice.show, prefs.swapsOffered, prefs.modeSetAt, prefs.programSwitch, week, all, volume]);
}

const firstReason = (r: string[]) => (r[0] ?? "").replace(/\.$/, "");

export function SuggestionRowFor({ s, onOpen }: { s: TrainSuggestion; onOpen: () => void }) {
  return <SuggestionRow icon={s.icon} title={s.title} reason={s.reason} onClick={onOpen} />;
}

/* --------------------------------------------- light week, fewer sets, back */

const LIGHT: Record<"deload" | "lighter" | "standard" | "ease", { title: string; lines: string[]; action: string; mode: Mode; caption?: string }> = {
  deload: {
    title: "Light week suggested",
    lines: ["Same lifts and days", "About half the sets", "About 10% lighter", "Leave 3–4 reps in the tank"],
    action: "Start light week",
    mode: "deload",
    caption: "Starts with your next workout. Back to normal in Program any time.",
  },
  lighter: {
    title: "Fewer sets this week?",
    lines: ["Same lifts, days and weights", "One set fewer on most lifts"],
    action: "Use fewer sets",
    mode: "intro",
    caption: "Starts with your next workout. Back to normal in Program any time.",
  },
  standard: { title: "Back to the full plan?", lines: ["Every set of the plan", "Same lifts and days"], action: "Back to normal", mode: "standard", caption: "Starts with your next workout." },
  ease: {
    title: "Ease into the new split?",
    lines: ["Same lifts, days and weights", "One set fewer on most lifts"],
    action: "Use fewer sets",
    mode: "intro",
    caption: "Starts with your next workout. Back to normal in Program any time.",
  },
};

export function LightWeekSheet({ s, open, onOpenChange }: { s: Extract<TrainSuggestion, { kind: "deload" | "lighter" | "standard" | "ease" }> | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { setMode, pending } = useSetTrainingMode();
  const { snooze } = useLighterSnooze();
  const c = s ? LIGHT[s.kind] : null;
  const reason = s ? (s.kind === "ease" ? "You just switched plans. A week with one set fewer lets your body get used to the new lifts." : s.reasons.join(" ")) : "";
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={c?.title ?? ""}>
      {s && c && (
        <div className="flex flex-col gap-5 pb-2">
          {reason && <SheetReason>{reason}</SheetReason>}
          <div>
            <CheckedList lines={c.lines.map((title) => ({ title }))} />
            {c.caption && <Caption>{c.caption}</Caption>}
          </div>
          <SheetActions>
            <Button
              variant="primary"
              size="lg"
              block
              loading={pending}
              onClick={async () => {
                if (await setMode(c.mode)) onOpenChange(false);
              }}
            >
              {c.action}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              block
              onClick={async () => {
                if (await snooze()) onOpenChange(false);
              }}
            >
              Not now
            </Button>
          </SheetActions>
        </div>
      )}
    </Sheet>
  );
}

/* --------------------------------------------------------- carried swap */

export function SwapCarrySheet({ s, open, onOpenChange }: { s: Extract<TrainSuggestion, { kind: "swap" }> | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSaveTemplate();
  const savePrefs = useSavePrefs({ quiet: true });
  const [busy, setBusy] = useState(false);
  const { program } = useActiveProgram();
  const target = programInSentence(program);
  const source = s ? PROGRAMS[s.from].name : "";
  const answered = () => savePrefs.mutate({ swapsOffered: true });

  const useIt = async () => {
    if (!s || busy || offlineNoChange("Your workouts")) return;
    setBusy(true);
    // every active template the swaps touch, changed once with all of its swaps
    const before = new Map<string, StoredTemplate>();
    for (const sw of s.swaps) for (const t of sw.templates) before.set(t.key, t);
    const after = [...before.values()].map((t) => ({
      ...t,
      exercises: t.exercises.map((e) => {
        const sw = s.swaps.find((x) => x.from === e.slug);
        const lib = sw ? getExercise(sw.to) : undefined;
        return sw && lib ? substituteExercise(e, lib) : e;
      }),
    }));
    try {
      for (const t of after) await save.mutateAsync(t);
    } catch {
      setBusy(false);
      return;
    }
    answered();
    setBusy(false);
    onOpenChange(false);
    toast.success(`${s.swaps[0].toName} is in ${target}`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          Promise.all([...before.values()].map((t) => save.mutateAsync(t)))
            .then(() => toast("Swap undone."))
            .catch(() => {});
        },
      },
    });
  };

  const first = s?.swaps[0];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Use the same swap?">
      {s && first && (
        <div className="flex flex-col gap-5 pb-2">
          <SheetReason>
            In {source} you do {first.toName} instead of {first.fromName}.
            {s.swaps.length > 1 ? ` And ${s.swaps.slice(1).map((x) => `${x.toName} instead of ${x.fromName}`).join(", ")}.` : ""}
          </SheetReason>
          <CheckedList
            lines={s.swaps.flatMap((sw) => sw.templates.map((t) => ({ title: t.name, subtitle: `${sw.fromName} → ${sw.toName}`, dataName: true })))}
            label={`What changes in ${target}`}
          />
          <SheetActions>
            <Button variant="primary" size="lg" block loading={busy} onClick={useIt}>
              Use it in {target}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              block
              disabled={busy}
              onClick={() => {
                answered();
                onOpenChange(false);
              }}
            >
              Keep as it is
            </Button>
          </SheetActions>
        </div>
      )}
    </Sheet>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useProfile, useSavePrefs } from "@/lib/data/profile";
import { useSetProgram } from "@/lib/data/program";
import { parseAppPrefs } from "@/lib/prefs";
import { activeProgram, PROGRAMS, scheduleFor, templateDef } from "@/lib/training/programs";
import type { DayFamily } from "@/lib/training/types";
import { CheckedList, SheetActions, SheetReason, type CheckedLine } from "./parts";

/**
 * The one-time "Your plan is now the Arnold split" notice (docs/DESIGN-V3-SIMPLE.md §4.3.8,
 * `train-new-plan`). Shown when the publication moved the active plan from Push/Pull/Legs to the
 * Arnold split (`prefs.programSwitch.from === "ppl"`, `.to === "arnold"`, the active program is
 * `arnold`) and `prefs.switchNoticeSeenAt` is not set. Any way of closing it writes
 * `switchNoticeSeenAt = programSwitch.at`; a fresh account never sees it (no `programSwitch`).
 *
 *   const notice = useNewPlanNotice();
 *   <NewPlanNotice open={notice.show && open} onOpenChange={...} />
 */
export function useNewPlanNotice() {
  const { profile } = useProfile();
  const prefs = parseAppPrefs(profile?.prefs);
  const sw = prefs.programSwitch;
  const show = !!profile && !!sw && sw.from === "ppl" && sw.to === "arnold" && activeProgram(profile) === "arnold" && !prefs.switchNoticeSeenAt;
  return { show, at: sw?.at ?? null };
}

const FAMILY_WORDS: Partial<Record<DayFamily, string>> = {
  shoulders_arms: "Shoulders and arms",
  chest_back: "Chest and back",
  legs_abs: "Legs and abs",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
};
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const and = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** "Shoulders and arms Monday and Thursday" … "Sunday is rest", from his saved week. */
export function weekByFamily(schedule: Record<string, string>): CheckedLine[] {
  const fams = new Map<string, number[]>();
  const rest: number[] = [];
  for (const wd of ORDER) {
    const key = schedule[String(wd)] ?? "rest";
    const fam = key === "rest" ? null : (templateDef(key)?.family ?? null);
    if (!fam) {
      rest.push(wd);
      continue;
    }
    fams.set(fam, [...(fams.get(fam) ?? []), wd]);
  }
  const lines: CheckedLine[] = [...fams.entries()].map(([fam, days]) => ({ title: `${FAMILY_WORDS[fam as DayFamily] ?? fam} ${and(days.map((d) => DAY[d]))}` }));
  if (rest.length) lines.push({ title: `${and(rest.map((d) => DAY[d]))} ${rest.length === 1 ? "is" : "are"} rest` });
  return lines;
}

export function NewPlanNotice({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { profile } = useProfile();
  const { at } = useNewPlanNotice();
  const savePrefs = useSavePrefs({ quiet: true });
  const { setProgram, pending } = useSetProgram();
  const [busy, setBusy] = useState(false);
  const arnold = PROGRAMS.arnold.name;
  const ppl = PROGRAMS.ppl.name;
  const lines = weekByFamily(scheduleFor(profile));

  const seen = () => {
    if (at) savePrefs.mutate({ switchNoticeSeenAt: at });
  };
  const close = (o: boolean) => {
    if (!o) seen();
    onOpenChange(o);
  };
  const keepPpl = async () => {
    setBusy(true);
    seen();
    const ok = await setProgram("ppl");
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={close} title={`Your plan is now the ${arnold}`}>
      <div className="flex flex-col gap-5 pb-2">
        <CheckedList lines={lines} label={`The ${arnold} week`} />
        <SheetReason>
          Your workouts, weights and bests are all kept. {ppl} is saved with your changes, under Program.
        </SheetReason>
        <SheetActions>
          <Button variant="primary" size="lg" block onClick={() => close(false)}>
            See my week
          </Button>
          <Button variant="secondary" size="lg" block loading={busy || pending} onClick={keepPpl}>
            Keep {ppl}
          </Button>
        </SheetActions>
      </div>
    </Sheet>
  );
}


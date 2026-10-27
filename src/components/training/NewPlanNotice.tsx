"use client";

import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useUser } from "@/lib/data/core";
import { useProfile, useSavePrefs } from "@/lib/data/profile";
import { useSetProgram } from "@/lib/data/program";
import { parseAppPrefs } from "@/lib/prefs";
import { activeProgram, PROGRAMS, scheduleFor, templateDef } from "@/lib/training/programs";
import type { ProgramId } from "@/lib/training/types";
import { programInSentence } from "./format";
import { CheckedList, SheetActions, SheetReason, type CheckedLine } from "./parts";

/**
 * The one-time "Your plan is now …" notice (docs/DESIGN-V3-SIMPLE.md §4.3.8, `train-new-plan`).
 * Shown when a switch made outside the app (the publication) moved the active plan: the last
 * `prefs.programSwitch` went to the active program from another one, and `prefs.switchNoticeSeenAt`
 * is older than that switch (or not set). Any way of closing it writes `switchNoticeSeenAt =
 * programSwitch.at`; his own in-app switch writes it too (useSetProgram), so it never follows him.
 * A fresh account never sees it (no `programSwitch`). Names and days all come from PROGRAM's data.
 *
 *   const notice = useNewPlanNotice();
 *   <NewPlanNotice open={notice.show && open} onOpenChange={...} />
 */
/** When this page load began (a restored cache entry is older than this). */
const PAGE_START = typeof performance === "undefined" ? 0 : performance.timeOrigin;

export function useNewPlanNotice() {
  const { profile } = useProfile();
  const { userId } = useUser();
  const qc = useQueryClient();
  // the profile as the server has it now (not a copy restored from the offline cache): only then
  // may the notice open by itself, so a cache from before "seen" never brings it back
  const fetching = useIsFetching({ queryKey: ["profile", userId] });
  const fresh = fetching === 0 && (qc.getQueryState(["profile", userId])?.dataUpdatedAt ?? 0) >= PAGE_START;
  const prefs = parseAppPrefs(profile?.prefs);
  const sw = prefs.programSwitch;
  const active = activeProgram(profile);
  const seen = prefs.switchNoticeSeenAt;
  const show = !!profile && !!sw && sw.to === active && sw.from !== sw.to && !!PROGRAMS[sw.from] && (!seen || seen < sw.at);
  return { show, fresh, at: sw?.at ?? null, from: (sw?.from ?? null) as ProgramId | null, to: active };
}

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const and = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** "Arms & Shoulders Monday and Thursday" … "Sunday is rest", from his saved week (A/B days share a line). */
export function weekByFamily(schedule: Record<string, string>): CheckedLine[] {
  const groups = new Map<string, { label: string; days: number[] }>();
  const rest: number[] = [];
  for (const wd of ORDER) {
    const key = schedule[String(wd)] ?? "rest";
    const def = key === "rest" ? undefined : templateDef(key);
    if (!def) {
      rest.push(wd);
      continue;
    }
    const id = def.family ?? def.key;
    const label = def.name.replace(/\s+[A-Z]$/, "");
    const g = groups.get(id) ?? { label, days: [] };
    g.days.push(wd);
    groups.set(id, g);
  }
  const lines: CheckedLine[] = [...groups.values()].map((g) => ({ title: `${g.label} ${and(g.days.map((d) => DAY[d]))}`, dataName: false }));
  if (rest.length) lines.push({ title: `${and(rest.map((d) => DAY[d]))} ${rest.length === 1 ? "is" : "are"} rest` });
  return lines;
}

export function NewPlanNotice({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { profile } = useProfile();
  const { at, from, to } = useNewPlanNotice();
  const savePrefs = useSavePrefs({ quiet: true });
  const { setProgram, pending } = useSetProgram();
  const [busy, setBusy] = useState(false);
  const prev = from ? PROGRAMS[from].name : null;
  const lines = weekByFamily(scheduleFor(profile));

  const seen = () => {
    if (at) savePrefs.mutate({ switchNoticeSeenAt: at });
  };
  const close = (o: boolean) => {
    if (!o) seen();
    onOpenChange(o);
  };
  const keepPrev = async () => {
    if (!from) return;
    setBusy(true);
    seen();
    const ok = await setProgram(from);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={close} title={`Your plan is now ${programInSentence(to)}`}>
      <div className="flex flex-col gap-5 pb-2">
        <CheckedList lines={lines} label="Your week" />
        <SheetReason>
          Your workouts, weights and bests are all kept.{prev ? ` ${prev} is saved with your changes, under Program.` : ""}
        </SheetReason>
        <SheetActions>
          <Button variant="primary" size="lg" block onClick={() => close(false)}>
            See my week
          </Button>
          {prev && (
            <Button variant="secondary" size="lg" block loading={busy || pending} onClick={keepPrev}>
              Keep {prev}
            </Button>
          )}
        </SheetActions>
      </div>
    </Sheet>
  );
}


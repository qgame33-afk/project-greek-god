"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { DEFAULT_SCHEDULE } from "@/lib/training/program";
import type { Profile } from "@/lib/data/profile";
import { normalizeSchedule, scheduleSummary, trainingDays, WEEK_ORDER, type Schedule } from "@/lib/onboarding/plan";
import { EditSheet } from "./EditSheet";
import { ScheduleEditor } from "./inputs";
import { useCommit } from "./useCommit";
import { useResetOnOpen } from "./useResetOnOpen";

type SheetProps = { open: boolean; onOpenChange: (o: boolean) => void; profile: Profile };

export function ScheduleSheet({ open, onOpenChange, profile }: SheetProps) {
  const { commit, pending, error, clearError } = useCommit();
  const current = useMemo(() => normalizeSchedule(profile.weekly_schedule), [profile.weekly_schedule]);
  const [s, setS] = useState<Schedule>(current);
  useResetOnOpen(open, () => {
    setS(current);
    clearError();
  });
  const changed = WEEK_ORDER.some((d) => s[d] !== current[d]);
  const isDefault = WEEK_ORDER.every((d) => s[d] === (DEFAULT_SCHEDULE as Schedule)[d]);
  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Weekly schedule"
      description="Your default week. Single-day moves and swaps still happen from Training."
      canSave={changed}
      pending={pending}
      error={error}
      onSave={() => commit({ weekly_schedule: s }, { message: `Schedule saved · ${scheduleSummary(s)}`, onDone: () => onOpenChange(false) })}
    >
      <div className="grid grid-cols-1 gap-3 pb-2">
        <ScheduleEditor value={s} onChange={setS} />
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-[13px] font-medium text-fg-2">
            <span className="num text-[15px] text-fg">{trainingDays(s)}</span> training {trainingDays(s) === 1 ? "day" : "days"} ·{" "}
            <span className="num text-[15px] text-fg">{7 - trainingDays(s)}</span> rest
          </p>
          {!isDefault && (
            <Button variant="link" className="h-11" onClick={() => setS({ ...(DEFAULT_SCHEDULE as Schedule) })}>
              Reset to Push/Pull/Legs × 2
            </Button>
          )}
        </div>
      </div>
    </EditSheet>
  );
}

/** Every IANA zone the browser knows, with the detected one first. */
export function useTimezones() {
  return useMemo(() => {
    let detected = "UTC";
    let all: string[] = [];
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
      /* very old browser */
    }
    if (!all.length) all = [detected, "UTC"];
    if (!all.includes(detected)) all = [detected, ...all];
    return { detected, all };
  }, []);
}

export function TimezoneSheet({ open, onOpenChange, profile }: SheetProps) {
  const { commit, pending, error, clearError } = useCommit();
  const { detected, all } = useTimezones();
  const [tz, setTz] = useState(profile.timezone);
  useResetOnOpen(open, () => {
    setTz(profile.timezone);
    clearError();
  });
  const options = all.includes(tz) ? all : [tz, ...all];
  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Time zone"
      description="Used for reminders and to decide which day a late log belongs to."
      canSave={tz !== profile.timezone}
      pending={pending}
      error={error}
      onSave={() => commit({ timezone: tz }, { message: `Time zone ${tz.replace(/_/g, " ")}`, onDone: () => onOpenChange(false) })}
    >
      <div className="grid grid-cols-1 gap-3 pb-2">
        <Field label="Time zone">
          {(id) => (
            <Select id={id} value={tz} onChange={(e) => setTz(e.target.value)}>
              {options.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {detected !== tz && (
          <Button variant="secondary" block onClick={() => setTz(detected)}>
            Use this device&apos;s zone · {detected.replace(/_/g, " ")}
          </Button>
        )}
      </div>
    </EditSheet>
  );
}

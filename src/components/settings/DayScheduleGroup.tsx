"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSavePrefs, type Profile } from "@/lib/data/profile";
import { blockedOffline } from "./offline";
import { formatClock, isTime, parseAppPrefs, toMinutes, type DaySchedule, type PrefsPatch } from "@/lib/prefs";
import { ControlRow, Group } from "./List";
import { MiniStepper } from "./inputs";

type MealKey = "breakfast" | "lunch" | "dinner" | "snack0" | "snack1" | "snack2";

const ROWS: { key: MealKey; label: string; detail?: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "snack0", label: "Morning snack", detail: "Used when you plan three snacks" },
  { key: "lunch", label: "Lunch" },
  { key: "snack1", label: "Afternoon snack" },
  { key: "dinner", label: "Dinner" },
  { key: "snack2", label: "Evening snack", detail: "Used with two or three snacks" },
];

function timeOf(day: DaySchedule, k: MealKey): string {
  if (k === "snack0") return day.meals.snacks[0];
  if (k === "snack1") return day.meals.snacks[1];
  if (k === "snack2") return day.meals.snacks[2];
  return day.meals[k];
}

function patchFor(k: MealKey, v: string, day: DaySchedule): PrefsPatch {
  if (k.startsWith("snack")) {
    const i = Number(k.slice(5));
    const snacks = [...day.meals.snacks] as string[];
    snacks[i] = v;
    return { day: { meals: { snacks } } };
  }
  return { day: { meals: { [k]: v } as NonNullable<NonNullable<PrefsPatch["day"]>["meals"]> } };
}

/**
 * Settings → Day schedule (docs/DESIGN-V2.md §3.10, §4.4): his usual training time and meal times,
 * stored in profiles.prefs.day through useSavePrefs (it merges, so the workout switches and every
 * other key survive). Each time saves when the picker closes, with Undo.
 */
export function DayScheduleGroup({ profile }: { profile: Profile }) {
  const save = useSavePrefs();
  const day = parseAppPrefs(profile.prefs).day;

  const commit = (patch: PrefsPatch, undo: PrefsPatch, message: string) =>
    !blockedOffline() &&
    save.mutate(patch, {
      onSuccess: () => toast(message, { duration: 6000, action: { label: "Undo", onClick: () => save.mutate(undo) } }),
    });

  return (
    <Group id="day" title="Day schedule" footer="Now and Fuel place your planned meals at these times. A snack near training moves to the pre-workout slot.">
      <ControlRow label="Usual training time" detail={day.trainAt ? "Now opens Train 90 minutes before" : "Not set: Now offers the session all afternoon"}>
        <TimeField
          label="Usual training time"
          value={day.trainAt}
          clearable
          onCommit={(v) =>
            commit({ day: { trainAt: v } }, { day: { trainAt: day.trainAt } }, v ? `Training at ${formatClock(toMinutes(v))}` : "Training time cleared")
          }
        />
      </ControlRow>
      {ROWS.map((r) => {
        const v = timeOf(day, r.key);
        return (
          <ControlRow key={r.key} label={r.label} detail={r.detail}>
            <TimeField label={r.label} value={v} onCommit={(next) => next && commit(patchFor(r.key, next, day), patchFor(r.key, v, day), `${r.label} at ${formatClock(toMinutes(next))}`)} />
          </ControlRow>
        );
      })}
      <ControlRow label="Pre-workout snack" detail={`${day.preWorkoutMin} min before training`}>
        <MiniStepper
          label="Minutes before training"
          value={day.preWorkoutMin}
          min={0}
          max={240}
          step={15}
          format={(m) => `${m}`}
          onChange={(m) => commit({ day: { preWorkoutMin: m } }, { day: { preWorkoutMin: day.preWorkoutMin } }, `Pre-workout snack ${m} min before`)}
        />
      </ControlRow>
    </Group>
  );
}

/**
 * A native time picker in a 44 px well (the iPhone shows its wheel). The value is kept locally
 * while he picks and saved once, on change from a complete time or on blur.
 */
function TimeField({ label, value, onCommit, clearable }: { label: string; value: string | null; onCommit: (v: string | null) => void; clearable?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value ?? "";
  const done = (v: string) => {
    setDraft(null);
    if (v === "" && clearable && value) return onCommit(null);
    if (isTime(v) && v !== value) onCommit(v);
  };
  return (
    <span className="flex items-center gap-1">
      {clearable && value && (
        <button type="button" onClick={() => onCommit(null)} className="press t-meta h-11 px-2 font-semibold text-stone hover:text-ivory" aria-label={`Clear ${label.toLowerCase()}`}>
          Clear
        </button>
      )}
      <input
        type="time"
        aria-label={label}
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => done(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="tnum h-11 w-[8.25rem] rounded-field border border-ui-line bg-m3 px-3 text-center [&::-webkit-calendar-picker-indicator]:hidden text-[length:max(16px,1rem)] font-semibold text-ivory outline-none transition-[border-color,box-shadow] [color-scheme:dark] focus:border-leaf-300 focus:shadow-[0_0_0_3px_var(--leaf-tint)]"
      />
    </span>
  );
}

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { avatarInitial } from "@/components/shell/nav";
import { Tag } from "@/components/ui/tag";
import { Segmented } from "@/components/ui/controls";
import { ErrorNote } from "@/components/ui/misc";
import { useToday, useUser } from "@/lib/data/core";
import { useProfile, useSavePrefs, type Profile } from "@/lib/data/profile";
import { daysBetween, shortDate, type ISODate } from "@/lib/dates";
import { requiredWeeklyGain } from "@/lib/bodyweight";
import { cn } from "@/lib/cn";
import { balancedCarbs } from "@/lib/onboarding/macros";
import { formatPlacardWeight, normalizeSchedule, scheduleSummary, weeklyRateText } from "@/lib/onboarding/plan";
import { parseAppPrefs } from "@/lib/prefs";
import { formatBodyweight, formatHeight, formatInt, round, type WeightUnit } from "@/lib/units";
import { AISheet, CreditsSheet, PrivacySheet, aiStatusLabel, useAppStatus, useCredits } from "./AboutSheets";
import { PasswordSheet, useSignOut } from "./AccountSheets";
import { AppearanceGroup } from "./AppearanceGroup";
import { DayScheduleGroup } from "./DayScheduleGroup";
import { DeleteAccountSheet, ExportSheet, WipeSheet } from "./DataSheets";
import { GoalWeightSheet, HeightSheet, NameSheet, StartWeightSheet, TargetDateSheet } from "./GoalSheets";
import { LengthUnitToggle, WeightUnitToggle } from "./inputs";
import { ControlRow, Group, GroupSkeleton, InfoRow, LinkRow, NavRow, SwitchRow } from "./List";
import { DailyGoalSheet, GoalHistorySheet, MacroCheck, NutritionSheet } from "./NutritionSheets";
import { ReminderSection } from "./ReminderSection";
import { TimezoneSheet } from "./TrainingSheets";
import { useCommit } from "./useCommit";

type SheetId =
  | "name"
  | "start"
  | "goal"
  | "target"
  | "height"
  | "nutrition"
  | "history"
  | "water"
  | "sleep"
  | "steps"
  | "timezone"
  | "export"
  | "wipe"
  | "delete"
  | "password"
  | "privacy"
  | "ai"
  | "credits";

type CoachKey = "profile" | "training" | "nutrition" | "bodyweight" | "recovery" | "measurements";
const COACH: { key: CoachKey; label: string; detail: string }[] = [
  { key: "profile", label: "Profile and goals", detail: "Body stats, goals and daily targets." },
  { key: "training", label: "Training", detail: "Workouts, sets, records and your schedule." },
  { key: "nutrition", label: "Nutrition", detail: "Food log and daily totals." },
  { key: "bodyweight", label: "Bodyweight", detail: "Weigh-ins and the trend." },
  { key: "recovery", label: "Recovery and habits", detail: "Sleep, soreness, energy and habits." },
  { key: "measurements", label: "Measurements", detail: "Tape measurements and athletic tests." },
];

const MODE: Record<string, { label: string; text: string }> = {
  standard: { label: "Standard", text: "Every prescribed set at 1–2 reps in reserve." },
  intro: { label: "Intro", text: "One fewer set per exercise while you settle in." },
  deload: { label: "Deload", text: "About half the sets, ~10% lighter, 3–4 reps in reserve." },
};

const SECTIONS: { id: string; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "goal", label: "Goal" },
  { id: "program", label: "Program" },
  { id: "day", label: "Day schedule" },
  { id: "nutrition", label: "Nutrition targets" },
  { id: "reminders", label: "Reminders" },
  { id: "workout", label: "Workout" },
  { id: "appearance", label: "Appearance" },
  { id: "oracle", label: "Oracle" },
  { id: "data", label: "Data" },
  { id: "account", label: "Account" },
];

function coachOf(p: Profile | null | undefined): Record<CoachKey, boolean> {
  const raw = (p?.coach_access ?? {}) as Partial<Record<CoachKey, boolean>>;
  return Object.fromEntries(COACH.map((c) => [c.key, raw[c.key] !== false])) as Record<CoachKey, boolean>;
}

/**
 * Settings (docs/DESIGN-V2.md §3.10): one page of plain grouped rows. Profile, Goal, Program (the
 * schedule and mode are edited in Train → Program; this links there), Day schedule, Nutrition
 * targets, Reminders, Workout, Appearance, Oracle, Data and Account. Every prefs write goes
 * through useSavePrefs, which merges into the stored JSON. There is no Haptics row: iPhone web
 * apps have no vibration.
 */
export function SettingsView() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const recovery = params.get("reset") === "1";
  const { profile, loading, error } = useProfile();
  const { user } = useUser();
  const today = useToday();
  const status = useAppStatus();
  const credits = useCredits();
  const { commit } = useCommit({ inline: false });
  const savePrefs = useSavePrefs();
  const { signOut, pending: signingOut, dialog: signOutDialog } = useSignOut();
  // Arriving from a password-reset email opens "Set a new password" straight away.
  const [sheet, setSheet] = useState<SheetId | null>(recovery ? "password" : null);
  const [mounted, setMounted] = useState<Set<SheetId>>(() => new Set<SheetId>(recovery ? ["password"] : []));

  const open = (id: SheetId) => {
    setMounted((m) => (m.has(id) ? m : new Set(m).add(id)));
    setSheet(id);
  };
  const sheetProps = (id: SheetId) => ({ open: sheet === id, onOpenChange: (o: boolean) => setSheet(o ? id : null) });

  if (error && !profile) {
    return (
      <Shell>
        <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["profile"] })}>Couldn&apos;t load your settings. {(error as Error).message}</ErrorNote>
      </Shell>
    );
  }

  if (loading || !profile) {
    return (
      <Shell>
        <div className="grid grid-cols-1 gap-8" aria-busy="true">
          <div className="flex items-center gap-4">
            <div className="skeleton size-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-7 w-40 rounded-field" />
              <div className="skeleton h-3.5 w-56 rounded-full" />
            </div>
          </div>
          <GroupSkeleton rows={4} />
          <GroupSkeleton rows={4} />
          <GroupSkeleton rows={3} />
        </div>
      </Shell>
    );
  }

  const u = (profile.weight_unit === "kg" ? "kg" : "lb") as WeightUnit;
  const lu = profile.length_unit === "cm" ? "cm" : "in";
  const coach = coachOf(profile);
  const prefs = parseAppPrefs(profile.prefs);
  const setCoach = (k: CoachKey, v: boolean) => commit({ coach_access: { ...coach, [k]: v } }, { guard: false });

  const startLb = Number(profile.start_weight_lb ?? 163);
  const goalLb = Number(profile.goal_weight_lb ?? 183);
  const rate = requiredWeeklyGain(startLb, goalLb, profile.start_date, profile.target_date);
  const daysLeft = daysBetween(today, profile.target_date);
  const carbsAuto = profile.carb_goal === balancedCarbs(profile.calorie_goal, profile.protein_goal, profile.fat_goal);
  const schedule = normalizeSchedule(profile.weekly_schedule);
  const mode = MODE[profile.training_mode] ?? MODE.standard;
  const sheetBase = { profile, today };

  return (
    <Shell>
      <div className="lg:grid lg:grid-cols-[11.75rem_minmax(0,42.5rem)] lg:gap-14">
        <SectionNav />
        <div className="@container grid grid-cols-1 gap-8">
          <ProfileHeader profile={profile} email={user?.email ?? null} today={today} onEdit={() => open("name")} />

          <Group id="profile" title="Profile">
            <NavRow label="Name" value={profile.display_name?.trim() || "Not set"} onClick={() => open("name")} />
            <NavRow label="Height" value={formatHeight(Number(profile.height_cm ?? 189.2), lu)} onClick={() => open("height")} />
            <ControlRow label="Weight unit">
              <WeightUnitToggle value={u} onChange={(v) => commit({ weight_unit: v }, { guard: false })} />
            </ControlRow>
            <ControlRow label="Length unit">
              <LengthUnitToggle value={lu} onChange={(v) => commit({ length_unit: v }, { guard: false })} />
            </ControlRow>
            <NavRow label="Time zone" detail="Decides when a new day starts" value={profile.timezone.split("/").pop()?.replace(/_/g, " ")} onClick={() => open("timezone")} />
          </Group>

          <Group id="goal" title="Goal" footer="Goal changes are logged with the date, so suggestions and monthly reviews know when a target moved.">
            <NavRow label="Start" detail={fullDate(profile.start_date)} value={formatBodyweight(startLb, u)} onClick={() => open("start")} />
            <NavRow
              label="Goal and band"
              detail={`Band ${formatPlacardWeight(Number(profile.goal_range_min_lb ?? 180), u)}–${formatPlacardWeight(Number(profile.goal_range_max_lb ?? 185), u)} ${u}`}
              value={formatBodyweight(goalLb, u)}
              onClick={() => open("goal")}
            />
            <NavRow
              label="Target date"
              detail={daysLeft > 0 ? `${formatInt(daysLeft)} days left · ${weeklyRateText(rate, u)}` : "The target date has passed. Set a new one."}
              value={fullDate(profile.target_date)}
              onClick={() => open("target")}
            />
            <NavRow label="Goal history" detail="Every target change with its date and reason." onClick={() => open("history")} />
          </Group>

          <Group id="program" title="Program" footer="The weekly schedule, training mode and volleyball are set in Train → Program.">
            <LinkRow label="Weekly schedule" detail={scheduleSummary(schedule)} value={<WeekPips schedule={schedule} />} href="/training?tab=program" />
            <LinkRow label="Training mode" detail={mode.text} value={mode.label} href="/training?tab=program" />
            <LinkRow label="Volleyball" detail="Sessions per week, counted as training load" value={`${profile.volleyball_per_week} a week`} href="/training?tab=program" />
            <ControlRow label="Experience" stack>
              <Segmented
                ariaLabel="Training experience"
                className="@max-[19rem]:h-auto @max-[19rem]:flex-col @max-[19rem]:[&>button]:min-h-11"
                value={(profile.experience as "beginner" | "intermediate" | "advanced") ?? "intermediate"}
                onChange={(v) => commit({ experience: v }, { guard: false })}
                options={[
                  { value: "beginner", label: "Beginner" },
                  { value: "intermediate", label: "Intermediate" },
                  { value: "advanced", label: "Advanced" },
                ]}
              />
            </ControlRow>
          </Group>

          <DayScheduleGroup profile={profile} />

          <Group id="nutrition" title="Nutrition targets" footer={<MacroCheck calories={profile.calorie_goal} protein={profile.protein_goal} carbs={profile.carb_goal} fat={profile.fat_goal} />}>
            <NavRow label="Calories" value={`${formatInt(profile.calorie_goal)} kcal`} onClick={() => open("nutrition")} />
            <NavRow label="Protein" value={`${formatInt(profile.protein_goal)} g`} onClick={() => open("nutrition")} />
            <NavRow label="Carbs" badge={carbsAuto ? <Tag kind="CALC" /> : undefined} detail={carbsAuto ? "Balanced from calories, protein and fat" : undefined} value={`${formatInt(profile.carb_goal)} g`} onClick={() => open("nutrition")} />
            <NavRow label="Fat" value={`${formatInt(profile.fat_goal)} g`} onClick={() => open("nutrition")} />
            <NavRow label="Water" value={`${(profile.water_goal_ml / 1000).toFixed(profile.water_goal_ml % 100 === 0 ? 1 : 2)} L`} onClick={() => open("water")} />
            <NavRow label="Sleep goal" value={`${round(Number(profile.sleep_goal_h), 2)} h`} onClick={() => open("sleep")} />
            <NavRow label="Steps" value={formatInt(profile.steps_goal)} onClick={() => open("steps")} />
          </Group>

          <ReminderSection />

          <Group id="workout" title="Workout">
            <SwitchRow label="Tap ✓ logs shown values" detail="One tap logs the prefilled weight and reps." checked={prefs.tapLogsGhost} onChange={(v) => savePrefs.mutate({ tapLogsGhost: v })} />
            <SwitchRow label="Use system keyboard" detail="Type set values with the phone keyboard instead of the number pad." checked={prefs.systemKeyboard} onChange={(v) => savePrefs.mutate({ systemKeyboard: v })} />
            <SwitchRow label="Rest chime" detail="A soft two-note chime when rest is over." checked={prefs.restChime} onChange={(v) => savePrefs.mutate({ restChime: v })} />
          </Group>

          <AppearanceGroup profile={profile} />

          <Group id="oracle" title="Oracle" footer="The Oracle only sees what is switched on, and only when you ask it something. Progress photos are never sent.">
            {COACH.map((c) => (
              <SwitchRow key={c.key} label={c.label} detail={c.detail} checked={coach[c.key]} onChange={(v) => setCoach(c.key, v)} />
            ))}
          </Group>

          <Group id="data" title="Data" footer="Exports include every table as JSON and CSV. Deleting can't be undone.">
            <NavRow label="Export data" detail="ZIP with JSON, CSV and optional photos." onClick={() => open("export")} />
            <LinkRow label="Meal preferences" detail="Dislikes, allergies and what the planner has learned" href="/nutrition/meals/preferences" />
            <NavRow label="Delete all logged data" detail="Keeps your account, profile and goals." danger onClick={() => open("wipe")} />
            <InfoRow label="Version" value={status.data?.version ?? "—"} />
            <NavRow label="Privacy" onClick={() => open("privacy")} />
            <NavRow label="AI and your data" detail="Google Gemini" value={status.isError ? "—" : aiStatusLabel(status.data)} onClick={() => open("ai")} />
            {credits.data && <NavRow label="Art credits" detail="Statue of Hermes · The Met, public domain" onClick={() => open("credits")} />}
          </Group>

          <Group id="account" title="Account">
            <InfoRow label="Email" value={user?.email ?? "—"} />
            <NavRow label="Change password" onClick={() => open("password")} />
            <NavRow label={signingOut ? "Signing out…" : "Sign out"} chevron={false} disabled={signingOut} onClick={() => void signOut()} />
            <NavRow label="Delete account" detail="Removes everything, including photos." danger onClick={() => open("delete")} />
          </Group>
        </div>
      </div>

      {/* sheets mount on first open and stay mounted so Undo toasts keep working */}
      {mounted.has("name") && <NameSheet {...sheetProps("name")} {...sheetBase} />}
      {mounted.has("start") && <StartWeightSheet {...sheetProps("start")} {...sheetBase} />}
      {mounted.has("goal") && <GoalWeightSheet {...sheetProps("goal")} {...sheetBase} />}
      {mounted.has("target") && <TargetDateSheet {...sheetProps("target")} {...sheetBase} />}
      {mounted.has("height") && <HeightSheet {...sheetProps("height")} {...sheetBase} />}
      {mounted.has("nutrition") && <NutritionSheet {...sheetProps("nutrition")} {...sheetBase} />}
      {mounted.has("history") && <GoalHistorySheet {...sheetProps("history")} today={today} weightUnit={u} />}
      {mounted.has("water") && <DailyGoalSheet kind="water" {...sheetProps("water")} {...sheetBase} />}
      {mounted.has("sleep") && <DailyGoalSheet kind="sleep" {...sheetProps("sleep")} {...sheetBase} />}
      {mounted.has("steps") && <DailyGoalSheet kind="steps" {...sheetProps("steps")} {...sheetBase} />}
      {mounted.has("timezone") && <TimezoneSheet {...sheetProps("timezone")} profile={profile} />}
      {mounted.has("export") && user && <ExportSheet {...sheetProps("export")} userId={user.id} email={user.email ?? null} today={today} version={status.data?.version} />}
      {mounted.has("wipe") && user && <WipeSheet {...sheetProps("wipe")} userId={user.id} onExport={() => open("export")} />}
      {mounted.has("delete") && <DeleteAccountSheet {...sheetProps("delete")} email={user?.email ?? null} onExport={() => open("export")} />}
      {mounted.has("password") && <PasswordSheet {...sheetProps("password")} email={user?.email ?? null} recovery={recovery} onDone={() => recovery && router.replace("/settings")} />}
      {mounted.has("privacy") && <PrivacySheet {...sheetProps("privacy")} />}
      {mounted.has("ai") && <AISheet {...sheetProps("ai")} status={status.data} statusError={status.isError} />}
      {mounted.has("credits") && credits.data && <CreditsSheet {...sheetProps("credits")} markdown={credits.data} />}
      {signOutDialog}
    </Shell>
  );
}

/** "Sep 11, 2026" */
function fullDate(d: ISODate) {
  return shortDate(d, "0000-01-01");
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[57.5rem] pb-6">{children}</div>;
}

/* --------------------------------------------------------------- the header */

/** The avatar initial (from his display name, never the email), the name and the day of the climb. */
function ProfileHeader({ profile, email, today, onEdit }: { profile: Profile; email: string | null; today: ISODate; onEdit: () => void }) {
  const name = profile.display_name?.trim();
  const initial = avatarInitial(name);
  const day = daysBetween(profile.start_date, today) + 1;
  const u = (profile.weight_unit === "kg" ? "kg" : "lb") as WeightUnit;
  return (
    <header className="pt-1">
      <p className="t-eyebrow mb-4">Settings</p>
      {/* at accessibility sizes the name and the line under it take the full width below the initial */}
      <div className="flex items-center gap-4 @max-[19rem]:flex-wrap">
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-m2 shadow-[inset_0_0_0_1px_var(--leaf-line)]" aria-hidden>
          <span className="font-voice text-[length:2rem] font-semibold leading-none text-leaf-200">{initial}</span>
        </div>
        <div className="min-w-0 flex-1 @max-[19rem]:order-last @max-[19rem]:basis-full">
          <h1 className="t-title-1 truncate text-ivory @max-[19rem]:whitespace-normal">{name || "Your name"}</h1>
          <p className="t-meta mt-1 text-stone">
            {day >= 1 ? `Day ${formatInt(day)} of the ascent` : `Starts in ${formatInt(1 - day)} ${1 - day === 1 ? "day" : "days"}`} · {formatPlacardWeight(Number(profile.start_weight_lb ?? 163), u)} →{" "}
            {formatPlacardWeight(Number(profile.goal_weight_lb ?? 183), u)} {u}
          </p>
          {email && <p className="t-meta truncate text-ash">{email}</p>}
        </div>
        <button type="button" onClick={onEdit} className="press t-callout -mr-2 h-11 shrink-0 px-3 font-semibold text-ivory underline decoration-ui-line underline-offset-4 @max-[19rem]:ml-auto">
          Edit
        </button>
      </div>
    </header>
  );
}

/** Seven small marks for the week: an ivory pip for a training day, an outline for rest. */
function WeekPips({ schedule }: { schedule: Record<string, string> }) {
  const order = ["1", "2", "3", "4", "5", "6", "0"];
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {order.map((d) => (
        <span key={d} className={cn("size-2 rounded-full", schedule[d] !== "rest" ? "bg-ivory" : "shadow-[inset_0_0_0_1px_var(--ui-line)]")} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------- desktop section nav */

function SectionNav() {
  const ids = useMemo(() => SECTIONS.map((s) => s.id), []);
  const [active, setActive] = useState("profile");
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids]);
  return (
    <nav aria-label="Settings sections" className="hidden lg:block">
      <ul className="sticky top-8 grid gap-0.5">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                setActive(s.id);
              }}
              className={cn("t-callout relative flex h-11 items-center rounded-field px-3 font-semibold transition-colors", active === s.id ? "bg-m2 text-ivory" : "text-ash hover:text-stone")}
              aria-current={active === s.id ? "true" : undefined}
            >
              {active === s.id && <span className="absolute left-0 top-3 h-5 w-0.5 rounded-full bg-ivory" aria-hidden />}
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

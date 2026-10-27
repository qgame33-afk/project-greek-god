"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronRight, Clock, Download, Dumbbell, Sparkle, Target, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CoachDataList } from "@/components/coach/AccessSheet";
import { ReminderSettings } from "@/components/reminders/ReminderSettings";
import { BackHeader } from "@/components/shell/BackHeader";
import { avatarInitial } from "@/components/shell/nav";
import { Segmented } from "@/components/ui/controls";
import { ListGroup, RadioGroup, RadioRow } from "@/components/ui/list";
import { ErrorNote } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { saveAppearance, useAppearance, type MotionPref, type NightPref } from "@/lib/appearance";
import { useToday, useUser } from "@/lib/data/core";
import { useActiveProgram } from "@/lib/data/program";
import { useProfile, useSavePrefs, type Profile } from "@/lib/data/profile";
import { daysBetween, shortDate, type ISODate } from "@/lib/dates";
import { requiredWeeklyGain } from "@/lib/bodyweight";
import { balancedCarbs } from "@/lib/onboarding/macros";
import { formatPlacardWeight, weeklyRateText } from "@/lib/onboarding/plan";
import { parseAppPrefs } from "@/lib/prefs";
import { normalizeSettings } from "@/lib/reminders/schedule";
import { formatBodyweight, formatHeight, formatInt, round, type LengthUnit, type WeightUnit } from "@/lib/units";
import { AISheet, PrivacySheet, aiStatusLabel, useAppStatus } from "./AboutSheets";
import { PasswordSheet, useSignOut } from "./AccountSheets";
import { DayScheduleGroup } from "./DayScheduleGroup";
import { DeleteAccountSheet, ExportSheet, WipeSheet } from "./DataSheets";
import { GoalWeightSheet, HeightSheet, NameSheet, StartWeightSheet, TargetDateSheet } from "./GoalSheets";
import { ControlRow, Group, GroupSkeleton, InfoRow, LinkRow, NavRow, SwitchRow } from "./List";
import { DailyGoalSheet, GoalHistorySheet, MacroCheck, NutritionSheet } from "./NutritionSheets";
import { TimezoneSheet } from "./TrainingSheets";
import { blockedOffline } from "./offline";
import { useCommit } from "./useCommit";

/** The Settings pages (§4.9): the index's profile card plus seven rows → `/settings?section=<id>`. */
export const SECTIONS = ["profile", "goals", "schedule", "workout", "reminders", "coach-data", "data", "account"] as const;
export type SectionId = (typeof SECTIONS)[number];

const TITLE: Record<SectionId, string> = {
  profile: "Profile",
  goals: "Goals and targets",
  schedule: "Day schedule",
  workout: "Workout",
  reminders: "Reminders",
  "coach-data": "Coach data",
  data: "Your data",
  account: "Account",
};

/** The old one-page anchors (§3.7) → the page that holds them now. */
const HASH: Record<string, SectionId> = {
  profile: "profile",
  appearance: "profile",
  goal: "goals",
  nutrition: "goals",
  day: "schedule",
  program: "workout",
  workout: "workout",
  reminders: "reminders",
  oracle: "coach-data",
  data: "data",
  account: "account",
};

const isSection = (v: string | null): v is SectionId => !!v && (SECTIONS as readonly string[]).includes(v);

type SheetId = "name" | "start" | "goal" | "target" | "height" | "nutrition" | "history" | "water" | "sleep" | "steps" | "timezone" | "export" | "wipe" | "delete" | "password" | "privacy" | "ai" | "experience";

const weightUnitOf = (p: Profile): WeightUnit => (p.weight_unit === "lb" ? "lb" : "kg");
const lengthUnitOf = (p: Profile): LengthUnit => (p.length_unit === "in" ? "in" : "cm");

/**
 * Settings (docs/DESIGN-V3-SIMPLE.md §4.9): an index (a profile card and seven rows in two groups)
 * whose entries push `/settings?section=<id>`, each page holding the existing controls and save
 * logic. Old `#hash` links land on their page; `?reset=1` opens "Set a new password" on Account.
 * Every prefs write goes through useSavePrefs (it merges into the stored JSON).
 */
export function SettingsView() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const recovery = params.get("reset") === "1";
  const raw = params.get("section");
  const section: SectionId | null = recovery ? "account" : isSection(raw) ? raw : null;
  const { profile, loading, error } = useProfile();

  // /settings#goal and friends → /settings?section=goals (the old anchors keep working)
  useEffect(() => {
    if (section) return;
    const h = window.location.hash.slice(1);
    if (HASH[h]) router.replace(`/settings?section=${HASH[h]}`, { scroll: false });
  }, [section, router]);

  const header = section ? <BackHeader href="/settings" parent="Settings" title={TITLE[section]} /> : <BackHeader href="/" parent="Today" title="Settings" />;

  if (error && !profile) {
    return (
      <Shell>
        {header}
        <ErrorNote className="mt-6" onRetry={() => qc.invalidateQueries({ queryKey: ["profile"] })}>
          Couldn&apos;t load your settings.
        </ErrorNote>
      </Shell>
    );
  }

  if (loading || !profile) {
    return (
      <Shell>
        {header}
        <div className="mt-6 grid grid-cols-1 gap-3" aria-busy="true">
          <div className="skeleton h-24 rounded-card" />
          <GroupSkeleton rows={4} />
          <GroupSkeleton rows={3} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {header}
      <div className="mt-6">{section ? <SectionPage id={section} profile={profile} recovery={recovery} /> : <Index profile={profile} />}</div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-col pb-6">{children}</div>;
}

/* ------------------------------------------------------------------ index */

function Tile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-icon bg-card-3 text-fg">
      <Icon className="size-5" strokeWidth={1.9} />
    </span>
  );
}

function Index({ profile }: { profile: Profile }) {
  const status = useAppStatus();
  const { def } = useActiveProgram();
  const reminders = normalizeSettings(profile.reminders);
  const on = Object.values(reminders).filter((r) => r.on).length;
  const name = profile.display_name?.trim();
  const href = (s: SectionId) => `/settings?section=${s}`;
  return (
    <div className="@container grid grid-cols-1 gap-3">
      <Link href={href("profile")} className="press flex min-h-24 items-center gap-4 rounded-card bg-surface px-4 py-4">
        <span aria-hidden className="t-section grid size-14 shrink-0 place-items-center rounded-full bg-card-2">
          {avatarInitial(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="t-row block truncate" data-budget-name="">
            {name || "Your name"}
          </span>
          <span className="t-label mt-0.5 block">Profile, units, display</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
      </Link>

      <ListGroup>
        <LinkRow icon={<Tile icon={Target} />} label="Goals and targets" value={`${formatInt(profile.calorie_goal)} kcal`} href={href("goals")} />
        <LinkRow icon={<Tile icon={Clock} />} label="Day schedule" detail="Meal and training times" href={href("schedule")} />
        <LinkRow icon={<Tile icon={Dumbbell} />} label="Workout" value={def.name} href={href("workout")} />
        <LinkRow icon={<Tile icon={Bell} />} label="Reminders" value={on ? `${on} on` : "Off"} href={href("reminders")} />
      </ListGroup>
      <ListGroup>
        <LinkRow icon={<Tile icon={Sparkle} />} label="Coach data" detail="What the AI can read" href={href("coach-data")} />
        <LinkRow icon={<Tile icon={Download} />} label="Your data" detail="Export, privacy, delete" href={href("data")} />
        <LinkRow icon={<Tile icon={User} />} label="Account" detail="Email, password, sign out" href={href("account")} />
      </ListGroup>
      <p className="t-label mt-3 text-center">Version {status.data?.version ?? "—"}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ pages */

function SectionPage({ id, profile, recovery }: { id: SectionId; profile: Profile; recovery: boolean }) {
  const router = useRouter();
  const { user } = useUser();
  const today = useToday();
  const status = useAppStatus();
  const { def } = useActiveProgram();
  const { commit } = useCommit({ inline: false });
  const savePrefs = useSavePrefs();
  const { signOut, pending: signingOut, dialog: signOutDialog } = useSignOut();
  // Arriving from a password-reset email opens "Set a new password" straight away.
  const [sheet, setSheet] = useState<SheetId | null>(recovery ? "password" : null);
  const [mounted, setMounted] = useState<Set<SheetId>>(() => new Set<SheetId>(recovery ? ["password"] : []));
  const open = (s: SheetId) => {
    setMounted((m) => (m.has(s) ? m : new Set(m).add(s)));
    setSheet(s);
  };
  const sheetProps = (s: SheetId) => ({ open: sheet === s, onOpenChange: (o: boolean) => setSheet(o ? s : null) });
  const sheetBase = { profile, today };

  const u = weightUnitOf(profile);
  const lu = lengthUnitOf(profile);
  const prefs = parseAppPrefs(profile.prefs);
  const startLb = Number(profile.start_weight_lb ?? 163);
  const goalLb = Number(profile.goal_weight_lb ?? 183);
  const rate = requiredWeeklyGain(startLb, goalLb, profile.start_date, profile.target_date);
  const daysLeft = daysBetween(today, profile.target_date);
  const carbsAuto = profile.carb_goal === balancedCarbs(profile.calorie_goal, profile.protein_goal, profile.fat_goal);
  const exp = profile.experience === "beginner" || profile.experience === "advanced" ? profile.experience : "intermediate";

  let body: ReactNode = null;
  if (id === "profile")
    body = (
      <div className="grid grid-cols-1 gap-7">
        <Group>
          <NavRow label="Name" value={profile.display_name?.trim() || "Not set"} onClick={() => open("name")} />
          <NavRow label="Height" value={formatHeight(Number(profile.height_cm ?? 189.2), lu)} onClick={() => open("height")} />
          <ControlRow label="Weight unit">
            <Segmented<WeightUnit>
              ariaLabel="Weight unit"
              className="w-32"
              value={u}
              onChange={(v) => commit({ weight_unit: v }, { guard: false })}
              options={[
                { value: "kg", label: "kg" },
                { value: "lb", label: "lb" },
              ]}
            />
          </ControlRow>
          <ControlRow label="Length unit">
            <Segmented<LengthUnit>
              ariaLabel="Length unit"
              className="w-36"
              value={lu}
              onChange={(v) => commit({ length_unit: v }, { guard: false })}
              options={[
                { value: "cm", label: "cm" },
                { value: "in", label: "ft · in" },
              ]}
            />
          </ControlRow>
          <NavRow label="Time zone" value={profile.timezone.split("/").pop()?.replace(/_/g, " ")} onClick={() => open("timezone")} />
        </Group>
        <Display />
      </div>
    );
  else if (id === "goals")
    body = (
      <div className="grid grid-cols-1 gap-7">
        <Group footer="Goal changes are saved with the date.">
          <NavRow label="Start" detail={fullDate(profile.start_date)} value={formatBodyweight(startLb, u)} onClick={() => open("start")} />
          <NavRow
            label="Goal and band"
            detail={`Happy anywhere from ${formatPlacardWeight(Number(profile.goal_range_min_lb ?? 180), u)} to ${formatPlacardWeight(Number(profile.goal_range_max_lb ?? 185), u)} ${u}`}
            value={formatBodyweight(goalLb, u)}
            onClick={() => open("goal")}
          />
          <NavRow
            label="Target date"
            detail={daysLeft > 0 ? `${formatInt(daysLeft)} days to go · ${weeklyRateText(rate, u)}` : "The target date has passed. Set a new one."}
            value={fullDate(profile.target_date)}
            onClick={() => open("target")}
          />
          <NavRow label="Goal history" detail="Every target change with its date" onClick={() => open("history")} />
        </Group>
        <Group title="Daily targets" footer={<MacroCheck calories={profile.calorie_goal} protein={profile.protein_goal} carbs={profile.carb_goal} fat={profile.fat_goal} />}>
          <NavRow label="Calories" value={`${formatInt(profile.calorie_goal)} kcal`} onClick={() => open("nutrition")} />
          <NavRow label="Protein" value={`${formatInt(profile.protein_goal)} g`} onClick={() => open("nutrition")} />
          <NavRow label="Carbs" detail={carbsAuto ? "Balanced from the others" : undefined} value={`${formatInt(profile.carb_goal)} g`} onClick={() => open("nutrition")} />
          <NavRow label="Fat" value={`${formatInt(profile.fat_goal)} g`} onClick={() => open("nutrition")} />
          <NavRow label="Water" value={`${(profile.water_goal_ml / 1000).toFixed(profile.water_goal_ml % 100 === 0 ? 1 : 2)} L`} onClick={() => open("water")} />
          <NavRow label="Sleep goal" value={`${round(Number(profile.sleep_goal_h), 2)} h`} onClick={() => open("sleep")} />
          <NavRow label="Steps" value={formatInt(profile.steps_goal)} onClick={() => open("steps")} />
        </Group>
      </div>
    );
  else if (id === "schedule")
    body = (
      <div className="grid grid-cols-1 gap-7">
        <DayScheduleGroup profile={profile} />
        <Group>
          <LinkRow label="Check-ins and habits" href="/recovery" />
        </Group>
      </div>
    );
  else if (id === "workout")
    body = (
      <div className="grid grid-cols-1 gap-3">
        <Group>
          <LinkRow label="Program" value={def.name} href="/training?tab=program" />
          <NavRow label="Experience" value={EXPERIENCE[exp]} onClick={() => open("experience")} />
        </Group>
        <Group footer="Plan, week order and lighter options are in Train › Program.">
          <SwitchRow label="One tap logs the shown values" detail="Log set saves the weight and reps on screen." checked={prefs.tapLogsGhost} onChange={(v) => !blockedOffline() && savePrefs.mutate({ tapLogsGhost: v })} />
          <SwitchRow label="Use the phone keyboard" detail="Instead of the big number pad." checked={prefs.systemKeyboard} onChange={(v) => !blockedOffline() && savePrefs.mutate({ systemKeyboard: v })} />
          <SwitchRow label="Rest chime" detail="A soft sound when rest is over." checked={prefs.restChime} onChange={(v) => !blockedOffline() && savePrefs.mutate({ restChime: v })} />
          <SwitchRow label="Open the workout when the app opens" detail="While a workout is running." checked={prefs.gymAuto} onChange={(v) => !blockedOffline() && savePrefs.mutate({ gymAuto: v })} />
        </Group>
      </div>
    );
  else if (id === "reminders") body = <ReminderSettings embedded={false} heading={false} />;
  else if (id === "coach-data")
    body = (
      <Group footer="The AI only reads what is switched on, and only when you ask it something. Progress photos are never sent.">
        <CoachDataList profile={profile} />
      </Group>
    );
  else if (id === "data")
    body = (
      <div className="grid grid-cols-1 gap-7">
        <Group footer="The export is every table as JSON and CSV in one ZIP file.">
          <NavRow label="Export data" detail="A ZIP of everything, photos optional" onClick={() => open("export")} />
          <LinkRow label="Meal preferences" detail="Dislikes, allergies and what the planner learned" href="/nutrition/meals/preferences" />
          <NavRow label="Privacy" onClick={() => open("privacy")} />
          <NavRow label="AI and your data" value={status.isError ? "—" : aiStatusLabel(status.data)} onClick={() => open("ai")} />
        </Group>
        <Group footer="Keeps your account, profile and goals. This can't be undone.">
          <NavRow label="Delete all logged data" danger chevron={false} onClick={() => open("wipe")} />
        </Group>
      </div>
    );
  else if (id === "account")
    body = (
      <div className="grid grid-cols-1 gap-7">
        <Group>
          <InfoRow label="Email" value={user?.email ?? "—"} />
          <NavRow label="Change password" onClick={() => open("password")} />
          <NavRow label={signingOut ? "Signing out…" : "Sign out"} chevron={false} disabled={signingOut} onClick={() => void signOut()} />
        </Group>
        <Group footer="Removes everything, including photos.">
          <NavRow label="Delete account" danger chevron={false} onClick={() => open("delete")} />
        </Group>
      </div>
    );

  return (
    <>
      {body}
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
      {mounted.has("experience") && <ExperienceSheet {...sheetProps("experience")} value={exp} onPick={(v) => commit({ experience: v }, { guard: false })} />}
      {mounted.has("export") && user && <ExportSheet {...sheetProps("export")} userId={user.id} email={user.email ?? null} today={today} version={status.data?.version} />}
      {mounted.has("wipe") && user && <WipeSheet {...sheetProps("wipe")} userId={user.id} onExport={() => open("export")} />}
      {mounted.has("delete") && <DeleteAccountSheet {...sheetProps("delete")} email={user?.email ?? null} onExport={() => open("export")} />}
      {mounted.has("password") && <PasswordSheet {...sheetProps("password")} email={user?.email ?? null} recovery={recovery} onDone={() => recovery && router.replace("/settings?section=account")} />}
      {mounted.has("privacy") && <PrivacySheet {...sheetProps("privacy")} />}
      {mounted.has("ai") && <AISheet {...sheetProps("ai")} status={status.data} statusError={status.isError} />}
      {signOutDialog}
    </>
  );
}

const EXPERIENCE: Record<"beginner" | "intermediate" | "advanced", string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };

function ExperienceSheet({ open, onOpenChange, value, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; value: keyof typeof EXPERIENCE; onPick: (v: keyof typeof EXPERIENCE) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Experience" description="Sets the starting progression steps.">
      <RadioGroup ariaLabel="Experience" className="mb-2 mt-2">
        {(Object.keys(EXPERIENCE) as (keyof typeof EXPERIENCE)[]).map((k) => (
          <RadioRow
            key={k}
            title={EXPERIENCE[k]}
            checked={value === k}
            onSelect={() => {
              if (blockedOffline()) return;
              onPick(k);
              onOpenChange(false);
            }}
          />
        ))}
      </RadioGroup>
    </Sheet>
  );
}

/** Profile › Display (§1.1.2, §1.6): per device. Motion follows the iPhone or reduces; night dimming Off / 9 PM–5 AM / Always. */
function Display() {
  const a = useAppearance();
  return (
    <Group title="Display" footer="These apply to this device.">
      <ControlRow label="Motion" detail={a.motion === "reduce" ? "Fades instead of movement" : "Follows the iPhone's setting"} stack>
        <Segmented<MotionPref>
          ariaLabel="Motion"
          value={a.motion}
          onChange={(v) => saveAppearance({ motion: v })}
          options={[
            { value: "system", label: "System" },
            { value: "reduce", label: "Reduce" },
          ]}
        />
      </ControlRow>
      <ControlRow label="Night dimming" detail="Slightly dimmer text and gold" stack>
        <Segmented<NightPref>
          ariaLabel="Night dimming"
          value={a.night}
          onChange={(v) => saveAppearance({ night: v })}
          options={[
            { value: "off", label: "Off" },
            { value: "auto", label: "9 PM–5 AM" },
            { value: "always", label: "Always" },
          ]}
        />
      </ControlRow>
    </Group>
  );
}

/** "Sep 11, 2026" */
function fullDate(d: ISODate) {
  return shortDate(d, "0000-01-01");
}

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AutoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { ErrorNote, PageHeader } from "@/components/ui/misc";
import { useToday, useUser } from "@/lib/data/core";
import { useProfile, type Profile } from "@/lib/data/profile";
import { daysBetween, shortDate, type ISODate } from "@/lib/dates";
import { requiredWeeklyGain } from "@/lib/bodyweight";
import { cn } from "@/lib/cn";
import { balancedCarbs } from "@/lib/onboarding/macros";
import { formatPlacardWeight, normalizeSchedule, scheduleSummary, weeklyRateText } from "@/lib/onboarding/plan";
import { formatBodyweight, formatHeight, formatInt, round, type WeightUnit } from "@/lib/units";
import { AISheet, CreditsSheet, PrivacySheet, aiStatusLabel, useAppStatus, useCredits } from "./AboutSheets";
import { PasswordSheet, useSignOut } from "./AccountSheets";
import { DeleteAccountSheet, ExportSheet, WipeSheet } from "./DataSheets";
import { GoalWeightSheet, HeightSheet, NameSheet, StartWeightSheet, TargetDateSheet } from "./GoalSheets";
import { LengthUnitToggle, MiniStepper, WeightUnitToggle } from "./inputs";
import { ControlRow, Group, GroupSkeleton, InfoRow, NavRow, SwitchRow } from "./List";
import { DailyGoalSheet, GoalHistorySheet, MacroCheck, NutritionSheet } from "./NutritionSheets";
import { ReminderSection } from "./ReminderSection";
import { ScheduleSheet, TimezoneSheet } from "./TrainingSheets";
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
  | "schedule"
  | "timezone"
  | "export"
  | "wipe"
  | "delete"
  | "password"
  | "privacy"
  | "ai"
  | "credits";

export interface Prefs {
  tapLogsGhost: boolean;
  systemKeyboard: boolean;
  restFocus: boolean;
  haptics: boolean;
  restChime: boolean;
}
const PREF_DEFAULTS: Prefs = { tapLogsGhost: true, systemKeyboard: false, restFocus: false, haptics: true, restChime: false };

type CoachKey = "profile" | "training" | "nutrition" | "bodyweight" | "recovery" | "measurements";
const COACH: { key: CoachKey; label: string; detail: string }[] = [
  { key: "profile", label: "Profile and goals", detail: "Body stats, goals and daily targets." },
  { key: "training", label: "Training", detail: "Workouts, sets, records and your schedule." },
  { key: "nutrition", label: "Nutrition", detail: "Food log and daily totals." },
  { key: "bodyweight", label: "Bodyweight", detail: "Weigh-ins and the trend." },
  { key: "recovery", label: "Recovery and habits", detail: "Sleep, soreness, energy and habits." },
  { key: "measurements", label: "Measurements", detail: "Tape measurements and athletic tests." },
];

const MODE_TEXT: Record<string, string> = {
  standard: "The full program: every prescribed set at 1–2 reps in reserve.",
  intro: "Settling in: one fewer set per exercise (never below 2) while you rebuild the habit.",
  deload: "Recovery week: about half the sets, ~10% lighter, 3–4 reps in reserve.",
};

const SECTIONS: { id: string; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "goals", label: "Goals" },
  { id: "nutrition", label: "Nutrition" },
  { id: "daily", label: "Daily goals" },
  { id: "training", label: "Training" },
  { id: "units", label: "Units and time" },
  { id: "coach", label: "Coach access" },
  { id: "reminders", label: "Reminders" },
  { id: "data", label: "Your data" },
  { id: "account", label: "Account" },
  { id: "about", label: "About" },
];

export function prefsOf(p: Profile | null | undefined): Prefs {
  const raw = (p?.prefs ?? {}) as Partial<Prefs>;
  return { ...PREF_DEFAULTS, ...Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "boolean")) };
}

function coachOf(p: Profile | null | undefined): Record<CoachKey, boolean> {
  const raw = (p?.coach_access ?? {}) as Partial<Record<CoachKey, boolean>>;
  return Object.fromEntries(COACH.map((c) => [c.key, raw[c.key] !== false])) as Record<CoachKey, boolean>;
}

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
  const { commit } = useCommit();
  const { signOut, pending: signingOut, dialog: signOutDialog } = useSignOut();
  // Arriving from a password-reset email opens "Set a new password" straight away.
  const [sheet, setSheet] = useState<SheetId | null>(recovery ? "password" : null);
  const [mounted, setMounted] = useState<Set<SheetId>>(() => new Set<SheetId>(recovery ? ["password"] : []));

  const open = (id: SheetId) => {
    setMounted((m) => (m.has(id) ? m : new Set(m).add(id)));
    setSheet(id);
  };
  const sheetProps = (id: SheetId) => ({ open: sheet === id, onOpenChange: (o: boolean) => setSheet(o ? id : null) });

  // Device haptics follow the synced preference (src/lib/haptics.ts reads this key).
  const prefs = prefsOf(profile);
  useEffect(() => {
    if (!profile) return;
    try {
      localStorage.setItem("pgg.haptics", prefs.haptics ? "on" : "off");
    } catch {
      /* private mode */
    }
  }, [profile, prefs.haptics]);

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
        <div className="grid grid-cols-1 gap-7">
          <div className="skeleton h-[148px] w-full rounded-[20px]" />
          <GroupSkeleton rows={4} />
          <GroupSkeleton rows={5} />
          <GroupSkeleton rows={3} />
        </div>
      </Shell>
    );
  }

  const u = (profile.weight_unit === "kg" ? "kg" : "lb") as WeightUnit;
  const lu = profile.length_unit === "cm" ? "cm" : "in";
  const coach = coachOf(profile);
  const setPref = (k: keyof Prefs, v: boolean) => {
    if (k === "haptics") {
      try {
        localStorage.setItem("pgg.haptics", v ? "on" : "off");
      } catch {
        /* private mode */
      }
    }
    commit({ prefs: { ...prefs, [k]: v } }, { guard: false });
  };
  const setCoach = (k: CoachKey, v: boolean) => commit({ coach_access: { ...coach, [k]: v } }, { guard: false });

  const startLb = Number(profile.start_weight_lb ?? 163);
  const goalLb = Number(profile.goal_weight_lb ?? 183);
  const rate = requiredWeeklyGain(startLb, goalLb, profile.start_date, profile.target_date);
  const daysLeft = daysBetween(today, profile.target_date);
  const carbsAuto = profile.carb_goal === balancedCarbs(profile.calorie_goal, profile.protein_goal, profile.fat_goal);
  const schedule = normalizeSchedule(profile.weekly_schedule);
  const sheetBase = { profile, today };

  return (
    <Shell>
      <div className="lg:grid lg:grid-cols-[188px_minmax(0,680px)] lg:gap-14">
        <SectionNav />
        <div className="grid grid-cols-1 gap-7">
          <ProfileCard profile={profile} email={user?.email ?? null} today={today} onEdit={() => open("name")} />

          <Group
            id="goals"
            title="Goals"
            footer="Goal changes are logged with the date, so suggestions and monthly reviews know when a target moved."
          >
            <NavRow label="Start" detail={fullDate(profile.start_date)} value={formatBodyweight(startLb, u)} onClick={() => open("start")} />
            <NavRow
              label="Goal weight"
              detail={`Range ${formatPlacardWeight(Number(profile.goal_range_min_lb ?? 180), u)}–${formatPlacardWeight(Number(profile.goal_range_max_lb ?? 185), u)} ${u}`}
              value={formatBodyweight(goalLb, u)}
              onClick={() => open("goal")}
            />
            <NavRow
              label="Target date"
              detail={daysLeft > 0 ? `${formatInt(daysLeft)} days left · ${weeklyRateText(rate, u)}` : "Target date has passed. Set a new one."}
              value={fullDate(profile.target_date)}
              onClick={() => open("target")}
            />
            <NavRow label="Height" value={formatHeight(Number(profile.height_cm ?? 189.2), lu)} onClick={() => open("height")} />
          </Group>

          <Group id="nutrition" title="Nutrition targets" footer={<MacroCheck calories={profile.calorie_goal} protein={profile.protein_goal} carbs={profile.carb_goal} fat={profile.fat_goal} />}>
            <NavRow label="Calories" value={`${formatInt(profile.calorie_goal)} kcal`} onClick={() => open("nutrition")} />
            <NavRow label="Protein" value={`${formatInt(profile.protein_goal)} g`} onClick={() => open("nutrition")} />
            <NavRow label="Carbs" badge={carbsAuto ? <AutoBadge /> : undefined} value={`${formatInt(profile.carb_goal)} g`} onClick={() => open("nutrition")} />
            <NavRow label="Fat" value={`${formatInt(profile.fat_goal)} g`} onClick={() => open("nutrition")} />
            <NavRow label="Goal history" detail="Every target change with its date and reason." onClick={() => open("history")} />
          </Group>

          <Group id="daily" title="Daily goals">
            <NavRow label="Water" value={`${(profile.water_goal_ml / 1000).toFixed(profile.water_goal_ml % 100 === 0 ? 1 : 2)} L`} onClick={() => open("water")} />
            <NavRow label="Sleep" value={`${round(Number(profile.sleep_goal_h), 2)} h`} onClick={() => open("sleep")} />
            <NavRow label="Steps" value={formatInt(profile.steps_goal)} onClick={() => open("steps")} />
          </Group>

          <Group id="training" title="Training">
            <NavRow label="Weekly schedule" detail={scheduleSummary(schedule)} value={<WeekStrip schedule={schedule} />} onClick={() => open("schedule")} />
            <ControlRow label="Experience" stack>
              <Segmented
                ariaLabel="Training experience"
                value={(profile.experience as "beginner" | "intermediate" | "advanced") ?? "intermediate"}
                onChange={(v) => commit({ experience: v }, { guard: false })}
                options={[
                  { value: "beginner", label: "Beginner" },
                  { value: "intermediate", label: "Intermediate" },
                  { value: "advanced", label: "Advanced" },
                ]}
              />
            </ControlRow>
            <ControlRow label="Training mode" detail={MODE_TEXT[profile.training_mode] ?? MODE_TEXT.standard} stack>
              <Segmented
                ariaLabel="Training mode"
                value={(profile.training_mode as "standard" | "intro" | "deload") ?? "standard"}
                onChange={(v) => commit({ training_mode: v }, { guard: false, message: v === "standard" ? "Back to the full program" : v === "intro" ? "Intro volume on" : "Deload week on" })}
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "intro", label: "Intro" },
                  { value: "deload", label: "Deload" },
                ]}
              />
            </ControlRow>
            <ControlRow label="Volleyball" detail="Sessions per week. Counted as training load.">
              <MiniStepper label="Volleyball sessions" value={profile.volleyball_per_week} min={0} max={14} onChange={(v) => commit({ volleyball_per_week: v }, { guard: false })} />
            </ControlRow>
          </Group>

          <Group title="Workout">
            <SwitchRow label="Tap ✓ logs shown values" detail="One tap logs the grey suggested or previous weight and reps." checked={prefs.tapLogsGhost} onChange={(v) => setPref("tapLogsGhost", v)} />
            <SwitchRow label="Use system keyboard" detail="Type set values with the phone keyboard instead of the number pad." checked={prefs.systemKeyboard} onChange={(v) => setPref("systemKeyboard", v)} />
            <SwitchRow label="Open rest timer in focus mode" detail="Rests start in the full-screen timer instead of the compact dock." checked={prefs.restFocus} onChange={(v) => setPref("restFocus", v)} />
          </Group>

          <Group title="Haptics and sound">
            <SwitchRow label="Haptics" detail="A light tap when a set logs or a rest ends." checked={prefs.haptics} onChange={(v) => setPref("haptics", v)} />
            <SwitchRow label="Rest chime" detail="A soft two-note chime when rest is over." checked={prefs.restChime} onChange={(v) => setPref("restChime", v)} />
          </Group>

          <Group id="units" title="Units and time" footer="Everything is stored in pounds, inches and millilitres and converted for display, so switching never changes your data.">
            <ControlRow label="Weight">
              <WeightUnitToggle value={u} onChange={(v) => commit({ weight_unit: v }, { guard: false })} />
            </ControlRow>
            <ControlRow label="Length">
              <LengthUnitToggle value={lu} onChange={(v) => commit({ length_unit: v }, { guard: false })} />
            </ControlRow>
            <NavRow label="Time zone" value={profile.timezone.split("/").pop()?.replace(/_/g, " ")} onClick={() => open("timezone")} />
          </Group>

          <Group id="coach" title="Coach data access" footer="The AI Coach only sees what's switched on, and only when you ask it something. Progress photos are never sent.">
            {COACH.map((c) => (
              <SwitchRow key={c.key} label={c.label} detail={c.detail} checked={coach[c.key]} onChange={(v) => setCoach(c.key, v)} />
            ))}
          </Group>

          <ReminderSection />

          <Group id="data" title="Your data" footer="Exports include every table as JSON and CSV. Deleting can't be undone.">
            <NavRow label="Export data" detail="ZIP with JSON, CSV and optional photos." onClick={() => open("export")} />
            <NavRow label="Delete all logged data" detail="Keeps your account, profile and goals." danger onClick={() => open("wipe")} />
            <NavRow label="Delete account" detail="Removes everything, including photos." danger onClick={() => open("delete")} />
          </Group>

          <Group id="account" title="Account">
            <InfoRow label="Email" value={user?.email ?? "—"} />
            <NavRow label="Change password" onClick={() => open("password")} />
            <NavRow label={signingOut ? "Signing out…" : "Sign out"} chevron={false} disabled={signingOut} onClick={() => void signOut()} />
          </Group>

          <Group id="about" title="About">
            <InfoRow label="Version" value={status.data?.version ?? "—"} />
            <NavRow label="Privacy" onClick={() => open("privacy")} />
            <NavRow label="AI and your data" detail="Google Gemini" value={status.isError ? "—" : aiStatusLabel(status.data)} onClick={() => open("ai")} />
            {credits.data && <NavRow label="Art credits" detail="Statue of Hermes · The Met, public domain" onClick={() => open("credits")} />}
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
      {mounted.has("schedule") && <ScheduleSheet {...sheetProps("schedule")} profile={profile} />}
      {mounted.has("timezone") && <TimezoneSheet {...sheetProps("timezone")} profile={profile} />}
      {mounted.has("export") && user && <ExportSheet {...sheetProps("export")} userId={user.id} email={user.email ?? null} today={today} version={status.data?.version} />}
      {mounted.has("wipe") && user && <WipeSheet {...sheetProps("wipe")} userId={user.id} onExport={() => open("export")} />}
      {mounted.has("delete") && <DeleteAccountSheet {...sheetProps("delete")} email={user?.email ?? null} onExport={() => open("export")} />}
      {mounted.has("password") && (
        <PasswordSheet {...sheetProps("password")} email={user?.email ?? null} recovery={recovery} onDone={() => recovery && router.replace("/settings")} />
      )}
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
  return (
    <div className="mx-auto w-full max-w-[920px] pb-6">
      <PageHeader eyebrow="Profile and preferences" title="Settings" />
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- profile */

function ProfileCard({ profile, email, today, onEdit }: { profile: Profile; email: string | null; today: ISODate; onEdit: () => void }) {
  const name = profile.display_name?.trim();
  const letter = (name || email || "A").slice(0, 1).toUpperCase();
  const day = daysBetween(profile.start_date, today) + 1;
  const left = daysBetween(today, profile.target_date);
  const u = (profile.weight_unit === "kg" ? "kg" : "lb") as WeightUnit;
  return (
    <section id="profile" className="card scroll-mt-20 p-5 lg:scroll-mt-8" aria-label="Profile">
      <div className="flex items-center gap-4">
        <div
          className="grid size-16 shrink-0 place-items-center rounded-full border border-line-gold bg-[radial-gradient(80%_80%_at_30%_20%,rgb(213_172_103/.18),transparent_70%),var(--surface-2)]"
          aria-hidden
        >
          <span className="font-serif text-[26px] font-semibold leading-none text-gold-300">{letter}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="t-h3 truncate">{name || "Add your name"}</p>
          <p className="truncate text-[13px] font-medium text-fg-2">{email}</p>
        </div>
        <Button variant="ghost" size="icon" className="w-auto px-3 text-[14px] text-gold-300 hover:text-gold-200" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line-hair pt-4">
        <div>
          <dt className="eyebrow">{day >= 1 ? "Day" : "Starts in"}</dt>
          <dd className="mt-1.5">
            <span className="num-sm">{formatInt(day >= 1 ? day : 1 - day)}</span>
            <span className="mt-0.5 block text-[12px] font-medium text-fg-3">{day >= 1 ? "of the ascent" : day === 0 ? "day" : "days"}</span>
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Plan</dt>
          <dd className="mt-1.5">
            <span className="num-sm whitespace-nowrap">
              {formatPlacardWeight(Number(profile.start_weight_lb ?? 163), u)}
              <span className="px-1 text-[17px] text-fg-3">→</span>
              {formatPlacardWeight(Number(profile.goal_weight_lb ?? 183), u)}
            </span>
            <span className="mt-0.5 block text-[12px] font-medium text-fg-3">{u}</span>
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Target</dt>
          <dd className="mt-1.5">
            <span className="num-sm whitespace-nowrap">{shortDate(profile.target_date, today).replace(/, \d{4}$/, "")}</span>
            <span className="mt-0.5 block text-[12px] font-medium text-fg-3">{left > 0 ? `${formatInt(left)} days left` : profile.target_date.slice(0, 4)}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Seven tiny pips for the week, gold for training days. */
function WeekStrip({ schedule }: { schedule: Record<string, string> }) {
  const order = ["1", "2", "3", "4", "5", "6", "0"];
  const letters = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <span className="hidden items-center gap-1 sm:inline-flex" aria-hidden>
      {order.map((d, i) => (
        <span key={d} className={cn("grid size-5 place-items-center rounded-[6px] text-[10px] font-bold", schedule[d] !== "rest" ? "bg-gold-tint text-gold-300" : "bg-s3 text-fg-3")}>
          {letters[i]}
        </span>
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
              className={cn(
                "relative flex h-10 items-center rounded-[10px] px-3 text-[14px] font-semibold transition-colors",
                active === s.id ? "bg-s2 text-fg" : "text-fg-3 hover:text-fg-2",
              )}
              aria-current={active === s.id ? "true" : undefined}
            >
              {active === s.id && <span className="absolute left-0 top-2.5 h-5 w-[2px] rounded-full bg-gold-400" aria-hidden />}
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

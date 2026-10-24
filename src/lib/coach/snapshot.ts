// Builds the coach's factual context from the user's own rows. Pure: no I/O, so it is unit
// tested and reused by the dev mock. Every fact carries a short id the model must cite; the
// server maps cited ids back to these labels/values (model-written numbers are never shown
// as chips).

import { calorieSuggestion, progressPct, requiredWeeklyGain, weightStats, type CalorieSuggestion, type WeighIn } from "@/lib/bodyweight";
import { MIN_SPAN_DAYS, MIN_WEIGHINS, rateAt, trendAt } from "@/lib/progress/pace";
import { addDays, dayName, daysBetween, monthLabel, shortDate, weekDates, weekStart, type ISODate } from "@/lib/dates";
import { parseAppPrefs } from "@/lib/prefs";
import { lighterWeekAdvice } from "@/lib/training/block";
import { getExercise } from "@/lib/training/library";
import { activeProgram, programSince, PROGRAMS, templateDef, visibleExercises } from "@/lib/training/programs";
import type { Mode, PastSet } from "@/lib/training/progression";
import type { MuscleGroup, TemplateExercise } from "@/lib/training/types";
import { GROUP_LABEL, GROUP_ZONES, GROUPS, groupCredit, groupSets, groupTrends, volumeSuggestions } from "@/lib/training/volume-zones";
import { formatBodyweight, formatDelta, formatHeight, formatInt, formatLength, formatLoad, formatLiters, round } from "@/lib/units";
import { CATEGORY_META, sharedCategories } from "./access";
import {
  describeSets,
  liftTrends,
  measurementChanges,
  mergeSchedule,
  monthlyWeights,
  nutritionWindow,
  recoverySummary,
  resolvePlan,
  signed,
  trainingAdherence,
  weeksBetween,
  type CheckIn,
  type DayTotals,
  type HistorySet,
  type MeasurementRow,
  type PlanOverride,
} from "./aggregate";
import type { CoachAccess, CoachCategory, Fact, FactKind } from "./types";

export interface RawProfile {
  display_name: string | null;
  height_cm: number | null;
  start_weight_lb: number;
  goal_weight_lb: number;
  goal_range_min_lb: number | null;
  goal_range_max_lb: number | null;
  start_date: ISODate;
  target_date: ISODate;
  experience: string;
  weight_unit: "lb" | "kg";
  length_unit: "in" | "cm";
  calorie_goal: number;
  protein_goal: number;
  carb_goal: number;
  fat_goal: number;
  water_goal_ml: number;
  sleep_goal_h: number;
  weekly_schedule: unknown;
  training_mode: string;
  /** profiles.prefs: the active program, its start, and the lighter-week snooze. */
  prefs?: unknown;
}

export interface RawSession {
  id: string;
  local_date: ISODate;
  name: string;
  template_key: string | null;
  duration_sec: number | null;
  total_volume_lb: number | null;
  sets_completed: number | null;
  pr_count: number | null;
  status: string;
  mode?: string | null;
}

export interface RawTraining {
  /** done + active sessions, last 56 days (facts list the last 28) */
  sessions: RawSession[];
  /** completed working sets (set_history), last 56 days */
  sets: HistorySet[];
  /** all-time bests (exercise_bests) */
  bests: { exercise_slug: string; exercise_name: string | null; best_e1rm_lb: number | null; best_weight_lb: number | null; last_date: ISODate | null }[];
  /** pr_events, last 28 days */
  prs: { local_date: ISODate; exercise_slug: string; exercise_name: string | null; weight_lb: number | null; reps: number | null; e1rm_lb: number | null }[];
  /** the user's editable templates (empty → built-in program) */
  templates: { key: string; name: string; exercises: TemplateExercise[] }[];
  overrides: PlanOverride[];
  custom: Record<string, MuscleGroup[]>;
}

export interface RawCoachData {
  today: ISODate;
  /** "HH:MM" on the user's device, when known */
  localTime: string | null;
  /** IANA time zone of the user's device (else their profile), for timestamptz → local date */
  timeZone?: string | null;
  profile: RawProfile;
  access: CoachAccess;
  goalChanges: { field: string; old_value: number | null; new_value: number | null; changed_at: string; source: string }[];
  /** null when bodyweight isn't shared */
  weights: WeighIn[] | null;
  training: RawTraining | null;
  nutrition: { days: DayTotals[]; water: { local_date: ISODate; total_ml: number | null }[] } | null;
  recovery: { logs: CheckIn[] } | null;
  measurements: { rows: MeasurementRow[] } | null;
}

export interface Snapshot {
  facts: Fact[];
  /** The block sent to the model. */
  text: string;
  shared: CoachCategory[];
  /** Server-side values for suggestion validation (never trusted from the model). */
  derived: {
    trendLb: number | null;
    calorieCheck: CalorieSuggestion | null;
    lastCalorieChange: ISODate | null;
  };
}

const HREF: Record<CoachCategory, string> = {
  profile: "/settings",
  training: "/training",
  nutrition: "/nutrition",
  bodyweight: "/progress?tab=weight",
  recovery: "/recovery",
  measurements: "/progress?tab=body",
};

const GOAL_FIELD_LABEL: Record<string, string> = {
  calorie_goal: "Calorie target",
  protein_goal: "Protein target",
  carb_goal: "Carb target",
  fat_goal: "Fat target",
  goal_weight_lb: "Goal weight",
  water_goal_ml: "Water target",
  sleep_goal_h: "Sleep target",
  steps_goal: "Step target",
};

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The user's calendar date of a timestamptz (never a UTC slice: 9 pm in Toronto is tomorrow in UTC). */
export function dateInZone(ts: string, timeZone: string | null | undefined): ISODate {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts.slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
}

/** "8 h" / "7.25 h" */
const hours = (h: number) => `${round(h, 2)} h`;
/** Averages to the nearest quarter hour (DESIGN: sleep precision 0.25 h). */
const quarter = (h: number) => `${Math.round(h * 4) / 4} h`;

export function buildSnapshot(raw: RawCoachData): Snapshot {
  const { today, profile: p, access } = raw;
  const wu = p.weight_unit;
  const lu = p.length_unit;
  const facts: Fact[] = [];
  const sections: { title: string; lines: string[] }[] = [];
  let lines: string[] = [];
  const section = (title: string) => {
    lines = [];
    sections.push({ title, lines });
  };
  const note = (s: string) => lines.push(s);
  const fact = (category: CoachCategory, kind: FactKind, id: string, label: string, value: string, detail?: string, href?: string) => {
    if (facts.some((f) => f.id === id)) return;
    facts.push({ id, category, kind, label, value, detail, href: href ?? HREF[category] });
    lines.push(`[${id}] ${label}: ${value}${detail ? ` — ${detail}` : ""}`);
  };
  const sd = (d: ISODate) => shortDate(d, today);
  const bw = (lb: number | null | undefined) => formatBodyweight(lb, wu);
  const load = (lb: number) => formatLoad(lb, wu, false);
  const loadU = (lb: number | null | undefined) => formatLoad(lb, wu);
  const rate = (lbPerWk: number) => `${formatDelta(lbPerWk, wu, 2)}/wk`;
  const goalValue = (field: string, v: number | null) => {
    if (v == null) return "—";
    if (field === "calorie_goal") return `${formatInt(v)} kcal`;
    if (field === "water_goal_ml") return formatLiters(v);
    if (field === "sleep_goal_h") return hours(v);
    if (field === "goal_weight_lb") return bw(v);
    if (field === "steps_goal") return `${formatInt(v)} steps`;
    return `${round(v, 0)} g`;
  };

  const shared = sharedCategories(access);
  const lastCalChange = raw.goalChanges
    .filter((g) => g.field === "calorie_goal")
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at))[0];
  const changedOn = (ts: string) => dateInZone(ts, raw.timeZone);
  const lastCalorieChange = lastCalChange ? changedOn(lastCalChange.changed_at) : null;

  /* ------------------------------------------------------------ profile */
  if (access.profile) {
    section("PROFILE & GOALS");
    const daysLeft = daysBetween(today, p.target_date);
    fact("profile", "plan", "goal.weight", "Goal weight", bw(p.goal_weight_lb), p.goal_range_min_lb && p.goal_range_max_lb ? `acceptable range ${bw(p.goal_range_min_lb)}–${bw(p.goal_range_max_lb)}` : undefined);
    fact("profile", "plan", "goal.date", "Target date", sd(p.target_date), `${daysLeft} days left (${round(daysLeft / 7, 1)} weeks)`);
    fact("profile", "logged", "goal.start", "Start", `${bw(p.start_weight_lb)} on ${sd(p.start_date)}`, `start date ${p.start_date}; ${weeksBetween(p.start_date, today)} weeks elapsed`);
    if (p.height_cm) fact("profile", "logged", "prof.height", "Height", formatHeight(p.height_cm, lu));
    fact("profile", "logged", "prof.experience", "Training experience", cap(p.experience));
    const recent = raw.goalChanges.filter((g) => changedOn(g.changed_at) >= addDays(today, -90)).slice(0, 6);
    for (const [i, g] of recent.entries()) {
      fact(
        "profile",
        "logged",
        `goal.change.${i + 1}`,
        `${GOAL_FIELD_LABEL[g.field] ?? cap(g.field.replace(/_/g, " "))} changed`,
        `${goalValue(g.field, g.old_value)} → ${goalValue(g.field, g.new_value)}`,
        `on ${sd(changedOn(g.changed_at))} (${g.source})`,
      );
    }
  }

  /* ------------------------------------------------------------ targets */
  if (access.profile || access.nutrition || access.recovery) {
    section("DAILY TARGETS (the plan, set by the user)");
    if (access.profile || access.nutrition) {
      fact("profile", "plan", "goal.kcal", "Calorie target", `${formatInt(p.calorie_goal)} kcal/day`, lastCalChange ? `last changed ${sd(lastCalorieChange!)} from ${formatInt(lastCalChange.old_value)}` : "never changed in the app");
      fact("profile", "plan", "goal.protein", "Protein target", `${p.protein_goal} g/day`);
      fact("profile", "plan", "goal.carbs", "Carb target", `${p.carb_goal} g/day`);
      fact("profile", "plan", "goal.fat", "Fat target", `${p.fat_goal} g/day`);
      fact("profile", "plan", "goal.water", "Water target", `${formatLiters(p.water_goal_ml)}/day`);
    }
    if (access.profile || access.recovery) fact("profile", "plan", "goal.sleep", "Sleep target", `${hours(Number(p.sleep_goal_h))}/night`);
  }

  /* --------------------------------------------------------- bodyweight */
  let trendLb: number | null = null;
  let calorieCheck: CalorieSuggestion | null = null;
  if (access.bodyweight && raw.weights) {
    section("BODYWEIGHT (logged weigh-ins)");
    const w = raw.weights;
    if (!w.length) {
      note("No weigh-ins logged yet. Bodyweight trend, rate and calorie checks are unavailable until the user logs morning weigh-ins.");
    } else {
      const st = weightStats(w, p.start_weight_lb, p.goal_weight_lb, today);
      // THE trend and THE rate (lib/progress/pace): the same numbers every screen shows.
      const tr = trendAt(w, today);
      const rt = rateAt(w, today, p.start_date);
      trendLb = tr.lb;
      const sorted = [...w].sort((a, b) => a.local_date.localeCompare(b.local_date));
      const first = sorted[0];
      fact("bodyweight", "logged", "bw.latest", "Latest weigh-in", bw(st.current), `on ${sd(st.currentDate!)}`);
      if (tr.lb != null)
        fact("bodyweight", "logged", "bw.avg7", "7-day average", bw(tr.lb), tr.end === today ? "trend weight (mean of weigh-ins in the last 7 days)" : `trend weight as of ${sd(tr.end)} (the last weigh-in is more than a week old)`);
      if (rt.status === "ok" && rt.lbPerWeek != null)
        fact(
          "bodyweight",
          "logged",
          "bw.rate",
          "Rate",
          rate(rt.lbPerWeek),
          `least-squares slope of ${rt.n} weigh-ins over the last 4 weeks; the only weekly rate the app shows${rt.includesEarlyWater ? ". The window includes the programme's first two weeks, which carry water and glycogen" : ""}`,
        );
      else
        fact(
          "bodyweight",
          "logged",
          "bw.rate",
          "Rate",
          "Not enough data yet",
          rt.status === "needs_weighins" ? `needs ${MIN_WEIGHINS} weigh-ins in the last 4 weeks; has ${rt.n}. Don't state a weekly rate.` : `needs weigh-ins spanning ${MIN_SPAN_DAYS} days; they span ${rt.spanDays}. Don't state a weekly rate.`,
        );
      if (st.monthlyChange != null) fact("bodyweight", "logged", "bw.month", "Monthly change", formatDelta(st.monthlyChange, wu), "7-day average vs the 7-day average 30 days earlier (a change, not a rate)");
      if (tr.lb != null) fact("bodyweight", "logged", "bw.fromStart", "Change since start", formatDelta(round(tr.lb - p.start_weight_lb, 2), wu), `trend weight vs start weight ${bw(p.start_weight_lb)} (${sd(p.start_date)})`);
      fact("bodyweight", "logged", "bw.first", "First weigh-in", bw(first.weight_lb), `on ${sd(first.local_date)}`);
      const req = trendLb != null ? requiredWeeklyGain(trendLb, p.goal_weight_lb, today, p.target_date) : null;
      if (req != null) fact("bodyweight", "plan", "bw.required", "Required rate", rate(req), `to reach ${bw(p.goal_weight_lb)} by ${sd(p.target_date)} from the current trend weight`);
      if (tr.lb != null)
        fact("bodyweight", "logged", "bw.toGoal", "Left to goal", formatDelta(round(p.goal_weight_lb - tr.lb, 2), wu).replace(/^\+/, ""), `${progressPct(tr.lb, p.start_weight_lb, p.goal_weight_lb)}% of the way from start to goal`);
      const last14 = w.filter((x) => x.local_date > addDays(today, -14) && x.local_date <= today).length;
      fact("bodyweight", "logged", "bw.count", "Weigh-ins logged", String(w.length), `${last14} in the last 14 days`);
      // §12 smart calorie check: the app's own rule, on the same rate
      const targetRate = req ?? round((p.goal_weight_lb - p.start_weight_lb) / Math.max(1, daysBetween(p.start_date, p.target_date) / 7), 2);
      calorieCheck = calorieSuggestion(w, today, targetRate, lastCalorieChange, p.start_date);
      const cc = calorieCheck;
      // the rule judges only weigh-ins since the last calorie change (when it falls in the 4 weeks)
      const ccWindow = cc.kind !== "cooldown" && cc.since ? `since the calorie change on ${sd(cc.since)}` : "over the last 4 weeks";
      const ccValue =
        cc.kind === "insufficient"
          ? "Not enough data yet"
          : cc.kind === "cooldown"
            ? `Waiting until ${sd(cc.nextCheck)}`
            : cc.kind === "on_track"
              ? "On track"
              : cc.kind === "increase"
                ? `Gaining slower than planned`
                : `Gaining faster than planned`;
      const water = cc.kind !== "insufficient" && cc.kind !== "cooldown" && cc.earlyWater ? " The rate includes early water and glycogen, so treat a fast early gain with caution." : "";
      const ccDetail =
        cc.kind === "insufficient"
          ? `needs ≥8 weigh-ins spanning ≥14 days ${ccWindow}; has ${cc.weighIns} weigh-ins over ${cc.daysOfData} days. Don't recommend a calorie change yet.`
          : cc.kind === "cooldown"
            ? `calorie target changed ${sd(cc.lastChange)}; the app waits 14 days of new data before another change`
            : cc.kind === "on_track"
              ? `rate ${ccWindow} ${rate(cc.ratePerWeek)} vs target ${rate(cc.targetRate)}. Keep the calorie target.${water}`
              : `rate ${ccWindow} ${rate(cc.ratePerWeek)} vs target ${rate(cc.targetRate)}. The app's rule suggests ${signed(cc.delta, 0)} kcal/day (a modest step that needs the user's confirmation).${water}`;
      fact("bodyweight", "logged", "bw.check", "Calorie check", ccValue, ccDetail);
      for (const m of monthlyWeights(w).slice(-12)) {
        fact("bodyweight", "logged", `bw.m.${m.month}`, `${monthLabel(m.month + "-01")} average`, bw(m.avg), `${m.n} weigh-ins; first ${bw(m.first.lb)} on ${sd(m.first.date)}, last ${bw(m.last.lb)} on ${sd(m.last.date)}`);
      }
    }
  }

  /* ----------------------------------------------------------- training */
  const program = activeProgram({ prefs: p.prefs, weekly_schedule: p.weekly_schedule });
  const def = PROGRAMS[program];
  if (access.training && raw.training) {
    const t = raw.training;
    section("TRAINING (logged sessions and sets; program = plan)");
    const since = programSince(p.prefs, program);
    const other = PROGRAMS[program === "arnold" ? "ppl" : "arnold"];
    fact("training", "plan", "prog.active", "Program", `${def.name}${since ? ` since ${sd(since)}` : ""}`, "the active weekly plan; the user can move single days or switch programs");
    fact("training", "plan", "prog.saved", "Saved alternative", `${other.name} (saved, not active)`, "kept with the user's own edits; switching is the user's choice");
    fact("training", "plan", "tr.mode", "Training mode", cap(p.training_mode), "standard = full program; intro = one set fewer on most exercises (\"Fewer sets\"); deload = ~10% lighter, about half the sets, 3–4 RIR");
    const schedule = mergeSchedule(p.weekly_schedule, p.prefs);
    const ctx = { program, since };
    const tplName = (key: string) => (key === "rest" ? "Rest day" : (t.templates.find((x) => x.key === key)?.name ?? templateDef(key)?.name ?? key));
    const recentSessions = t.sessions.filter((s) => s.local_date >= addDays(today, -27));
    const doneDates = recentSessions.filter((s) => s.status === "done").map((s) => s.local_date);
    const planOf = (d: ISODate) => resolvePlan(d, schedule, t.overrides, ctx).key;
    const sessionsOn = (d: ISODate) => recentSessions.filter((s) => s.local_date === d);
    const planLine = (d: ISODate) => {
      const r = resolvePlan(d, schedule, t.overrides, ctx);
      const why = r.overridden ? (r.movedFrom ? `moved from ${sd(r.movedFrom)}` : `changed for this date${r.reason ? ` (${r.reason})` : ""}`) : "weekly schedule";
      const done = sessionsOn(d);
      const status = done.length ? `; logged: ${done.map((s) => `${s.name} (${s.status === "active" ? "in progress" : "done"})`).join(", ")}` : "";
      return { name: tplName(r.key), detail: `${dayName(d)} ${sd(d)}, ${why}${status}` };
    };
    const todayPlan = planLine(today);
    fact("training", "plan", "plan.today", "Today's plan", todayPlan.name, todayPlan.detail);
    const yPlan = planLine(addDays(today, -1));
    fact("training", "plan", "plan.yesterday", "Yesterday's plan", yPlan.name, yPlan.detail);
    const tPlan = planLine(addDays(today, 1));
    fact("training", "plan", "plan.tomorrow", "Tomorrow's plan", tPlan.name, tPlan.detail);
    // Planned days before the user's start date were never part of the plan: they are not
    // "missed" (a new user must not hear 0% adherence for days before they began).
    const started = (from: ISODate) => (p.start_date > from ? p.start_date : from);
    const sinceStart = (from: ISODate) => (p.start_date > from ? ` (counting from the start date, ${sd(p.start_date)})` : "");
    const week = weekDates(today);
    const weekDetail = week
      .map((d) => {
        const k = planOf(d);
        const done = sessionsOn(d).some((s) => s.status === "done");
        const status = done ? " — done" : d < p.start_date && d < today ? " — before the start date" : d < today && k !== "rest" ? " — not logged" : "";
        return `${dayName(d, true)} ${tplName(k)}${d === today ? " (today)" : ""}${status}`;
      })
      .join("; ");
    const weekAd = trainingAdherence(doneDates, week[0], week[6], today, planOf);
    fact("training", "logged", "plan.week", "This week", `${weekAd.done} session${weekAd.done === 1 ? "" : "s"} done`, weekDetail);

    const a7 = trainingAdherence(doneDates, started(addDays(today, -6)), today, today, planOf);
    const a28 = trainingAdherence(doneDates, started(addDays(today, -27)), today, today, planOf);
    fact("training", "logged", "tr.count7", "Sessions, last 7 days", String(a7.done), `${a7.plannedDone} of ${a7.planned} planned training days done so far${sinceStart(addDays(today, -6))}`);
    fact(
      "training",
      "logged",
      "tr.count28",
      "Sessions, last 28 days",
      String(a28.done),
      `${a28.plannedDone} of ${a28.planned} planned training days done${a28.planned ? ` (${Math.round((a28.plannedDone / a28.planned) * 100)}% adherence)` : ""}${a28.extra > 0 ? `, ${a28.extra} extra` : ""}${sinceStart(addDays(today, -27))}`,
    );

    const sessions = [...recentSessions].filter((s) => s.status === "done").sort((a, b) => b.local_date.localeCompare(a.local_date));
    if (!sessions.length) note("No finished workouts in the last 28 days.");
    const seen = new Map<string, number>();
    for (const s of sessions) {
      const n = (seen.get(s.local_date) ?? 0) + 1;
      seen.set(s.local_date, n);
      const id = `ses.${s.local_date}${n > 1 ? `.${n}` : ""}`;
      const parts = [
        s.duration_sec ? `${Math.round(s.duration_sec / 60)} min` : null,
        s.total_volume_lb != null ? `${formatInt(wu === "kg" ? Number(s.total_volume_lb) / 2.2046226218 : Number(s.total_volume_lb))} ${wu} volume` : null,
        s.sets_completed != null ? `${s.sets_completed} sets` : null,
        s.pr_count ? `${s.pr_count} PR${s.pr_count > 1 ? "s" : ""}` : null,
      ].filter(Boolean);
      fact("training", "logged", id, `${sd(s.local_date)} · ${s.name}`, parts.join(" · ") || "logged", `${dayName(s.local_date)}`);
    }

    // per-lift trends over the 8-week window (retired lifts are history only)
    const bestBy = new Map(t.bests.map((b) => [b.exercise_slug, b]));
    const trends = liftTrends(t.sets)
      .filter((x) => {
        const lib = getExercise(x.slug);
        return !lib?.retired && lib?.category !== "explosive";
      })
      .slice(0, 26);
    if (trends.length) note("Lift trends use the best Epley e1RM per session (1–12 rep sets only) over the last 8 weeks.");
    for (const tr of trends) {
      const last = tr.sessions.at(-1)!;
      const best = bestBy.get(tr.slug);
      const lib = getExercise(tr.slug);
      const addedLoad = lib?.tracking === "bodyweight_reps";
      const topStr = (x: { weight: number; reps: number | null }) => `${load(x.weight)}×${x.reps ?? "—"}`;
      let value: string;
      if (tr.e1rmSessions >= 2) value = `${load(tr.firstE1rm!)} → ${loadU(tr.latestE1rm)} e1RM`;
      else if (tr.e1rmSessions === 1 && tr.sessions.length === 1) value = `${loadU(tr.latestE1rm)} e1RM`;
      else if (tr.lastTop) value = tr.sessions.length > 1 && tr.firstTop ? `${topStr(tr.firstTop)} → ${topStr(tr.lastTop)} ${wu} top set` : `${topStr(tr.lastTop)} ${wu} top set`;
      else value = `${tr.sessions.length} session${tr.sessions.length > 1 ? "s" : ""}`;
      const progress =
        tr.e1rmSessions < 2
          ? null
          : tr.stalled
            ? `STALLED: no e1RM gain in the last ${tr.sessionsSinceGain} sessions`
            : tr.sessionsSinceGain > 0
              ? `${tr.sessionsSinceGain} session${tr.sessionsSinceGain > 1 ? "s" : ""} since the last e1RM gain`
              : "latest session set the best e1RM of the window";
      const details = [
        `${tr.sessions.length} session${tr.sessions.length > 1 ? "s" : ""} ${sd(tr.firstDate)}–${sd(tr.lastDate)}`,
        `last sets ${sd(last.date)}: ${describeSets(last.sets, load)} (${wu})`,
        tr.change != null && tr.e1rmSessions >= 2 ? `e1RM change ${signed(wu === "kg" ? tr.change / 2.2046226218 : tr.change, 1)} ${wu}` : null,
        tr.e1rmSessions < 2 && tr.sessions.length > 1 ? "mostly sets above 12 reps, so progress is shown as the top set (heaviest load × reps)" : null,
        addedLoad ? "loads are ADDED weight on top of bodyweight" : null,
        best?.best_e1rm_lb ? `all-time best e1RM ${loadU(Number(best.best_e1rm_lb))}` : null,
        progress,
      ].filter(Boolean);
      fact("training", "logged", `lift.${tr.slug}`, tr.name, value, details.join("; "), `/training/exercise/${tr.slug}`);
    }

    if (t.prs.length) {
      const list = t.prs
        .slice(0, 8)
        .map((r) => `${r.exercise_name ?? r.exercise_slug} ${r.weight_lb ? load(Number(r.weight_lb)) : "BW"}×${r.reps ?? "—"} (${sd(r.local_date)})`)
        .join(", ");
      fact("training", "logged", "tr.prs", "PRs, last 28 days", String(t.prs.length), list, "/progress?tab=strength");
    } else {
      fact("training", "logged", "tr.prs", "PRs, last 28 days", "0", "no e1RM PRs logged in the last 28 days", "/progress?tab=strength");
    }

    // weekly hard sets per muscle group (§5: a secondary muscle counts half a set)
    const last7 = t.sets.filter((x) => x.local_date >= addDays(today, -6) && x.local_date <= today);
    const vol = groupSets(last7, t.custom);
    note("Weekly volume = completed working sets in the last 7 days per muscle group; a secondary muscle counts half a set.");
    for (const g of GROUPS) {
      const ex = [...new Set(last7.filter((x) => (groupCredit(x.exercise_slug, t.custom)[g] ?? 0) > 0).map((x) => x.exercise_name || x.exercise_slug))];
      const [lo, hi] = GROUP_ZONES[g];
      fact("training", "logged", `vol.${g}`, `${GROUP_LABEL[g]} sets, last 7 days`, `${vol[g]} set${vol[g] === 1 ? "" : "s"}`, `zone ${lo}–${hi}; ${ex.length ? ex.join(", ") : "none logged"}`);
    }

    // lighter-week and volume advice, from the same rules the app shows
    const modeOf = new Map(t.sessions.map((s) => [s.id, (s.mode ?? "standard") as Mode]));
    const keyOf = new Map(t.sessions.map((s) => [s.id, s.template_key]));
    const history: Record<string, PastSet[]> = {};
    for (const x of [...t.sets].sort((a, b) => b.local_date.localeCompare(a.local_date) || a.set_index - b.set_index)) {
      (history[x.exercise_slug] ??= []).push({ local_date: x.local_date, session_id: x.session_id, set_index: x.set_index, weight_lb: x.weight_lb, reps: x.reps, duration_sec: x.duration_sec, rir: null, mode: modeOf.get(x.session_id) ?? "standard", template_key: keyOf.get(x.session_id) ?? null, completed_at: x.completed_at ?? null });
    }
    const checkins = raw.recovery?.logs ?? [];
    const prefs = parseAppPrefs(p.prefs);
    const plannedByWeek = [2, 1].map((i) => {
      const ws = addDays(weekStart(today), -7 * i);
      const ad = trainingAdherence(
        t.sessions.filter((s) => s.status === "done").map((s) => s.local_date),
        started(ws),
        addDays(ws, 6),
        today,
        planOf,
      );
      return { weekStart: ws, planned: ad.planned, done: ad.plannedDone };
    });
    const lighter = lighterWeekAdvice({
      today,
      mode: (p.training_mode ?? "standard") as Mode,
      modeSetAt: (prefs.modeSetAt as ISODate | undefined) ?? null,
      snoozedUntil: (prefs.lighterSnoozedUntil as ISODate | undefined) ?? null,
      sessions: t.sessions,
      checkins,
      sleepGoalH: Number(p.sleep_goal_h),
      history,
      plannedByWeek,
      historyFrom: p.start_date,
    });
    if (lighter.kind) {
      const title = lighter.kind === "deload" ? "Light week suggested (deload: half the sets, about 10% lighter, 3–4 RIR)" : lighter.kind === "lighter" ? "Fewer sets this week (one set fewer on every exercise, same weights)" : "Back to the full plan";
      fact("training", "plan", "tr.lighter", "Lighter-week check", title, lighter.reasons.length ? lighter.reasons.join(" ") : "the lighter mode has run for 7 days or more");
    }
    const active = def.keys.map((k) => {
      const row = t.templates.find((x) => x.key === k);
      const d = templateDef(k)!;
      return { key: k, name: row?.name ?? d.name, exercises: visibleExercises(row?.exercises ?? d.exercises) };
    });
    const suggestions = volumeSuggestions({
      today,
      sets: t.sets,
      sessions: t.sessions,
      checkins,
      templates: active,
      trends: groupTrends(history, today, t.custom),
      mode: (p.training_mode ?? "standard") as Mode,
      programSince: since,
      startDate: p.start_date,
      custom: t.custom,
    });
    if (suggestions.length) fact("training", "plan", "vol.suggest", "Volume check", suggestions[0].reason, suggestions.map((v) => v.reason).join(" "));

    // the active program (plan): his stored templates, else the built-ins
    const dayOf = (key: string) =>
      Object.entries(schedule)
        .filter(([, v]) => v === key)
        .map(([k]) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][Number(k)])
        .join("/");
    for (const tp of active) {
      const ex = tp.exercises
        .map((e) => `${e.name} ${e.sets}×${e.repLow === e.repHigh ? e.repLow : `${e.repLow}–${e.repHigh}`}${e.unit === "sec" ? " s" : e.unit === "each" ? " each" : ""}${e.rir ? ` @${e.rir === "Fresh" ? "fresh" : `${e.rir} RIR`}` : ""}${e.optional ? " (optional)" : ""}`)
        .join("; ");
      fact("training", "plan", `prog.${tp.key}`, `${tp.name}${dayOf(tp.key) ? ` (${dayOf(tp.key)})` : ""}`, `${tp.exercises.length} exercises`, ex, `/training/program/${tp.key}`);
    }
  }

  /* ---------------------------------------------------------- nutrition */
  if (access.nutrition && raw.nutrition) {
    section("NUTRITION (logged food)");
    const days = raw.nutrition.days;
    const td = days.find((d) => d.local_date === today);
    const eaten = {
      calories: Math.round(Number(td?.calories ?? 0)),
      protein: round(Number(td?.protein_g ?? 0), 0),
      carbs: round(Number(td?.carbs_g ?? 0), 0),
      fat: round(Number(td?.fat_g ?? 0), 0),
    };
    const entries = Number(td?.entries ?? 0);
    const asOf = raw.localTime ? `as of ${raw.localTime}` : "so far today";
    if (!entries) note(`Nothing logged yet today (${asOf}).`);
    fact("nutrition", "logged", "nut.today.kcal", "Calories eaten today", `${formatInt(eaten.calories)} kcal`, `${entries} entr${entries === 1 ? "y" : "ies"} ${asOf}`);
    fact("nutrition", "logged", "nut.today.protein", "Protein eaten today", `${eaten.protein} g`, asOf);
    fact("nutrition", "logged", "nut.today.macros", "Carbs · fat today", `${eaten.carbs} g · ${eaten.fat} g`, asOf);
    const leftK = p.calorie_goal - eaten.calories;
    const leftP = round(p.protein_goal - eaten.protein, 0);
    fact("nutrition", "logged", "nut.left.kcal", leftK >= 0 ? "Calories left today" : "Calories over target", `${formatInt(Math.abs(leftK))} kcal`, `target ${formatInt(p.calorie_goal)} − eaten ${formatInt(eaten.calories)}`);
    fact("nutrition", "logged", "nut.left.protein", leftP >= 0 ? "Protein left today" : "Protein over target", `${Math.abs(leftP)} g`, `target ${p.protein_goal} − eaten ${eaten.protein}`);
    fact("nutrition", "logged", "nut.left.macros", "Carbs · fat left", `${round(p.carb_goal - eaten.carbs, 0)} g · ${round(p.fat_goal - eaten.fat, 0)} g`, "negative = over target");
    const yesterday = addDays(today, -1);
    for (const n of [7, 14]) {
      const w = nutritionWindow(days, yesterday, n);
      if (!w.avg) {
        fact("nutrition", "logged", `nut.avg${n}`, `${n}-day average`, "No days logged", `${sd(w.from)}–${sd(w.to)}`);
        continue;
      }
      fact(
        "nutrition",
        "logged",
        `nut.avg${n}`,
        `${n}-day average`,
        `${formatInt(w.avg.calories)} kcal · ${w.avg.protein} g protein`,
        `${sd(w.from)}–${sd(w.to)} (today excluded), averaged over the ${w.daysLogged} of ${w.days} days that have entries; carbs ${w.avg.carbs} g, fat ${w.avg.fat} g. Days with no entries are unknown, not zero.`,
      );
    }
    const water = raw.nutrition.water;
    const wt = Number(water.find((x) => x.local_date === today)?.total_ml ?? 0);
    fact("nutrition", "logged", "nut.water", "Water today", formatLiters(wt), `target ${formatLiters(p.water_goal_ml)}; ${asOf}`);
    const w7 = water.filter((x) => x.local_date >= addDays(today, -7) && x.local_date <= yesterday && Number(x.total_ml) > 0);
    if (w7.length) fact("nutrition", "logged", "nut.water7", "Water, 7-day average", formatLiters(w7.reduce((a, b) => a + Number(b.total_ml), 0) / w7.length), `${w7.length} days with water logged`);
  }

  /* ----------------------------------------------------------- recovery */
  if (access.recovery && raw.recovery) {
    section("RECOVERY (daily check-ins; scales 1–5 where 5 = most: sleep quality, energy, soreness, fatigue, stress)");
    const r = recoverySummary(raw.recovery.logs, 7);
    if (!r.recent.length) note("No recovery check-ins in the last 14 days.");
    else {
      const n = r.recent.length;
      if (r.avg.sleep_hours != null)
        fact(
          "recovery",
          "logged",
          "rec.sleep",
          "Sleep, average",
          quarter(r.avg.sleep_hours),
          `last ${r.counts.sleep_hours} check-ins; target ${hours(Number(p.sleep_goal_h))}${r.avg.sleep_quality != null ? `; sleep quality ${r.avg.sleep_quality}/5` : ""}`,
        );
      if (r.avg.energy != null) fact("recovery", "logged", "rec.energy", "Energy, average", `${r.avg.energy}/5`, `last ${r.counts.energy} of ${n} check-ins`);
      if (r.avg.soreness != null) fact("recovery", "logged", "rec.soreness", "Soreness, average", `${r.avg.soreness}/5`, `last ${r.counts.soreness} check-ins`);
      if (r.avg.fatigue != null) fact("recovery", "logged", "rec.fatigue", "Fatigue, average", `${r.avg.fatigue}/5`, `last ${r.counts.fatigue} check-ins`);
      if (r.avg.stress != null) fact("recovery", "logged", "rec.stress", "Stress, average", `${r.avg.stress}/5`, `last ${r.counts.stress} check-ins`);
      fact(
        "recovery",
        "logged",
        "rec.pain",
        "Pain notes",
        r.pain.length ? `${r.pain.length} in the last ${r.recent.length} check-ins` : "None reported",
        r.pain.length ? `PAIN NOTES — ${r.pain.map((x) => `${sd(x.date)}: "${x.note.slice(0, 160)}"`).join("; ")}. Take these seriously: no training through pain; suggest getting checked.` : `last ${r.recent.length} check-ins`,
      );
      for (const c of r.recent) {
        const bits = [
          c.sleep_hours != null ? `sleep ${hours(Number(c.sleep_hours))}` : null,
          c.sleep_quality != null ? `quality ${c.sleep_quality}/5` : null,
          c.energy != null ? `energy ${c.energy}/5` : null,
          c.soreness != null ? `soreness ${c.soreness}/5` : null,
          c.fatigue != null ? `fatigue ${c.fatigue}/5` : null,
          c.stress != null ? `stress ${c.stress}/5` : null,
          c.pain_notes?.trim() ? `PAIN NOTE: "${c.pain_notes.trim().slice(0, 160)}"` : null,
        ].filter(Boolean);
        const head = [c.sleep_hours != null ? `${hours(Number(c.sleep_hours))} sleep` : null, c.energy != null ? `energy ${c.energy}/5` : null].filter(Boolean).join(" · ");
        fact("recovery", "logged", `rec.${c.local_date}`, `${sd(c.local_date)} check-in`, head || "logged", bits.join(", "));
      }
    }
  }

  /* ------------------------------------------------------- measurements */
  if (access.measurements && raw.measurements) {
    section("MEASUREMENTS (tape, logged)");
    const ch = measurementChanges(raw.measurements.rows);
    if (!ch.length) note("No body measurements logged yet.");
    for (const c of ch) {
      const fmt = (v: number) => (c.length ? formatLength(v, lu) : `${round(v, 1)}%`);
      const delta = c.length ? `${signed(lu === "cm" ? c.change * 2.54 : c.change, lu === "cm" ? 1 : 2)} ${lu}` : `${signed(c.change, 1)} pts`;
      fact(
        "measurements",
        "logged",
        `meas.${c.key.replace(/_in$|_pct$/, "")}`,
        c.label,
        c.entries > 1 ? `${fmt(c.first.v)} → ${fmt(c.latest.v)}` : fmt(c.latest.v),
        c.entries > 1 ? `${sd(c.first.date)} → ${sd(c.latest.date)} (${delta}), ${c.entries} entries` : `measured ${sd(c.latest.date)}`,
      );
    }
  }

  /* ------------------------------------------------------------ compose */
  const notShared = (Object.keys(CATEGORY_META) as CoachCategory[]).filter((k) => !access[k]);
  const head = [
    `TODAY: ${dayName(today)} ${today}${raw.localTime ? `, local time ${raw.localTime}` : ""}. Units: weight ${wu}, length ${lu}.`,
    `SHARED WITH COACH: ${shared.length ? shared.map((k) => CATEGORY_META[k].label).join(", ") : "nothing"}.`,
    notShared.length
      ? `NOT SHARED: ${notShared.map((k) => CATEGORY_META[k].label).join(", ")} — the user turned these off in privacy settings. You cannot see that data; say so if it matters and never guess it.`
      : "Everything is shared.",
    "Fact lines are `[id] label: value — detail`. Logged facts are the user's records or calculations from them; targets, the schedule and the program are the plan.",
  ];
  const body = sections.filter((s) => s.lines.length).map((s) => `## ${s.title}\n${s.lines.join("\n")}`);
  const rules = access.training ? `## PROGRAM RULES (${def.name})\n${def.rules.map((r) => `- ${r}`).join("\n")}` : "";
  const text = [head.join("\n"), ...body, rules].filter(Boolean).join("\n\n");

  return { facts, text, shared, derived: { trendLb, calorieCheck, lastCalorieChange } };
}

/** The chips stored with an answer for the ids the model cited (unknown ids are dropped). */
export function chipsFor(ids: unknown[], facts: Fact[], max = 8) {
  const by = new Map(facts.map((f) => [f.id, f]));
  const out: Fact[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string") continue;
    const id = raw.trim().replace(/^\[|\]$/g, "");
    const f = by.get(id);
    if (f && !out.includes(f)) out.push(f);
    if (out.length >= max) break;
  }
  return out.map(({ id, kind, label, value, href, category }) => ({ id, kind, label, value, href, category }));
}

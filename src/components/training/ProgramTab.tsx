"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/controls";
import { Input, Select } from "@/components/ui/field";
import { Collapse, Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/dates";
import { isOffline } from "@/lib/data/core";
import { useSavePrefs, useSaveProfile } from "@/lib/data/profile";
import { scheduleOf, useAllSessions } from "@/lib/data/training";
import { effectiveTrainAt, formatClock, isTime, parseAppPrefs, toMinutes } from "@/lib/prefs";
import { normalizeSettings } from "@/lib/reminders/schedule";
import { DEFAULT_SCHEDULE, SUNDAY_RECOVERY, estimateDurationMin } from "@/lib/training/program";
import type { Mode } from "@/lib/training/progression";
import { scheduleIssues, weekdaysFor } from "@/lib/training/schedule";
import { modeTemplate, templateSummary } from "@/lib/training/volume";
import { MODE_HELP } from "./DaySheet";
import { plural } from "./format";
import { MODE_LABEL, offlineNoChange, useSaveSchedule, useSetTrainingMode, useTypicalDurations, type useTrainingWeek } from "./hooks";

type Week = ReturnType<typeof useTrainingWeek>;

const DAYS: { wd: number; short: string; label: string }[] = [
  { wd: 1, short: "Mon", label: "Monday" },
  { wd: 2, short: "Tue", label: "Tuesday" },
  { wd: 3, short: "Wed", label: "Wednesday" },
  { wd: 4, short: "Thu", label: "Thursday" },
  { wd: 5, short: "Fri", label: "Friday" },
  { wd: 6, short: "Sat", label: "Saturday" },
  { wd: 0, short: "Sun", label: "Sunday" },
];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Train → Program (docs/DESIGN-V2.md §3.4.2): the split and its templates (each opens the template
 * editor), the weekly schedule (the only place it is edited), the training mode, the usual
 * training time (Now reads it) and volleyball sessions a week.
 */
export function ProgramTab({ week }: { week: Week }) {
  return (
    <div>
      <header>
        <h1 className="t-title-1 text-ivory">Program</h1>
        <p className="t-meta mt-1.5 text-stone">
          Six days of push, pull and legs · {MODE_LABEL[week.mode].toLowerCase()} mode
        </p>
      </header>
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start lg:gap-12">
        <Split week={week} />
        <div className="min-w-0 space-y-10">
          <ScheduleEditor week={week} />
          <ModePicker week={week} />
          <TrainingTime week={week} />
          <VolleyballPerWeek week={week} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the split */

function Split({ week }: { week: Week }) {
  const all = useAllSessions();
  const typical = useTypicalDurations();
  const schedule = scheduleOf(week.profile ?? undefined);
  const [sundayOpen, setSundayOpen] = useState(false);
  const sundayId = useId();
  const lastDone = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of all.data ?? []) if (s.template_key && !m[s.template_key]) m[s.template_key] = s.local_date;
    return m;
  }, [all.data]);
  const restDays = DAYS.filter((d) => (schedule[String(d.wd)] ?? "rest") === "rest");

  return (
    <section aria-labelledby="split-h" className="@container min-w-0">
      <div className="mb-1 flex min-h-8 items-baseline justify-between gap-3">
        <h2 id="split-h" className="t-eyebrow">
          The split
        </h2>
        <span className="t-meta text-ash">Tap to edit a day</span>
      </div>
      <ul className="divide-y divide-vein border-y border-vein">
        {week.templates.map((t) => {
          const days = weekdaysFor(schedule, t.key);
          const eff = modeTemplate(t, week.mode);
          const s = templateSummary(eff);
          const min = week.mode === "standard" && typical[t.key] ? typical[t.key] : estimateDurationMin(eff);
          const last = lastDone[t.key];
          return (
            <li key={t.key}>
              <Link href={`/training/program/${t.key}`} className="press-soft flex min-h-20 items-center gap-3 py-3">
                <span className={cn("t-eyebrow w-10 shrink-0 @max-[19rem]:hidden", !days.length && "text-ash")}>{days.length ? days.map((d) => SHORT[d]).join(" ") : "—"}</span>
                <span className="min-w-0 flex-1">
                  <span className="t-eyebrow hidden @max-[19rem]:block">{days.length ? days.map((d) => SHORT[d]).join(" ") : "Not scheduled"}</span>
                  <span className="t-title-2 block text-ivory">{t.name}</span>
                  <span className="t-meta tnum mt-0.5 block text-stone">
                    {plural(s.exercises, "lift")} · {plural(s.sets, "set")} · ~{min} min
                  </span>
                  <span className="t-meta line-clamp-2 block text-ash">{all.isLoading ? " " : last ? `${t.subtitle || t.focus} · last ${shortDate(last, week.today)}` : `${t.subtitle || t.focus} · not done yet`}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" aria-expanded={sundayOpen} aria-controls={sundayId} onClick={() => setSundayOpen((o) => !o)} className="press-soft flex min-h-20 w-full items-center gap-3 py-3 text-left">
            <span className="t-eyebrow w-10 shrink-0 @max-[19rem]:hidden">{restDays.length ? restDays.map((d) => d.short).join(" ") : "—"}</span>
            <span className="min-w-0 flex-1">
              <span className="t-title-2 block text-ivory">Recovery</span>
              <span className="t-meta block text-stone">No compulsory lifting. Everything is optional.</span>
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-ash transition-transform duration-(--dur-base)", sundayOpen && "rotate-180")} strokeWidth={1.6} aria-hidden />
          </button>
          <Collapse open={sundayOpen} id={sundayId} className="pb-4 pl-13 @max-[19rem]:pl-0">
            <ul className="space-y-2">
              {SUNDAY_RECOVERY.items.map((i) => (
                <li key={i.label} className="t-callout text-stone">
                  <span className="text-ivory">{i.label}.</span> {i.detail}
                </li>
              ))}
            </ul>
          </Collapse>
        </li>
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------ schedule */

function ScheduleEditor({ week }: { week: Week }) {
  const save = useSaveSchedule();
  const saved = scheduleOf(week.profile ?? undefined);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const current = draft ?? saved;
  const dirty = !!draft && DAYS.some(({ wd }) => draft[String(wd)] !== saved[String(wd)]);
  const keys = week.templates.map((t) => t.key);
  const names = Object.fromEntries(week.templates.map((t) => [t.key, t.name])) as Record<string, string>;
  const issues = scheduleIssues(current, keys);
  const isDefault = DAYS.every(({ wd }) => current[String(wd)] === DEFAULT_SCHEDULE[String(wd)]);

  const commit = async () => {
    if (!draft) return;
    // Past days keep the plan they had; the draft is kept if anything fails.
    if (await save.commit({ ...draft }, { ...saved })) setDraft(null);
  };

  return (
    <section aria-labelledby="sched-h">
      <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
        <h2 id="sched-h" className="t-eyebrow">
          Weekly schedule
        </h2>
        {!isDefault && (
          <button type="button" onClick={() => setDraft({ ...(DEFAULT_SCHEDULE as Record<string, string>) })} className="press t-meta -mr-2 inline-flex h-11 items-center px-2 font-semibold text-ivory underline decoration-ui-line underline-offset-4">
            Use default
          </button>
        )}
      </div>
      <div className="slab divide-y divide-vein px-4">
        {week.loading
          ? DAYS.map((d) => (
              <div key={d.wd} className="flex min-h-15 items-center gap-3 py-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="ml-auto h-11 w-40" />
              </div>
            ))
          : DAYS.map(({ wd, short, label }) => {
              const v = current[String(wd)] ?? "rest";
              const changed = !!draft && v !== saved[String(wd)];
              return (
                <div key={wd} className="flex min-h-15 items-center gap-3 py-2">
                  <label htmlFor={`sched-${wd}`} className={cn("t-title-3 w-12 shrink-0", changed ? "text-ivory underline decoration-ui-line underline-offset-4" : "text-stone")}>
                    <span aria-hidden>{short}</span>
                    <span className="sr-only">{label}</span>
                  </label>
                  <div className="min-w-0 flex-1">
                    <Select id={`sched-${wd}`} value={v} onChange={(e) => setDraft({ ...current, [String(wd)]: e.target.value })} className="h-11 bg-m1">
                      {week.templates.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.name}
                        </option>
                      ))}
                      <option value="rest">Rest</option>
                    </Select>
                  </div>
                </div>
              );
            })}
      </div>
      <div className="t-meta mt-2 space-y-1 text-stone" aria-live="polite">
        <p>
          {plural(issues.trainingDays, "training day")}, {7 - issues.trainingDays} rest.
          {issues.duplicates.length > 0 && ` ${issues.duplicates.map((k) => names[k]).join(" and ")} ${issues.duplicates.length === 1 ? "appears" : "appear"} twice; progression still tracks every session.`}
          {issues.missing.length > 0 && ` ${issues.missing.map((k) => names[k]).join(", ")} ${issues.missing.length === 1 ? "isn't" : "aren't"} scheduled.`}
        </p>
        <p className="text-ash">Applies from today. Past days keep the plan they had; to move one session, tap its day on Week.</p>
      </div>
      {dirty && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={save.pending}>
            Discard
          </Button>
          <Button variant="outline" size="sm" onClick={commit} loading={save.pending}>
            Save schedule
          </Button>
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- mode */

const MODES: { value: Mode; title: string }[] = [
  { value: "standard", title: "Standard" },
  { value: "intro", title: "Intro volume" },
  { value: "deload", title: "Deload week" },
];

function ModePicker({ week }: { week: Week }) {
  const { mode, setMode, pending } = useSetTrainingMode();
  return (
    <section aria-labelledby="mode-h">
      <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
        <h2 id="mode-h" className="t-eyebrow">
          Training mode
        </h2>
        {week.deload.suggest && mode !== "deload" && (
          <span className="t-meta flex items-center gap-1.5 text-stone">
            A lighter week is due <Tag kind="RULE" explain={week.deload.reasons.join(" ")} />
          </span>
        )}
      </div>
      <ul className="slab divide-y divide-vein px-4" role="radiogroup" aria-labelledby="mode-h">
        {MODES.map((m) => {
          const on = mode === m.value;
          return (
            <li key={m.value}>
              <button type="button" role="radio" aria-checked={on} disabled={pending} onClick={() => void setMode(m.value)} className="press-soft flex min-h-16 w-full items-center gap-3 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="t-title-3 block text-ivory">{m.title}</span>
                  <span className="t-meta mt-0.5 block text-stone">{MODE_HELP[m.value]}</span>
                </span>
                <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-full", on ? "bg-ivory text-night" : "shadow-[inset_0_0_0_1.5px_var(--ui-line)]")}>
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="t-meta mt-2 text-ash">
        {mode === "deload"
          ? "Deload is on. After about a week, switch back to Standard and start the next block from your pre-deload weights."
          : mode === "intro"
            ? "Intro volume suits the first 2–3 weeks back or a busy stretch. Switch to Standard once sessions feel routine."
            : "Plan a deload every 5–7 hard weeks, or sooner when fatigue check-ins stay high."}
      </p>
    </section>
  );
}

/* --------------------------------------------------------- training time */

/** The usual training time (§4.4): prefs.day.trainAt, written with useSavePrefs (other keys are kept). */
function TrainingTime({ week }: { week: Week }) {
  const save = useSavePrefs();
  const id = useId();
  const prefs = parseAppPrefs(week.profile?.prefs);
  const stored = prefs.day.trainAt;
  const reminder = normalizeSettings(week.profile?.reminders).workout;
  const effective = effectiveTrainAt(prefs, week.profile?.reminders);
  const [text, setText] = useState(stored ?? "");
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    setText(stored ?? "");
  }

  const write = (next: string | null) => {
    const prev = stored;
    if (next === prev) return;
    if (offlineNoChange("Your training time")) return setText(prev ?? "");
    save.mutate(
      { day: { trainAt: next } },
      {
        onSuccess: () =>
          toast.success(next ? `Usual training time ${formatClock(toMinutes(next))}` : "Usual training time cleared", {
            duration: 6000,
            action: { label: "Undo", onClick: () => save.mutate({ day: { trainAt: prev } }) },
          }),
      },
    );
  };

  return (
    <section aria-labelledby={`${id}-h`}>
      <div className="mb-2 flex min-h-11 items-center">
        <h2 id={`${id}-h`} className="t-eyebrow">
          Usual training time
        </h2>
      </div>
      <div className="slab flex items-center gap-3 px-4 py-3">
        <label htmlFor={id} className="t-title-3 min-w-0 flex-1 text-ivory">
          {stored ? formatClock(toMinutes(stored)) : effective ? `${formatClock(toMinutes(effective))} (reminder)` : "Not set"}
        </label>
        <Input
          id={id}
          type="time"
          value={text}
          step={300}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => (text === "" ? write(null) : isTime(text) ? write(text) : setText(stored ?? ""))}
          className="tnum h-11 w-32 shrink-0 bg-m1"
          aria-describedby={`${id}-hint`}
        />
        {stored && (
          <Button variant="ghost" size="sm" className="-mr-2 shrink-0 px-2" onClick={() => write(null)} disabled={save.isPending}>
            Clear
          </Button>
        )}
      </div>
      <p id={`${id}-hint`} className="t-meta mt-2 text-ash">
        Now uses this to know when to get you ready.
        {!stored && reminder.on ? ` Until you set one, it uses your workout reminder (${formatClock(toMinutes(reminder.time))}).` : ""}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------ volleyball */

function VolleyballPerWeek({ week }: { week: Week }) {
  const save = useSaveProfile();
  const saved = week.profile?.volleyball_per_week ?? 2;
  const [value, setValue] = useState(saved);
  const [seen, setSeen] = useState(saved);
  if (saved !== seen) {
    setSeen(saved);
    setValue(saved);
  }
  const timer = useRef<number | null>(null);
  // the value still waiting for its write, so leaving the tab before the taps settle never drops it
  const pending = useRef<number | null>(null);
  const mutate = useRef(save.mutate);
  useEffect(() => {
    mutate.current = save.mutate;
  });
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (pending.current != null && !isOffline()) mutate.current({ values: { volleyball_per_week: pending.current } });
    },
    [],
  );
  const onChange = (v: number) => {
    setValue(v);
    if (timer.current) window.clearTimeout(timer.current);
    pending.current = v === saved ? null : v;
    // one write after the taps settle
    timer.current = window.setTimeout(() => {
      timer.current = null;
      pending.current = null;
      if (v === saved) return;
      if (offlineNoChange("Volleyball sessions a week")) return setValue(saved);
      save.mutate({ values: { volleyball_per_week: v } }, { onError: () => setValue(saved) });
    }, 700);
  };
  return (
    <section aria-labelledby="vbw-h">
      <div className="mb-2 flex min-h-11 items-center">
        <h2 id="vbw-h" className="t-eyebrow">
          Volleyball
        </h2>
      </div>
      <div className="slab flex items-center gap-3 px-4 py-3">
        <span className="t-title-3 min-w-0 flex-1 text-ivory">Sessions a week</span>
        <Stepper size="sm" value={value} onChange={onChange} min={0} max={7} label="Volleyball sessions a week" className="w-36 shrink-0" />
      </div>
      <p className="t-meta mt-2 text-ash">Your usual on-court load. More than this in 7 days suggests lighter legs.</p>
    </section>
  );
}

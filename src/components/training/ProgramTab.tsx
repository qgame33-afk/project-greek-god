"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { SuggestedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/dates";
import { useSaveProfile } from "@/lib/data/profile";
import { scheduleOf, useAllSessions } from "@/lib/data/training";
import { DEFAULT_SCHEDULE, SUNDAY_RECOVERY } from "@/lib/training/program";
import type { Mode } from "@/lib/training/progression";
import { scheduleIssues, weekdaysFor } from "@/lib/training/schedule";
import { modeTemplate } from "@/lib/training/volume";
import { MODE_HELP } from "./DaySheet";
import { templateMeta, weekdaysLabel } from "./format";
import { MODE_LABEL, useSaveSchedule, useTypicalDurations, type useTrainingWeek } from "./hooks";

type Week = ReturnType<typeof useTrainingWeek>;

const DAYS: { wd: number; label: string }[] = [
  { wd: 1, label: "Monday" },
  { wd: 2, label: "Tuesday" },
  { wd: 3, label: "Wednesday" },
  { wd: 4, label: "Thursday" },
  { wd: 5, label: "Friday" },
  { wd: 6, label: "Saturday" },
  { wd: 0, label: "Sunday" },
];

export function ProgramTab({ week }: { week: Week }) {
  const all = useAllSessions();
  const typical = useTypicalDurations();
  const schedule = scheduleOf(week.profile ?? undefined);
  const lastDone = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of all.data ?? []) if (s.template_key && !m[s.template_key]) m[s.template_key] = s.local_date;
    return m;
  }, [all.data]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="templates-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="templates-h" className="eyebrow">
            The six-day split
          </h2>
          <p className="text-[12px] text-fg-3">Tap to edit</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {week.templates.map((t) => {
            const days = weekdaysFor(schedule, t.key);
            const last = lastDone[t.key];
            return (
              <Link
                key={t.key}
                href={`/training/program/${t.key}`}
                className="card press-soft group flex items-stretch gap-3 p-4 transition-colors hover:border-line-strong sm:min-h-[148px] sm:p-5"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="eyebrow">{weekdaysLabel(days)}</p>
                    <p className="shrink-0 text-[12px] text-fg-3">{all.isLoading || (all.isError && !all.data) ? "" : last ? `Last ${shortDate(last)}` : "Not done yet"}</p>
                  </div>
                  <p className="t-h2 mt-1.5 text-[24px] leading-none">{t.name}</p>
                  <p className="mt-1 truncate text-[13px] text-fg-2">{t.subtitle || t.focus}</p>
                  <p className="num mt-auto pt-2.5 text-[15px] text-fg">{templateMeta(modeTemplate(t, week.mode), week.mode === "standard" ? typical[t.key] : null)}</p>
                </div>
                <ChevronRight className="mt-0.5 size-4 shrink-0 self-center text-fg-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
          <RecoveryCard />
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <ScheduleEditor week={week} />
        <ModeCard week={week} />
      </div>
    </div>
  );
}

function RecoveryCard() {
  return (
    <section className="card p-4 sm:col-span-2 sm:p-5 xl:col-span-3" aria-label="Sunday recovery">
      <p className="eyebrow">Sundays</p>
      <p className="t-h2 mt-1.5 text-[24px] leading-none">Recovery</p>
      <p className="mt-1 text-[13px] text-fg-2">No compulsory lifting. Everything below is optional.</p>
      <ul className="mt-3 grid gap-x-8 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {SUNDAY_RECOVERY.items.map((i) => (
          <li key={i.label} className="flex gap-2.5 text-[13px] leading-snug text-fg-2">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-gold-600" aria-hidden />
            <span>
              <span className="font-semibold text-fg">{i.label}.</span> {i.detail}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------- schedule */

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
    <Card>
      <CardHeader
        title="Weekly schedule"
        action={!isDefault ? <CardAction onClick={() => setDraft({ ...(DEFAULT_SCHEDULE as Record<string, string>) })}>Use default</CardAction> : undefined}
      />
      {week.loading ? (
        <div className="space-y-2">
          {DAYS.map((d) => (
            <Skeleton key={d.wd} className="h-[52px] w-full" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {DAYS.map(({ wd, label }) => {
            const v = current[String(wd)] ?? "rest";
            const changed = !!draft && v !== saved[String(wd)];
            const dup = v !== "rest" && issues.duplicates.includes(v);
            return (
              <li key={wd} className="grid grid-cols-[96px_1fr] items-center gap-3">
                <label htmlFor={`sched-${wd}`} className={cn("text-[14px] font-semibold", changed ? "text-gold-300" : "text-fg-2")}>
                  {label}
                </label>
                <Select
                  id={`sched-${wd}`}
                  value={v}
                  onChange={(e) => setDraft({ ...current, [String(wd)]: e.target.value })}
                  className={cn(dup && "border-line-strong")}
                >
                  {week.templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                  <option value="rest">Rest</option>
                </Select>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 space-y-1 text-[13px] text-fg-2" aria-live="polite">
        <p>
          {issues.trainingDays} training {issues.trainingDays === 1 ? "day" : "days"}, {7 - issues.trainingDays} rest.
        </p>
        {issues.duplicates.length > 0 && <p>{issues.duplicates.map((k) => names[k]).join(" and ")} appear{issues.duplicates.length === 1 ? "s" : ""} twice. That&apos;s allowed — progression still tracks every session.</p>}
        {issues.missing.length > 0 && <p>{issues.missing.map((k) => names[k]).join(", ")} {issues.missing.length === 1 ? "isn't" : "aren't"} scheduled.</p>}
      </div>
      {dirty && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setDraft(null)} disabled={save.pending}>
            Discard
          </Button>
          <Button variant="outline-gold" onClick={commit} loading={save.pending}>
            Save schedule
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ mode */

const MODES: { value: Mode; title: string }[] = [
  { value: "standard", title: "Standard" },
  { value: "intro", title: "Intro volume" },
  { value: "deload", title: "Deload week" },
];

function ModeCard({ week }: { week: Week }) {
  const save = useSaveProfile();
  const busy = useRef(false);
  const mode = week.mode;
  const setMode = async (m: Mode) => {
    if (m === mode || busy.current) return;
    busy.current = true;
    const prev = mode;
    try {
      await save.mutateAsync({ values: { training_mode: m } });
    } catch {
      return;
    } finally {
      busy.current = false;
    }
    toast.success(`${MODE_LABEL[m]} mode on`, {
      description: "Applies to workouts you start from now on.",
      duration: 6000,
      action: { label: "Undo", onClick: () => save.mutateAsync({ values: { training_mode: prev } }).catch(() => {}) },
    });
  };
  return (
    <Card>
      <CardHeader title="Training mode" />
      <ul className="space-y-2" role="radiogroup" aria-label="Training mode">
        {MODES.map((m) => {
          const on = mode === m.value;
          return (
            <li key={m.value}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                disabled={save.isPending}
                onClick={() => setMode(m.value)}
                className={cn(
                  "press-soft flex min-h-[60px] w-full items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors",
                  on ? "border-line-gold bg-gold-tint" : "border-line bg-s3 hover:border-line-strong",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[15px] font-bold", on && "text-gold-200")}>{m.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-fg-2">{MODE_HELP[m.value]}</span>
                </span>
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border", on ? "border-gold-400 text-gold-300" : "border-line-field")}>
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {mode === "deload" ? (
        <p className="mt-3 text-[13px] leading-relaxed text-fg-2">Deload is on. After about a week, switch back to Standard and start the next block from your pre-deload weights.</p>
      ) : mode === "intro" ? (
        <p className="mt-3 text-[13px] leading-relaxed text-fg-2">Intro volume suits the first 2–3 weeks back or a busy stretch. Switch to Standard once sessions feel routine.</p>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-fg-2">Plan a deload every 5–7 hard weeks, or sooner when fatigue check-ins stay high.</p>
      )}

      {week.deload.suggest && (
        <div className="mt-4 rounded-[14px] border border-lapis-line bg-lapis-tint p-3.5">
          <SuggestedBadge />
          <p className="mt-2 text-[14px] font-bold">A deload week now</p>
          <ul className="mt-1 space-y-0.5 text-[13px] text-lapis-text">
            {week.deload.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setMode("deload")}
            disabled={save.isPending}
            className="press mt-3 inline-flex h-11 items-center rounded-[12px] border border-lapis-line px-4 text-[14px] font-bold text-lapis-text hover:bg-lapis-tint"
          >
            Switch to deload
          </button>
        </div>
      )}
    </Card>
  );
}

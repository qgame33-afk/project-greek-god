"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronRight, Volleyball as VolleyballIcon } from "lucide-react";
import { ReadinessNote } from "@/components/recovery/ReadinessNote";
import { Colonnade, colonnadeSlot } from "@/components/signature/Colonnade";
import { OptionalBadge, SuggestedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { useMediaQuery } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { addDays, dayName, relativeDay, shortDate, type ISODate } from "@/lib/dates";
import { useSessionDetail, useStartWorkout } from "@/lib/data/workout";
import { SUNDAY_RECOVERY } from "@/lib/training/program";
import { describeMove, planMove, weekComplete, type MissedWorkout } from "@/lib/training/schedule";
import { isLegDay, modeTemplate } from "@/lib/training/volume";
import { fmtSessionMinutes, fmtVolume, targetLabel, templateMeta } from "./format";
import { MODE_LABEL, useDayPlanWrites, useTypicalDurations, useUnits, type useTrainingWeek } from "./hooks";

type Week = ReturnType<typeof useTrainingWeek>;

/* ------------------------------------------------------------- the week */

export function WeekCard({ week, onDay, onVolleyball, className }: { week: Week; onDay: (d: ISODate) => void; onVolleyball: () => void; className?: string }) {
  const train = week.days.filter((d) => d.kind === "train");
  const done = train.filter((d) => d.done).length;
  const vbSessions = week.volleyballDays.filter((v) => v.local_date >= (week.days[0]?.date ?? week.today) && v.local_date <= (week.days[6]?.date ?? week.today)).length;
  // The week failed to load: don't present "0 done" or "no volleyball" as fact.
  const unknown = !!week.error;
  const complete = !unknown && weekComplete(week.days);
  const wide = useMediaQuery("(min-width: 1024px)");
  const height = wide ? 152 : 112;
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="eyebrow">This week</h2>
          <p className="mt-1 text-[13px] text-fg-2">{complete ? "Every session done. The temple is complete." : `${shortDate(week.days[0]?.date ?? week.today)} – ${shortDate(week.days[6]?.date ?? week.today)}`}</p>
        </div>
        <p className="num text-[28px] font-semibold leading-none">
          <span aria-hidden>
            {unknown ? "—" : done}
            <span className="text-fg-3"> / {train.length}</span>
          </span>
          <span className="sr-only">{unknown ? "Sessions done this week not loaded" : `${done} of ${train.length} sessions done`}</span>
        </p>
      </div>
      <div className="flex flex-1 flex-col justify-center lg:py-1">
        {unknown ? (
          <p className="py-8 text-center text-[13px] text-fg-3">The week will show here once it loads.</p>
        ) : week.loading ? (
          <Skeleton className="mx-auto aspect-[320/96] w-full max-w-[373px] lg:max-w-[507px]" />
        ) : (
          <div className="mx-auto w-full" style={{ maxWidth: (height * 320) / 96 }}>
            <Colonnade days={week.days} height={height} interactive onDayClick={onDay} />
            {wide && (
              <div className="relative mt-1.5 h-4" aria-hidden>
                {week.days.map((d, i) => {
                  const box = colonnadeSlot(i);
                  return (
                    <span
                      key={d.date}
                      className={cn(
                        "num absolute top-0 truncate text-center text-[11px] font-semibold uppercase tracking-[.06em]",
                        d.today ? "text-gold-300" : d.done ? "text-fg-2" : "text-fg-3",
                      )}
                      style={{ left: `${box.left}%`, width: `${box.width}%` }}
                    >
                      {d.kind === "rest" ? "Rest" : d.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3 border-t border-line-hair pt-3">
        <span className="size-2 shrink-0 rounded-full bg-lapis" aria-hidden />
        <p className="min-w-0 flex-1 text-[13px] text-fg-2">
          {unknown ? (
            <>
              Volleyball · <span className="num text-[15px] text-fg">—</span> this week
            </>
          ) : vbSessions ? (
            <>
              Volleyball · <span className="num text-[15px] text-fg">{vbSessions}</span> this week
            </>
          ) : (
            "No volleyball yet this week"
          )}
        </p>
        <Button variant="ghost" size="md" className="-mr-3 h-11 px-3 text-[14px] text-gold-300 hover:text-gold-200" onClick={onVolleyball}>
          <VolleyballIcon className="size-4" />
          Log volleyball
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------- next workout */

export function NextWorkoutCard({ week, onDay, className }: { week: Week; onDay: (d: ISODate) => void; className?: string }) {
  const { today } = week;
  const { unit } = useUnits();
  const { start, starting, active } = useStartWorkout();
  const typical = useTypicalDurations();
  const plan = week.resolve(today);
  const todayDone = week.sessions.filter((s) => s.local_date === today && s.status === "done");
  const next = week.resolved.find((p) => p.date > today && p.template);
  const metaFor = (t: NonNullable<typeof plan.template>) => templateMeta(modeTemplate(t, week.mode), week.mode === "standard" ? typical[t.key] : null);

  if (week.loading) {
    return (
      <Card variant="accent" className={className}>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-8 w-40" />
        <Skeleton className="mt-3 h-4 w-56" />
        <Skeleton className="mt-6 h-14 w-full rounded-[14px]" />
      </Card>
    );
  }

  if (active) {
    return (
      <Card variant="accent" className={cn("flex flex-col", className)}>
        <p className="eyebrow text-gold-300">In progress · {relativeDay(active.local_date, today)}</p>
        <p className="t-card mt-2">{active.name}</p>
        <p className="mt-1.5 text-[13px] text-fg-2">
          Started {new Date(active.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Your sets are saved as you go.
        </p>
        <Button variant="primary" size="lg" block className="mt-5" asChild>
          <Link href={`/workout/${active.id}`}>Resume workout</Link>
        </Button>
        <ActiveProgress sessionId={active.id} />
        {plan.template && plan.key !== active.template_key && active.local_date === today && (
          <PlannedInstead name={plan.template.name} onOpen={() => onDay(today)} />
        )}
      </Card>
    );
  }

  // Finished today → show the result and what's next.
  if (todayDone.length) {
    const s = todayDone[0];
    const plannedOpen = !!plan.template && !todayDone.some((x) => x.template_key === plan.key || x.template_key == null);
    return (
      <Card variant="accent" className={className}>
        <p className="eyebrow">Today · {dayName(today)}</p>
        <div className="mt-3 flex items-center gap-3 rounded-[14px] border border-success/25 bg-success-tint px-3.5 py-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-success text-ink">
            <Check className="size-4" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold">Completed · {s.name}</p>
            <p className="truncate text-[13px] text-fg-2">
              {fmtSessionMinutes(s.duration_sec)} · {fmtVolume(Number(s.total_volume_lb), unit)} · {s.sets_completed} sets
            </p>
          </div>
        </div>
        {plannedOpen && <PlannedInstead name={plan.template!.name} onOpen={() => onDay(today)} />}
        {next?.template && <NextPreview date={next.date} today={today} name={next.template.name} meta={metaFor(next.template)} onOpen={() => onDay(next.date)} />}
      </Card>
    );
  }

  // Rest day today.
  if (!plan.template) {
    return (
      <Card variant="accent" className={className}>
        <p className="eyebrow">Today · {dayName(today)}</p>
        <p className="t-card mt-2">Recovery day</p>
        <ul className="mt-3 space-y-2">
          {SUNDAY_RECOVERY.items.slice(0, 3).map((i) => (
            <li key={i.label} className="flex gap-2.5 text-[13px] leading-snug text-fg-2">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-gold-600" aria-hidden />
              <span>
                <span className="font-semibold text-fg">{i.label}.</span> {i.detail}
              </span>
            </li>
          ))}
        </ul>
        <ReadinessNote date={today} session={null} checkinPrompt={false} className="mt-4" />
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" size="md" className="flex-1" asChild>
            <Link href="/recovery?checkin=1">Recovery check-in</Link>
          </Button>
          <Button variant="ghost" size="md" onClick={() => onDay(today)}>
            Train anyway
          </Button>
        </div>
        {next?.template && <NextPreview date={next.date} today={today} name={next.template.name} meta={metaFor(next.template)} onOpen={() => onDay(next.date)} />}
      </Card>
    );
  }

  const t = plan.template;
  const eff = modeTemplate(t, week.mode);
  const shown = eff.exercises.slice(0, 3);
  const more = eff.exercises.length - shown.length;
  return (
    <Card variant="accent" className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">
            Today · {dayName(today)}
            {plan.movedFrom ? ` · moved from ${dayName(plan.movedFrom, true)}` : ""}
          </p>
          <p className="t-card mt-2">{t.name}</p>
          {t.subtitle && <p className="mt-1.5 text-[13px] text-fg-2">{t.subtitle}</p>}
          <p className="num mt-1 text-[15px] text-fg">{templateMeta(eff, week.mode === "standard" ? typical[t.key] : null)}</p>
        </div>
        {week.mode !== "standard" && (
          <span className="mt-0.5 shrink-0 rounded-full border border-line-strong px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.1em] text-fg-2">{MODE_LABEL[week.mode]}</span>
        )}
      </div>
      <ReadinessNote date={today} session={t.name} className="mt-4" />
      <Button variant="primary" size="lg" block shine className="mt-4" loading={starting} onClick={() => start({ template: t, date: today, mode: week.mode })}>
        Start workout
      </Button>
      <ul className="mt-4 divide-y divide-line-hair">
        {shown.map((e) => (
          <li key={e.slug + e.name} className="flex min-h-11 items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{e.name}</span>
            {e.optional && <OptionalBadge />}
            <span className="num shrink-0 text-[15px] text-fg-2">{targetLabel(e)}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onDay(today)} className="-mb-2 mt-1 flex min-h-11 items-center justify-between text-[13px] font-bold text-gold-300 hover:text-gold-200">
        <span>{more > 0 ? `+${more} more · options` : "Mode, swap or move"}</span>
        <ChevronRight className="size-4" />
      </button>
    </Card>
  );
}

function NextPreview({ date, today, name, meta, onOpen }: { date: ISODate; today: ISODate; name: string; meta: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="press-soft mt-4 flex w-full items-center gap-3 border-t border-line-hair pt-3 text-left">
      <div className="min-w-0 flex-1">
        <p className="eyebrow">Next · {date === addDays(today, 1) ? "Tomorrow" : dayName(date)}</p>
        <p className="mt-1 text-[16px] font-bold">{name}</p>
        <p className="truncate text-[12px] text-fg-3">{meta}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-fg-3" />
    </button>
  );
}

/** Live progress of the open session: sets logged so far and the next exercises. */
function ActiveProgress({ sessionId }: { sessionId: string }) {
  const q = useSessionDetail(sessionId);
  const work = (q.data?.sets ?? []).filter((x) => x.kind !== "warmup");
  if (!work.length) return null;
  const doneSets = work.filter((x) => x.completed).length;
  const byEx = new Map<string, { name: string; done: number; total: number }>();
  for (const x of work) {
    const k = `${x.exercise_order}|${x.exercise_slug}`;
    const e = byEx.get(k) ?? { name: x.exercise_name, done: 0, total: 0 };
    e.total++;
    if (x.completed) e.done++;
    byEx.set(k, e);
  }
  const list = [...byEx.values()];
  const firstOpen = Math.max(0, list.findIndex((e) => e.done < e.total));
  const shown = list.slice(firstOpen, firstOpen + 3);
  const pct = Math.round((doneSets / work.length) * 100);
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Progress</p>
        <p className="num text-[15px] text-fg-2">
          {doneSets}
          <span className="text-fg-3"> / {work.length} sets</span>
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--track)]" role="img" aria-label={`${doneSets} of ${work.length} sets logged`}>
        <div className="h-full w-full rounded-full bg-gold-400 transition-transform duration-500" style={{ transform: `translateX(${pct - 100}%)` }} />
      </div>
      <ul className="mt-2 divide-y divide-line-hair">
        {shown.map((e) => (
          <li key={e.name} className="flex min-h-11 items-center gap-3">
            <span className={cn("min-w-0 flex-1 truncate text-[14px] font-semibold", e.done >= e.total && "text-fg-3")}>{e.name}</span>
            <span className="num shrink-0 text-[15px] text-fg-2">
              {e.done}/{e.total}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Quiet note when a different workout was trained on a day that planned another one. */
function PlannedInstead({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="press-soft mt-3 flex min-h-11 w-full items-center gap-3 rounded-[12px] bg-s3 px-3.5 text-left">
      <span className="min-w-0 flex-1 text-[13px] text-fg-2">
        {name} was planned today. <span className="font-semibold text-fg">Move or skip it</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-fg-3" />
    </button>
  );
}

/* ------------------------------------------------------------- missed */

/** A quiet nudge — never red, never guilt. One tap when the move is clean, a confirm when it isn't. */
export function MissedCard({ week, missed, className }: { week: Week; missed: MissedWorkout; className?: string }) {
  const { today } = week;
  const { apply, pending } = useDayPlanWrites();
  const [confirm, setConfirm] = useState<ISODate | null>(null);
  const names = Object.fromEntries(week.templates.map((t) => [t.key, t.name]));
  const moveTo = (to: ISODate) => planMove({ from: missed.date, to, fromKey: missed.key, toKey: week.resolve(to).key, today });
  const go = async (to: ISODate) => {
    if (pending) return;
    const m = moveTo(to);
    if (m.kind === "replace" && confirm !== to) return setConfirm(to);
    if (await apply({ writes: m.writes, message: describeMove(m, names, today) })) setConfirm(null);
  };
  const skip = () =>
    apply({ writes: [{ plan_date: missed.date, template_key: "rest", reason: "rest", moved_from: null }], message: `${missed.name} skipped. Your week moves on.` });
  const others = week.missed.length - 1;
  const todayTaken = week.sessions.some((s) => s.local_date === today && (s.status === "done" || s.status === "active"));
  return (
    <Card className={className}>
      <p className="text-[15px] font-semibold leading-snug">
        {missed.name} was planned {missed.date === addDays(today, -1) ? "yesterday" : dayName(missed.date)}
        {missed.doneInstead ? ` (you did ${missed.doneInstead})` : ""}. Move it to {todayTaken ? "tomorrow" : "today or tomorrow"}?
      </p>
      {others > 0 && <p className="mt-1 text-[12px] text-fg-3">{others === 1 ? "One more session" : `${others} more sessions`} from this week went unlogged. Tap a day above to move it.</p>}
      {confirm && <p className="mt-3 rounded-[12px] bg-s3 px-3.5 py-2.5 text-[13px] text-fg-2">{describeMove(moveTo(confirm), names, today)} Tap again to confirm.</p>}
      <div className={cn("mt-4 grid gap-2", todayTaken ? "grid-cols-2" : "grid-cols-3")}>
        {!todayTaken && (
          <Button variant={confirm === today ? "outline-gold" : "secondary"} size="md" disabled={pending} onClick={() => go(today)}>
            {confirm === today ? "Confirm" : "Today"}
          </Button>
        )}
        <Button variant={confirm === addDays(today, 1) ? "outline-gold" : "secondary"} size="md" disabled={pending} onClick={() => go(addDays(today, 1))}>
          {confirm === addDays(today, 1) ? "Confirm" : "Tomorrow"}
        </Button>
        <Button variant="ghost" size="md" disabled={pending} onClick={skip}>
          Skip it
        </Button>
      </div>
    </Card>
  );
}

/* --------------------------------------------------- volleyball advice */

/** Lapis suggestion on leg days when on-court load or soreness is high. Never applied on its own. */
export function LegAdviceCard({ week, className }: { week: Week; className?: string }) {
  const { today } = week;
  const { start, starting } = useStartWorkout();
  const plan = week.resolve(today);
  const t = plan.template;
  if (!t || !isLegDay(t) || !week.vbAdvice.heavy) return null;
  const doneToday = week.sessions.some((s) => s.local_date === today && (s.status === "done" || s.status === "active"));
  if (doneToday) return null;
  const light = modeTemplate(t, week.mode, true);
  return (
    <section className={cn("rounded-[20px] border border-lapis-line bg-lapis-tint p-4 sm:p-5", className)}>
      <SuggestedBadge />
      <p className="mt-2.5 text-[15px] font-bold leading-snug">Go lighter on legs today</p>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
        Skip the optional jumps and take one set off each leg lift, never below 2. {templateMeta(light)}.
      </p>
      <ul className="mt-2 space-y-0.5 text-[12px] text-lapis-text">
        {week.vbAdvice.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <button
        type="button"
        disabled={starting}
        onClick={() => start({ template: t, date: today, mode: week.mode, lighterLegs: true })}
        className="press mt-4 inline-flex h-12 items-center justify-center rounded-[14px] border border-lapis-line px-5 text-[15px] font-bold text-lapis-text hover:bg-lapis-tint disabled:opacity-50"
      >
        Start lighter {t.name}
      </button>
    </section>
  );
}


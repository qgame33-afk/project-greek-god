"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SealTick } from "@/components/art/icons";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { addDays, dayName, type ISODate } from "@/lib/dates";
import { useRecentHistory, useSessionDetail, useStartWorkout } from "@/lib/data/workout";
import { effectiveTrainAt, formatClock, parseAppPrefs, toMinutes } from "@/lib/prefs";
import { keyLift } from "@/lib/today/now";
import { estimateDurationMin } from "@/lib/training/program";
import { isLegDay, modeTemplate } from "@/lib/training/volume";
import { formatInt, formatLoad, toDisplayWeight } from "@/lib/units";
import { MODE_LABEL, useTypicalDurations, useUnits, type useTrainingWeek } from "../hooks";

type Week = ReturnType<typeof useTrainingWeek>;

const lifts = (n: number) => `${n} ${n === 1 ? "lift" : "lifts"}`;
const sets = (n: number) => `${n} ${n === 1 ? "set" : "sets"}`;

/**
 * Today's session row (§3.4.1 item 5): when, what, and Begin — the one gold control of the Week.
 * Live: Return. Sealed: the result and what's next. Rest day: rest, and the next session. The text
 * block opens today's day sheet (mode, swap, move).
 */
export function TodaySession({ week, onDay, className }: { week: Week; onDay: (d: ISODate) => void; className?: string }) {
  const { today } = week;
  const { unit } = useUnits();
  const { start, starting, active } = useStartWorkout();
  const typical = useTypicalDurations();
  const plan = week.resolve(today);
  const t = plan.template;
  const eff = t ? modeTemplate(t, week.mode) : null;
  const history = useRecentHistory(t?.exercises.map((e) => e.slug) ?? []);
  const key = eff ? keyLift(eff, history.data ?? {}, week.mode, (lb) => formatLoad(lb, unit, false)) : null;
  const prefs = parseAppPrefs(week.profile?.prefs);
  const at = effectiveTrainAt(prefs, week.profile?.reminders);
  const atMin = at ? toMinutes(at) : NaN;
  const doneToday = week.sessions.filter((s) => s.local_date === today && s.status === "done");
  const next = week.resolved.find((p) => p.date > today && p.template);
  const nextLabel = next ? `${next.date === addDays(today, 1) ? "Tomorrow" : dayName(next.date)} · ${next.template!.name}` : null;

  /* ---------------------------------------------------------------- live */
  if (active) {
    return (
      <section aria-labelledby="today-h" className={cn("rounded-card bg-m1 p-4 shadow-[inset_0_0_0_1px_var(--leaf-line)]", className)}>
        <div className="flex items-center gap-4 @max-[19rem]:flex-col @max-[19rem]:items-stretch">
          <div className="min-w-0 flex-1">
            <p className="t-eyebrow text-leaf-300">
              Live · started {new Date(active.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </p>
            <h2 id="today-h" className="t-title-2 mt-1.5 text-ivory">
              {active.name}
            </h2>
            <LiveProgress sessionId={active.id} />
          </div>
          <Button variant="primary" size="lg" asChild>
            <Link href={`/workout/${active.id}`}>Return</Link>
          </Button>
        </div>
      </section>
    );
  }

  /* -------------------------------------------------------------- sealed */
  if (doneToday.length) {
    const s = doneToday[0];
    const plannedOpen = !!t && !doneToday.some((x) => x.template_key === plan.key || x.template_key == null);
    return (
      <section aria-labelledby="today-h" className={cn("rounded-card bg-m1 p-4 shadow-[inset_0_0_0_1px_var(--vein-2)]", className)}>
        <button type="button" onClick={() => onDay(today)} className="press-soft flex w-full items-center gap-3 text-left">
          <SealTick className="size-7 text-leaf-300" />
          <span className="min-w-0 flex-1">
            <span className="t-eyebrow block">Today · sealed</span>
            <span id="today-h" className="t-title-2 mt-1 block text-ivory">
              {s.name}
            </span>
            <span className="t-meta tnum mt-0.5 block text-stone">
              {[s.duration_sec ? `${Math.max(1, Math.round(s.duration_sec / 60))} min` : null, sets(s.sets_completed), Number(s.total_volume_lb) > 0 ? `${formatInt(toDisplayWeight(Number(s.total_volume_lb), unit))} ${unit} moved` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
        </button>
        {plannedOpen && (
          <button type="button" onClick={() => onDay(today)} className="press-soft t-callout mt-3 flex min-h-11 w-full items-center gap-2 border-t border-vein pt-3 text-left text-stone">
            <span className="min-w-0 flex-1">
              {t!.name} was planned today. <span className="text-ivory">Move or skip it</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
          </button>
        )}
        {nextLabel && <NextLine label={nextLabel} onOpen={() => next && onDay(next.date)} />}
      </section>
    );
  }

  /* ---------------------------------------------------------------- rest */
  if (!t || !eff) {
    const vb = week.volleyballDays.some((v) => v.local_date === today);
    const sleep = Number(week.profile?.sleep_goal_h) || 8;
    return (
      <section aria-labelledby="today-h" className={cn("rounded-card bg-m1 p-4 shadow-[inset_0_0_0_1px_var(--vein-2)]", className)}>
        <div className="flex items-center gap-4 @max-[19rem]:flex-col @max-[19rem]:items-stretch">
          <div className="min-w-0 flex-1">
            <p className="t-eyebrow">Today · {dayName(today, true)}</p>
            <h2 id="today-h" className="t-title-2 mt-1.5 text-ivory">
              {vb ? "Volleyball day" : "Rest day"}
            </h2>
            <p className="t-meta mt-0.5 text-stone">{vb ? "Fuel both: the court and tomorrow's lifting." : `Walk, stretch, sleep ${sleep} h.`}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onDay(today)}>
            Train anyway
          </Button>
        </div>
        {nextLabel && <NextLine label={nextLabel} onOpen={() => next && onDay(next.date)} />}
      </section>
    );
  }

  /* ------------------------------------------------------------- planned */
  const setCount = eff.exercises.reduce((n, e) => n + e.sets, 0);
  const minutes = week.mode === "standard" && typical[t.key] ? typical[t.key] : estimateDurationMin(eff);
  const legs = isLegDay(t) && week.vbAdvice.heavy;
  return (
    <section aria-labelledby="today-h" className={cn("rounded-card bg-m1 p-4 shadow-[inset_0_0_0_1px_var(--leaf-line)]", className)}>
      <div className="flex items-center gap-4 @max-[19rem]:flex-col @max-[19rem]:items-stretch">
        <button type="button" onClick={() => onDay(today)} className="press-soft min-w-0 flex-1 text-left" aria-describedby="today-meta">
          <span className="t-eyebrow block text-leaf-300">
            Today{Number.isNaN(atMin) ? "" : ` · ${formatClock(atMin)}`}
            {plan.movedFrom ? ` · from ${dayName(plan.movedFrom, true)}` : ""}
          </span>
          <span id="today-h" className="t-title-2 mt-1.5 flex items-center gap-2 text-ivory">
            {t.name}
            {week.mode !== "standard" && <span className="t-tag rounded-tag px-1.5 py-1 text-stone shadow-[inset_0_0_0_1px_var(--ui-line)]">{MODE_LABEL[week.mode]}</span>}
          </span>
          <span id="today-meta" className="t-meta tnum mt-0.5 block text-stone">
            {lifts(eff.exercises.length)} · {sets(setCount)} · ~{minutes} min
          </span>
        </button>
        <Button variant="primary" size="lg" className="px-7" loading={starting} onClick={() => start({ template: t, date: today, mode: week.mode })} aria-label={`Begin ${t.name}`}>
          Begin
        </Button>
      </div>
      {key?.target && (
        <div className="mt-3 border-t border-vein pt-3">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="t-callout min-w-0 text-ivory">{key.name}</span>
            <span className="t-num-s shrink-0 text-ivory">{key.target}</span>
          </p>
          <p className="t-meta tnum mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-stone">
            <span className="min-w-0">{key.from ? `Last time ${key.from}` : "First time on this lift"}</span>
            <Tag kind="RULE" explain={key.reason} />
          </p>
        </div>
      )}
      {legs && (
        <div className="mt-3 flex items-center gap-3 border-t border-vein pt-3 @max-[19rem]:flex-col @max-[19rem]:items-stretch">
          <p className="t-callout min-w-0 flex-1 text-stone">
            <span className="text-ivory">Volleyball load is high.</span> Lighter legs: no jumps, one set off each leg lift. <Tag kind="RULE" explain={week.vbAdvice.reasons.join(" ")} />
          </p>
          <Button variant="outline" size="sm" disabled={starting} onClick={() => start({ template: t, date: today, mode: week.mode, lighterLegs: true })}>
            Start lighter
          </Button>
        </div>
      )}
    </section>
  );
}

function NextLine({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="press-soft mt-3 flex min-h-11 w-full items-center gap-2 border-t border-vein pt-3 text-left">
      <span className="t-eyebrow">Next</span>
      <span className="t-callout min-w-0 flex-1 truncate text-ivory">{label}</span>
      <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
    </button>
  );
}

/** Sets logged so far in the open session. */
function LiveProgress({ sessionId }: { sessionId: string }) {
  const q = useSessionDetail(sessionId);
  const work = (q.data?.sets ?? []).filter((x) => x.kind !== "warmup");
  if (!work.length) return <p className="t-meta mt-0.5 text-stone">Your sets are saved as you go.</p>;
  const done = work.filter((x) => x.completed).length;
  return (
    <p className="t-meta tnum mt-0.5 text-stone">
      {done} of {work.length} sets · saved as you go
    </p>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, Check, ChevronRight, HeartPulse } from "lucide-react";
import { LaurelBullet } from "@/components/art/Motifs";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { Bar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { dayName, formatDuration, formatMinutes } from "@/lib/dates";
import { useSessionDetail } from "@/lib/data/workout";
import { useNowSec } from "@/lib/live-clock";
import { prescription } from "@/lib/today/plan";
import { restDayRecommendations } from "@/lib/today/recovery-recs";
import { formatInt, formatLoad, toDisplayWeight, type WeightUnit } from "@/lib/units";
import type { TodayModel } from "./useTodayModel";

interface Props {
  m: TodayModel;
  starting: boolean;
  onStart: () => void;
  shine: boolean;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}

export function WorkoutCard({ m, starting, onStart, shine, error, onRetry, className }: Props) {
  const t = m.template;
  const unit = (m.profile.weight_unit ?? "lb") as WeightUnit;
  const vbChip = m.volleyballToday ? (
    <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line bg-s3 px-2.5 text-[12px] font-semibold text-fg-2">
      <span className="size-1.5 rounded-full bg-lapis" aria-hidden />
      {t && (m.facts.kind === "train" && (m.facts.legs || m.facts.explosiveFirst)) ? "Volleyball today · jumps optional" : "Volleyball today"}
    </span>
  ) : null;

  const shell = (children: React.ReactNode) => (
    <section aria-label="Today's workout" className={cn("card-accent flex h-full flex-col p-4 sm:p-5 lg:p-6", className)}>
      {error && <ErrorNote className="mb-3" onRetry={onRetry}>Couldn&apos;t load today&apos;s sessions.</ErrorNote>}
      {children}
    </section>
  );

  /* ------------------------------------------------------------ active */
  if (m.active) {
    const s = m.active;
    const otherDay = s.local_date !== m.today;
    return shell(
      <>
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow !text-gold-300">{otherDay ? `Still open · ${dayName(s.local_date)}` : "In progress"}</p>
          {vbChip}
        </div>
        <h2 className="t-card mt-2">{s.name}</h2>
        <p className="mt-1.5 text-[14px] font-medium text-fg-2">
          {otherDay ? "Finish or discard it to start today's session." : "Your session is open. Every logged set is saved."}
        </p>
        <SessionBody sessionId={s.id} mode="active" unit={unit}>
          <Button variant="primary" size="lg" block className="mt-4" onClick={onStart} loading={starting} aria-label={`Resume ${s.name}`} data-today-resume>
            {otherDay ? (
              "Resume"
            ) : (
              <>
                Resume · <Elapsed startedAt={s.started_at} />
              </>
            )}
          </Button>
        </SessionBody>
      </>,
    );
  }

  /* -------------------------------------------------------------- done */
  if (m.doneToday) {
    const s = m.doneToday;
    const secs = s.duration_sec ?? (s.ended_at ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000 : null);
    const vol = Number(s.total_volume_lb ?? 0);
    const bits = [
      secs != null && secs > 0 ? formatMinutes(secs / 60) : null,
      vol > 0 ? `${formatInt(toDisplayWeight(vol, unit))} ${unit}` : null,
      s.sets_completed > 0 ? `${s.sets_completed} sets` : null,
    ].filter(Boolean);
    return shell(
      <>
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Today · {dayName(m.today)}</p>
          {vbChip}
        </div>
        <h2 className="t-card mt-2">{s.name}</h2>
        <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-success/25 bg-success-tint px-3.5 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success/20 text-success">
            <Check className="size-[18px]" strokeWidth={2.5} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-fg">Completed</p>
            <p className="num-xs truncate text-fg-2">{bits.length ? bits.join(" · ") : "Session saved"}</p>
          </div>
        </div>
        <SessionBody sessionId={s.id} mode="done" unit={unit}>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="md" className="flex-1">
              <Link href={`/workout/${s.id}`}>View summary</Link>
            </Button>
          </div>
        </SessionBody>
        {m.next && <NextLine next={m.next} className="mt-auto pt-4" />}
      </>,
    );
  }

  /* ---------------------------------------------------------- rest day */
  if (!t) {
    const recs = restDayRecommendations(m.checkin, Number(m.profile.sleep_goal_h), m.next);
    return shell(
      <>
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Today · {dayName(m.today)}</p>
          {vbChip}
        </div>
        <h2 className="t-card mt-2">Recovery day</h2>
        <p className="mt-1.5 text-[14px] font-medium text-fg-2">No lifting planned. Recovery is where the gains are made.</p>
        <ol className="mt-4 space-y-3">
          {recs.map((r) => (
            <li key={r.key} className="flex gap-3">
              <LaurelBullet size={14} className="mt-[3px] shrink-0" />
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-fg">{r.label}</p>
                <p className="text-[13px] leading-snug text-fg-2">{r.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
          <Button asChild variant="outline-gold" size="md">
            <Link href={m.todayRec ? "/recovery" : "/recovery?checkin=1"}>
              <HeartPulse className="size-[18px]" aria-hidden />
              {m.todayRec ? "View check-in" : "Recovery check-in"}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="md">
            <Link href="/training">Train anyway</Link>
          </Button>
        </div>
      </>,
    );
  }

  /* ----------------------------------------------------------- planned */
  // 3 rows on phones (START WORKOUT stays above the fold), up to 5 where the card is taller.
  const shown = t.exercises.slice(0, 5);
  const more3 = Math.max(0, t.exercises.length - 3);
  const more5 = Math.max(0, t.exercises.length - 5);
  return shell(
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Today · {dayName(m.today)}</p>
        {vbChip}
      </div>
      {/* Title row carries the count and duration (DESIGN §7.1) so START WORKOUT stays clear of
          the FAB at 390×844 even with a two-line greeting and daily line. */}
      <div className="mt-2 flex items-end justify-between gap-3">
        <h2 className="t-card min-w-0 truncate">{t.name}</h2>
        <p className="mb-1 shrink-0 text-[13px] font-semibold text-fg-2">
          {t.exercises.length} exercises<span className="text-fg-3"> · </span>~{m.durationMin} min
        </p>
      </div>
      {t.subtitle && <p className="mt-1 truncate text-[14px] font-medium text-fg-2">{t.subtitle}</p>}
      <Button variant="primary" size="lg" block shine={shine} className="mt-4" onClick={onStart} loading={starting}>
        Start workout
      </Button>
      <ol className="mt-3 divide-y divide-line-hair" aria-label={`${t.name} exercises`}>
        {shown.map((e, i) => (
          <li key={e.slug + i} className={cn("min-h-11 items-center gap-3 py-2", i < 3 ? "flex" : "hidden lg:flex")}>
            <span className="num w-4 shrink-0 text-[13px] font-semibold text-fg-3">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{e.name}</span>
            <span className="num-xs shrink-0 text-fg-2">{prescription(e)}</span>
          </li>
        ))}
      </ol>
      <Link
        href="/training"
        className="group -mb-2 mt-auto flex min-h-11 items-center justify-between pt-1 text-[13px] font-bold text-fg-2 hover:text-fg"
      >
        <span className="lg:hidden">{more3 > 0 ? `+${more3} more · full plan` : "Full plan"}</span>
        <span className="hidden lg:inline">{more5 > 0 ? `+${more5} more · full plan` : "Full plan"}</span>
        <ChevronRight className="size-4 text-fg-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </>,
  );
}

/**
 * A session's exercises from its real set rows. Active: a sets meter above RESUME and
 * done/total per exercise with UP NEXT. Done: the exercises completed with their top set.
 */
function SessionBody({ sessionId, mode, unit, children }: { sessionId: string; mode: "active" | "done"; unit: WeightUnit; children: React.ReactNode }) {
  const q = useSessionDetail(sessionId);
  const sets = (q.data?.sets ?? []).filter((x) => x.kind !== "warmup");
  const done = sets.filter((x) => x.completed).length;
  type Ex = { slug: string; name: string; done: number; total: number; top: { w: number | null; r: number | null } | null };
  const byEx: Ex[] = [];
  for (const x of sets) {
    const slug = x.exercise_slug ?? x.exercise_name ?? "?";
    let e = byEx.find((b) => b.slug === slug);
    if (!e) byEx.push((e = { slug, name: x.exercise_name ?? slug, done: 0, total: 0, top: null }));
    e.total++;
    if (!x.completed) continue;
    e.done++;
    const w = x.weight_lb == null ? null : Number(x.weight_lb);
    const score = (w ?? 0) * (1 + (x.reps ?? 0) / 30);
    const prev = e.top ? (e.top.w ?? 0) * (1 + (e.top.r ?? 0) / 30) : -1;
    if (score > prev) e.top = { w, r: x.reps };
  }
  const list = mode === "done" ? byEx.filter((e) => e.done > 0) : byEx;
  const next = mode === "active" ? list.findIndex((e) => e.done < e.total) : -1;
  return (
    <>
      {children}
      {mode === "active" && sets.length > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-[13px] font-semibold text-fg-2">
            <span>
              <span className="num-xs text-[16px] text-fg">{done}</span> / {sets.length} sets logged
            </span>
            <span className="text-fg-3">{byEx.length} exercises</span>
          </div>
          <Bar value={done / sets.length} className="mt-2" label={`${done} of ${sets.length} sets logged`} />
        </div>
      )}
      {list.length > 0 && (
        <ol className="mt-3 divide-y divide-line-hair" aria-label={mode === "done" ? "Exercises completed" : "Exercises in this session"}>
          {list.slice(0, 5).map((e, i) => {
            const complete = e.done === e.total;
            return (
              <li key={e.slug} className={cn("min-h-11 items-center gap-3 py-2", i < 3 ? "flex" : "hidden lg:flex")}>
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", complete ? "bg-success/20 text-success" : "text-fg-3")}>
                  {complete ? <Check className="size-3" strokeWidth={3} aria-hidden /> : <span className="num text-[13px] font-semibold">{i + 1}</span>}
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-[14px] font-semibold", mode === "done" || i === next ? "text-fg" : "text-fg-2")}>{e.name}</span>
                {i === next && <span className="eyebrow !text-gold-300">Up next</span>}
                <span className="num-xs shrink-0 text-fg-2">
                  {mode === "done" && e.top?.w != null && e.top.r != null ? (
                    <>
                      {formatLoad(e.top.w, unit, false)} × {e.top.r}
                      <span className="text-fg-3"> · {e.done} sets</span>
                    </>
                  ) : (
                    `${e.done}/${e.total}`
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {list.length > 5 && <p className="hidden pt-1 text-[12px] font-semibold text-fg-3 lg:block">+{list.length - 5} more</p>}
      {list.length > 3 && <p className="pt-1 text-[12px] font-semibold text-fg-3 lg:hidden">+{list.length - 3} more</p>}
    </>
  );
}

/** Live elapsed time — the only part of the card that re-renders every second. */
function Elapsed({ startedAt }: { startedAt: string }) {
  const now = useNowSec();
  const start = Math.floor(new Date(startedAt).getTime() / 1000);
  const s = now > 0 ? Math.max(0, now - start) : 0;
  return <span className="num tabular-nums">{now > 0 ? formatDuration(s) : "—"}</span>;
}

function NextLine({ next, className }: { next: NonNullable<TodayModel["next"]>; className?: string }) {
  return (
    <Link href="/training" className={cn("group flex min-h-11 items-center gap-2 text-[13px] font-semibold text-fg-2 hover:text-fg", className)}>
      <span className="eyebrow">Next</span>
      <span className="truncate text-fg">
        {next.name} · {next.when}
      </span>
      <span className="text-fg-3">· ~{next.minutes} min</span>
      <ArrowRight className="ml-auto size-4 text-fg-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeftRight, BedDouble, CalendarClock, Check, ChevronLeft, ChevronRight, RotateCcw, Volleyball as VolleyballIcon } from "lucide-react";
import { OptionalBadge, SuggestedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { dayName, longDate, relativeDay, shortDate, weekday, type ISODate } from "@/lib/dates";
import { scheduleOf, type Session } from "@/lib/data/training";
import { useStartWorkout } from "@/lib/data/workout";
import { SUNDAY_RECOVERY } from "@/lib/training/program";
import type { Mode } from "@/lib/training/progression";
import { describeMove, linkedMoveDates, planMove, rescheduleOptions, type RescheduleOption } from "@/lib/training/schedule";
import { isLegDay, modeTemplate } from "@/lib/training/volume";
import { fmtSessionMinutes, fmtVolume, targetLabel, templateMeta } from "./format";
import { useDayPlanWrites, useUnits, type useTrainingWeek } from "./hooks";
import { VolleyballList } from "./VolleyballList";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Week = ReturnType<typeof useTrainingWeek>;
type View = "main" | "move" | "swap";

export const MODE_HELP: Record<Mode, string> = {
  standard: "The program as written.",
  intro: "One set fewer on most exercises. Jumps keep 2 quality sets.",
  deload: "About half the sets, ~10% lighter, 3–4 reps in reserve.",
};

/** Everything about one day of the week: status, start, reschedule, swap, rest, volleyball. */
export function DaySheet({
  date,
  open,
  onOpenChange,
  week,
  onLogVolleyball,
  onOpenSession,
}: {
  date: ISODate | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  week: Week;
  onLogVolleyball: (date: ISODate) => void;
  onOpenSession: (s: Session) => void;
}) {
  const title = date ? (date === week.today ? `Today · ${longDate(date).split(", ")[1]}` : longDate(date)) : "Day";
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={date ? describePlan(week, date) : undefined}>
      {date && open && <DayBody key={date} date={date} week={week} close={() => onOpenChange(false)} onLogVolleyball={onLogVolleyball} onOpenSession={onOpenSession} />}
    </Sheet>
  );
}

function describePlan(week: Week, date: ISODate) {
  const p = week.resolve(date);
  if (!p.template) return "Rest day";
  const trained = week.sessions.filter((s) => s.local_date === date && (s.status === "done" || s.status === "active"));
  if (trained.length && !trained.some((s) => s.template_key === p.key || s.template_key == null)) return `${p.template.name} was planned`;
  return p.template.subtitle || p.template.focus;
}

function DayBody({
  date,
  week,
  close,
  onLogVolleyball,
  onOpenSession,
}: {
  date: ISODate;
  week: Week;
  close: () => void;
  onLogVolleyball: (date: ISODate) => void;
  onOpenSession: (s: Session) => void;
}) {
  const { today } = week;
  const plan = week.resolve(date);
  const template = plan.template;
  const sessions = week.sessions.filter((s) => s.local_date === date && s.status !== "discarded");
  const done = sessions.filter((s) => s.status === "done");
  const active = sessions.find((s) => s.status === "active") ?? null;
  const vb = week.volleyball.filter((v) => v.local_date === date);
  const past = date < today;
  const isToday = date === today;
  const missed = !!template && past && !done.length && !active;
  // A different workout was trained this day: the planned one is still open (move or skip it).
  const plannedOpen = !!template && (done.length > 0 || !!active) && ![...done, ...(active ? [active] : [])].some((s) => s.template_key === plan.key || s.template_key == null);
  // Past days frozen by a weekly-schedule change keep the plan they had.
  const frozen = plan.reason === "custom" && past;
  const todayTaken = week.sessions.some((s) => s.local_date === today && (s.status === "done" || s.status === "active"));

  const [view, setView] = useState<View>("main");
  const [mode, setMode] = useState<Mode>(week.mode);
  const [lighter, setLighter] = useState(false);
  const { unit } = useUnits();
  const { start, starting } = useStartWorkout();
  const { apply, pending } = useDayPlanWrites();

  const legDay = !!template && isLegDay(template);
  const suggestLighter = legDay && week.vbAdvice.heavy;
  const effective = template ? modeTemplate(template, mode, lighter) : null;
  const defaultKey = scheduleOf(week.profile ?? undefined)[String(weekday(date))] ?? "rest";

  const names = useMemo(() => Object.fromEntries(week.templates.map((t) => [t.key, t.name])), [week.templates]);

  const doStart = async () => {
    if (!template) return;
    await start({ template, date, mode, lighterLegs: lighter });
  };

  const dayLabel = (d: ISODate) => (d === today ? "today" : dayName(d));
  /** Back to the weekly plan — together with the other side of a reschedule, so nothing is orphaned. */
  const resetToPlan = async () => {
    const linked = linkedMoveDates(date, week.plansRows);
    const dates = [date, ...linked];
    const message =
      linked.length === 0
        ? `${relativeDay(date, today)} is back to the weekly plan.`
        : `${cap(dates.sort().map(dayLabel).join(" and "))} are back to the weekly plan.`;
    return apply({ deletes: dates, message });
  };

  const setKey = async (key: string) => {
    if (key === plan.key && !plan.overridden) return setView("main");
    const ok =
      key === defaultKey
        ? await resetToPlan()
        : await apply({
            writes: [{ plan_date: date, template_key: key, reason: key === "rest" ? "rest" : "swap", moved_from: null }],
            message: key === "rest" ? `${relativeDay(date, today)} is now a rest day.` : `${names[key] ?? key} on ${dayLabel(date)}.`,
          });
    if (!ok) return;
    // Rest closes the sheet; a chosen workout returns to the day so it can be started right away.
    if (key === "rest") close();
    else setView("main");
  };

  if (view === "move" && template) {
    return (
      <MoveView
        date={date}
        fromKey={plan.key}
        closed={plannedOpen}
        week={week}
        names={names}
        back={() => setView("main")}
        pending={pending}
        onApply={async (opt) => {
          const m = planMove({ from: date, to: opt.date, fromKey: plan.key, toKey: opt.key, today, closed: plannedOpen });
          const ok = await apply({ writes: m.writes, message: describeMove(m, names, today) });
          if (ok) close();
        }}
      />
    );
  }

  if (view === "swap") {
    return (
      <div className="space-y-4 pt-1">
        <BackRow onClick={() => setView("main")} label={`Choose the workout for ${relativeDay(date, today).toLowerCase() === "today" ? "today" : dayName(date)}`} />
        <ul className="space-y-2">
          {week.templates.map((t) => {
            const current = plan.key === t.key;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setKey(t.key)}
                  className={cn(
                    "press-soft flex min-h-16 w-full items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors",
                    current ? "border-line-gold bg-gold-tint" : "border-line bg-s3 hover:border-line-strong",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="t-h2 text-[18px]">{t.name}</p>
                    <p className="truncate text-[12px] text-fg-2">
                      {t.subtitle} · {templateMeta(t)}
                    </p>
                  </div>
                  {current ? <Check className="size-5 text-gold-300" /> : defaultKey === t.key ? <span className="text-[11px] font-bold uppercase tracking-[.12em] text-fg-3">Usual</span> : null}
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              disabled={pending}
              onClick={() => setKey("rest")}
              className={cn(
                "press-soft flex min-h-14 w-full items-center gap-3 rounded-[14px] border px-4 text-left",
                plan.key === "rest" ? "border-line-gold bg-gold-tint" : "border-line bg-s3 hover:border-line-strong",
              )}
            >
              <BedDouble className="size-5 text-fg-2" />
              <span className="flex-1 text-[15px] font-semibold">Rest day</span>
              {plan.key === "rest" && <Check className="size-5 text-gold-300" />}
            </button>
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-1">
      {/* status */}
      {(done.length > 0 || active || missed || plan.movedFrom || plan.reason === "swap" || frozen) && (
        <div className="space-y-2">
          {done.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenSession(s)}
              className="press-soft flex min-h-14 w-full items-center gap-3 rounded-[14px] border border-success/25 bg-success-tint px-3.5 text-left"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-success text-ink">
                <Check className="size-4" strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold">Completed · {s.name}</span>
                <span className="block truncate text-[12px] text-fg-2">
                  {fmtSessionMinutes(s.duration_sec)} · {fmtVolume(Number(s.total_volume_lb), unit)} · {s.sets_completed} sets
                </span>
              </span>
              <ChevronRight className="size-4 text-fg-3" />
            </button>
          ))}
          {active && (
            <div className="flex min-h-14 items-center gap-3 rounded-[14px] border border-line-gold bg-gold-tint px-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-gold-200">In progress · {active.name}</span>
                <span className="block text-[12px] text-fg-2">Pick up where you left off.</span>
              </span>
              <Button variant="primary" size="sm" className="h-11" asChild>
                <Link href={`/workout/${active.id}`}>Resume</Link>
              </Button>
            </div>
          )}
          {missed && <p className="rounded-[14px] bg-s3 px-3.5 py-3 text-[13px] text-fg-2">Not logged. Move it to another day, log it now if you trained, or leave it.</p>}
          {plannedOpen && template && (
            <div className="rounded-[14px] bg-s3 px-3.5 py-3">
              <p className="text-[14px] font-bold">{template.name} is still open</p>
              <p className="mt-0.5 text-[13px] text-fg-2">It was planned {isToday ? "today" : `for ${dayName(date)}`}. Move it to another day or skip it.</p>
            </div>
          )}
          {plan.movedFrom && <p className="text-[13px] text-fg-3">Moved here from {dayName(plan.movedFrom)}, {shortDate(plan.movedFrom)}.</p>}
          {plan.reason === "swap" && !plan.movedFrom && <p className="text-[13px] text-fg-3">Swapped in for this day only. Your weekly plan is unchanged.</p>}
          {frozen && <p className="text-[13px] text-fg-3">Planned under your previous weekly schedule.</p>}
        </div>
      )}

      {/* the workout */}
      {template && effective && !done.length && !active && (
        <div className="space-y-4">
          <div>
            <p className="t-card">{template.name}</p>
            <p className="mt-1 text-[13px] text-fg-2">{templateMeta(effective)}</p>
          </div>
          <ul className="divide-y divide-line-hair rounded-[14px] bg-s3 px-3.5">
            {template.exercises.map((e) => {
              const eff = effective.exercises.find((x) => x.slug === e.slug && x.name === e.name);
              return (
                <li key={e.slug + e.name} className={cn("flex min-h-11 items-center gap-3 py-2", !eff && "opacity-45")}>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{e.name}</span>
                  {e.optional && <OptionalBadge />}
                  <span className="num shrink-0 text-[15px] text-fg-2">{eff ? targetLabel(eff) : "Skipped"}</span>
                </li>
              );
            })}
          </ul>

          {!(date > today) && (
            <>
              <div>
                <Segmented
                  ariaLabel="Session mode"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "intro", label: "Intro volume" },
                    { value: "deload", label: "Deload" },
                  ]}
                />
                <p className="mt-2 text-[13px] text-fg-2">{MODE_HELP[mode]}</p>
              </div>

              {legDay && (
                <div className={cn("rounded-[14px] border p-3.5", suggestLighter ? "border-lapis-line bg-lapis-tint" : "border-line bg-s3")}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      {suggestLighter && <SuggestedBadge className="mb-2" />}
                      <p className="text-[14px] font-bold">Lighter legs</p>
                      <p className="mt-0.5 text-[13px] text-fg-2">Skip the optional jumps and take one set off each leg lift, never below 2.</p>
                      {suggestLighter && (
                        <ul className="mt-2 space-y-0.5 text-[12px] text-lapis-text">
                          {week.vbAdvice.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Switch checked={lighter} onCheckedChange={setLighter} label="Lighter legs" />
                  </div>
                </div>
              )}

              <Button variant="primary" size="lg" block onClick={doStart} loading={starting}>
                {isToday ? "Start workout" : `Log ${dayName(date, true)} session`}
              </Button>
              {past && <p className="-mt-2 text-center text-[12px] text-fg-3">Opens the workout dated {shortDate(date)} so you can enter what you did.</p>}
            </>
          )}
        </div>
      )}

      {!template && !done.length && (
        <div className="rounded-[14px] bg-s3 p-4">
          <p className="text-[15px] font-bold">{weekday(date) === 0 ? SUNDAY_RECOVERY.title : "Rest day"}</p>
          <ul className="mt-2 space-y-1.5">
            {SUNDAY_RECOVERY.items.slice(0, 4).map((i) => (
              <li key={i.label} className="text-[13px] text-fg-2">
                <span className="font-semibold text-fg">{i.label}.</span> {i.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* actions */}
      <ul className="overflow-hidden rounded-[14px] border border-line">
        {template && ((!done.length && !active) || plannedOpen) && (
          <ActionRow
            icon={CalendarClock}
            onClick={() => setView("move")}
            label={plannedOpen ? `Move ${template.name}` : date > today ? "Reschedule" : isToday ? "Move to another day" : "Move to today or later"}
          />
        )}
        {date > today && template && !done.length && !todayTaken && (
          <ActionRow
            icon={CalendarClock}
            disabled={pending}
            onClick={async () => {
              const m = planMove({ from: date, to: today, fromKey: plan.key, toKey: week.resolve(today).key, today });
              if (await apply({ writes: m.writes, message: describeMove(m, names, today) })) close();
            }}
            label="Do it today instead"
            hint={week.resolve(today).template ? `Swaps with ${week.resolve(today).template!.name}` : undefined}
          />
        )}
        {!done.length && !active && <ActionRow icon={ArrowLeftRight} onClick={() => setView("swap")} label={template ? "Swap workout" : "Add a workout"} />}
        {template && ((!done.length && !active) || plannedOpen) && (
          <ActionRow
            icon={BedDouble}
            disabled={pending}
            onClick={() => setKey("rest")}
            label={plannedOpen ? `Skip ${template.name}` : missed ? "Skip it (mark as rest)" : "Make rest day"}
          />
        )}
        {plan.overridden && !done.length && !frozen && (
          <ActionRow
            icon={RotateCcw}
            disabled={pending}
            onClick={async () => {
              if (await resetToPlan()) close();
            }}
            label="Reset to weekly plan"
            hint={linkedMoveDates(date, week.plansRows).length ? "Both days" : defaultKey === "rest" ? "Rest" : names[defaultKey]}
          />
        )}
        {date <= today && <ActionRow icon={VolleyballIcon} onClick={() => onLogVolleyball(date)} label="Log volleyball" />}
      </ul>

      <VolleyballList rows={vb} today={today} title="Volleyball" />
    </div>
  );
}

function ActionRow({ icon: Icon, label, hint, onClick, disabled }: { icon: typeof Check; label: string; hint?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <li className="border-t border-line-hair first:border-t-0">
      <button type="button" onClick={onClick} disabled={disabled} className="flex min-h-[52px] w-full items-center gap-3 bg-s2 px-4 text-left transition-colors hover:bg-s3 active:bg-s3 disabled:opacity-50">
        <Icon className="size-[18px] shrink-0 text-fg-2" />
        <span className="flex-1 text-[15px] font-semibold">{label}</span>
        {hint && <span className="text-[12px] text-fg-3">{hint}</span>}
        <ChevronRight className="size-4 shrink-0 text-fg-3" />
      </button>
    </li>
  );
}

function BackRow({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onClick} aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg">
        <ChevronLeft className="size-5" />
      </button>
      <p className="text-[14px] font-semibold text-fg-2">{label}</p>
    </div>
  );
}

function MoveView({
  date,
  fromKey,
  closed,
  week,
  names,
  back,
  onApply,
  pending,
}: {
  date: ISODate;
  fromKey: string;
  closed: boolean;
  week: Week;
  names: Record<string, string>;
  back: () => void;
  onApply: (o: RescheduleOption) => void;
  pending: boolean;
}) {
  const { today } = week;
  const todayTaken = week.sessions.some((s) => s.local_date === today && (s.status === "done" || s.status === "active"));
  const options = rescheduleOptions({ from: date, fromKey, today, plans: week.planLikes, closed }).filter((o) => !(todayTaken && o.date === today));
  const [picked, setPicked] = useState<RescheduleOption | null>(null);
  const move = picked ? planMove({ from: date, to: picked.date, fromKey, toKey: picked.key, today, closed }) : null;
  return (
    <div className="space-y-4 pt-1">
      <BackRow onClick={back} label={`Move ${names[fromKey] ?? fromKey} to…`} />
      <ul className="space-y-2" role="radiogroup" aria-label="New day">
        {options.map((o) => {
          const sel = picked?.date === o.date;
          return (
            <li key={o.date}>
              <button
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => setPicked(o)}
                className={cn(
                  "press-soft flex min-h-14 w-full items-center gap-3 rounded-[14px] border px-4 text-left transition-colors",
                  sel ? "border-line-gold bg-gold-tint" : "border-line bg-s3 hover:border-line-strong",
                )}
              >
                <span className="w-24 shrink-0">
                  <span className="block text-[15px] font-bold">{relativeDay(o.date, today) === shortDate(o.date, today) ? dayName(o.date) : relativeDay(o.date, today)}</span>
                  <span className="block text-[12px] text-fg-3">{shortDate(o.date, today)}</span>
                </span>
                <span className="min-w-0 flex-1 text-[13px] text-fg-2">
                  {o.key === "rest" ? "Rest day" : o.kind === "swap" ? `${o.name} · swap days` : `${o.name} · replaced`}
                </span>
                {o.key === "rest" && !sel && <span className="text-[11px] font-bold uppercase tracking-[.12em] text-fg-3">Free</span>}
                {sel && <Check className="size-5 text-gold-300" />}
              </button>
            </li>
          );
        })}
      </ul>
      {move && (
        <div className="space-y-3 rounded-[14px] bg-s3 p-4">
          <p className="text-[14px] leading-relaxed">{describeMove(move, names, today)}</p>
          <Button variant="primary" size="lg" block loading={pending} onClick={() => picked && onApply(picked)}>
            Move {names[fromKey] ?? fromKey}
          </Button>
        </div>
      )}
      {!move && <p className="text-[12px] text-fg-3">Moves only this week’s session. Your weekly plan stays the same — edit it under Program.</p>}
    </div>
  );
}

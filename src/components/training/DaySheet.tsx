"use client";

import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ListGroup, RadioGroup, RadioRow, Row } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { addDays, dayName, monthName, parseISODate, relativeDay, weekday, type ISODate } from "@/lib/dates";
import { scheduleOf, type Session } from "@/lib/data/training";
import { useSessionDetail, useStartWorkout } from "@/lib/data/workout";
import { programOfKey, templateLabels } from "@/lib/training/programs";
import { describeMove, linkedMoveDates, planMove, rescheduleOptions, type RescheduleOption } from "@/lib/training/schedule";
import { formatLoad } from "@/lib/units";
import { LiftRows, plannedCounts } from "./LiftRows";
import { aboutMin, plural } from "./format";
import { useDayPlanWrites, useTypicalDurations, useUnits, type useTrainingWeek } from "./hooks";
import { estimateDurationMin } from "@/lib/training/programs";
import { Caption } from "./parts";

type Week = ReturnType<typeof useTrainingWeek>;
type View = "main" | "move" | "pick";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Friday 23 Oct" */
const dayCaption = (d: ISODate) => `${dayName(d)} ${parseISODate(d).getDate()} ${monthName(d, true)}`;

/**
 * A day's sheet (docs/DESIGN-V3-SIMPLE.md §4.3.2, `train-day`, `?day=`): the date, the workout's
 * name, "6 lifts · 15 sets · about 45 min", the first four lifts with targets and "+ 2 more lifts".
 * Today → gold "Start workout"; other days → "Do it today", "Move it", "Make Friday a rest day";
 * an overridden date → "Back to the usual plan"; a done day → its rows and "See workout"; a rest
 * day → "Train anyway". These are the existing `day_plans` actions; done workouts never change.
 */
export function DaySheet({ date, open, onOpenChange, week }: { date: ISODate | null; open: boolean; onOpenChange: (o: boolean) => void; week: Week }) {
  const plan = date ? week.resolve(date) : null;
  const done = date ? week.sessions.find((s) => s.local_date === date && s.status === "done") : undefined;
  const name = done?.name ?? plan?.template?.name ?? "Rest day";
  // a stored name (a done workout, or a day kept from the program he left) is history (§5.2)
  const key = done?.template_key ?? plan?.key ?? null;
  const history = !!done || (!!key && programOfKey(key) !== null && programOfKey(key) !== week.program);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          <span className="t-label block font-normal">{date ? dayCaption(date) : ""}</span>
          <span data-budget-name="" data-history={history ? "" : undefined} className="block">
            {name}
          </span>
        </>
      }
    >
      {date && open && <DayBody key={date} date={date} week={week} close={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function DayBody({ date, week, close }: { date: ISODate; week: Week; close: () => void }) {
  const { today } = week;
  const plan = week.resolve(date);
  const template = plan.template;
  const sessions = week.sessions.filter((s) => s.local_date === date && s.status !== "discarded");
  const done = sessions.filter((s) => s.status === "done");
  const active = sessions.find((s) => s.status === "active") ?? null;
  const past = date < today;
  const isToday = date === today;
  const frozen = plan.reason === "custom" && past;
  const todayTaken = week.sessions.some((s) => s.local_date === today && (s.status === "done" || s.status === "active"));
  const plannedOpen = !!template && (done.length > 0 || !!active) && ![...done, ...(active ? [active] : [])].some((s) => s.template_key === plan.key || s.template_key == null);

  const [view, setView] = useState<View>("main");
  const [all, setAll] = useState(false);
  const typical = useTypicalDurations();
  const { start, starting } = useStartWorkout();
  const { apply, pending } = useDayPlanWrites();
  const defaultKey = scheduleOf(week.profile ?? undefined)[String(weekday(date))] ?? "rest";
  const names = useMemo(() => Object.fromEntries(week.templates.map((t) => [t.key, templateLabels(t).short])), [week.templates]);
  const dayWord = isToday ? "today" : dayName(date);

  const resetToPlan = async () => {
    const linked = linkedMoveDates(date, week.plansRows);
    const dates = [date, ...linked].sort();
    const message = linked.length === 0 ? `${relativeDay(date, today)} is back to the usual plan` : `${cap(dates.map((d) => (d === today ? "today" : dayName(d))).join(" and "))} are back to the usual plan`;
    return apply({ deletes: dates, message });
  };
  const setKey = async (key: string) => {
    const ok =
      key === defaultKey && plan.overridden
        ? await resetToPlan()
        : await apply({
            writes: [{ plan_date: date, template_key: key, reason: key === "rest" ? "rest" : "swap", moved_from: null }],
            message: key === "rest" ? `${cap(relativeDay(date, today).toLowerCase() === "today" ? "today" : dayName(date))} is a rest day` : `${names[key] ?? key} on ${dayWord}`,
          });
    if (!ok) return;
    if (key === "rest") close();
    else setView("main");
  };

  if (view === "move" && template) return <MoveView date={date} fromKey={plan.key} closed={plannedOpen} week={week} names={names} back={() => setView("main")} pending={pending} onDone={close} apply={apply} />;
  if (view === "pick") return <PickView week={week} current={plan.key} pending={pending} onPick={setKey} back={() => setView("main")} />;

  /* a done day: that workout's rows and "See workout" */
  if (done.length) {
    return (
      <div className="flex flex-col gap-4 pb-2">
        {done.map((s) => (
          <DoneSession key={s.id} session={s} />
        ))}
        {plannedOpen && template && (
          <>
            <Caption className="mt-0">{template.name} was planned too.</Caption>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" size="md" onClick={() => setView("move")}>
                Move it
              </Button>
              <Button variant="ghost" size="md" disabled={pending} onClick={() => setKey("rest")}>
                Let it go
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  /* a rest day */
  if (!template) {
    return (
      <div className="flex flex-col gap-4 pb-2">
        <p className="t-body text-fg-2">Nothing to lift {isToday ? "today" : `on ${dayName(date)}`}.</p>
        {(!past || isToday) && (
          <Button variant="ghost" size="lg" block onClick={() => setView("pick")}>
            Train anyway
          </Button>
        )}
        {plan.overridden && !frozen && (
          <Button variant="ghost" size="lg" block disabled={pending} onClick={async () => (await resetToPlan()) && close()}>
            Back to the usual plan
          </Button>
        )}
      </div>
    );
  }

  const { lifts, sets, eff } = plannedCounts(template, week.mode);
  const minutes = week.mode === "standard" && typical[template.key] ? typical[template.key] : estimateDurationMin(eff);
  const totalRows = template.exercises.length;
  const more = totalRows - 4;
  const missed = past && !active;

  return (
    <div className="flex flex-col gap-4 pb-2">
      <p className="t-label">
        {plural(lifts, "lift")} · {plural(sets, "set")} · {aboutMin(minutes)}
      </p>
      {(plan.movedFrom || plan.reason === "swap" || frozen || missed) && (
        <p className="t-cap">
          {missed ? "Not done. " : ""}
          {plan.movedFrom ? `Moved here from ${dayName(plan.movedFrom)}.` : plan.reason === "swap" ? "Swapped in for this day only." : frozen ? "Planned under your earlier week." : ""}
        </p>
      )}
      <div>
        <LiftRows template={template} mode={week.mode} limit={all ? undefined : 4} />
        {more > 0 && (
          <button type="button" onClick={() => setAll((a) => !a)} aria-expanded={all} className="press t-label hit-44 mt-2 px-1 font-semibold text-fg-2">
            {all ? "Show fewer" : `+ ${plural(more, "more lift")}`}
          </button>
        )}
      </div>

      {active ? (
        <Button variant="primary" size="lg" block asChild>
          <Link href={`/workout/${active.id}`}>
            <Dumbbell aria-hidden strokeWidth={1.9} />
            Back to workout
          </Link>
        </Button>
      ) : isToday ? (
        <Button variant="primary" size="lg" block loading={starting} onClick={() => start({ template, date, mode: week.mode })}>
          <Dumbbell aria-hidden strokeWidth={1.9} />
          Start workout
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {past ? (
            <Button variant="secondary" size="md" loading={starting} onClick={() => start({ template, date, mode: week.mode })}>
              Log it
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="md"
              disabled={pending || todayTaken}
              onClick={async () => {
                const m = planMove({ from: date, to: today, fromKey: plan.key, toKey: week.resolve(today).key, today });
                if (await apply({ writes: m.writes, message: describeMove(m, names, today) })) close();
              }}
            >
              Do it today
            </Button>
          )}
          <Button variant="secondary" size="md" onClick={() => setView("move")}>
            Move it
          </Button>
        </div>
      )}
      {!active && (
        <div className="flex flex-col">
          {isToday && (
            <Button variant="ghost" size="md" block onClick={() => setView("move")}>
              Move it
            </Button>
          )}
          <Button variant="ghost" size="md" block onClick={() => setView("pick")}>
            Do a different workout
          </Button>
          <Button variant="ghost" size="md" block disabled={pending} onClick={() => setKey("rest")}>
            Make {isToday ? "today" : dayName(date)} a rest day
          </Button>
          {plan.overridden && !frozen && (
            <Button variant="ghost" size="md" block disabled={pending} onClick={async () => (await resetToPlan()) && close()}>
              Back to the usual plan
            </Button>
          )}
        </div>
      )}
      {past && !active && <Caption className="mt-0 text-center">&ldquo;Log it&rdquo; opens a workout dated {dayCaption(date)} so you can enter what you did.</Caption>}
    </div>
  );
}

/** A finished workout's lifts: name, sets and the best set, then "See workout". */
function DoneSession({ session }: { session: Session }) {
  const q = useSessionDetail(session.id);
  const { unit } = useUnits();
  const rows = useMemo(() => {
    const by = new Map<string, { name: string; sets: number; best: { w: number | null; r: number | null } | null }>();
    for (const x of q.data?.sets ?? []) {
      if (x.kind === "warmup" || !x.completed) continue;
      const k = x.exercise_slug ?? x.exercise_name ?? "";
      const cur = by.get(k) ?? { name: x.exercise_name ?? k, sets: 0, best: null };
      cur.sets++;
      const w = x.weight_lb == null ? null : Number(x.weight_lb);
      if (!cur.best || (w ?? 0) > (cur.best.w ?? 0) || ((w ?? 0) === (cur.best.w ?? 0) && (x.reps ?? 0) > (cur.best.r ?? 0))) cur.best = { w, r: x.reps };
      by.set(k, cur);
    }
    return [...by.values()];
  }, [q.data]);
  const min = session.duration_sec ? `${Math.max(1, Math.round(session.duration_sec / 60))} min` : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="t-label">{["Done", min, plural(session.sets_completed, "set")].filter(Boolean).join(" · ")}</p>
      {q.isLoading ? (
        <Skeleton className="h-[168px] rounded-tile-lg" />
      ) : (
        rows.length > 0 && (
          <ListGroup>
            {rows.map((r) => (
              <Row
                key={r.name}
                title={r.name}
                dataName
                history
                subtitle={plural(r.sets, "set")}
                value={r.best ? (r.best.w ? `${formatLoad(r.best.w, unit, false)} × ${r.best.r ?? "—"}` : `${r.best.r ?? "—"} reps`) : "—"}
              />
            ))}
          </ListGroup>
        )
      )}
      <Button variant="secondary" size="lg" block asChild>
        <Link href={`/workout/${session.id}`}>See workout</Link>
      </Button>
    </div>
  );
}

/** "Train anyway" / "Do a different workout": the active program's days, then rest. */
function PickView({ week, current, pending, onPick, back }: { week: Week; current: string; pending: boolean; onPick: (key: string) => void; back: () => void }) {
  const [picked, setPicked] = useState(current);
  return (
    <div className="flex flex-col gap-4 pb-2">
      <p className="t-body text-fg-2">Pick a workout for this day. Your usual week stays the same.</p>
      <RadioGroup ariaLabel="Workout">
        {week.templates.map((t) => {
          const c = plannedCounts(t, week.mode);
          return <RadioRow key={t.key} title={t.name} subtitle={`${plural(c.lifts, "lift")} · ${plural(c.sets, "set")}`} checked={picked === t.key} onSelect={() => setPicked(t.key)} />;
        })}
        <RadioRow title="Rest" checked={picked === "rest"} onSelect={() => setPicked("rest")} />
      </RadioGroup>
      <Button variant="primary" size="lg" block loading={pending} disabled={picked === current} onClick={() => onPick(picked)}>
        {picked === "rest" ? "Make it a rest day" : `Use ${templateLabels(week.templates.find((t) => t.key === picked) ?? { key: picked, name: picked }).short}`}
      </Button>
      <Button variant="ghost" size="md" block onClick={back}>
        Back
      </Button>
    </div>
  );
}

/** "Move it": the next days to move this workout to, each saying what happens to that day. */
function MoveView({
  date,
  fromKey,
  closed,
  week,
  names,
  back,
  pending,
  onDone,
  apply,
}: {
  date: ISODate;
  fromKey: string;
  closed: boolean;
  week: Week;
  names: Record<string, string>;
  back: () => void;
  pending: boolean;
  onDone: () => void;
  apply: ReturnType<typeof useDayPlanWrites>["apply"];
}) {
  const { today } = week;
  const todayTaken = week.sessions.some((s) => s.local_date === today && (s.status === "done" || s.status === "active"));
  const options = rescheduleOptions({ from: date, fromKey, today, plans: week.planLikes, closed }).filter((o) => !(todayTaken && o.date === today));
  const [picked, setPicked] = useState<RescheduleOption | null>(null);
  const move = picked ? planMove({ from: date, to: picked.date, fromKey, toKey: picked.key, today, closed }) : null;
  const label = (o: RescheduleOption) => (o.date === today ? "Today" : o.date === addDays(today, 1) ? "Tomorrow" : dayName(o.date));
  return (
    <div className="flex flex-col gap-4 pb-2">
      <p className="t-body text-fg-2">Move {names[fromKey] ?? "this workout"} to another day. Only this week changes.</p>
      {options.length ? (
        <RadioGroup ariaLabel="New day">
          {options.map((o) => (
            <RadioRow
              key={o.date}
              title={`${label(o)} · ${parseISODate(o.date).getDate()} ${monthName(o.date, true)}`}
              subtitle={o.key === "rest" ? "Rest day, free" : o.kind === "swap" ? `${names[o.key] ?? o.name} · swap days` : `${names[o.key] ?? o.name} · replaced`}
              checked={picked?.date === o.date}
              onSelect={() => setPicked(o)}
            />
          ))}
        </RadioGroup>
      ) : (
        <p className="t-body text-fg-2">No free day in the next week.</p>
      )}
      {move && <p className="t-label px-1">{describeMove(move, names, today)}</p>}
      <Button
        variant="primary"
        size="lg"
        block
        loading={pending}
        disabled={!move}
        onClick={async () => {
          if (move && (await apply({ writes: move.writes, message: describeMove(move, names, today) }))) onDone();
        }}
      >
        Move {names[fromKey] ?? "it"}
      </Button>
      <Button variant="ghost" size="md" block onClick={back}>
        Back
      </Button>
    </div>
  );
}

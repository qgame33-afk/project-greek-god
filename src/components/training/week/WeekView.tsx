"use client";

import Link from "next/link";
import { ChartLine, ChevronRight, Dumbbell, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/controls";
import { DayStrip, type StripDay } from "@/components/ui/day-strip";
import { ListGroup, ListItem, Row, SectionHead } from "@/components/ui/list";
import { ErrorNote } from "@/components/ui/misc";
import { PageHeader } from "@/components/shell/PageHeader";
import { addDays, dayName, type ISODate } from "@/lib/dates";
import { useStartWorkout } from "@/lib/data/workout";
import { estimateDurationMin, programOfKey, SUNDAY_RECOVERY, templateLabels } from "@/lib/training/programs";
import { modeTemplate } from "@/lib/training/volume";
import { aboutMin, plural, spokenName } from "../format";
import { MODE_LABEL, useAllPREvents, useTypicalDurations, useWeekVolume, type useTrainingWeek } from "../hooks";
import { NewPlanNotice, useNewPlanNotice } from "../NewPlanNotice";
import { OptionsToday, useTodayOptionsFor } from "../OptionsToday";
import { LiftRows } from "../LiftRows";
import { RestIdeasList } from "../RestIdeas";
import { LightWeekSheet, SuggestionRowFor, SwapCarrySheet, useTrainSuggestion, type TrainSuggestion } from "./Suggestion";
import { WeekSkeleton } from "./WeekSkeleton";

type Week = ReturnType<typeof useTrainingWeek>;

/**
 * Train (docs/DESIGN-V3-SIMPLE.md §4.3.1, `train`; rest day §4.3.3, `train-sunday`): the title and
 * "Program" pill, the week strip with each day's `abbr`, the hero with the gold Start workout,
 * at most one suggestion, today's lifts with their targets, and two rows (Sets by muscle, Lifts
 * and history). Everything comes from PROGRAM's interface; no name is typed here.
 */
export function WeekView({ week, onDay, go }: { week: Week; onDay: (d: ISODate) => void; go: (href: string) => void }) {
  const opts = useTodayOptionsFor(week);
  const volume = useWeekVolume(week);
  const suggestion = useTrainSuggestion(week, volume.suggestions);
  const notice = useNewPlanNotice();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sheet, setSheet] = useState<TrainSuggestion["kind"] | null>(null);
  // the one-time notice opens by itself on the first visit after the publication (§4.3.8)
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [seenNotice, setSeenNotice] = useState(false);
  if (notice.show && notice.fresh && !seenNotice) {
    setSeenNotice(true);
    setNoticeOpen(true);
  }

  const header = <PageHeader title="Train" accessory={<Pill onClick={() => go("/training?tab=program")}>Program</Pill>} />;

  if (week.error && !week.sessions.length) {
    return (
      <>
        {header}
        <ErrorNote onRetry={week.refetch} className="mt-4">
          Couldn&apos;t load this week.
        </ErrorNote>
      </>
    );
  }
  if (!week.weekReady) {
    return (
      <>
        {header}
        <WeekSkeleton />
      </>
    );
  }

  const openSuggestion = () => {
    if (!suggestion) return;
    if (suggestion.kind === "missed") return onDay(suggestion.date);
    if (suggestion.kind === "volume") return go("/training?tab=volume");
    if (suggestion.kind === "notice") return setNoticeOpen(true);
    setSheet(suggestion.kind);
  };
  const plan = week.resolve(week.today);

  return (
    <>
      {header}
      <Strip week={week} onDay={onDay} />
      <div className="mt-4 flex flex-col gap-3">
        {plan.template ? <Hero week={week} options={opts.summary} onOptions={() => setOptionsOpen(true)} /> : <RestHero week={week} />}
        {suggestion && <SuggestionRowFor s={suggestion} onOpen={openSuggestion} />}
      </div>

      {plan.template ? <TodayLifts week={week} /> : <RestDay week={week} onDay={onDay} />}

      <ListGroup className="mt-7">
        <Row icon={ChartLine} title="Sets by muscle" subtitle="This week" onClick={() => go("/training?tab=volume")} />
        <Row icon={RotateCcw} title="Lifts and history" onClick={() => go("/training?tab=lifts")} />
      </ListGroup>

      <OptionsToday open={optionsOpen} onOpenChange={setOptionsOpen} options={opts} />
      <NewPlanNotice open={noticeOpen && notice.show} onOpenChange={setNoticeOpen} />
      <LightWeekSheet
        s={suggestion && (suggestion.kind === "deload" || suggestion.kind === "lighter" || suggestion.kind === "standard" || suggestion.kind === "ease") ? suggestion : null}
        open={!!sheet && sheet !== "swap"}
        onOpenChange={(o) => !o && setSheet(null)}
      />
      <SwapCarrySheet s={suggestion?.kind === "swap" ? suggestion : null} open={sheet === "swap"} onOpenChange={(o) => !o && setSheet(null)} />
    </>
  );
}

/* ----------------------------------------------------------------- strip */

function Strip({ week, onDay }: { week: Week; onDay: (d: ISODate) => void }) {
  const days: StripDay[] = week.days.map((d) => {
    const done = week.sessions.find((s) => s.local_date === d.date && s.status === "done");
    const plan = week.resolve(d.date);
    const t = d.kind === "rest" && !done ? null : plan.template;
    const label = done ? templateLabels({ key: done.template_key ?? "", name: done.name }).abbr : t ? templateLabels(t).abbr : "Rest";
    // a day of another program (before a switch) is spoken by its short label, never its old name
    const key = done ? (done.template_key ?? "") : (t?.key ?? "");
    const other = !!key && programOfKey(key) !== null && programOfKey(key) !== week.program;
    const name = other ? `${label} workout` : done ? done.name : t ? t.name : "Rest day";
    const state = done ? "win" : d.missed ? "missed" : "none";
    return {
      date: d.date,
      state,
      label,
      labelTone: done ? "on" : t ? "off" : "faint",
      spoken: `${spokenName(name)}, ${done ? "done" : d.missed ? "not done" : t ? "planned" : "rest"}`,
    };
  });
  return <DayStrip days={days} today={week.today} selected={week.today} onSelect={onDay} ariaLabel="This week" className="mt-2" />;
}

/* ------------------------------------------------------------------ hero */

function Hero({ week, options, onOptions }: { week: Week; options: string | null; onOptions: () => void }) {
  const { today } = week;
  const { start, starting, active } = useStartWorkout();
  const typical = useTypicalDurations();
  const prs = useAllPREvents();
  const t = week.resolve(today).template!;
  const eff = modeTemplate(t, week.mode);
  const setCount = eff.exercises.reduce((n, e) => n + e.sets, 0);
  const minutes = week.mode === "standard" && typical[t.key] ? typical[t.key] : estimateDurationMin(eff);
  const done = week.sessions.find((s) => s.local_date === today && s.status === "done");
  const caption = `Today · ${dayName(today)}`;

  if (active) {
    return (
      <section aria-labelledby="hero-h" className="rounded-card bg-surface px-[22px] pb-[22px] pt-6">
        <p className="t-label">{active.local_date === today ? caption : `In progress · ${dayName(active.local_date)}`}</p>
        <h2 id="hero-h" className="t-head mt-1.5" data-budget-name="">
          {active.name}
        </h2>
        <p className="t-label mt-2">In progress · your sets are saved as you go</p>
        <Button variant="primary" size="lg" block className="mt-5" asChild>
          <Link href={`/workout/${active.id}`} data-today-resume="">
            <Dumbbell aria-hidden strokeWidth={1.9} />
            Back to workout
          </Link>
        </Button>
      </section>
    );
  }

  if (done) {
    const bests = (prs.data ?? []).filter((p) => p.session_id === done.id).length;
    const min = done.duration_sec ? Math.max(1, Math.round(done.duration_sec / 60)) : null;
    return (
      <section aria-labelledby="hero-h" className="rounded-card bg-surface px-[22px] pb-[22px] pt-6">
        <p className="t-label">{caption}</p>
        <h2 id="hero-h" className="t-head mt-1.5" data-budget-name="">
          {done.name}
        </h2>
        <p className="t-label mt-2">{["Done", min ? `${min} min` : null, bests ? plural(bests, "new best") : null].filter(Boolean).join(" · ")}</p>
        <Button variant="secondary" size="lg" block className="mt-5" asChild>
          <Link href={`/workout/${done.id}`}>See workout</Link>
        </Button>
      </section>
    );
  }

  const stats = [plural(eff.exercises.length, "lift"), plural(setCount, "set"), aboutMin(minutes), week.mode !== "standard" ? MODE_LABEL[week.mode] : null].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby="hero-h" className="rounded-card bg-surface px-[22px] pb-[22px] pt-6">
      <p className="t-label">{caption}</p>
      <h2 id="hero-h" className="t-head mt-1.5" data-budget-name="">
        {t.name}
      </h2>
      <p className="t-label mt-2">{stats}</p>
      {options && (
        <button type="button" onClick={onOptions} aria-haspopup="dialog" className="press t-label hit-44 mt-1 inline-flex min-h-11 items-center gap-1 font-semibold text-fg">
          {options} · Options
          <ChevronRight className="size-4 text-fg-3" strokeWidth={2.2} aria-hidden />
        </button>
      )}
      <Button
        variant="primary"
        size="lg"
        block
        className={options ? "mt-3" : "mt-5"}
        loading={starting}
        onClick={() => start({ template: t, date: today, mode: week.mode })}
        aria-label={`Start workout. ${spokenName(t.name)}. ${stats.replace(/·/g, ",")}`}
      >
        <Dumbbell aria-hidden strokeWidth={1.9} />
        Start workout
      </Button>
    </section>
  );
}

/* --------------------------------------------------------- today's lifts */

function TodayLifts({ week }: { week: Week }) {
  const t = week.resolve(week.today).template!;
  return (
    <section aria-labelledby="lifts-h">
      <SectionHead id="lifts-h">Today&apos;s lifts</SectionHead>
      <LiftRows template={t} mode={week.mode} />
    </section>
  );
}

/* --------------------------------------------------------------- rest day */

function RestHero({ week }: { week: Week }) {
  const { active } = useStartWorkout();
  return (
    <section aria-labelledby="hero-h" className="rounded-card bg-surface px-[22px] pb-[22px] pt-6">
      <p className="t-label">Today · {dayName(week.today)}</p>
      <h2 id="hero-h" className="t-head mt-1.5" data-program-text="">
        {SUNDAY_RECOVERY.title}
      </h2>
      <p className="t-label mt-2">Nothing to lift today.</p>
      {active && (
        <Button variant="primary" size="lg" block className="mt-5" asChild>
          <Link href={`/workout/${active.id}`} data-today-resume="">
            <Dumbbell aria-hidden strokeWidth={1.9} />
            Back to workout
          </Link>
        </Button>
      )}
    </section>
  );
}

function RestDay({ week, onDay }: { week: Week; onDay: (d: ISODate) => void }) {
  const next = week.resolved.find((p) => p.date > week.today && p.template);
  const tomorrow = addDays(week.today, 1);
  const nt = next?.template ? modeTemplate(next.template, week.mode) : null;
  return (
    <>
      <section aria-labelledby="ideas-h">
        <SectionHead id="ideas-h">If you feel like it</SectionHead>
        <RestIdeasList />
      </section>
      {next && nt && (
        <section aria-labelledby="next-h">
          <SectionHead id="next-h">{next.date === tomorrow ? "Tomorrow" : "Next workout"}</SectionHead>
          <ListItem
            tile={Dumbbell}
            title={next.template!.name}
            subtitle={`${dayName(next.date)} · ${plural(nt.exercises.length, "lift")} · ${plural(nt.exercises.reduce((n, e) => n + e.sets, 0), "set")}`}
            onClick={() => onDay(next.date)}
            dataName
          />
        </section>
      )}
    </>
  );
}

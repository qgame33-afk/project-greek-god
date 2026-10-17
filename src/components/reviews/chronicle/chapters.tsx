"use client";

import type { ReactNode } from "react";
import { LaurelSprig } from "@/components/art/icons";
import { Statue } from "@/components/art/Statue";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { parseISODate, type ISODate } from "@/lib/dates";
import type { Terrace } from "@/lib/progress/pace";
import { dayMonth } from "@/lib/progress/pace";
import type { BookTitle, Credit } from "@/lib/reviews/chronicle";
import type { Priority, ReviewStats } from "@/lib/reviews/compute";
import { formatInt, formatLoad, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { MiniMountain } from "./MiniMountain";

export interface ChronicleData {
  stats: ReviewStats;
  priorities: Priority[];
  unit: WeightUnit;
  today: ISODate;
  title: BookTitle;
  current: boolean;
  gild: number;
  credits: Credit[];
  change: { value: string | null; range: string | null; earlyWater: boolean };
  series: { date: ISODate; lb: number }[];
  weighIns: { date: ISODate; lb: number }[];
  terraces: Terrace[];
  reached: Terrace[];
  followed: { done: number; due: number } | null;
  ritesDone: number | null;
  plan: { month: ISODate; end: ISODate; lb: number } | null;
}

export const CHAPTERS = ["Title", "Strength", "The mountain", "Fuel and rites", "Next month"] as const;

const spoken = (d: ISODate) => parseISODate(d).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
const w1 = (lb: number, unit: WeightUnit) => round(toDisplayWeight(lb, unit), 1).toFixed(1);
const e1 = (lb: number, unit: WeightUnit) => String(Math.round(toDisplayWeight(lb, unit)));

/** The chapter's eyebrow: "II · Strength". */
function Head({ n, children, title }: { n: number; children?: ReactNode; title: string }) {
  return (
    <header className="mb-6">
      <p className="t-eyebrow text-leaf-300">
        {["I", "II", "III", "IV", "V"][n]} · {CHAPTERS[n]}
      </p>
      <h2 className="t-title-1 mt-2 text-ivory">{title}</h2>
      {children}
    </header>
  );
}

/* ----------------------------------------------------------------- I. Title */

export function TitleChapter({ d }: { d: ChronicleData }) {
  const month = d.title.film.charAt(0) + d.title.film.slice(1).toLowerCase();
  return (
    <div className="flex min-h-full flex-col items-center justify-center text-center">
      <div className="relative w-full">
        <div className="mx-auto" style={{ width: "min(86%, 22rem, 44svh)" }}>
          <Statue p={d.gild} fromP={0} mode="chronicle" label={`Your statue as it stood at the end of ${month}: gilded to ${Math.round(d.gild * 100)} percent of the climb.`} />
        </div>
        {/* the bust fades into the night so the title can sit over its base */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-obsidian to-transparent" />
      </div>
      <div className="relative -mt-6 w-full">
        <p className="t-eyebrow tracking-[0.4em] text-leaf-300">{d.title.book}</p>
        <h1 className="t-film mt-2 text-ivory" style={{ fontSize: "clamp(2rem, 11vw, 3rem)", letterSpacing: "0.2em" }}>
          {d.title.film}
        </h1>
        <p className="t-verdict mt-2 text-stone">{d.title.subtitle}.</p>
      </div>
      <dl className="mt-8 grid w-full grid-cols-3 divide-x divide-vein-2 @max-[24rem]:grid-cols-1 @max-[24rem]:divide-x-0 @max-[24rem]:divide-y">
        {d.credits.map((c) => (
          <div key={c.label} className="px-2 @max-[24rem]:py-2.5" aria-label={c.spoken}>
            <dt className="sr-only">{c.label}</dt>
            <dd aria-hidden className="t-num-l tnum text-ivory">
              {c.value}
            </dd>
            <dd aria-hidden className="t-eyebrow mt-1.5 text-stone">
              {c.label}
            </dd>
          </div>
        ))}
      </dl>
      {d.current && <p className="t-meta mt-5 text-stone">This Book is still being written. Its numbers run to today.</p>}
    </div>
  );
}

/* -------------------------------------------------------------- II. Strength */

export function StrengthChapter({ d }: { d: ChronicleData }) {
  const prs = [...d.stats.training.prs.items].sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0) || b.e1rm - a.e1rm).slice(0, 5);
  const lifts = d.stats.training.lifts.filter((l) => l.main);
  const n = d.stats.training.prs.items.length;
  return (
    <div>
      <Head n={1} title={n ? `${n === 1 ? "One record" : `${n} records`} gilded` : "No new records"}>
        {!n && <p className="t-callout mt-2 text-stone">A record is a set that beats every one before it. The first session of a lift is its benchmark.</p>}
      </Head>
      {prs.length > 0 && (
        <ul className="divide-y divide-vein border-y border-vein">
          {prs.map((p, i) => (
            <li
              key={p.slug + p.date + i}
              className="flex min-h-16 items-center gap-3.5 py-2.5"
              aria-label={`${p.name}: ${p.weight != null ? `${formatLoad(p.weight, d.unit, false)} by ${p.reps}` : `${p.reps} reps`}, ${spoken(p.date)}, estimated one-rep max ${e1(p.e1rm, d.unit)}`}
            >
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--leaf-line)]">
                <LaurelSprig className="size-5 text-leaf-300" strokeWidth={1.5} />
              </span>
              <span aria-hidden className="min-w-0 flex-1">
                <span className="t-title-3 block truncate text-ivory">{p.name}</span>
                <span className="t-meta tnum block text-stone">
                  {p.weight != null ? `${formatLoad(p.weight, d.unit, false)} × ${p.reps}` : `${p.reps} reps`} · {dayMonth(p.date, d.today)}
                  {p.gain != null ? ` · +${e1(p.gain, d.unit)}` : ""}
                </span>
              </span>
              <span aria-hidden className="shrink-0 text-right">
                <span className="t-num-m tnum block text-ivory">{e1(p.e1rm, d.unit)}</span>
                <span className="t-tag block text-stone">e1RM</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {lifts.length > 0 && (
        <div className="mt-8">
          <p className="t-eyebrow mb-1 flex items-center gap-2">
            The main lifts · e1RM <Tag kind="CALC" />
          </p>
          <ul className="divide-y divide-vein border-y border-vein">
            {lifts.map((l) => (
              <li key={l.slug} className="flex min-h-12 items-center justify-between gap-3 py-2" aria-label={`${l.name}: ${e1(l.startE1rm, d.unit)} to ${e1(l.endE1rm, d.unit)}`}>
                <span aria-hidden className="t-callout min-w-0 truncate text-ivory">
                  {l.name}
                </span>
                <span aria-hidden className="t-callout tnum shrink-0 text-stone">
                  {e1(l.startE1rm, d.unit)} → <span className="font-semibold text-ivory">{e1(l.endE1rm, d.unit)}</span>
                  <span className={cn("ml-2", l.change > 0 ? "text-leaf-300" : "text-stone")}>
                    {l.change > 0 ? "+" : l.change < 0 ? "−" : ""}
                    {e1(Math.abs(l.change), d.unit)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- III. The mountain */

export function MountainChapter({ d }: { d: ChronicleData }) {
  const { from, to } = d.stats.window;
  return (
    <div>
      <Head
        n={2}
        title={d.reached.length ? (d.reached.length > 1 ? `Terraces ${d.reached[0].numeral} to ${d.reached.at(-1)!.numeral}` : `Terrace ${d.reached[0].numeral}`) : "The month on the mountain"}
      />
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className={cn("tnum leading-none text-ivory", d.change.value ? "t-monument" : "t-dial text-stone")}>{d.change.value ? d.change.value.replace(` ${d.unit}`, "") : "—"}</span>
        {d.change.value && <span className="t-title-2 mb-2 text-stone">{d.unit}</span>}
      </div>
      <p className="t-callout mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-stone">
        <span>{d.change.value ? `Trend ${d.change.value}${d.change.range ? ` (${d.change.range})` : ""}` : "Needs weigh-ins a week apart to show a change."}</span>
        {d.change.value && <Tag kind="CALC" explain="The 7-day trend at the month's last weigh-in minus the trend at its first. A change over the month, not a weekly rate." />}
      </p>
      {d.change.earlyWater && <p className="t-meta mt-2 text-stone">Includes early water and glycogen. The weekly pace uses the last 4 weeks.</p>}
      {d.series.length > 1 && (
        <figure className="mt-6">
          <MiniMountain from={from} to={to} series={d.series} weighIns={d.weighIns} terraces={d.terraces} unit={d.unit} />
          <figcaption className="sr-only">
            The 7-day trend from {w1(d.series[0].lb, d.unit)} on {spoken(d.series[0].date)} to {w1(d.series.at(-1)!.lb, d.unit)} on {spoken(d.series.at(-1)!.date)}.
          </figcaption>
        </figure>
      )}
      {d.reached.length > 0 && (
        <ul className="mt-6 divide-y divide-vein border-y border-vein">
          {d.reached.map((t) => (
            <li key={t.index} className="flex min-h-12 items-center justify-between gap-3 py-2">
              <span className="t-title-3 text-ivory">
                <span className="font-voice text-leaf-300">Terrace {t.numeral}</span> · {w1(t.lb, d.unit)} {d.unit}
              </span>
              <span className="t-meta text-leaf-300">reached {dayMonth(t.reachedOn!, d.today)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------- IV. Fuel and rites */

export function FuelChapter({ d }: { d: ChronicleData }) {
  const n = d.stats.nutrition;
  const r = d.stats.recovery;
  const rows: { label: string; value: string; unit?: string; sub: string; tag?: ReactNode }[] = [
    {
      label: "Calories",
      value: n.avgCalories != null ? formatInt(n.avgCalories) : "—",
      unit: n.avgCalories != null ? "kcal" : undefined,
      sub: n.daysLogged ? `a day on ${n.daysLogged} logged days · target ${formatInt(n.calorieTarget)}` : "No food logged",
      tag: n.avgCalories != null ? <Tag kind="CALC" /> : undefined,
    },
    {
      label: "Protein",
      value: n.avgProtein != null ? formatInt(n.avgProtein) : "—",
      unit: n.avgProtein != null ? "g" : undefined,
      sub: n.daysLogged ? `a day · target ${n.proteinTarget} g · hit on ${n.proteinHitDays} days` : "No food logged",
      tag: n.avgProtein != null ? <Tag kind="CALC" /> : undefined,
    },
    {
      label: "Plan followed",
      value: d.followed && d.followed.due ? `${d.followed.done} of ${d.followed.due}` : "—",
      sub: d.followed && d.followed.due ? "planned meals eaten as planned" : "No planned meals were due",
      tag: d.followed && d.followed.due ? <Tag kind="CALC" explain="Planned meals with a logged food entry ÷ planned meals that were due." /> : undefined,
    },
    {
      label: "Sleep",
      value: r.avgSleep != null ? r.avgSleep.toFixed(1) : "—",
      unit: r.avgSleep != null ? "h" : undefined,
      sub: r.sleepNights ? `a night over ${r.sleepNights} nights · goal ${r.sleepGoal} h` : "No sleep logged",
    },
    {
      label: "Rites",
      value: d.ritesDone != null && d.ritesDone > 0 ? String(d.ritesDone) : "—",
      sub: d.ritesDone ? "marked done" : "None marked done",
    },
  ];
  return (
    <div>
      <Head n={3} title="What fed the climb" />
      <dl className="divide-y divide-vein border-y border-vein">
        {rows.map((x) => (
          <div key={x.label} className="flex min-h-16 items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <dt className="t-eyebrow flex items-center gap-2">
                {x.label} {x.tag}
              </dt>
              <dd className="t-meta mt-1 text-stone">{x.sub}</dd>
            </div>
            <dd className="shrink-0 text-right">
              <span className={cn("t-num-m tnum", x.value === "—" ? "text-stone" : "text-ivory")}>{x.value}</span>
              {x.unit && <span className="t-meta ml-1 text-stone">{x.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ------------------------------------------------------- V. Next month's line */

export function NextChapter({ d }: { d: ChronicleData }) {
  const next = d.plan ? parseISODate(d.plan.month).toLocaleDateString("en-GB", { month: "long" }) : null;
  return (
    <div>
      <Head n={4} title={next ? `${next}'s line` : "The next line"}>
        <p className="t-callout mt-2 text-stone">From your recorded numbers. Suggestions only; nothing changes until you confirm it.</p>
      </Head>
      {d.priorities.length ? (
        <ol className="grid gap-6">
          {d.priorities.map((p, i) => (
            <li key={p.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
              <span aria-hidden className="t-title-2 font-voice text-leaf-300">
                {["I", "II", "III"][i]}
              </span>
              <div className="min-w-0">
                <p className="t-title-3 text-ivory">{p.title}</p>
                <p className="t-callout mt-1 text-stone">{p.detail}</p>
                {p.evidence.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Evidence">
                    {p.evidence.map((e) => (
                      <li key={e} className="t-meta tnum rounded-tag px-2 py-0.5 text-stone shadow-[inset_0_0_0_1px_var(--vein-3)]">
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="t-callout text-stone">Not enough logged yet for a line. Log weigh-ins, food and sessions for two weeks and it appears here.</p>
      )}
      {d.plan && (
        <p className="t-callout mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-vein pt-4 text-stone">
          <Tag kind="PLAN" />
          <span>
            <span className="tnum font-semibold text-ivory">
              {w1(d.plan.lb, d.unit)} {d.unit}
            </span>{" "}
            by {dayMonth(d.plan.end, d.today)}: the straight line from your start to your goal, not a prediction.
          </span>
        </p>
      )}
    </div>
  );
}

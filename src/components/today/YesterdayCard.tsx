"use client";

import Link from "next/link";
import { Check, ChevronRight, Clock, Dumbbell, Moon, Sunrise, Volleyball } from "lucide-react";
import type { ReactNode } from "react";
import { LaurelBullet } from "@/components/art/Motifs";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { dayName, formatMinutes, shortDate } from "@/lib/dates";
import { STREAK_THRESHOLD } from "@/lib/habits";
import { fmtHours } from "@/lib/today/daily-line";
import { weighInCaption, type YesterdayRecap } from "@/lib/today/yesterday";
import { formatBodyweight, formatDelta, formatInt, toDisplayWeight, type WeightUnit } from "@/lib/units";
import type { TodayModel } from "./useTodayModel";

const VB_KIND: Record<string, string> = { practice: "Practice", game: "Game", tournament: "Tournament", open_gym: "Open gym" };

/**
 * Yesterday, in one glance: the training it held, then a ledger of fuel, water, weigh-in,
 * sleep and missions — each read from what was logged, each linking to where it lives.
 * Missing values are "—"; a goal met turns its caption gold; nothing is marked as a miss.
 */
export function YesterdayCard({ m, loading, error, onRetry, className }: { m: TodayModel; loading: boolean; error?: Error | null; onRetry?: () => void; className?: string }) {
  const y = m.yesterday;
  const unit = (m.profile.weight_unit ?? "lb") as WeightUnit;
  const heading = (
    <h2 className="eyebrow">
      Yesterday · <span className="text-fg-2">{`${dayName(y.date)}, ${shortDate(y.date, m.today)}`}</span>
    </h2>
  );

  if (y.beforeStart) {
    return (
      <section aria-label="Yesterday" className={cn("card-instrument p-4 sm:p-5", className)}>
        {heading}
        <div className="mt-3 flex items-center gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-s3 text-fg-2">
            <Sunrise className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-fg">Your first recap lands tomorrow.</p>
            <p className="mt-0.5 text-[13px] font-medium leading-snug text-fg-2">Each morning this card shows the day before: training, food, water, weigh-in, sleep and missions, from what you log.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Yesterday" className={cn("card-instrument @container p-4 sm:p-5", className)}>
      <div className="mb-3 flex min-h-6 items-center justify-between gap-3">{heading}</div>
      {error && (
        <ErrorNote className="mb-3" onRetry={onRetry}>
          Couldn&apos;t load yesterday&apos;s logs.
        </ErrorNote>
      )}
      <div className="grid grid-cols-1 gap-3 @[860px]:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] @[860px]:gap-4">
        {loading && (y.training.kind === "rest" || y.training.kind === "unlogged") ? (
          // volleyball and PRs may still be loading: don't flash "Rest day" before they land
          <Skeleton className="h-[72px] rounded-[14px]" />
        ) : (
          <TrainingRow y={y} unit={unit} />
        )}
        <Ledger y={y} unit={unit} today={m.today} loading={loading} />
      </div>
      {!loading && !error && y.logged === 0 && (
        <p className="mt-3 text-[13px] font-medium leading-snug text-fg-3">Nothing logged yesterday. Log as you go today and tomorrow&apos;s recap fills itself.</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- training */

function TrainingRow({ y, unit }: { y: YesterdayRecap; unit: WeightUnit }) {
  const t = y.training;
  const dayHref = `/training?day=${y.date}`;
  const vb = y.volleyball;
  const vbMinutes = vb?.minutes ? `${vb.minutes} min` : null;
  const vbLine = vb ? [vb.kind ? (VB_KIND[vb.kind] ?? null) : null, vbMinutes].filter(Boolean).join(" · ") : "";

  let icon: ReactNode;
  let title: string;
  let detail: string;
  let href = dayHref;
  let quiet = false;
  const extras: ReactNode[] = [];

  switch (t.kind) {
    case "done": {
      icon = (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success-tint text-success">
          <Check className="size-5" strokeWidth={2.5} aria-hidden />
        </span>
      );
      title = t.name;
      const bits = [
        t.sets > 0 ? `${t.sets} ${t.sets === 1 ? "set" : "sets"}` : null,
        t.volumeLb > 0 ? `${formatInt(toDisplayWeight(t.volumeLb, unit))} ${unit}` : null,
        t.minutes ? formatMinutes(t.minutes) : null,
      ].filter(Boolean);
      detail = bits.length ? bits.join(" · ") : "Session saved";
      if (t.sessionId) href = `/workout/${t.sessionId}`;
      if (t.prs > 0)
        extras.push(
          <span key="pr" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-gold-300">
            <LaurelBullet size={12} className="shrink-0" />
            {t.prs} {t.prs === 1 ? "PR" : "PRs"}
          </span>,
        );
      if (vb)
        extras.push(
          <span key="vb" className="inline-flex min-w-0 items-center gap-1.5 text-fg-2">
            <span className="size-1.5 shrink-0 rounded-full bg-lapis" aria-hidden />
            <span className="truncate">Volleyball{vbMinutes ? ` · ${vbMinutes}` : ""}</span>
          </span>,
        );
      break;
    }
    case "open":
      icon = (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-s3 text-fg-2">
          <Clock className="size-5" aria-hidden />
        </span>
      );
      title = t.name;
      detail = "Still open · finish or discard it";
      href = `/workout/${t.sessionId}`;
      break;
    case "volleyball":
      icon = (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lapis-tint text-lapis">
          <Volleyball className="size-5" aria-hidden />
        </span>
      );
      title = "Volleyball";
      detail = vbLine || "Logged";
      break;
    case "rest":
      icon = (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-s3 text-fg-2">
          <Moon className="size-5" aria-hidden />
        </span>
      );
      title = "Rest day";
      detail = "Planned recovery";
      break;
    case "unlogged":
      icon = (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-s3 text-fg-3">
          <Dumbbell className="size-5" aria-hidden />
        </span>
      );
      title = t.planned;
      detail = "Planned · no session logged";
      quiet = true;
      break;
  }

  const label = [`Yesterday's training: ${title}`, detail, ...(t.kind === "done" && t.prs > 0 ? [`${t.prs} ${t.prs === 1 ? "personal record" : "personal records"}`] : []), ...(t.kind === "done" && vb ? [`volleyball${vbMinutes ? ` ${vbMinutes}` : ""}`] : [])].join(", ");

  return (
    <Link
      href={href}
      aria-label={`${label}. ${t.kind === "done" && t.sessionId ? "View summary" : "Open the day"}`}
      className="press-soft group flex min-h-[72px] items-center gap-3.5 rounded-[14px] bg-s2 px-3.5 py-3 ring-1 ring-line-hair ring-inset transition-colors hover:bg-s3"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className={cn("t-h2 block truncate", quiet ? "text-fg-2" : "text-fg")}>{title}</span>
        <span className={cn("num-xs mt-1 block truncate", quiet ? "text-fg-3" : "text-fg-2")}>{detail}</span>
        {extras.length > 0 && <span className="mt-1 flex min-w-0 items-center gap-3 text-[12.5px] font-semibold">{extras}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/* --------------------------------------------------------------- ledger */

interface Cell {
  key: string;
  label: string;
  value: string | null;
  unit?: string;
  caption: string;
  met?: boolean;
  href: string;
  spoken: string;
}

function Ledger({ y, unit, today, loading }: { y: YesterdayRecap; unit: WeightUnit; today: string; loading: boolean }) {
  const d = y.date;
  const c = y.calories;
  const p = y.protein;
  const w = y.water;
  const s = y.sleep;
  const bw = y.weight;
  const mi = y.missions;
  const litres = (ml: number) => (ml / 1000).toFixed(1);

  const cells: Cell[] = [
    {
      key: "kcal",
      label: "Calories",
      value: c.value != null ? formatInt(c.value) : null,
      caption: c.value != null ? `of ${formatInt(c.goal)}` : "Not logged",
      met: c.met,
      href: `/nutrition?date=${d}`,
      spoken: c.value != null ? `${formatInt(c.value)} of ${formatInt(c.goal)} kilocalories` : "not logged",
    },
    {
      key: "protein",
      label: "Protein",
      value: p.value != null ? formatInt(p.value) : null,
      unit: "g",
      caption: p.value != null ? `of ${formatInt(p.goal)} g` : "Not logged",
      met: p.met,
      href: `/nutrition?date=${d}`,
      spoken: p.value != null ? `${formatInt(p.value)} of ${formatInt(p.goal)} grams` : "not logged",
    },
    {
      key: "water",
      label: "Water",
      value: w.value != null ? litres(w.value) : null,
      unit: "L",
      caption: w.value != null ? `of ${litres(w.goal)} L` : "Not logged",
      met: w.met,
      href: `/nutrition?date=${d}`,
      spoken: w.value != null ? `${litres(w.value)} of ${litres(w.goal)} litres` : "not logged",
    },
    {
      key: "weight",
      label: "Weigh-in",
      value: bw.lb != null ? formatBodyweight(bw.lb, unit, false) : null,
      unit,
      caption: bw.lb == null ? "No weigh-in" : bw.deltaLb != null && bw.prevDate ? weighInCaption(bw.deltaLb, bw.prevDate, d, unit, today) : "First weigh-in",
      href: "/progress?tab=weight",
      spoken:
        bw.lb == null
          ? "no weigh-in"
          : `${formatBodyweight(bw.lb, unit)}${bw.deltaLb != null && bw.prevDate ? `, ${formatDelta(bw.deltaLb, unit)} since ${shortDate(bw.prevDate, today)}` : ""}`,
    },
    {
      key: "sleep",
      label: "Sleep",
      value: s.value != null ? fmtHours(s.value) : null,
      unit: "h",
      caption: s.value != null ? `goal ${fmtHours(s.goal)} h` : "No check-in",
      met: s.met,
      href: `/recovery?date=${d}`,
      spoken: s.value != null ? `${fmtHours(s.value)} hours, goal ${fmtHours(s.goal)}` : "no check-in",
    },
    {
      key: "missions",
      label: "Missions",
      value: mi ? String(mi.done) : null,
      unit: mi ? `/ ${mi.total}` : undefined,
      // a day at 60%+ counted toward the streak — said plainly, never the reverse
      caption: mi ? (mi.complete ? "All complete" : mi.done / mi.total >= STREAK_THRESHOLD ? "Streak day" : "Review day") : "None set",
      met: mi?.complete,
      href: `/recovery?date=${d}`,
      spoken: mi ? `${mi.done} of ${mi.total} completed` : "none set",
    },
  ];

  return (
    <ul className="grid grid-cols-3 gap-px overflow-hidden rounded-[14px] bg-line-hair ring-1 ring-line-hair ring-inset @[620px]:grid-cols-6">
      {cells.map((x) => (
        <li key={x.key} className="min-w-0 bg-s1">
          {loading && x.value == null ? (
            <div className="px-3 py-3" aria-hidden>
              <Skeleton className="h-3 w-12" />
              <Skeleton className="mt-2.5 h-6 w-14" />
              <Skeleton className="mt-2 h-3 w-10" />
            </div>
          ) : (
            <Link
              href={x.href}
              aria-label={`Yesterday's ${x.label.toLowerCase()}: ${x.spoken}${x.met ? ", goal met" : ""}`}
              className="press-soft flex h-full min-h-[84px] flex-col px-3 py-3 transition-colors hover:bg-white/[.03]"
            >
              <span className="eyebrow truncate !tracking-[0.14em]">{x.label}</span>
              <span className={cn("num-md mt-1.5 truncate", x.value == null ? "text-fg-3" : "text-fg")}>
                {x.value ?? "—"}
                {x.value != null && x.unit && <span className="unit">{x.unit}</span>}
              </span>
              <span className={cn("mt-1 flex min-w-0 items-center gap-1 text-[12px] font-semibold leading-snug", x.met ? "text-gold-300" : "text-fg-3")}>
                {x.met && <Check className="size-3.5 shrink-0" strokeWidth={2.75} aria-hidden />}
                <span className="truncate">{x.caption}</span>
              </span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

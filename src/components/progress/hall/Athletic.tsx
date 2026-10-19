"use client";

import { Plus } from "lucide-react";
import { LaurelSprig, Volleyball } from "@/components/art/icons";
import { RecordMark } from "@/components/ui/record-mark";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import type { AthleticTest } from "@/lib/data/body";
import { parseISODate, type ISODate } from "@/lib/dates";
import { feetInches, touchHeight, type TestType } from "@/lib/progress/athletic";
import { fmtLen } from "@/lib/progress/measurements";
import { testLine, type TestLine } from "@/lib/progress/hall";
import { dayMonth } from "@/lib/progress/pace";
import { formatLoad, round, toDisplayLength, toDisplayWeight, type LengthUnit, type WeightUnit } from "@/lib/units";
import { HistoryChart } from "../charts/HistoryChart";
import { Sparkline, signed } from "../kit";

/** The tests in the order a volleyball player reads them: the approach jump first. */
const ROWS: TestType[] = ["standing_vertical", "broad_jump", "sprint", "standing_reach"];
const spoken = (d: ISODate) =>
  parseISODate(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });

export function valueText(v: number, type: TestType, unit: LengthUnit) {
  return type === "sprint" ? { value: v.toFixed(2), unit: "s" } : { value: fmtLen(v, unit), unit };
}
function changeText(l: TestLine, unit: LengthUnit) {
  if (l.change == null) return null;
  return l.type === "sprint" ? `${signed(l.change, 2)} s` : `${signed(toDisplayLength(l.change, unit), unit === "cm" ? 1 : 2)} ${unit}`;
}
const unitWord = (u: string) => (u === "in" ? "inches" : u === "cm" ? "centimetres" : "seconds");

/**
 * Athletic, first-class (docs/DESIGN-V2.md §3.6.2): the approach jump as the hero (it is the
 * number volleyball is played on), then standing vertical, broad jump, sprint and reach, each
 * with its trend and a 44 px + to log it, then squat to bodyweight and volleyball frequency.
 * Logged results only; nothing is projected.
 */
export function Athletic({
  tests,
  lu,
  wu,
  today,
  loading,
  squat,
  volleyball,
  onLog,
  onOpen,
}: {
  tests: AthleticTest[];
  lu: LengthUnit;
  wu: WeightUnit;
  today: ISODate;
  loading: boolean;
  squat: {
    ratio: number | null;
    e1rm: number | null;
    bodyweight: number | null;
  };
  volleyball: {
    perWeek: number;
    total: number;
    weeks: { start: ISODate; count: number }[];
    target: number | null;
    loading: boolean;
  };
  onLog: (type?: TestType) => void;
  onOpen: (type: TestType) => void;
}) {
  const approach = testLine(tests, "approach_vertical");
  const reach = testLine(tests, "standing_reach");
  const touch = touchHeight(reach.latest ? Number(reach.latest.value) : null, approach.best ? Number(approach.best.value) : null);

  return (
    <div className="grid grid-cols-1 gap-6">
      {loading ? (
        <div className="skeleton h-44 rounded-card" aria-hidden />
      ) : (
        <ApproachHero line={approach} touch={touch} lu={lu} today={today} onLog={() => onLog("approach_vertical")} onOpen={() => onOpen("approach_vertical")} />
      )}

      <ul className="divide-y divide-vein border-y border-vein">
        {ROWS.map((t) => (
          <TestRowView key={t} line={testLine(tests, t)} lu={lu} today={today} loading={loading} onLog={() => onLog(t)} onOpen={() => onOpen(t)} />
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-4 @max-[19rem]:grid-cols-1">
        <div className="min-w-0">
          <p className="t-eyebrow flex items-center gap-1.5">Squat ÷ bodyweight</p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="t-num-m tnum text-ivory">{squat.ratio != null ? squat.ratio.toFixed(2) : "—"}</span>
            {squat.ratio != null && <span className="t-meta text-stone">× BW</span>}
            {squat.ratio != null && (
              <Tag
                kind="CALC"
                className="ml-0.5"
                explain={`Back squat best e1RM ${Math.round(toDisplayWeight(squat.e1rm!, wu))} ${wu} ÷ 7-day trend ${formatLoad(round(squat.bodyweight!, 1), wu)}.`}
              />
            )}
          </p>
          <p className="t-meta mt-0.5 text-stone">{squat.ratio != null ? "Best e1RM ÷ trend weight" : squat.e1rm == null ? "Log a back squat set of 1–12 reps" : "Needs a weigh-in"}</p>
        </div>
        <div className="min-w-0">
          <p className="t-eyebrow flex items-center gap-1.5">
            <Volleyball className="size-3.5 text-stone" strokeWidth={1.6} /> Volleyball
          </p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="t-num-m tnum text-ivory">{volleyball.loading ? "—" : volleyball.perWeek.toFixed(1)}</span>
            {!volleyball.loading && <span className="t-meta text-stone">a week</span>}
          </p>
          <div className="mt-1 flex items-end gap-3">
            <p className="t-meta min-w-0 flex-1 text-stone">
              {volleyball.total} in 4 weeks
              {volleyball.target != null ? ` · plan ${volleyball.target}` : ""}
            </p>
            <span className="flex h-6 w-14 shrink-0 items-end gap-1" role="img" aria-label={`Volleyball sessions per week, oldest first: ${volleyball.weeks.map((w) => w.count).join(", ")}`}>
              {volleyball.weeks.map((w) => (
                <span
                  key={w.start}
                  className={cn("flex-1 rounded-xs", w.count ? "bg-stone" : "bg-ui-line")}
                  style={{
                    height: `${w.count ? Math.max(5, (w.count / Math.max(3, ...volleyball.weeks.map((x) => x.count))) * 24) : 2}px`,
                  }}
                />
              ))}
            </span>
          </div>
        </div>
      </div>

      <p className="t-meta text-stone">Test fresh: same time, surface and shoes, after a full warm-up and before lifting. Best of three. No projections: these are your logged results.</p>
    </div>
  );
}

function ApproachHero({ line, touch, lu, today, onLog, onOpen }: { line: TestLine; touch: number | null; lu: LengthUnit; today: ISODate; onLog: () => void; onOpen: () => void }) {
  const v = line.latest ? valueText(Number(line.latest.value), "approach_vertical", lu) : null;
  const delta = changeText(line, lu);
  const best = line.best && line.latest && line.best.id !== line.latest.id ? valueText(Number(line.best.value), "approach_vertical", lu) : null;
  const touchText = touch != null ? (lu === "in" ? feetInches(touch) : `${fmtLen(touch, lu)} cm`) : null;
  const words = v
    ? `Approach vertical ${v.value} ${unitWord(v.unit)}, ${spoken(line.latest!.local_date)}${line.latestIsRecord ? ", a record" : ""}${delta ? `, ${delta} since ${spoken(line.first!.local_date)}` : ""}. Open history`
    : "Approach vertical: not tested yet";
  return (
    <div className="relative">
      <div className="relative flex items-start justify-between gap-3">
        <button type="button" onClick={v ? onOpen : onLog} className="press-soft min-w-0 flex-1 text-left" aria-label={v ? words : "Approach vertical: not tested yet. Log your first approach jump"}>
          <span className="t-eyebrow block">Approach vertical</span>
          <span aria-hidden className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={cn("t-dial tnum", v ? "text-ivory" : "text-stone")}>{v ? v.value : "—"}</span>
            {v && <span className="t-callout text-stone">{v.unit}</span>}
            {line.latestIsRecord && <RecordMark className="self-center" />}
          </span>
          <span aria-hidden className="t-meta tnum mt-1 block text-stone">
            {v
              ? [delta ? `${delta} since ${dayMonth(line.first!.local_date, today)}` : `First benchmark · ${dayMonth(line.latest!.local_date, today)}`, best ? `best ${best.value}` : null]
                  .filter(Boolean)
                  .join(" · ")
              : "Your normal 3–4 step approach, best of three"}
          </span>
        </button>
        <button
          type="button"
          onClick={onLog}
          className="press mt-5 grid size-11 shrink-0 place-items-center rounded-full text-stone shadow-[inset_0_0_0_1px_var(--ui-line)] hover:text-ivory"
          aria-label="Log an approach jump"
        >
          <Plus className="size-4" strokeWidth={1.8} />
        </button>
      </div>
      {line.series.length > 1 && (
        <div className="relative mt-2">
          <HistoryChart
            readout="scrub"
            height={132}
            decimals={lu === "cm" ? 1 : 1}
            points={line.series.map((r) => ({
              date: r.local_date,
              value: round(toDisplayLength(Number(r.value), lu), 2),
              pr: line.recordIds.has(r.id),
            }))}
            format={(x) => `${x.toFixed(lu === "cm" ? 1 : 2).replace(/0$/, "")} ${lu}`}
          />
          <p className="sr-only">Approach jumps, oldest first: {line.series.map((r) => `${valueText(Number(r.value), "approach_vertical", lu).value} on ${spoken(r.local_date)}`).join(", ")}</p>
        </div>
      )}
      <p className="t-meta relative mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-stone">
        <span className="font-semibold text-ivory">Touch {touchText ?? "—"}</span>
        {touchText && <Tag kind="CALC" explain="Standing reach + best approach vertical." />}
        <span>{touchText ? "reach + best approach" : !line.best ? "· log an approach jump" : "· log standing reach to see it"}</span>
      </p>
    </div>
  );
}

function TestRowView({ line, lu, today, loading, onLog, onOpen }: { line: TestLine; lu: LengthUnit; today: ISODate; loading: boolean; onLog: () => void; onOpen: () => void }) {
  const v = line.latest ? valueText(Number(line.latest.value), line.type, lu) : null;
  const delta = changeText(line, lu);
  const label = line.type === "sprint" && line.distance != null ? `Sprint · ${line.distance} m` : line.label;
  const meta = !v
    ? loading
      ? " "
      : "Not tested yet"
    : delta
      ? `${delta} since ${dayMonth(line.first!.local_date, today)}`
      : line.type === "standing_reach"
        ? `Reference · ${dayMonth(line.latest!.local_date, today)}`
        : `First benchmark · ${dayMonth(line.latest!.local_date, today)}`;
  const words = v ? `${label}: ${v.value} ${unitWord(v.unit)}${line.latestIsRecord ? ", a record" : ""}, ${meta}. Open history` : `${label}: not tested yet. Log it`;
  return (
    <li className="flex items-center gap-1">
      <button type="button" onClick={v ? onOpen : onLog} className="press-soft flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 text-left" aria-label={words}>
        <span aria-hidden className="min-w-0 flex-1">
          <span className={cn("t-title-3 block truncate @max-[19rem]:whitespace-normal", v ? "text-ivory" : "text-stone")}>{label}</span>
          <span className={cn("t-meta tnum flex min-w-0 items-center gap-1.5", line.improved ? "text-leaf-300" : "text-stone")}>
            <span className="truncate @max-[19rem]:whitespace-normal">{meta}</span>
            {line.latestIsRecord && <LaurelSprig className="size-3.5 shrink-0 text-leaf-300" strokeWidth={1.5} />}
          </span>
        </span>
        {line.series.length > 1 && <Sparkline values={line.series.map((r) => Number(r.value) * (line.type === "sprint" ? -1 : 1))} width={44} height={22} className="@max-[19rem]:hidden" />}
        <span aria-hidden className="shrink-0 text-right">
          <span className={cn("t-num-s tnum", v ? "text-ivory" : "text-stone")}>{v ? v.value : "—"}</span>
          {v && <span className="t-meta ml-1 text-stone">{v.unit}</span>}
          {v && line.type === "broad_jump" && lu === "in" && <span className="t-meta block text-stone">{feetInches(Number(line.latest!.value))}</span>}
        </span>
      </button>
      <button
        type="button"
        onClick={onLog}
        className="press grid size-11 shrink-0 place-items-center rounded-full text-stone shadow-[inset_0_0_0_1px_var(--ui-line)] hover:text-ivory"
        aria-label={`Log ${line.label.toLowerCase()}`}
      >
        <Plus className="size-4" strokeWidth={1.8} />
      </button>
    </li>
  );
}

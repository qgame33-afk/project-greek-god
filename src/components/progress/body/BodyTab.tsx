"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyArt } from "@/components/art/Motifs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { Select } from "@/components/ui/field";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useMeasurements, type Measurement } from "@/lib/data/body";
import { useProfile, useSaveProfile } from "@/lib/data/profile";
import { addMonths, monthLabel, monthName, shortDate, type ISODate } from "@/lib/dates";
import { toDisplayLength, type LengthUnit } from "@/lib/units";
import { cn } from "@/lib/cn";
import { BODY_FAT, MEASURE_BY_KEY, MEASURE_FIELDS, fieldSeries, fieldSummary, fmtLen, type MeasureKey } from "@/lib/progress/measurements";
import { compareMonths, measurementMonths } from "@/lib/progress/months";
import { dateToT } from "@/lib/progress/weightSeries";
import { useMeasurementWrite } from "@/lib/progress/hooks";
import { useProgressActions } from "../context";
import { ChartFrame, ChartSkeleton, RowMenu, SectionHead, Sparkline, SrTable, StatTile, signed } from "../kit";

const TrendChart = dynamic(() => import("../charts/TrendChart"), { ssr: false, loading: () => <ChartSkeleton /> });

type FieldKey = MeasureKey | "body_fat_pct";

export function BodyTab() {
  const today = useToday();
  const { profile } = useProfile();
  const saveProfile = useSaveProfile();
  const unit = (profile?.length_unit ?? "in") as LengthUnit;
  const q = useMeasurements();
  const qc = useQueryClient();
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const actions = useProgressActions();
  const [detail, setDetail] = useState<FieldKey | null>(null);

  if (q.error) return <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["measurements"] })}>Couldn&apos;t load measurements. {(q.error as Error).message}</ErrorNote>;

  const fat = fieldSummary(rows, "body_fat_pct");

  return (
    <div className="grid grid-cols-1 gap-4 lg:gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="eyebrow">Measurements</h2>
          <p className="mt-1 truncate text-[13px] text-fg-2">
            {rows.length ? `${rows.length} ${rows.length === 1 ? "entry" : "entries"} · latest ${shortDate(rows.at(-1)!.local_date, today)}` : "Tape measurements, dated."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Segmented
            size="md"
            ariaLabel="Length unit"
            value={unit}
            onChange={(v) => {
              if (v !== unit) saveProfile.mutate({ values: { length_unit: v } });
            }}
            options={[
              { value: "in", label: "in" },
              { value: "cm", label: "cm" },
            ]}
            className="w-[96px]"
          />
          <Button variant="secondary" className="h-11 px-4" onClick={() => actions.logMeasurements()}>
            Log
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {MEASURE_FIELDS.map((f) => (
            <Skeleton key={f.key} className="h-[118px] rounded-[16px]" />
          ))}
        </div>
      ) : !rows.length ? (
        <Empty
            art={<EmptyArt kind="column" size={56} />}
            title="No measurements yet"
            action={
              <Button variant="secondary" onClick={() => actions.logMeasurements()}>
                Log measurements
              </Button>
            }
          >
            Measure once a month, same time of day, relaxed and before training. Your first entry becomes the baseline.
          </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {MEASURE_FIELDS.map((f) => (
              <MeasureTile key={f.key} rows={rows} field={f.key} unit={unit} today={today} onOpen={() => setDetail(f.key)} />
            ))}
          </div>
          {fat.count > 0 && (
            <button type="button" onClick={() => setDetail("body_fat_pct")} className="card-instrument press-soft flex items-center justify-between gap-4 p-4 text-left hover:border-line-strong">
              <StatTile
                label="Body fat · estimate"
                value={fat.latest != null ? fat.latest.toFixed(1) : "—"}
                unit="%"
                delta={fat.change != null ? `${signed(fat.change, 1)} since ${shortDate(fat.firstDate!, today)}` : undefined}
                caption={fat.latestDate ? shortDate(fat.latestDate, today) : undefined}
                size="sm"
              />
              <Sparkline values={fieldSeries(rows, "body_fat_pct").map((p) => p.value)} tone="marble" width={88} height={28} />
            </button>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
            <MonthCompare rows={rows} unit={unit} />
            <EntryList rows={rows} unit={unit} />
          </div>
        </>
      )}

      <p className="text-[12px] leading-relaxed text-fg-3">Measure the same spot each time with the tape snug, not tight. Biceps flexed at the peak; everything else relaxed.</p>

      <FieldDetail field={detail} rows={rows} unit={unit} onClose={() => setDetail(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ tile */

function MeasureTile({ rows, field, unit, today, onOpen }: { rows: Measurement[]; field: MeasureKey; unit: LengthUnit; today: ISODate; onOpen: () => void }) {
  const f = MEASURE_BY_KEY[field];
  const s = fieldSummary(rows, field);
  const series = fieldSeries(rows, field).map((p) => toDisplayLength(p.value, unit));
  const good = s.change != null && f.growthGood && s.change > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-instrument press-soft relative flex min-h-[118px] min-w-0 flex-col justify-between p-3.5 text-left transition-colors hover:border-line-strong lg:p-4"
      aria-label={`${f.long}: ${s.latest != null ? `${fmtLen(s.latest, unit)} ${unit}` : "not measured"}. Open history`}
    >
      <p className="eyebrow truncate">{f.label}</p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="num-md whitespace-nowrap">
          {fmtLen(s.latest, unit)}
          {s.latest != null && <span className="unit">{unit}</span>}
        </p>
        <Sparkline values={series} tone={f.growthGood ? "gold" : "marble"} width={48} height={22} className="mb-0.5" />
      </div>
      <p className={cn("mt-1 truncate text-[12px] font-semibold", good ? "text-success" : "text-fg-2")}>
        {s.change != null ? `${signed(toDisplayLength(s.change, unit), unit === "cm" ? 1 : 2)} since ${shortDate(s.firstDate!, today)}` : s.latest != null ? "Baseline" : "Not measured yet"}
      </p>
    </button>
  );
}

/* ---------------------------------------------------------- detail sheet */

function FieldDetail({ field, rows, unit, onClose }: { field: FieldKey | null; rows: Measurement[]; unit: LengthUnit; onClose: () => void }) {
  const today = useToday();
  const actions = useProgressActions();
  // keep the last field rendered while the sheet animates closed
  const [last, setLast] = useState<FieldKey | null>(field);
  if (field && field !== last) setLast(field);
  const key = field ?? last;
  if (!key) return null;
  const isFat = key === "body_fat_pct";
  const label = isFat ? BODY_FAT.label : MEASURE_BY_KEY[key].long;
  const u = isFat ? "%" : unit;
  const conv = (v: number) => (isFat ? v : toDisplayLength(v, unit));
  const dp = isFat ? 1 : unit === "cm" ? 1 : 2;
  const series = fieldSeries(rows, key);
  const s = fieldSummary(rows, key);
  const points = series.map((p) => ({ date: p.date, t: dateToT(p.date), value: Math.round(conv(p.value) * 100) / 100 }));
  const good = !isFat && s.change != null && MEASURE_BY_KEY[key].growthGood && s.change > 0;
  const byDate = new Map(rows.map((r) => [r.local_date, r]));

  return (
    <Sheet open={!!field} onOpenChange={(o) => !o && onClose()} title={label} description={isFat ? "An estimate. The trend matters more than the number." : undefined} wide>
      <div className="pb-2 pt-1">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{s.latestDate ? `Latest · ${shortDate(s.latestDate, today)}` : "Latest"}</p>
            <p className="mt-2">
              <span className="num-xl">{s.latest != null ? conv(s.latest).toFixed(dp) : "—"}</span>
              <span className="unit !text-[18px]">{u}</span>
            </p>
          </div>
          {s.change != null && (
            <div className="text-right">
              <p className="eyebrow">Since {shortDate(s.firstDate!, today)}</p>
              <p className={cn("num-md mt-2", good ? "text-success" : "text-fg")}>
                {signed(conv(s.change), dp)}
                <span className="unit">{u}</span>
              </p>
            </div>
          )}
        </div>

        <div className="mt-5">
          {points.length >= 2 ? (
            <ChartFrame tall={false}>
              <TrendChart points={points} format={(v) => `${v.toFixed(dp)} ${u}`} decimals={isFat ? 1 : unit === "cm" ? 0 : 1} />
            </ChartFrame>
          ) : (
            <p className="card-inset p-4 text-[13px] text-fg-2">One entry so far. Measure again next month to see the trend.</p>
          )}
          <SrTable caption={`${label} history`} head={["Date", `Value (${u})`]} rows={series.slice(-7).reverse().map((p) => [shortDate(p.date, today), conv(p.value).toFixed(dp)])} />
        </div>

        <SectionHead title="History" className="mb-1 mt-5" />
        <ul>
          {[...series].reverse().map((p, i, arr) => {
            const prev = arr[i + 1];
            const row = byDate.get(p.date);
            return (
              <li key={p.date} className={cn("border-line-hair", i > 0 && "border-t")}>
                <button
                  type="button"
                  className="press-soft flex min-h-[52px] w-full items-center justify-between gap-3 text-left"
                  onClick={() => {
                    onClose();
                    if (row) window.setTimeout(() => actions.logMeasurements(row), 220);
                  }}
                  aria-label={`${shortDate(p.date, today)}, ${conv(p.value).toFixed(dp)} ${u}. Edit entry`}
                >
                  <span className="text-[15px] font-semibold text-fg">{shortDate(p.date, today)}</span>
                  <span className="flex items-baseline gap-3">
                    <span className="num text-[13px] text-fg-3">{prev ? signed(conv(p.value - prev.value), dp) : "First"}</span>
                    <span className="num-sm">
                      {conv(p.value).toFixed(dp)}
                      <span className="unit">{u}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------- month compare */

function MonthCompare({ rows, unit }: { rows: Measurement[]; unit: LengthUnit }) {
  const months = measurementMonths(rows); // newest first
  const [a, setA] = useState<ISODate | null>(null);
  const [b, setB] = useState<ISODate | null>(null);
  const from = a && months.includes(a) ? a : (months.at(-1) ?? null);
  const to = b && months.includes(b) ? b : (months[0] ?? null);
  if (!from || !to) return null;
  const fields: FieldKey[] = [...MEASURE_FIELDS.map((f) => f.key), "body_fat_pct"];
  const cmp = compareMonths(rows, from, to, fields).filter((r) => r.a || r.b);
  const fmt = (key: string, v: number) => (key === "body_fat_pct" ? `${v.toFixed(1)}%` : fmtLen(v, unit, true));
  const dp = unit === "cm" ? 1 : 2;
  const short = (m: ISODate) => `${monthLabel(m).slice(0, 3)} ’${m.slice(2, 4)}`;

  return (
    <Card>
      <SectionHead title="Compare months" className="mb-2 min-h-6" />
      {months.length < 2 ? (
        <p className="text-[13px] leading-relaxed text-fg-2">
          Comparison opens up once you have entries in two different months. Next tape check: early {monthLabel(addMonths(months[0], 1))}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="eyebrow mb-1.5 block">From</span>
              <Select value={from} onChange={(e) => setA(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthName(m, true)} {m.slice(0, 4)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="eyebrow mb-1.5 block">To</span>
              <Select value={to} onChange={(e) => setB(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthName(m, true)} {m.slice(0, 4)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <table className="mt-4 w-full text-left">
            <caption className="sr-only">
              Measurements in {unit}, {monthLabel(from)} compared with {monthLabel(to)}
            </caption>
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.14em] text-fg-3">
                <th scope="col" className="pb-2 font-bold">
                  Site
                </th>
                <th scope="col" className="pb-2 text-right font-bold">
                  {short(from)}
                </th>
                <th scope="col" className="pb-2 text-right font-bold">
                  {short(to)}
                </th>
                <th scope="col" className="pb-2 text-right font-bold">
                  Change
                </th>
              </tr>
            </thead>
            <tbody>
              {cmp.map((r) => {
                const f = r.field === "body_fat_pct" ? null : MEASURE_BY_KEY[r.field as MeasureKey];
                const good = !!f?.growthGood && r.diff != null && r.diff > 0;
                return (
                  <tr key={r.field} className="border-t border-line-hair">
                    <th scope="row" className="py-2.5 text-[14px] font-semibold text-fg">
                      {f?.label ?? "Body fat"}
                    </th>
                    <td className="num py-2.5 text-right text-[15px] text-fg-2">{r.a ? fmt(r.field, r.a.value) : "—"}</td>
                    <td className="num py-2.5 text-right text-[15px] text-fg">{r.b ? fmt(r.field, r.b.value) : "—"}</td>
                    <td className={cn("num py-2.5 text-right text-[15px] font-semibold", good ? "text-success" : "text-fg-2")}>
                      {r.diff == null ? "—" : r.field === "body_fat_pct" ? signed(r.diff, 1) : signed(toDisplayLength(r.diff, unit), dp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-fg-3">Latest entry in each month, in {unit === "in" ? "inches" : "centimetres"}.</p>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ entry list */

function EntryList({ rows, unit }: { rows: Measurement[]; unit: LengthUnit }) {
  const today = useToday();
  const actions = useProgressActions();
  const { del } = useMeasurementWrite();
  const desc = [...rows].sort((a, b) => b.local_date.localeCompare(a.local_date));
  return (
    <Card>
      <SectionHead title="Entries" className="mb-1" />
      <ul>
        {desc.map((r, i) => {
          const n = MEASURE_FIELDS.filter((f) => r[f.key] != null).length;
          const pending = r.id === "optimistic";
          return (
            <li key={r.id + r.local_date} className={cn("flex items-center border-line-hair", i > 0 && "border-t")}>
              <button type="button" disabled={pending} onClick={() => actions.logMeasurements(r)} className="press-soft flex min-h-[56px] min-w-0 flex-1 flex-col justify-center text-left">
                <span className="text-[15px] font-semibold text-fg">{shortDate(r.local_date, today)}</span>
                <span className="truncate text-[12px] font-medium text-fg-3">
                  {n} of 8 sites
                  {r.waist_in != null ? ` · waist ${fmtLen(Number(r.waist_in), unit)} ${unit}` : ""}
                  {r.body_fat_pct != null ? ` · ${Number(r.body_fat_pct).toFixed(1)}% fat` : ""}
                </span>
              </button>
              {!pending && <RowMenu label={`Entry ${shortDate(r.local_date, today)}`} onEdit={() => actions.logMeasurements(r)} onDelete={() => del(r)} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

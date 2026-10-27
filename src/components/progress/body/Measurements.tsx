"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, NotebookPen } from "lucide-react";
import { Select } from "@/components/ui/field";
import { ListGroup, Row, SectionHead } from "@/components/ui/list";
import { Collapse, Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useMeasurements, type Measurement } from "@/lib/data/body";
import { useProfile } from "@/lib/data/profile";
import { addMonths, monthLabel, monthName, type ISODate } from "@/lib/dates";
import { useMeasurementWrite } from "@/lib/progress/hooks";
import { BODY_FAT, MEASURE_BY_KEY, MEASURE_FIELDS, fieldSeries, fieldSummary, fmtLen, type MeasureKey } from "@/lib/progress/measurements";
import { compareMonths, measurementMonths } from "@/lib/progress/months";
import { dayMonth } from "@/lib/progress/pace";
import { toDisplayLength, type LengthUnit } from "@/lib/units";
import { HistoryChart } from "../charts/HistoryChart";
import { useProgressActions } from "../context";
import { RowMenu, SrTable, lengthWords, signed, unitsOf } from "../kit";

type FieldKey = MeasureKey | "body_fat_pct";

/**
 * Progress › Body › Measurements (docs/DESIGN-V3-SIMPLE.md §4.5.4): "Measurements" with "Add", then
 * each measured site with its latest value and the change since its first entry, each → its
 * history. "All entries" holds the dated entries (edit, delete) and the month comparison. Values
 * are stored in inches and shown in the profile's length unit.
 */
export function Measurements() {
  const today = useToday();
  const { profile } = useProfile();
  const unit = unitsOf(profile).lu;
  const q = useMeasurements();
  const qc = useQueryClient();
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const actions = useProgressActions();
  const [detail, setDetail] = useState<FieldKey | null>(null);
  const [entries, setEntries] = useState(false);

  const fields: FieldKey[] = [...MEASURE_FIELDS.map((f) => f.key), "body_fat_pct"];
  const measured = fields.filter((k) => fieldSummary(rows, k).count > 0);

  return (
    <section id="progress-measurements" aria-labelledby="measure-h" className="scroll-mt-24">
      <SectionHead
        id="measure-h"
        action={
          <button type="button" onClick={() => actions.logMeasurements()} aria-label="Add measurements" className="press t-label hit-44 font-semibold text-fg-2 hover:text-fg">
            Add
          </button>
        }
      >
        Measurements
      </SectionHead>
      {q.error ? (
        <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["measurements"] })}>Couldn&apos;t load your measurements.</ErrorNote>
      ) : q.isLoading ? (
        <Skeleton className="h-64 w-full rounded-tile-lg" />
      ) : !measured.length ? (
        <Empty title="No measurements yet">Once a month: arms, chest, waist and thighs, relaxed and before training. Tap Add.</Empty>
      ) : (
        <>
          <ListGroup ariaLabel="Measurements">
            {measured.map((k) => (
              <SiteRow key={k} rows={rows} field={k} unit={unit} today={today} onOpen={() => setDetail(k)} />
            ))}
          </ListGroup>
          <ListGroup className="mt-3">
            <Row icon={NotebookPen} title="All entries" value={String(rows.length)} onClick={() => setEntries(true)} />
          </ListGroup>
        </>
      )}

      <FieldSheet field={detail} rows={rows} unit={unit} onClose={() => setDetail(null)} />
      <EntriesSheet open={entries} onOpenChange={setEntries} rows={rows} unit={unit} />
    </section>
  );
}

const fieldLabel = (k: FieldKey) => (k === "body_fat_pct" ? BODY_FAT.label : MEASURE_BY_KEY[k].label);

function SiteRow({ rows, field, unit, today, onOpen }: { rows: Measurement[]; field: FieldKey; unit: LengthUnit; today: ISODate; onOpen: () => void }) {
  const isFat = field === "body_fat_pct";
  const s = fieldSummary(rows, field);
  const conv = (v: number) => (isFat ? v : toDisplayLength(v, unit));
  const dp = isFat ? 1 : unit === "cm" ? 1 : 2;
  const val = (v: number) => (isFat ? `${v.toFixed(1)}%` : `${fmtLen(v, unit)} ${unit}`);
  const change = s.change != null ? Math.round(conv(s.change) * 10 ** dp) / 10 ** dp : null;
  const since = s.firstDate ? monthName(s.firstDate, true) : "";
  const sub = change == null ? `First entry · ${dayMonth(s.latestDate!, today)}` : change === 0 ? `Same since ${since}` : `${signed(change, dp)}${isFat ? "%" : ""} since ${since}`;
  const spokenUnit = isFat ? "percent" : lengthWords(unit);
  return (
    <Row
      title={fieldLabel(field)}
      subtitle={sub}
      value={<span className="t-row text-fg">{val(s.latest!)}</span>}
      onClick={onOpen}
      ariaLabel={`${fieldLabel(field)}: ${isFat ? s.latest!.toFixed(1) : fmtLen(s.latest!, unit)} ${spokenUnit}${change == null ? ", first entry" : change === 0 ? `, same since ${since}` : `, ${signed(change, dp).replace("−", "minus ")} since ${since}`}. Opens its history`}
    />
  );
}

/* --------------------------------------------------------- history sheet */

function FieldSheet({ field, rows, unit, onClose }: { field: FieldKey | null; rows: Measurement[]; unit: LengthUnit; onClose: () => void }) {
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
  const points = series.map((p) => ({ date: p.date, value: Math.round(conv(p.value) * 100) / 100 }));
  const byDate = new Map(rows.map((r) => [r.local_date, r]));

  return (
    <Sheet open={!!field} onOpenChange={(o) => !o && onClose()} title={label} description={isFat ? "An estimate. The trend matters more than the number." : undefined} wide>
      <div className="grid gap-5 pb-2">
        <div className="flex items-end justify-between gap-4 rounded-tile-lg bg-surface px-4 py-3.5">
          <div>
            <p className="t-cap">{s.latestDate ? `Latest · ${dayMonth(s.latestDate, today)}` : "Latest"}</p>
            <p className="t-num mt-1 tabular-nums">
              {s.latest != null ? conv(s.latest).toFixed(dp) : "—"}
              <span className="unit">{u}</span>
            </p>
          </div>
          {s.change != null && (
            <div className="text-right">
              <p className="t-cap">Since {dayMonth(s.firstDate!, today)}</p>
              <p className="t-num-s mt-1 tabular-nums">
                {signed(conv(s.change), dp)}
                <span className="unit">{u}</span>
              </p>
            </div>
          )}
        </div>

        <div>
          {points.length >= 2 ? (
            <HistoryChart points={points} format={(v) => `${v.toFixed(dp)} ${u}`} decimals={dp} />
          ) : (
            <p className="t-label">One entry so far. Measure again next month to see the change.</p>
          )}
          <SrTable
            caption={`${label} history`}
            head={["Date", `Value (${u})`]}
            rows={[...series].reverse().map((p) => [dayMonth(p.date, today), conv(p.value).toFixed(dp)])}
          />
        </div>

        <ListGroup ariaLabel={`${label} entries`}>
          {[...series].reverse().map((p, i, arr) => {
            const prev = arr[i + 1];
            const row = byDate.get(p.date);
            return (
              <Row
                key={p.date}
                title={dayMonth(p.date, today)}
                subtitle={prev ? `${signed(conv(p.value - prev.value), dp)} from the one before` : "First entry"}
                value={<span className="t-row tabular-nums text-fg">{`${conv(p.value).toFixed(dp)} ${u}`}</span>}
                onClick={() => {
                  onClose();
                  if (row) window.setTimeout(() => actions.logMeasurements(row), 220);
                }}
                ariaLabel={`${dayMonth(p.date, today)}, ${conv(p.value).toFixed(dp)} ${isFat ? "percent" : lengthWords(unit)}. Edit entry`}
              />
            );
          })}
        </ListGroup>
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------- entries sheet */

function EntriesSheet({ open, onOpenChange, rows, unit }: { open: boolean; onOpenChange: (o: boolean) => void; rows: Measurement[]; unit: LengthUnit }) {
  const today = useToday();
  const actions = useProgressActions();
  const { del } = useMeasurementWrite();
  const [compare, setCompare] = useState(false);
  const desc = [...rows].sort((a, b) => b.local_date.localeCompare(a.local_date));
  const edit = (r: Measurement) => {
    onOpenChange(false);
    window.setTimeout(() => actions.logMeasurements(r), 220);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="All entries" wide>
      <div className="grid gap-2 pb-2">
        <div className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
          {desc.map((r) => {
            const n = MEASURE_FIELDS.filter((f) => r[f.key] != null).length;
            const pending = r.id === "optimistic";
            return (
              <div key={r.id + r.local_date} className="flex items-center pr-2">
                <button type="button" disabled={pending} onClick={() => edit(r)} className="press-soft flex min-h-[68px] min-w-0 flex-1 flex-col justify-center py-3 pl-4 text-left">
                  <span className="t-row">{dayMonth(r.local_date, today)}</span>
                  <span className="t-label mt-0.5 truncate">
                    {n} {n === 1 ? "site" : "sites"}
                    {r.body_fat_pct != null ? " · body fat" : ""}
                  </span>
                </button>
                {!pending && <RowMenu label={`Entry ${dayMonth(r.local_date, today)}`} onEdit={() => edit(r)} onDelete={() => del(r)} />}
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => setCompare(!compare)} aria-expanded={compare} aria-controls="measure-compare" className="press-soft mt-3 flex min-h-14 w-full items-center justify-between gap-3 rounded-tile-lg bg-surface px-4 text-left">
          <span className="t-row">Compare months</span>
          <ChevronDown className={cn("size-5 text-fg-3 transition-transform duration-(--dur-fast)", compare && "rotate-180")} strokeWidth={1.9} aria-hidden />
        </button>
        <Collapse open={compare} id="measure-compare">
          <div className="pt-3">
            <MonthCompare rows={rows} unit={unit} />
          </div>
        </Collapse>
      </div>
    </Sheet>
  );
}

function MonthCompare({ rows, unit }: { rows: Measurement[]; unit: LengthUnit }) {
  const months = measurementMonths(rows); // newest first
  const [a, setA] = useState<ISODate | null>(null);
  const [b, setB] = useState<ISODate | null>(null);
  const from = a && months.includes(a) ? a : (months.at(-1) ?? null);
  const to = b && months.includes(b) ? b : (months[0] ?? null);
  if (!from || !to) return null;
  if (months.length < 2) return <p className="t-label">Comparing opens up once you have entries in two different months. Next check: early {monthLabel(addMonths(months[0], 1))}.</p>;
  const fields: FieldKey[] = [...MEASURE_FIELDS.map((f) => f.key), "body_fat_pct"];
  const cmp = compareMonths(rows, from, to, fields).filter((r) => r.a || r.b);
  const fmt = (key: string, v: number) => (key === "body_fat_pct" ? `${v.toFixed(1)}%` : fmtLen(v, unit, true));
  const dp = unit === "cm" ? 1 : 2;
  const short = (m: ISODate) => `${monthName(m, true)} ${m.slice(2, 4)}`;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["From", from, setA],
            ["To", to, setB],
          ] as const
        ).map(([lbl, v, set]) => (
          <label key={lbl} className="block">
            <span className="t-label mb-1.5 block font-semibold">{lbl}</span>
            <Select value={v} onChange={(e) => set(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthName(m, true)} {m.slice(0, 4)}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>
      <table className="mt-4 w-full text-left">
        <caption className="sr-only">
          Measurements in {lengthWords(unit)}, {monthLabel(from)} compared with {monthLabel(to)}
        </caption>
        <thead>
          <tr className="t-cap">
            <th scope="col" className="pb-2 font-semibold">
              Site
            </th>
            <th scope="col" className="pb-2 text-right font-semibold">
              {short(from)}
            </th>
            <th scope="col" className="pb-2 text-right font-semibold">
              {short(to)}
            </th>
            <th scope="col" className="pb-2 text-right font-semibold">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {cmp.map((r) => (
            <tr key={r.field} className="border-t border-line">
              <th scope="row" className="t-label py-2.5 font-semibold text-fg">
                {fieldLabel(r.field as FieldKey)}
              </th>
              <td className="t-label py-2.5 text-right tabular-nums">{r.a ? fmt(r.field, r.a.value) : "—"}</td>
              <td className="t-label py-2.5 text-right tabular-nums text-fg">{r.b ? fmt(r.field, r.b.value) : "—"}</td>
              <td className="t-label py-2.5 text-right tabular-nums">{r.diff == null ? "—" : r.field === "body_fat_pct" ? signed(r.diff, 1) : signed(toDisplayLength(r.diff, unit), dp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="t-cap mt-2">The latest entry in each month, in {unit}.</p>
    </div>
  );
}

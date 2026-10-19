"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Select } from "@/components/ui/field";
import { Collapse, ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { isOffline, useToday } from "@/lib/data/core";
import { useMeasurements, type Measurement } from "@/lib/data/body";
import { useProfile, useSaveProfile } from "@/lib/data/profile";
import { addMonths, monthLabel, monthName, type ISODate } from "@/lib/dates";
import { useMeasurementWrite } from "@/lib/progress/hooks";
import { BODY_FAT, MEASURE_BY_KEY, MEASURE_FIELDS, fieldSeries, fieldSummary, fmtLen, type MeasureKey } from "@/lib/progress/measurements";
import { compareMonths, measurementMonths } from "@/lib/progress/months";
import { dayMonth } from "@/lib/progress/pace";
import { toDisplayLength, type LengthUnit } from "@/lib/units";
import { HistoryChart } from "../charts/HistoryChart";
import { useProgressActions } from "../context";
import { RowMenu, SectionTitle, Sparkline, SrTable, signed } from "../kit";

type FieldKey = MeasureKey | "body_fat_pct";

/**
 * Gallery → Measurements (docs/DESIGN-V2.md §3.6.3): each tape site first → latest with its
 * change (CALC), a sparkline and its history sheet; then month-to-month comparison and the dated
 * entries (edit / delete with Undo). + Add opens the existing measurement sheet.
 */
export function Measurements() {
  const today = useToday();
  const { profile } = useProfile();
  const saveProfile = useSaveProfile();
  const unit = (profile?.length_unit ?? "in") as LengthUnit;
  const q = useMeasurements();
  const qc = useQueryClient();
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const actions = useProgressActions();
  const [detail, setDetail] = useState<FieldKey | null>(null);
  const [open, setOpen] = useState<"compare" | "entries" | null>(null);
  const fat = fieldSummary(rows, "body_fat_pct");
  const latest = rows.at(-1)?.local_date ?? null;

  return (
    <section id="ascent-measurements" aria-labelledby="gallery-measure" className="@container min-w-0 scroll-mt-24">
      <SectionTitle
        id="gallery-measure"
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Tape · first → latest
            <Tag kind="CALC" explain="Change = your latest entry for a site minus your first." />
          </span>
        }
        title="Measurements"
      >
        <Button variant="secondary" size="sm" onClick={() => actions.logMeasurements()} className="shrink-0 px-3.5">
          <Plus className="size-4" strokeWidth={1.8} /> Add
        </Button>
      </SectionTitle>

      {q.error ? (
        <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["measurements"] })}>Couldn&apos;t load measurements. {(q.error as Error).message}</ErrorNote>
      ) : q.isLoading ? (
        <div className="grid gap-2" aria-busy="true" aria-label="Loading measurements">
          {MEASURE_FIELDS.slice(0, 5).map((f) => (
            <Skeleton key={f.key} className="h-14 w-full rounded-field" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="t-meta flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-stone">
              {latest ? (
                <>
                  <span>
                    Last measured {dayMonth(latest, today)} · {rows.length} {rows.length === 1 ? "entry" : "entries"}
                  </span>
                </>
              ) : (
                <span>Once a month, same time of day, relaxed and before training. Your first entry becomes the baseline.</span>
              )}
            </p>
            <Segmented
              size="sm"
              ariaLabel="Length unit"
              value={unit}
              onChange={(v) => {
                if (v === unit) return;
                if (isOffline()) return void toast.error("You're offline. The unit didn't change.", { description: "Try again when you're back online." });
                saveProfile.mutate({ values: { length_unit: v } });
              }}
              options={[
                { value: "in", label: "in" },
                { value: "cm", label: "cm" },
              ]}
              className="w-24 shrink-0"
            />
          </div>
          <ul className="divide-y divide-vein border-y border-vein">
            {MEASURE_FIELDS.map((f) => (
              <SiteRow key={f.key} rows={rows} field={f.key} unit={unit} today={today} onOpen={() => (rows.length ? setDetail(f.key) : actions.logMeasurements())} />
            ))}
            {fat.count > 0 && <SiteRow rows={rows} field="body_fat_pct" unit={unit} today={today} onOpen={() => setDetail("body_fat_pct")} />}
          </ul>

          {rows.length > 0 && (
            <div className="mt-2">
              <Disclosure label="Compare months" open={open === "compare"} onToggle={() => setOpen(open === "compare" ? null : "compare")} id="measure-compare">
                <MonthCompare rows={rows} unit={unit} />
              </Disclosure>
              <Disclosure label={`Entries · ${rows.length}`} open={open === "entries"} onToggle={() => setOpen(open === "entries" ? null : "entries")} id="measure-entries">
                <EntryList rows={rows} unit={unit} />
              </Disclosure>
            </div>
          )}
          <p className="t-meta mt-3 text-stone">Measure the same spot each time with the tape snug, not tight. Biceps flexed at the peak; everything else relaxed.</p>
        </>
      )}

      <FieldSheet field={detail} rows={rows} unit={unit} onClose={() => setDetail(null)} />
    </section>
  );
}

function Disclosure({ label, open, onToggle, id, children }: { label: string; open: boolean; onToggle: () => void; id: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-vein">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className="press flex min-h-12 w-full items-center justify-between gap-3 text-left">
        <span className="t-callout font-semibold text-ivory">{label}</span>
        <ChevronDown className={cn("size-4 text-ash transition-transform duration-(--dur-fast)", open && "rotate-180")} strokeWidth={1.6} aria-hidden />
      </button>
      <Collapse open={open} id={id} className="relative">
        <div className="pb-4">{children}</div>
      </Collapse>
    </div>
  );
}

/* ------------------------------------------------------------------ row */

function SiteRow({ rows, field, unit, today, onOpen }: { rows: Measurement[]; field: FieldKey; unit: LengthUnit; today: ISODate; onOpen: () => void }) {
  const isFat = field === "body_fat_pct";
  const f = isFat ? null : MEASURE_BY_KEY[field];
  const label = isFat ? "Body fat · estimate" : f!.label;
  const s = fieldSummary(rows, field);
  const u = isFat ? "%" : unit;
  const conv = (v: number) => (isFat ? v : toDisplayLength(v, unit));
  const dp = isFat ? 1 : unit === "cm" ? 1 : 2;
  const val = (v: number) => (isFat ? v.toFixed(1) : fmtLen(v, unit));
  const series = fieldSeries(rows, field).map((p) => conv(p.value));
  const good = !!f?.growthGood && s.change != null && s.change > 0;
  const changeText = s.change != null ? `${signed(conv(s.change), dp)} ${u}` : s.latest != null ? "baseline" : "";
  const words =
    s.latest == null
      ? `${label}: not measured yet. Add measurements`
      : `${isFat ? BODY_FAT.label : f!.long}: ${s.first != null && s.change != null ? `${val(s.first)} on ${dayMonth(s.firstDate!, today)} to ` : ""}${val(s.latest)} ${u === "in" ? "inches" : u === "cm" ? "centimetres" : "percent"}${s.change != null ? `, ${changeText}` : ""}. Open history`;
  return (
    <li>
      <button type="button" onClick={onOpen} className="press-soft flex min-h-14 w-full items-center gap-3 py-2 text-left" aria-label={words}>
        <span aria-hidden className="min-w-0 flex-1">
          <span className={cn("t-title-3 block truncate @max-[19rem]:whitespace-normal", s.latest != null ? "text-ivory" : "text-stone")}>{label}</span>
          <span className="t-meta tnum block truncate @max-[19rem]:whitespace-normal text-stone">
            {s.latest == null ? "Not measured yet" : s.first != null && s.change != null ? `${val(s.first)} → ${val(s.latest)}` : `${dayMonth(s.latestDate!, today)}`}
          </span>
        </span>
        {series.length > 1 && <Sparkline values={series} tone={good ? "leaf" : "ivory"} width={44} height={22} className="@max-[19rem]:hidden" />}
        <span aria-hidden className="shrink-0 text-right">
          <span className={cn("t-num-s tnum block", s.latest != null ? "text-ivory" : "text-stone")}>
            {s.latest != null ? val(s.latest) : "—"}
            {s.latest != null && <span className="t-meta ml-1 text-stone">{u}</span>}
          </span>
          {changeText && <span className={cn("t-meta tnum block", good ? "text-leaf-300" : "text-stone")}>{changeText}</span>}
        </span>
        <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
      </button>
    </li>
  );
}

/* --------------------------------------------------------- detail sheet */

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
  const points = series.map((p) => ({
    date: p.date,
    value: Math.round(conv(p.value) * 100) / 100,
  }));
  const good = !isFat && s.change != null && MEASURE_BY_KEY[key].growthGood && s.change > 0;
  const byDate = new Map(rows.map((r) => [r.local_date, r]));

  return (
    <Sheet open={!!field} onOpenChange={(o) => !o && onClose()} title={label} description={isFat ? "An estimate. The trend matters more than the number." : undefined} wide>
      <div className="grid grid-cols-1 gap-6 pb-2 pt-1">
        <div className="flex items-end justify-between gap-4 border-y border-vein py-4">
          <div>
            <p className="t-eyebrow">{s.latestDate ? `Latest · ${dayMonth(s.latestDate, today)}` : "Latest"}</p>
            <p className="mt-1.5 flex items-baseline gap-1.5">
              <span className="t-num-l tnum text-ivory">{s.latest != null ? conv(s.latest).toFixed(dp) : "—"}</span>
              <span className="t-callout text-stone">{u}</span>
            </p>
          </div>
          {s.change != null && (
            <div className="text-right">
              <p className="t-eyebrow">Since {dayMonth(s.firstDate!, today)}</p>
              <p className={cn("t-num-m tnum mt-1.5", good ? "text-leaf-300" : "text-ivory")}>
                {signed(conv(s.change), dp)}
                <span className="t-meta ml-1 text-stone">{u}</span>
              </p>
            </div>
          )}
        </div>

        <div>
          {points.length >= 2 ? (
            <HistoryChart points={points} format={(v) => `${v.toFixed(dp)} ${u}`} decimals={isFat ? 1 : unit === "cm" ? 1 : 2} />
          ) : (
            <p className="t-callout text-stone">One entry so far. Measure again next month to see the trend.</p>
          )}
          <SrTable
            caption={`${label} history`}
            head={["Date", `Value (${u})`]}
            rows={series
              .slice(-7)
              .reverse()
              .map((p) => [dayMonth(p.date, today), conv(p.value).toFixed(dp)])}
          />
        </div>

        <div>
          <h3 className="t-eyebrow mb-1">History</h3>
          <ul className="divide-y divide-vein border-y border-vein">
            {[...series].reverse().map((p, i, arr) => {
              const prev = arr[i + 1];
              const row = byDate.get(p.date);
              return (
                <li key={p.date}>
                  <button
                    type="button"
                    className="press-soft flex min-h-13 w-full items-center justify-between gap-3 text-left"
                    onClick={() => {
                      onClose();
                      if (row) window.setTimeout(() => actions.logMeasurements(row), 220);
                    }}
                    aria-label={`${dayMonth(p.date, today)}, ${conv(p.value).toFixed(dp)} ${u}. Edit entry`}
                  >
                    <span className="t-title-3 text-ivory">{dayMonth(p.date, today)}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="t-meta tnum text-stone">{prev ? signed(conv(p.value - prev.value), dp) : "First"}</span>
                      <span className="t-num-s tnum text-ivory">
                        {conv(p.value).toFixed(dp)}
                        <span className="t-meta ml-1 text-stone">{u}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
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

  if (months.length < 2)
    return <p className="t-callout text-stone">Comparison opens up once you have entries in two different months. Next tape check: early {monthLabel(addMonths(months[0], 1))}.</p>;
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
            <span className="t-eyebrow mb-1.5 block">{lbl}</span>
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
          Measurements in {unit}, {monthLabel(from)} compared with {monthLabel(to)}
        </caption>
        <thead>
          <tr className="t-eyebrow">
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
          {cmp.map((r) => {
            const f = r.field === "body_fat_pct" ? null : MEASURE_BY_KEY[r.field as MeasureKey];
            const good = !!f?.growthGood && r.diff != null && r.diff > 0;
            return (
              <tr key={r.field} className="border-t border-vein">
                <th scope="row" className="t-callout py-2.5 font-semibold text-ivory">
                  {f?.label ?? "Body fat"}
                </th>
                <td className="t-callout tnum py-2.5 text-right text-stone">{r.a ? fmt(r.field, r.a.value) : "—"}</td>
                <td className="t-callout tnum py-2.5 text-right text-ivory">{r.b ? fmt(r.field, r.b.value) : "—"}</td>
                <td className={cn("t-callout tnum py-2.5 text-right font-semibold", good ? "text-leaf-300" : "text-stone")}>
                  {r.diff == null ? "—" : r.field === "body_fat_pct" ? signed(r.diff, 1) : signed(toDisplayLength(r.diff, unit), dp)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="t-meta mt-2 text-stone">The latest entry in each month, in {unit === "in" ? "inches" : "centimetres"}.</p>
    </div>
  );
}

/* ------------------------------------------------------------ entry list */

function EntryList({ rows, unit }: { rows: Measurement[]; unit: LengthUnit }) {
  const today = useToday();
  const actions = useProgressActions();
  const { del } = useMeasurementWrite();
  const desc = [...rows].sort((a, b) => b.local_date.localeCompare(a.local_date));
  return (
    <ul className="divide-y divide-vein">
      {desc.map((r) => {
        const n = MEASURE_FIELDS.filter((f) => r[f.key] != null).length;
        const pending = r.id === "optimistic";
        return (
          <li key={r.id + r.local_date} className="flex items-center">
            <button type="button" disabled={pending} onClick={() => actions.logMeasurements(r)} className="press-soft flex min-h-14 min-w-0 flex-1 flex-col justify-center text-left">
              <span className="t-title-3 text-ivory">{dayMonth(r.local_date, today)}</span>
              <span className="t-meta truncate text-stone">
                {n} of {MEASURE_FIELDS.length} sites
                {r.waist_in != null ? ` · waist ${fmtLen(Number(r.waist_in), unit)} ${unit}` : ""}
                {r.body_fat_pct != null ? ` · ${Number(r.body_fat_pct).toFixed(1)}% fat` : ""}
              </span>
            </button>
            {!pending && <RowMenu label={`Entry ${dayMonth(r.local_date, today)}`} onEdit={() => actions.logMeasurements(r)} onDelete={() => del(r)} />}
          </li>
        );
      })}
    </ul>
  );
}

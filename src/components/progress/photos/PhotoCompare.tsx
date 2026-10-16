"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronDown, MoveHorizontal } from "lucide-react";
import { Chip, Segmented } from "@/components/ui/controls";
import { Select } from "@/components/ui/field";
import { Empty } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { EmptyArt } from "@/components/art/Motifs";
import { useToday } from "@/lib/data/core";
import { useMeasurements, useWeights, type ProgressPhoto } from "@/lib/data/body";
import { useProfile } from "@/lib/data/profile";
import { monthLabel, shortDate, type ISODate } from "@/lib/dates";
import { formatBodyweight, formatLength, type LengthUnit, type WeightUnit } from "@/lib/units";
import { cn } from "@/lib/cn";
import { MEASURE_BY_KEY, MEASURE_FIELDS, type MeasureKey } from "@/lib/progress/measurements";
import { monthUpper } from "@/lib/progress/months";
import { POSES, POSE_LABEL, clampPct, defaultComparePair, groupPhotosByMonth, nearestByDate } from "@/lib/progress/photos";

interface Urls {
  thumb: (p: ProgressPhoto) => string | null;
  full: (p: ProgressPhoto) => string | null;
}

/**
 * Side-by-side or wipe comparison of two dated photos, each over a museum placard with the
 * month, the weight on (or nearest) that date and an optional measurement.
 */
export function PhotoCompare({ photos, urls, seedId }: { photos: ProgressPhoto[]; urls: Urls; seedId: string | null }) {
  const [mode, setMode] = useState<"side" | "wipe">("side");
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);
  const [label, setLabel] = useState<MeasureKey | "none">("none");
  const [picking, setPicking] = useState<"a" | "b" | null>(null);

  // Seed from "Compare" in the viewer: that photo vs the earliest of the same pose.
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!seedId || seeded.current === seedId) return;
    seeded.current = seedId;
    const seed = photos.find((p) => p.id === seedId);
    if (!seed) return;
    const same = photos.filter((p) => p.pose === seed.pose && p.id !== seed.id).sort((x, y) => x.local_date.localeCompare(y.local_date));
    const other = same[0];
    const t = window.setTimeout(() => {
      if (other && other.local_date <= seed.local_date) {
        setAId(other.id);
        setBId(seed.id);
      } else {
        setAId(seed.id);
        setBId(other?.id ?? null);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [seedId, photos]);

  const pair = defaultComparePair(photos);
  const a = photos.find((p) => p.id === aId) ?? pair?.[0] ?? photos.at(-1) ?? null;
  const b = photos.find((p) => p.id === bId) ?? pair?.[1] ?? photos[0] ?? null;

  if (photos.length < 2 || !a || !b)
    return (
      <Empty art={<EmptyArt kind="frame" size={56} />} title="Two photos make a comparison">
        Take your next set in 2–4 weeks with the same pose, light and distance.
      </Empty>
    );

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-center gap-2">
        <Segmented
          ariaLabel="Compare mode"
          size="md"
          value={mode}
          onChange={setMode}
          options={[
            { value: "side", label: "Side by side" },
            { value: "wipe", label: "Wipe" },
          ]}
          className="min-w-0 flex-1 sm:max-w-[240px]"
        />
        <Select aria-label="Placard label" value={label} onChange={(e) => setLabel(e.target.value as MeasureKey | "none")} className="h-11 w-[138px] text-[14px] sm:w-[160px]">
          <option value="none">Weight only</option>
          {MEASURE_FIELDS.map((f) => (
            <option key={f.key} value={f.key}>
              + {f.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PickButton which="Before" photo={a} onClick={() => setPicking("a")} />
        <PickButton which="After" photo={b} onClick={() => setPicking("b")} />
      </div>

      {mode === "side" ? (
        <div className="mx-auto grid w-full max-w-[640px] grid-cols-2 gap-3 lg:gap-6">
          {[a, b].map((p, i) => (
            <figure key={`${p.id}-${i}`} className="min-w-0">
              <Frame photo={p} src={urls.full(p) ?? urls.thumb(p)} />
              <Placard photo={p} label={label} />
            </figure>
          ))}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[420px]">
          <Wipe a={a} b={b} srcA={urls.full(a) ?? urls.thumb(a)} srcB={urls.full(b) ?? urls.thumb(b)} />
          <div className="mt-0 grid grid-cols-2 gap-3">
            <Placard photo={a} label={label} />
            <Placard photo={b} label={label} />
          </div>
        </div>
      )}

      <PhotoPicker
        open={picking != null}
        onOpenChange={(o) => !o && setPicking(null)}
        photos={photos}
        urls={urls}
        selectedId={picking === "a" ? a.id : b.id}
        title={picking === "a" ? "Before photo" : "After photo"}
        onPick={(id) => {
          if (picking === "a") setAId(id);
          else setBId(id);
          setPicking(null);
        }}
      />
    </div>
  );
}

function PickButton({ which, photo, onClick }: { which: string; photo: ProgressPhoto; onClick: () => void }) {
  const today = useToday();
  return (
    <button type="button" onClick={onClick} className="card-inset press-soft flex min-h-[52px] items-center justify-between gap-2 px-3 py-2 text-left hover:bg-s4">
      <span className="min-w-0">
        <span className="eyebrow block">{which}</span>
        <span className="block truncate text-[14px] font-semibold text-fg">
          {shortDate(photo.local_date, today)} · {POSE_LABEL[photo.pose] ?? photo.pose}
        </span>
      </span>
      <ChevronDown className="size-4 shrink-0 text-fg-3" aria-hidden />
    </button>
  );
}

function Frame({ photo, src }: { photo: ProgressPhoto; src: string | null }) {
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-[16px] bg-bg-deep">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${POSE_LABEL[photo.pose] ?? photo.pose}, ${monthLabel(photo.local_date)}`} width={photo.width ?? 1500} height={photo.height ?? 2000} decoding="async" className="size-full object-cover" />
      ) : (
        <span className="skeleton absolute inset-0" />
      )}
      <span className="pointer-events-none absolute inset-[6px] rounded-[11px] shadow-[inset_0_0_0_1px_var(--gold-800)]" aria-hidden />
    </div>
  );
}

/** Museum placard: Cinzel month + year, the date and pose, weight on/nearest the date, optional measurement. */
function Placard({ photo, label }: { photo: ProgressPhoto; label: MeasureKey | "none" }) {
  const today = useToday();
  const { weights } = useWeights();
  const { data: measures = [] } = useMeasurements();
  const { profile } = useProfile();
  const wu = (profile?.weight_unit ?? "lb") as WeightUnit;
  const lu = (profile?.length_unit ?? "in") as LengthUnit;
  const w = nearestByDate(weights, photo.local_date, 7);
  const m = label !== "none" ? nearestByDate(measures.filter((r) => r[label] != null), photo.local_date, 21) : null;
  return (
    <figcaption className="relative mx-auto mt-3 w-full max-w-[260px] rounded-[12px] border border-line bg-s2 px-3 pb-3 pt-3.5 text-center">
      <span className="absolute inset-x-6 top-0 h-px bg-gold-800" aria-hidden />
      <p className="t-plaque text-[12px] leading-tight tracking-[0.16em] sm:text-[13px] sm:tracking-[0.2em]">{monthUpper(photo.local_date, true)}</p>
      <p className="mt-1 text-[12px] font-medium text-fg-3">
        {shortDate(photo.local_date, today)} · {POSE_LABEL[photo.pose] ?? photo.pose}
      </p>
      <p className="num-sm mt-2">{w ? formatBodyweight(w.row.weight_lb, wu) : "—"}</p>
      <p className="text-[11px] font-medium text-fg-3">{w ? (w.days === 0 ? "weighed that day" : `weighed ${shortDate(w.row.local_date, today)}`) : "no weigh-in near this date"}</p>
      {label !== "none" && (
        <p className="mt-2 border-t border-line-hair pt-2 text-[13px] font-semibold text-fg-2">
          {MEASURE_BY_KEY[label].label} <span className="num text-[15px] text-fg">{m ? formatLength(Number(m.row[label]), lu) : "—"}</span>
        </p>
      )}
    </figcaption>
  );
}

/** Wipe: the "before" photo is clipped over the "after" one; drag or use arrow keys to move the divider. */
function Wipe({ a, b, srcA, srcB }: { a: ProgressPhoto; b: ProgressPhoto; srcA: string | null; srcB: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const pct = useRef(50);
  const dragging = useRef(false);

  const apply = (p: number) => {
    pct.current = clampPct(p);
    const v = pct.current;
    if (top.current) top.current.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
    if (handle.current) {
      handle.current.style.left = `${v}%`;
      handle.current.setAttribute("aria-valuenow", String(Math.round(v)));
      handle.current.setAttribute("aria-valuetext", `${Math.round(v)}% before photo`);
    }
  };
  const fromEvent = (e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    apply(((e.clientX - r.left) / r.width) * 100);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") apply(pct.current - step);
    else if (e.key === "ArrowRight") apply(pct.current + step);
    else if (e.key === "Home") apply(0);
    else if (e.key === "End") apply(100);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={box}
      className="relative aspect-[3/4] touch-none select-none overflow-hidden rounded-[16px] bg-bg-deep"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        fromEvent(e);
      }}
      onPointerMove={(e) => dragging.current && fromEvent(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {srcB && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={srcB} alt={`After: ${monthLabel(b.local_date)}`} draggable={false} className="absolute inset-0 size-full object-cover" />
      )}
      <div ref={top} className="absolute inset-0" style={{ clipPath: "inset(0 50% 0 0)" }}>
        {srcA && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={srcA} alt={`Before: ${monthLabel(a.local_date)}`} draggable={false} className="absolute inset-0 size-full object-cover" />
        )}
      </div>
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-[rgb(8_9_12/.7)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-fg backdrop-blur">
        {monthLabel(a.local_date).replace(/(\w{3})\w* (\d{4})/, "$1 $2")}
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-[rgb(8_9_12/.7)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-fg backdrop-blur">
        {monthLabel(b.local_date).replace(/(\w{3})\w* (\d{4})/, "$1 $2")}
      </span>
      <div
        ref={handle}
        role="slider"
        tabIndex={0}
        aria-label="Compare divider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={50}
        aria-valuetext="50% before photo"
        onKeyDown={onKey}
        className="absolute inset-y-0 w-11 -translate-x-1/2 cursor-ew-resize outline-none focus-visible:[&>span:last-child]:outline focus-visible:[&>span:last-child]:outline-2 focus-visible:[&>span:last-child]:outline-gold-400"
        style={{ left: "50%" }}
      >
        <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-gold-200 shadow-[0_0_0_1px_rgb(0_0_0/.25)]" aria-hidden />
        <span className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line-gold bg-s3 text-gold-200 shadow-[var(--e2)]" aria-hidden>
          <MoveHorizontal className="size-5" />
        </span>
      </div>
      <span className="pointer-events-none absolute inset-[6px] rounded-[11px] shadow-[inset_0_0_0_1px_var(--gold-800)]" aria-hidden />
    </div>
  );
}

function PhotoPicker({
  open,
  onOpenChange,
  photos,
  urls,
  selectedId,
  title,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  photos: ProgressPhoto[];
  urls: Urls;
  selectedId: string;
  title: string;
  onPick: (id: string) => void;
}) {
  const today = useToday();
  const [pose, setPose] = useState<string>("all");
  const list = pose === "all" ? photos : photos.filter((p) => p.pose === pose);
  const present = POSES.filter((p) => photos.some((x) => x.pose === p.key));
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description="Pick a date and pose." wide>
      <div className="grid grid-cols-1 gap-4 py-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by pose">
          <Chip selected={pose === "all"} onClick={() => setPose("all")}>
            All
          </Chip>
          {present.map((p) => (
            <Chip key={p.key} selected={pose === p.key} onClick={() => setPose(p.key)}>
              {p.label}
            </Chip>
          ))}
        </div>
        {groupPhotosByMonth(list).map((g) => (
          <section key={g.month}>
            <h3 className="eyebrow mb-2">{monthLabel(g.month as ISODate)}</h3>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {g.photos.map((p) => {
                const src = urls.thumb(p);
                const sel = p.id === selectedId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onPick(p.id)}
                      aria-pressed={sel}
                      className={cn("press-soft relative block aspect-[3/4] w-full overflow-hidden rounded-[12px] bg-s3", sel && "ring-2 ring-gold-400 ring-offset-2 ring-offset-s2")}
                      aria-label={`${POSE_LABEL[p.pose] ?? p.pose}, ${shortDate(p.local_date, today)}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {src && <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-5 text-left">
                        <span className="num block text-[12px] text-fg">{shortDate(p.local_date, today)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

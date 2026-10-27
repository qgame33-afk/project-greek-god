"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronDown, MoveHorizontal } from "lucide-react";
import { Chip, Segmented } from "@/components/ui/controls";
import { Select } from "@/components/ui/field";
import { Empty } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useMeasurements, useWeights, type ProgressPhoto } from "@/lib/data/body";
import { useProfile } from "@/lib/data/profile";
import { monthLabel, shortDate, type ISODate } from "@/lib/dates";
import { formatBodyweight, formatLength } from "@/lib/units";
import { cn } from "@/lib/cn";
import { MEASURE_BY_KEY, MEASURE_FIELDS, type MeasureKey } from "@/lib/progress/measurements";
import { dayMonth } from "@/lib/progress/pace";
import { POSES, POSE_LABEL, clampPct, defaultComparePair, groupPhotosByMonth, nearestByDate } from "@/lib/progress/photos";
import { unitsOf } from "../kit";

interface Urls {
  thumb: (p: ProgressPhoto) => string | null;
  full: (p: ProgressPhoto) => string | null;
}

/**
 * Side-by-side or wipe comparison of two dated photos, each with its date, the weight on (or
 * nearest) that date and an optional measurement.
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
      <Empty title="Two photos make a comparison">
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
          className="min-w-0 flex-1 sm:max-w-60"
        />
        <Select aria-label="PhotoCaption label" value={label} onChange={(e) => setLabel(e.target.value as MeasureKey | "none")} className="h-11 w-40 sm:w-44">
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
        <div className="mx-auto grid w-full max-w-col grid-cols-2 gap-3 lg:gap-6">
          {[a, b].map((p, i) => (
            <figure key={`${p.id}-${i}`} className="min-w-0">
              <Frame photo={p} src={urls.full(p) ?? urls.thumb(p)} />
              <PhotoCaption photo={p} label={label} />
            </figure>
          ))}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-md">
          <Wipe a={a} b={b} srcA={urls.full(a) ?? urls.thumb(a)} srcB={urls.full(b) ?? urls.thumb(b)} />
          <div className="mt-0 grid grid-cols-2 gap-3">
            <PhotoCaption photo={a} label={label} />
            <PhotoCaption photo={b} label={label} />
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
    <button type="button" onClick={onClick} className="press-soft flex min-h-[52px] items-center justify-between gap-2 rounded-tile bg-control px-3 py-2 text-left">
      <span className="min-w-0">
        <span className="t-cap block">{which}</span>
        <span className="t-row block truncate">
          {shortDate(photo.local_date, today)} · {POSE_LABEL[photo.pose] ?? photo.pose}
        </span>
      </span>
      <ChevronDown className="size-4 shrink-0 text-fg-3" aria-hidden />
    </button>
  );
}

/**
 * A photo in a plain rounded tile. Private images only (signed URLs).
 */
export function Frame({ photo, src, className }: { photo: ProgressPhoto; src: string | null; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-tile-lg bg-control", className)}>
      <div className="relative aspect-[3/4] overflow-hidden">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${POSE_LABEL[photo.pose] ?? photo.pose}, ${monthLabel(photo.local_date)}`}
            width={photo.width ?? 1500}
            height={photo.height ?? 2000}
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <span className="skeleton absolute inset-0" />
        )}
      </div>
    </div>
  );
}

/**
 * The caption under a photo: the day and pose, and the weight logged on (or nearest) that day.
 * With `label`, one tape measurement too.
 */
export function PhotoCaption({ photo, label = "none" }: { photo: ProgressPhoto; label?: MeasureKey | "none" }) {
  const today = useToday();
  const { weights } = useWeights();
  const { data: measures = [] } = useMeasurements();
  const { profile } = useProfile();
  const { wu, lu } = unitsOf(profile);
  const w = nearestByDate(weights, photo.local_date, 7);
  const m =
    label !== "none"
      ? nearestByDate(
          measures.filter((r) => r[label] != null),
          photo.local_date,
          21,
        )
      : null;
  return (
    <figcaption className="mt-2.5 w-full text-center">
      <p className="t-row">
        {dayMonth(photo.local_date, today, true)} {photo.local_date.slice(0, 4)}
      </p>
      <p className="t-cap mt-0.5">{POSE_LABEL[photo.pose] ?? photo.pose}</p>
      <p className="t-num-s mt-1.5 tabular-nums">{w ? formatBodyweight(w.row.weight_lb, wu) : "—"}</p>
      <p className="t-cap">{w ? (w.days === 0 ? "Weighed that day" : `Weighed ${dayMonth(w.row.local_date, today)}`) : "No weigh-in near this date"}</p>
      {label !== "none" && (
        <p className="t-cap mt-2 border-t border-line pt-2">
          {MEASURE_BY_KEY[label].label} <span className="t-label tabular-nums text-fg">{m ? formatLength(Number(m.row[label]), lu) : "—"}</span>
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
      className="relative aspect-[3/4] touch-none select-none overflow-hidden rounded-tile-lg bg-control"
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
      <span className="t-cap pointer-events-none absolute left-3 top-3 rounded-pill bg-bg/80 px-2.5 py-1 font-semibold text-fg">{monthLabel(a.local_date).replace(/(\w{3})\w* (\d{4})/, "$1 $2")}</span>
      <span className="t-cap pointer-events-none absolute right-3 top-3 rounded-pill bg-bg/80 px-2.5 py-1 font-semibold text-fg">{monthLabel(b.local_date).replace(/(\w{3})\w* (\d{4})/, "$1 $2")}</span>
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
        className="absolute inset-y-0 w-11 -translate-x-1/2 cursor-ew-resize outline-none focus-visible:[&>span:last-child]:outline focus-visible:[&>span:last-child]:outline-2 focus-visible:[&>span:last-child]:outline-fg"
        style={{ left: "50%" }}
      >
        <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-fg" aria-hidden />
        <span className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-card-3 text-fg" aria-hidden>
          <MoveHorizontal className="size-5" />
        </span>
      </div>
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
            <h3 className="t-label mb-2 font-semibold">{monthLabel(g.month as ISODate)}</h3>
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
                      className={cn("press-soft relative block aspect-[3/4] w-full overflow-hidden rounded-tile bg-control", sel && "ring-2 ring-fg ring-offset-2 ring-offset-sheet")}
                      aria-label={`${POSE_LABEL[p.pose] ?? p.pose}, ${shortDate(p.local_date, today)}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {src && <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
                      <span className="t-cap absolute bottom-1.5 left-1.5 rounded-pill bg-bg/80 px-2 py-0.5 font-semibold tabular-nums text-fg">{shortDate(p.local_date, today)}</span>
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

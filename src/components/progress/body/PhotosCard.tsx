"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Images, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { Row } from "@/components/ui/list";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { usePhotos, useSignedUrls, type ProgressPhoto } from "@/lib/data/body";
import { monthLabel, type ISODate } from "@/lib/dates";
import { POSES, POSE_LABEL, groupPhotosByMonth, thumbPath } from "@/lib/progress/photos";
import { dayLabel } from "../strength/model";
import { useProgressActions } from "../context";
import { PhotoCompare } from "../photos/PhotoCompare";
import { PhotoViewer } from "../photos/PhotoViewer";

/** Signed URLs (thumb + full) for a set of private photos, one batched request. */
export function usePhotoUrls(photos: ProgressPhoto[]) {
  const paths = useMemo(() => photos.flatMap((p) => [p.storage_path, thumbPath(p.storage_path)]), [photos]);
  const q = useSignedUrls("progress-photos", paths);
  return {
    loading: q.isLoading,
    error: q.error,
    thumb: (p: ProgressPhoto) => q.data?.[thumbPath(p.storage_path)] ?? q.data?.[p.storage_path] ?? null,
    full: (p: ProgressPhoto) => q.data?.[p.storage_path] ?? null,
  };
}

/**
 * Progress › Body › Photos (docs/DESIGN-V3-SIMPLE.md §4.5.4): "Only on your account", the two latest
 * photos side by side with their dates, secondary "Compare" and "Add photos". Every photo opens
 * the viewer (swipe through all, delete); "All photos" lists them by month. Private storage and
 * signed URLs only; the upload path is unchanged.
 */
export function PhotosCard() {
  const today = useToday();
  const q = usePhotos();
  const qc = useQueryClient();
  const actions = useProgressActions();
  const photos = useMemo(() => q.data ?? [], [q.data]);
  const urls = usePhotoUrls(photos);
  const [viewer, setViewer] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ open: boolean; seed: string | null }>({ open: false, seed: null });
  const [archive, setArchive] = useState(false);

  // newest first: the two latest, oldest of the two on the left
  const desc = useMemo(() => [...photos].sort((a, b) => b.local_date.localeCompare(a.local_date) || (b.created_at ?? "").localeCompare(a.created_at ?? "")), [photos]);
  const two = desc.slice(0, 2).reverse();

  return (
    <section id="progress-photos" aria-labelledby="photos-h" className="scroll-mt-24 rounded-card bg-surface p-5">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 id="photos-h" className="t-row">
          Photos
        </h2>
        <span className="t-label inline-flex items-center gap-1.5">
          <Lock className="size-4" strokeWidth={1.9} aria-hidden />
          Only on your account
        </span>
      </div>

      {q.error ? (
        <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["photos"] })}>Couldn&apos;t load your photos.</ErrorNote>
      ) : q.isLoading ? (
        <div className="grid grid-cols-2 gap-2.5" aria-busy="true" aria-label="Loading photos">
          <Skeleton className="aspect-[3/4] rounded-tile-lg" />
          <Skeleton className="aspect-[3/4] rounded-tile-lg" />
        </div>
      ) : !photos.length ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-tile-lg border-[1.5px] border-dashed border-ui-line px-4 text-center">
          <p className="t-row">No photos yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {two.map((p) => (
            <Tile key={p.id} photo={p} src={urls.thumb(p) ?? urls.full(p)} label={dayLabel(p.local_date, today)} onOpen={() => setViewer(p.id)} />
          ))}
          {two.length === 1 && (
            <button
              type="button"
              onClick={() => actions.logPhoto()}
              className="press-soft flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-tile-lg border-[1.5px] border-dashed border-ui-line px-3 text-center"
            >
              <span className="t-row">Next set</span>
              <span className="t-cap">In 2–4 weeks, same pose and light</span>
            </button>
          )}
        </div>
      )}
      {urls.error && photos.length > 0 && <p className="t-label mt-2">Couldn&apos;t open your photos right now. Try again in a moment.</p>}

      <div className={photos.length >= 2 ? "mt-3.5 grid grid-cols-2 gap-2.5 ax:grid-cols-1" : "mt-3.5 grid"}>
        {photos.length >= 2 && (
          <Button variant="secondary" size="lg" onClick={() => setCompare({ open: true, seed: null })}>
            Compare
          </Button>
        )}
        <Button variant="secondary" size="lg" onClick={() => actions.logPhoto()}>
          <Camera strokeWidth={1.9} aria-hidden />
          Add photos
        </Button>
      </div>

      {photos.length > 2 && (
        <div className="-mx-4 -mb-2 mt-2">
          <Row icon={Images} title="All photos" value={String(photos.length)} onClick={() => setArchive(true)} />
        </div>
      )}

      <PhotoViewer
        photos={[...desc].reverse()}
        openId={viewer}
        onOpenChange={(id) => setViewer(id)}
        urls={urls}
        onCompare={(id) => {
          setViewer(null);
          setCompare({ open: true, seed: id });
        }}
      />
      <Sheet open={compare.open} onOpenChange={(o) => setCompare((c) => ({ ...c, open: o }))} title="Compare" wide>
        <div className="pb-2">
          <PhotoCompare photos={photos} urls={urls} seedId={compare.seed} />
        </div>
      </Sheet>
      <ArchiveSheet
        open={archive}
        onOpenChange={setArchive}
        photos={photos}
        urls={urls}
        today={today}
        onOpen={(id) => {
          setArchive(false);
          window.setTimeout(() => setViewer(id), 220);
        }}
      />
    </section>
  );
}

function Tile({ photo, src, label, onOpen }: { photo: ProgressPhoto; src: string | null; label: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="press-soft relative block aspect-[3/4] w-full overflow-hidden rounded-tile-lg bg-control" aria-label={`${POSE_LABEL[photo.pose] ?? photo.pose}, ${label}. Open`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
        <img src={src} alt="" width={photo.width ?? 450} height={photo.height ?? 600} decoding="async" className="size-full object-cover" />
      ) : (
        <span className="skeleton absolute inset-0" />
      )}
      <span className="t-label absolute bottom-2.5 left-2.5 rounded-pill bg-bg/80 px-3 py-1 font-semibold text-fg" aria-hidden>
        {label}
      </span>
    </button>
  );
}

function ArchiveSheet({
  open,
  onOpenChange,
  photos,
  urls,
  today,
  onOpen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  photos: ProgressPhoto[];
  urls: ReturnType<typeof usePhotoUrls>;
  today: ISODate;
  onOpen: (id: string) => void;
}) {
  const [pose, setPose] = useState<string>("all");
  const filtered = pose === "all" ? photos : photos.filter((p) => p.pose === pose);
  const present = POSES.filter((p) => photos.some((x) => x.pose === p.key));
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="All photos" description={`${photos.length} photos`} wide>
      <div className="grid gap-5 pb-2">
        {present.length > 1 && (
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
        )}
        {groupPhotosByMonth(filtered).map((g) => (
          <section key={g.month} aria-label={monthLabel(g.month)}>
            <h3 className="t-label mb-2 font-semibold">
              {monthLabel(g.month)} · {g.photos.length}
            </h3>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {g.photos.map((p) => {
                const src = urls.thumb(p);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(p.id)}
                      className="press-soft relative block aspect-[3/4] w-full overflow-hidden rounded-tile bg-control"
                      aria-label={`${POSE_LABEL[p.pose] ?? p.pose}, ${dayLabel(p.local_date, today)}. Open`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
                      {src ? <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <span className="skeleton absolute inset-0" />}
                      <span className="t-cap absolute bottom-1.5 left-1.5 rounded-pill bg-bg/80 px-2 py-0.5 font-semibold text-fg" aria-hidden>
                        {POSE_LABEL[p.pose] ?? p.pose}
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

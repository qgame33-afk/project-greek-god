"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Plus } from "lucide-react";
import { EmptyArt } from "@/components/art/Motifs";
import { Button } from "@/components/ui/button";
import { Chip, Segmented } from "@/components/ui/controls";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { useToday } from "@/lib/data/core";
import { usePhotos, useSignedUrls, type ProgressPhoto } from "@/lib/data/body";
import { monthLabel, shortDate } from "@/lib/dates";
import { POSES, POSE_LABEL, groupPhotosByMonth, thumbPath } from "@/lib/progress/photos";
import { useProgressActions } from "../context";
import { PhotoViewer } from "./PhotoViewer";
import { PhotoCompare } from "./PhotoCompare";

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

export function PhotosTab() {
  const today = useToday();
  const q = usePhotos();
  const qc = useQueryClient();
  const actions = useProgressActions();
  const photos = useMemo(() => q.data ?? [], [q.data]);
  const [mode, setMode] = useState<"gallery" | "compare">("gallery");
  const [pose, setPose] = useState<string>("all");
  const [viewer, setViewer] = useState<string | null>(null);
  const [compareSeed, setCompareSeed] = useState<string | null>(null);
  const urls = usePhotoUrls(photos);

  const filtered = pose === "all" ? photos : photos.filter((p) => p.pose === pose);
  const groups = groupPhotosByMonth(filtered);
  const posesPresent = POSES.filter((p) => photos.some((x) => x.pose === p.key));

  if (q.error) return <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["photos"] })}>Couldn&apos;t load your photos. {(q.error as Error).message}</ErrorNote>;

  return (
    <div className="grid grid-cols-1 gap-4 lg:gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-fg-2">
          <Lock className="size-4 shrink-0 text-gold-300" aria-hidden />
          <span className="truncate">Private to your account. Never shared.</span>
        </p>
        <Button variant="secondary" className="h-11 shrink-0 px-4" onClick={() => actions.logPhoto()}>
          <Plus className="size-[18px]" /> Add
        </Button>
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-[12px]" />
          ))}
        </div>
      ) : !photos.length ? (
        <Empty
            art={<EmptyArt kind="frame" size={56} />}
            title="No progress photos yet"
            action={
              <Button variant="secondary" onClick={() => actions.logPhoto()}>
                Add first photos
              </Button>
            }
          >
            Every 2–4 weeks: front, side and back, same light and distance. They stay in private storage only you can open.
          </Empty>
      ) : (
        <>
          <Segmented
            ariaLabel="Photo view"
            value={mode}
            onChange={setMode}
            options={[
              { value: "gallery", label: `Gallery · ${photos.length}` },
              { value: "compare", label: "Compare" },
            ]}
          />

          {mode === "gallery" ? (
            <>
              {posesPresent.length > 1 && (
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Filter by pose">
                  <Chip selected={pose === "all"} onClick={() => setPose("all")}>
                    All
                  </Chip>
                  {posesPresent.map((p) => (
                    <Chip key={p.key} selected={pose === p.key} onClick={() => setPose(p.key)}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
              )}
              {urls.error ? <ErrorNote>Couldn&apos;t open your photos right now. {(urls.error as Error).message}</ErrorNote> : null}
              {groups.map((g) => (
                <section key={g.month} aria-label={monthLabel(g.month)}>
                  <h3 className="eyebrow mb-2.5 flex items-baseline justify-between">
                    <span>{monthLabel(g.month)}</span>
                    <span className="num text-[12px] tracking-normal text-fg-3">{g.photos.length}</span>
                  </h3>
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {g.photos.map((p) => {
                      const src = urls.thumb(p);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => setViewer(p.id)}
                            className="press-soft group relative block aspect-[3/4] w-full overflow-hidden rounded-[12px] bg-s3"
                            aria-label={`${POSE_LABEL[p.pose] ?? p.pose}, ${shortDate(p.local_date, today)}. Open`}
                          >
                            {src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={src}
                                alt=""
                                width={p.width ?? 450}
                                height={p.height ?? 600}
                                loading="lazy"
                                decoding="async"
                                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                onError={(e) => {
                                  const full = urls.full(p);
                                  if (full && e.currentTarget.src !== full) e.currentTarget.src = full;
                                }}
                              />
                            ) : (
                              <span className="skeleton absolute inset-0" />
                            )}
                            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-6 text-left">
                              <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-fg">{POSE_LABEL[p.pose] ?? p.pose}</span>
                              <span className="num block text-[12px] text-fg-2">{shortDate(p.local_date, today)}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </>
          ) : (
            <PhotoCompare photos={photos} urls={urls} seedId={compareSeed} />
          )}
        </>
      )}

      <PhotoViewer
        photos={filtered}
        openId={viewer}
        onOpenChange={(id) => setViewer(id)}
        urls={urls}
        onCompare={(id) => {
          setViewer(null);
          setCompareSeed(id);
          setMode("compare");
        }}
      />
    </div>
  );
}

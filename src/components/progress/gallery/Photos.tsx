"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Columns2, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { useToday } from "@/lib/data/core";
import { usePhotos, useSignedUrls, type ProgressPhoto } from "@/lib/data/body";
import { daysBetween, monthLabel } from "@/lib/dates";
import { dayMonth } from "@/lib/progress/pace";
import { POSES, POSE_LABEL, defaultComparePair, groupPhotosByMonth, thumbPath } from "@/lib/progress/photos";
import { useProgressActions } from "../context";
import { SectionTitle } from "../kit";
import { Frame, PhotoCompare, Placard } from "../photos/PhotoCompare";
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
 * Gallery → Photos (docs/DESIGN-V2.md §3.6.3): the first and latest photo of a pose as a framed
 * pair with date placards, Compare (side by side or wipe), and the archive by month. Private:
 * signed URLs only.
 */
export function Photos() {
  const today = useToday();
  const q = usePhotos();
  const qc = useQueryClient();
  const actions = useProgressActions();
  const photos = useMemo(() => q.data ?? [], [q.data]);
  const urls = usePhotoUrls(photos);
  const [pose, setPose] = useState<string>("all");
  const [viewer, setViewer] = useState<string | null>(null);
  // Compare opens in place of the pair (its photo picker is a sheet of its own)
  const [compare, setCompare] = useState<{ seed: string | null } | null>(null);

  const pair = defaultComparePair(photos);
  const filtered = pose === "all" ? photos : photos.filter((p) => p.pose === pose);
  const groups = groupPhotosByMonth(filtered);
  const posesPresent = POSES.filter((p) => photos.some((x) => x.pose === p.key));

  return (
    <section id="ascent-photos" aria-labelledby="gallery-photos" className="min-w-0 scroll-mt-24">
      <SectionTitle
        id="gallery-photos"
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3" strokeWidth={1.8} aria-hidden /> Private · only you
          </span>
        }
        title="Photos"
      >
        <Button variant="secondary" size="sm" onClick={() => actions.logPhoto()} className="shrink-0 px-3.5">
          <Plus className="size-4" strokeWidth={1.8} /> Add
        </Button>
      </SectionTitle>

      {q.error ? (
        <ErrorNote onRetry={() => qc.invalidateQueries({ queryKey: ["photos"] })}>Couldn&apos;t load your photos. {(q.error as Error).message}</ErrorNote>
      ) : q.isLoading ? (
        <div className="mt-3 grid grid-cols-2 gap-4" aria-busy="true" aria-label="Loading photos">
          <Skeleton className="aspect-[3/4] rounded-tag" />
          <Skeleton className="aspect-[3/4] rounded-tag" />
        </div>
      ) : !photos.length ? (
        <EmptyFrames onAdd={() => actions.logPhoto()} />
      ) : (
        <>
          {urls.error ? <ErrorNote className="mt-3">Couldn&apos;t open your photos right now. {(urls.error as Error).message}</ErrorNote> : null}

          {/* the pair: the first and the latest of one pose, framed */}
          {compare ? (
            <div className="mt-3">
              <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
                <h3 className="t-eyebrow">Compare</h3>
                <Button variant="ghost" size="sm" className="-mr-2 px-3" onClick={() => setCompare(null)}>
                  Done
                </Button>
              </div>
              <PhotoCompare photos={photos} urls={urls} seedId={compare.seed} />
            </div>
          ) : pair ? (
            <figure className="mt-3" aria-label={`${POSE_LABEL[pair[0].pose] ?? pair[0].pose}: ${monthLabel(pair[0].local_date)} and ${monthLabel(pair[1].local_date)}`}>
              <div className="mx-auto grid max-w-col grid-cols-2 gap-4">
                {pair.map((p, i) => (
                  <div key={p.id + i} className="min-w-0">
                    <button type="button" onClick={() => setViewer(p.id)} className="press-soft block w-full" aria-label={`${POSE_LABEL[p.pose] ?? p.pose}, ${dayMonth(p.local_date, today)}. Open`}>
                      <Frame photo={p} src={urls.full(p) ?? urls.thumb(p)} />
                    </button>
                    <Placard photo={p} />
                  </div>
                ))}
              </div>
              <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="t-meta tnum text-stone">
                  {daysBetween(pair[0].local_date, pair[1].local_date)} days apart · {POSE_LABEL[pair[0].pose] ?? pair[0].pose}
                </span>
                <Button variant="secondary" size="sm" onClick={() => setCompare({ seed: null })} className="px-3.5">
                  <Columns2 className="size-4" strokeWidth={1.6} /> Compare
                </Button>
              </figcaption>
            </figure>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <button type="button" onClick={() => setViewer(photos.at(-1)!.id)} className="press-soft block w-full" aria-label="Open the photo">
                  <Frame photo={photos.at(-1)!} src={urls.full(photos.at(-1)!) ?? urls.thumb(photos.at(-1)!)} />
                </button>
                <Placard photo={photos.at(-1)!} />
              </div>
              <EmptyFrame label="Next set" sub="In 2–4 weeks: same pose, light and distance" onAdd={() => actions.logPhoto()} />
            </div>
          )}

          {/* the archive */}
          <div className="mt-8">
            <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
              <h3 className="t-eyebrow">
                Archive · <span className="tnum">{photos.length}</span>
              </h3>
            </div>
            {posesPresent.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by pose">
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
            <div className="grid grid-cols-1 gap-5">
              {groups.map((g) => (
                <section key={g.month} aria-label={monthLabel(g.month)}>
                  <h4 className="t-meta mb-2 flex items-baseline justify-between font-semibold text-stone">
                    <span>{monthLabel(g.month)}</span>
                    <span className="tnum">{g.photos.length}</span>
                  </h4>
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {g.photos.map((p) => {
                      const src = urls.thumb(p);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => setViewer(p.id)}
                            className="press-soft group relative block aspect-[3/4] w-full overflow-hidden rounded-xs bg-m2 shadow-[0_0_0_1px_var(--vein-2)]"
                            aria-label={`${POSE_LABEL[p.pose] ?? p.pose}, ${dayMonth(p.local_date, today)}. Open`}
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
                                className="size-full object-cover"
                                onError={(e) => {
                                  const full = urls.full(p);
                                  if (full && e.currentTarget.src !== full) e.currentTarget.src = full;
                                }}
                              />
                            ) : (
                              <span className="skeleton absolute inset-0" />
                            )}
                            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-obsidian/90 to-transparent px-2 pb-1.5 pt-6 text-left">
                              <span className="t-tag block text-ivory">{POSE_LABEL[p.pose] ?? p.pose}</span>
                              <span className="t-meta tnum block text-stone">{dayMonth(p.local_date, today)}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </>
      )}

      <PhotoViewer
        photos={filtered}
        openId={viewer}
        onOpenChange={(id) => setViewer(id)}
        urls={urls}
        onCompare={(id) => {
          setViewer(null);
          setCompare({ seed: id });
          document.getElementById("ascent-photos")?.scrollIntoView({ block: "start" });
        }}
      />
    </section>
  );
}

/** The fresh state: two empty frames waiting for the first set. */
function EmptyFrames({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-4">
        <EmptyFrame label="The start" sub="Front, side and back" onAdd={onAdd} />
        <EmptyFrame label="In a month" sub="Same light and distance" onAdd={onAdd} muted />
      </div>
      <p className="t-callout mt-4 text-stone">Every 2–4 weeks: front, side and back in the same light. They stay in private storage only you can open.</p>
    </div>
  );
}

function EmptyFrame({ label, sub, onAdd, muted }: { label: string; sub: string; onAdd: () => void; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <button type="button" onClick={onAdd} className="press-soft block w-full rounded-tag bg-m1 p-1.5 shadow-[inset_0_0_0_1px_var(--ui-line)]" aria-label={`Add photos: ${label.toLowerCase()}`}>
        <span className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xs border border-dashed border-ui-line">
          <span className={muted ? "text-ash" : "text-stone"}>
            <Plus className="size-6" strokeWidth={1.4} aria-hidden />
          </span>
          <span className="t-tag text-stone">Add</span>
        </span>
      </button>
      <div className="mt-3 text-center">
        <span aria-hidden className="mx-auto mb-2.5 block h-px w-10 bg-ui-line" />
        <p className="t-eyebrow">{label}</p>
        <p className="t-meta mt-0.5 text-stone">{sub}</p>
      </div>
    </div>
  );
}

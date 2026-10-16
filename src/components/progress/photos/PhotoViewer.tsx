"use client";

import { Dialog } from "radix-ui";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Columns2, Trash, X } from "lucide-react";
import { Confirm } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useWeights, type ProgressPhoto } from "@/lib/data/body";
import { useProfile } from "@/lib/data/profile";
import { longDate, shortDate } from "@/lib/dates";
import { formatBodyweight, type WeightUnit } from "@/lib/units";
import { POSE_LABEL, nearestByDate } from "@/lib/progress/photos";
import { usePhotoDelete } from "@/lib/progress/hooks";

interface Urls {
  thumb: (p: ProgressPhoto) => string | null;
  full: (p: ProgressPhoto) => string | null;
}

/** Full-screen viewer: swipe or arrow through photos, see the nearest weigh-in, delete permanently. */
export function PhotoViewer({
  photos,
  openId,
  onOpenChange,
  urls,
  onCompare,
}: {
  photos: ProgressPhoto[];
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  urls: Urls;
  onCompare: (id: string) => void;
}) {
  const today = useToday();
  const { weights } = useWeights();
  const { profile } = useProfile();
  const unit = (profile?.weight_unit ?? "lb") as WeightUnit;
  const del = usePhotoDelete();
  const [confirm, setConfirm] = useState(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const i = photos.findIndex((p) => p.id === openId);
  const photo = i >= 0 ? photos[i] : null;
  const go = (d: 1 | -1) => {
    const j = i + d;
    if (j >= 0 && j < photos.length) onOpenChange(photos[j].id);
  };
  const w = photo ? nearestByDate(weights, photo.local_date, 7) : null;
  const src = photo ? (urls.full(photo) ?? urls.thumb(photo)) : null;

  return (
    <>
      <Dialog.Root open={!!photo} onOpenChange={(o) => !o && onOpenChange(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-bg-deep data-[state=open]:animate-[rise_200ms_var(--ease-out)]" />
          <Dialog.Content
            className="fixed inset-0 z-[51] flex flex-col outline-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") go(1);
              if (e.key === "ArrowLeft") go(-1);
            }}
            aria-describedby={undefined}
          >
            {photo && (
              <>
                <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-[calc(var(--safe-top)+8px)]">
                  <Dialog.Close className="grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg" aria-label="Close">
                    <X className="size-6" />
                  </Dialog.Close>
                  <div className="min-w-0 text-center">
                    <Dialog.Title className="truncate text-[15px] font-bold text-fg">
                      {POSE_LABEL[photo.pose] ?? photo.pose} · {shortDate(photo.local_date, today)}
                    </Dialog.Title>
                    <p className="num text-[12px] text-fg-3">
                      {i + 1} / {photos.length}
                    </p>
                  </div>
                  <span className="size-11" aria-hidden />
                </div>

                <div
                  className="relative flex min-h-0 flex-1 items-center justify-center px-2 touch-pan-y"
                  onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
                  onPointerUp={(e) => {
                    const s = swipe.current;
                    swipe.current = null;
                    if (!s) return;
                    const dx = e.clientX - s.x;
                    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
                  }}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photo.id}
                      src={src}
                      alt={`${POSE_LABEL[photo.pose] ?? photo.pose} pose, ${longDate(photo.local_date)}`}
                      width={photo.width ?? 1500}
                      height={photo.height ?? 2000}
                      decoding="async"
                      draggable={false}
                      className="max-h-full max-w-full select-none rounded-[14px] object-contain animate-[rise_200ms_var(--ease-out)_both]"
                    />
                  ) : (
                    <div className="skeleton aspect-[3/4] h-[70%] rounded-[14px]" />
                  )}
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    disabled={i <= 0}
                    aria-label="Previous photo"
                    className="press absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-[rgb(8_9_12/.6)] text-fg backdrop-blur disabled:opacity-0"
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    disabled={i >= photos.length - 1}
                    aria-label="Next photo"
                    className="press absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-[rgb(8_9_12/.6)] text-fg backdrop-blur disabled:opacity-0"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 px-4 pb-[calc(var(--safe-bottom)+12px)] pt-3">
                  <div className="min-w-0">
                    <p className="eyebrow">{w ? (w.days === 0 ? "Weight that day" : `Weight · ${shortDate(w.row.local_date, today)}`) : "Weight"}</p>
                    <p className="num-sm mt-1">{w ? formatBodyweight(w.row.weight_lb, unit) : "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onCompare(photo.id)} className="press inline-flex h-11 items-center gap-2 rounded-[12px] border border-line-strong bg-s3 px-3.5 text-[14px] font-bold text-fg">
                      <Columns2 className="size-4" /> Compare
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirm(true)}
                      disabled={del.isPending}
                      aria-label="Delete photo permanently"
                      className="press grid size-11 place-items-center rounded-[12px] border border-danger/35 bg-danger-tint text-danger disabled:opacity-50"
                    >
                      <Trash className="size-[18px]" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this photo?"
        body="It's removed from your private storage permanently. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!photo || del.isPending) return;
          const next = photos[i + 1] ?? photos[i - 1] ?? null;
          onOpenChange(next?.id ?? null);
          del.mutate(photo);
        }}
      />
    </>
  );
}

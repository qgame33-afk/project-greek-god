"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import type { ISODate } from "@/lib/dates";
import { POSES, POSE_LABEL, type Pose } from "@/lib/progress/photos";
import { usePhotoUpload } from "@/lib/progress/hooks";
import { prepareImage, type PreparedImage } from "./image";

/**
 * Capture or choose a progress photo, pick the pose and date, then save to private storage.
 * After each save the sheet stays open on the next pose so a full set takes one pass.
 */
export function PhotoUploadSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const today = useToday();
  const upload = usePhotoUpload();
  const [date, setDate] = useState<ISODate>(today);
  const [pose, setPose] = useState<Pose>("front");
  const [prepared, setPrepared] = useState<(PreparedImage & { url: string }) | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Pose[]>([]);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  // set synchronously, so two taps in the same frame can't both upload
  const busy = useRef(false);

  // fresh state each time it opens
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      setDate(today);
      setPose("front");
      setSaved([]);
      setError(null);
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // release the preview URL when it changes or the sheet unmounts
  useEffect(
    () => () => {
      if (prepared) URL.revokeObjectURL(prepared.url);
    },
    [prepared],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      const p = await prepareImage(file);
      setPrepared({ ...p, url: URL.createObjectURL(p.main) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparing(false);
      if (camRef.current) camRef.current.value = "";
      if (libRef.current) libRef.current.value = "";
    }
  };

  const save = () => {
    if (!prepared || busy.current || upload.isPending) return;
    if (date > today) return setError("That date is in the future.");
    setError(null);
    busy.current = true;
    upload.mutate(
      { main: prepared.main, thumb: prepared.thumb, width: prepared.width, height: prepared.height, date, pose },
      {
        onSuccess: () => {
          const done = saved.includes(pose) ? saved : [...saved, pose];
          setSaved(done);
          setPrepared(null);
          const next = POSES.find((p) => !done.includes(p.key));
          if (next) setPose(next.key);
        },
        onError: (e) => setError(`${e.message} Your photo is still here.`),
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };

  const close = () => onOpenChange(false);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Progress photo"
      description="Same light, same distance, same time of day."
      footer={
        prepared ? (
          <Button variant="primary" size="lg" block onClick={save} loading={upload.isPending}>
            Save {POSE_LABEL[pose].toLowerCase()} photo
          </Button>
        ) : saved.length ? (
          <Button variant="secondary" size="lg" block onClick={close}>
            Done
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-4 py-2">
        {saved.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 t-meta font-semibold text-stone" aria-live="polite">
            <span>Saved:</span>
            {saved.map((p) => (
              <span key={p} className="inline-flex h-7 items-center gap-1 rounded-full bg-leaf-tint px-2.5 t-meta font-bold text-leaf-300">
                <Check className="size-3.5" /> {POSE_LABEL[p]}
              </span>
            ))}
          </div>
        )}

        <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <input ref={libRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />

        {prepared ? (
          <div className="relative mx-auto w-full max-w-[220px] sm:max-w-[260px]">
            <div className="relative aspect-[3/4] overflow-hidden rounded-btn bg-obsidian">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={prepared.url} alt={`Preview, ${POSE_LABEL[pose]} pose`} width={prepared.width} height={prepared.height} className="size-full object-contain" />
              <span className="pointer-events-none absolute inset-0 rounded-btn shadow-[inset_0_0_0_1px_var(--leaf-700)]" aria-hidden />
            </div>
            <button
              type="button"
              onClick={() => setPrepared(null)}
              className="press absolute right-2 top-2 inline-flex h-11 items-center gap-1.5 rounded-full bg-obsidian/85 px-3.5 t-meta font-bold text-ivory"
            >
              <RotateCcw className="size-4" /> Retake
            </button>
            <p className="mt-2 text-center t-meta font-medium text-stone">
              {prepared.width} × {prepared.height} · {prepared.main.size >= 1024 * 1024 ? `${(prepared.main.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(prepared.main.size / 1024))} KB`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => camRef.current?.click()} disabled={preparing} className="card-inset press flex h-32 flex-col items-center justify-center gap-2.5 text-center hover:bg-m4 disabled:opacity-50">
              <Camera className="size-7 text-leaf-300" />
              <span className="t-callout font-bold text-ivory">Take photo</span>
            </button>
            <button type="button" onClick={() => libRef.current?.click()} disabled={preparing} className="card-inset press flex h-32 flex-col items-center justify-center gap-2.5 text-center hover:bg-m4 disabled:opacity-50">
              <ImagePlus className="size-7 text-leaf-300" />
              <span className="t-callout font-bold text-ivory">Choose from library</span>
            </button>
          </div>
        )}
        {preparing && <p className="text-center t-meta font-medium text-stone">Preparing photo…</p>}
        {error && <ErrorNote onRetry={prepared ? save : undefined}>{error}</ErrorNote>}

        <div>
          <p className="mb-2 t-meta font-semibold text-stone">Pose</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pose">
            {POSES.map((p) => (
              <Chip key={p.key} selected={pose === p.key} onClick={() => setPose(p.key)} className="h-11 px-4" ariaLabel={saved.includes(p.key) ? `${p.label}, saved` : undefined}>
                {saved.includes(p.key) && <Check className="size-3.5" aria-hidden />}
                {p.label}
              </Chip>
            ))}
          </div>
        </div>

        <Field label="Date">{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />}</Field>

        <p className="flex items-start gap-2 t-meta leading-relaxed text-stone">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Private to your account. Never shared. Photos are resized on this phone and location data is removed before upload.
        </p>
      </div>
    </Sheet>
  );
}

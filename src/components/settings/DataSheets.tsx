"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Check, Download, FileArchive, Share } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { drained } from "@/lib/data/outbox";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/export/csv";
import {
  buildExport,
  canShareFile,
  mealPhotoFiles,
  previewWipe,
  progressPhotoFiles,
  saveBlob,
  shareBlob,
  wipeLoggedData,
  type ExportProgress,
  type ExportResult,
  type WipePreview,
} from "@/lib/export/client";
import { countLabel, fileLines, KEPT_ON_WIPE, WIPE_TABLES, wipeSummary, wipeTotal, type WipeReport } from "@/lib/export/tables";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearLocalCaches } from "./session";
import { SwitchRow } from "./List";
import { useResetOnOpen } from "./useResetOnOpen";

const BIG_EXPORT = 75 * 1024 * 1024;

function Progress({ p }: { p: ExportProgress }) {
  const v = p.total ? Math.min(1, p.done / p.total) : 0;
  return (
    <div className="rounded-card bg-surface  p-4" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate t-label font-semibold text-fg">{p.label}</p>
        <p className="tabular-nums shrink-0 t-label text-fg-2">{Math.round(v * 100)}%</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
        <div className="h-full w-full rounded-full bg-fg transition-transform duration-(--dur-lift)" style={{ transform: `translateX(${(v - 1) * 100}%)` }} />
      </div>
    </div>
  );
}

/** "12 weigh-ins" with the count set in tabular numerals and the words in the body face. */
function CountLine({ text }: { text: string }) {
  const m = /^([\d,]+)\s(.*)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className="tabular-nums t-label font-semibold text-fg">{m[1]}</span> <span className="text-fg-2">{m[2]}</span>
    </>
  );
}

/* ------------------------------------------------------------------ export */

export function ExportSheet({
  open,
  onOpenChange,
  userId,
  email,
  today,
  version,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  email: string | null;
  today: string;
  version?: string;
}) {
  const [withPhotos, setWithPhotos] = useState(false);
  const [withMeals, setWithMeals] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const running = progress != null && !result;
  const photoQ = useQuery({
    queryKey: ["export-photo-files", userId],
    enabled: open,
    staleTime: 0,
    retry: 0,
    queryFn: async () => {
      const f = await progressPhotoFiles(userId);
      return { count: f.length, bytes: f.reduce((a, b) => a + b.size, 0) };
    },
  });
  const photos = photoQ.isError ? "error" : (photoQ.data ?? null);
  const mealQ = useQuery({
    queryKey: ["export-meal-files", userId],
    enabled: open,
    staleTime: 0,
    retry: 0,
    queryFn: async () => {
      const f = await mealPhotoFiles(userId);
      return { count: f.length, bytes: f.reduce((a, b) => a + b.size, 0) };
    },
  });
  const meals = mealQ.isError ? "error" : (mealQ.data ?? null);

  useResetOnOpen(open, () => {
    setResult(null);
    setError(null);
    setProgress(null);
  });

  const run = async () => {
    if (running) return;
    setError(null);
    setResult(null);
    abort.current = new AbortController();
    setProgress({ label: "Starting", done: 0, total: 1 });
    try {
      const r = await buildExport({
        userId,
        email,
        today,
        includePhotos: withPhotos && !!photoInfo?.count,
        includeMealPhotos: withMeals && !!mealInfo?.count,
        appVersion: version,
        onProgress: setProgress,
        signal: abort.current.signal,
      });
      setResult(r);
      saveBlob(r.blob, r.filename);
    } catch (e) {
      setProgress(null);
      if ((e as Error).name === "AbortError") return toast("Export cancelled");
      setError(`Export failed. Nothing was changed. ${e instanceof Error ? e.message : ""}`);
    }
  };

  const rows = result ? Object.values(result.counts).reduce((a, b) => a + b, 0) : 0;
  const photoInfo = photos && photos !== "error" ? photos : null;
  const mealInfo = meals && meals !== "error" ? meals : null;
  const extraBytes = (withPhotos ? (photoInfo?.bytes ?? 0) : 0) + (withMeals ? (mealInfo?.bytes ?? 0) : 0);
  const fileDetail = (f: typeof photos, none: string) =>
    f === null ? <Skeleton className="mt-1 h-3 w-28" /> : f === "error" ? "Couldn't check photo storage." : f.count === 0 ? none : `${f.count} ${f.count === 1 ? "photo" : "photos"} · ${formatBytes(f.bytes)}`;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) abort.current?.abort();
        onOpenChange(o);
      }}
      title="Export your data"
      description="Every table as JSON and CSV in one ZIP file."
      footer={
        result ? (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" onClick={() => saveBlob(result.blob, result.filename)}>
              <Download className="size-5" /> Save file
            </Button>
            {canShareFile(result.blob, result.filename) ? (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => shareBlob(result.blob, result.filename).catch((e: Error) => e.name !== "AbortError" && toast.error("Couldn't share", { description: e.message }))}
              >
                <Share className="size-5" /> Share
              </Button>
            ) : (
              <Button variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            )}
          </div>
        ) : running ? (
          <Button variant="secondary" size="lg" block onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        ) : (
          <Button variant="primary" size="lg" block onClick={run}>
            Export data
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 pb-3 pt-1">
        {result ? (
          <div className="rounded-card bg-surface  flex items-center gap-4 p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-tile bg-card-3 text-fg">
              <FileArchive className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="truncate t-label font-bold text-fg">{result.filename}</p>
              <p className="mt-0.5 t-cap text-fg-2">
                <span className="tabular-nums t-label">{formatBytes(result.bytes)}</span> · {rows.toLocaleString("en-US")} rows
                {result.photos + result.mealPhotos ? ` · ${result.photos + result.mealPhotos} ${result.photos + result.mealPhotos === 1 ? "photo" : "photos"}` : ""}
              </p>
              {result.photosSkipped > 0 && <p className="mt-1 t-cap text-fg-2">{result.photosSkipped} photos couldn&apos;t be downloaded and are listed in the README.</p>}
            </div>
          </div>
        ) : running && progress ? (
          <Progress p={progress} />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-2 t-label text-fg-2">
              {["Profile, goals and every change to them", "Workouts, sets and your program", "Food, water, saved foods and AI chats", "Weigh-ins, measurements, tests and reviews", "Recovery check-ins and habits"].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-fg" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <div className="overflow-hidden rounded-tile border border-line bg-sheet">
              <SwitchRow
                label="Include progress photos"
                detail={fileDetail(photos, "No progress photos yet.")}
                checked={withPhotos && !!photoInfo?.count}
                disabled={!photoInfo || photoInfo.count === 0}
                onChange={setWithPhotos}
              />
              <SwitchRow
                label="Include meal photos"
                detail={fileDetail(meals, "No meal photos yet.")}
                checked={withMeals && !!mealInfo?.count}
                disabled={!mealInfo || mealInfo.count === 0}
                onChange={setWithMeals}
              />
            </div>
            {extraBytes > BIG_EXPORT && (
              <p className="rounded-field border border-ui-line bg-surface px-3.5 py-3 t-cap text-fg">
                That&apos;s a large download ({formatBytes(extraBytes)} of photos). Use Wi-Fi and keep this screen open until it finishes.
              </p>
            )}
            <p className="t-cap leading-relaxed text-fg-2">The file contains health and body data, so store it somewhere private.</p>
          </>
        )}
        {error && <ErrorNote onRetry={run}>{error}</ErrorNote>}
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------- type DELETE */

function TypeDelete({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Field label='Type "DELETE" to confirm'>
      {(id) => (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          disabled={disabled}
          placeholder="DELETE"
          className="font-bold"
        />
      )}
    </Field>
  );
}

/* ------------------------------------------------------- wipe logged data */

export function WipeSheet({ open, onOpenChange, userId, onExport }: { open: boolean; onOpenChange: (o: boolean) => void; userId: string; onExport: () => void }) {
  const qc = useQueryClient();
  const [typed, setTyped] = useState("");
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [report, setReport] = useState<WipeReport | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const busy = useRef(false);

  const previewQ = useQuery({
    queryKey: ["wipe-preview", userId],
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: 0,
    queryFn: () => previewWipe(userId),
  });
  const preview: WipePreview | null | "error" = previewQ.isError ? "error" : (previewQ.data ?? null);
  const load = () => void previewQ.refetch();
  useResetOnOpen(open, () => {
    setTyped("");
    setReport(null);
    setProgress(null);
    setRunError(null);
  });

  const total = preview && preview !== "error" ? wipeTotal({ ...preview, failed: [] }) : 0;

  const run = async () => {
    if (busy.current || typed !== "DELETE") return;
    busy.current = true;
    setRunError(null);
    setProgress({ label: "Syncing pending changes", done: 0, total: 1 });
    try {
      await drained(4000); // don't let a queued set edit land after the wipe
      const r = await wipeLoggedData(userId, setProgress);
      setReport(r);
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith("pgg.rest.")) localStorage.removeItem(k);
      } catch {
        /* private mode */
      }
      await qc.invalidateQueries();
      if (r.failed.length) toast.error("Some data couldn't be deleted", { description: r.failed.map((f) => f.what).join(", ") });
      else toast.success(`Deleted ${wipeTotal(r).toLocaleString("en-US")} items`);
    } catch (e) {
      // the report path never throws; this is a lost connection before anything ran
      setRunError(`Couldn't start the delete. Nothing was removed. ${e instanceof Error ? e.message : ""}`);
      void previewQ.refetch();
    } finally {
      busy.current = false;
      setProgress(null);
    }
  };

  const lines =
    preview && preview !== "error"
      ? [...WIPE_TABLES.filter((t) => (preview.rows[t] ?? 0) > 0).map((t) => countLabel(t, preview.rows[t]!)), ...fileLines(preview.files, preview.thumbs)]
      : [];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !busy.current && onOpenChange(o)}
      title="Delete all logged data"
      description="Start fresh while keeping your account and goals."
      footer={
        report ? (
          report.failed.length ? (
            <Button variant="destructive" size="lg" block onClick={() => {
                setReport(null);
                void run();
              }}>
              Retry the rest
            </Button>
          ) : (
            <Button variant="secondary" size="lg" block onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )
        ) : (
          <Button variant="destructive-solid" size="lg" block className="disabled:bg-control disabled:text-fg-3" disabled={typed !== "DELETE" || total === 0 || !!progress} loading={!!progress} onClick={run}>
            Delete logged data
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 pb-3 pt-1">
        {report ? (
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-card bg-surface  p-4">
              <p className="t-label font-semibold mb-2">Deleted</p>
              {wipeSummary(report).length ? (
                <ul className="grid grid-cols-1 gap-1 t-label text-fg">
                  {wipeSummary(report).map((l) => (
                    <li key={l} className="flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-fg" aria-hidden />
                      <span>
                        <CountLine text={l} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-label text-fg-2">Nothing needed deleting.</p>
              )}
            </div>
            {report.failed.length > 0 && (
              <ErrorNote>
                Not deleted: {report.failed.map((f) => `${f.what} (${f.message})`).join("; ")}. Everything else is gone.
              </ErrorNote>
            )}
          </div>
        ) : progress ? (
          <Progress p={progress} />
        ) : (
          <>
            <div className="rounded-card bg-surface  p-4">
              <p className="t-label font-semibold mb-2">Will be deleted</p>
              {preview === null ? (
                <div className="grid grid-cols-1 gap-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3.5 w-36" />
                </div>
              ) : preview === "error" ? (
                <ErrorNote onRetry={load}>Couldn&apos;t count your data.</ErrorNote>
              ) : lines.length === 0 ? (
                <p className="t-label text-fg-2">There&apos;s no logged data to delete.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 t-label sm:grid-cols-2">
                  {lines.map((l) => (
                    <li key={l}>
                      <CountLine text={l} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-1">
              <p className="t-label font-semibold mb-1.5">Kept</p>
              <p className="t-cap leading-relaxed text-fg-2">{KEPT_ON_WIPE.join(" · ")}</p>
            </div>
            <p className="t-cap leading-relaxed text-fg-2">
              This can&apos;t be undone.{" "}
              <button type="button" className="-my-3 inline-flex min-h-11 items-center font-bold text-fg" onClick={onExport}>
                Export a copy first
              </button>
            </p>
            <TypeDelete value={typed} onChange={setTyped} disabled={total === 0} />
            {runError && <ErrorNote onRetry={() => void run()}>{runError}</ErrorNote>}
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------- delete account */

export function DeleteAccountSheet({ open, onOpenChange, email, onExport }: { open: boolean; onOpenChange: (o: boolean) => void; email: string | null; onExport: () => void }) {
  const qc = useQueryClient();
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  useResetOnOpen(open, () => {
    setTyped("");
    setError(null);
  });

  const run = async () => {
    if (busy.current || typed !== "DELETE") return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !body.ok) throw new Error(body.message ?? `The server said ${res.status}.`);
      await supabaseBrowser().auth.signOut({ scope: "local" });
      clearLocalCaches({ includeOutbox: true });
      qc.clear();
      // a full page load (see useSignOut): no signed-out server payload requests
      window.location.replace("/sign-in?deleted=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !busy.current && onOpenChange(o)}
      title="Delete account"
      description={email ? `Permanently delete ${email}.` : "Permanently delete your account."}
      footer={
        <Button variant="destructive-solid" size="lg" block className="disabled:bg-control disabled:text-fg-3" disabled={typed !== "DELETE"} loading={pending} onClick={run}>
          Delete account
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 pb-3 pt-1">
        <ul className="grid grid-cols-1 gap-2 t-label leading-relaxed text-fg-2">
          <li>Every workout, food log, weigh-in, measurement and check-in.</li>
          <li>All progress and meal photos in private storage.</li>
          <li>Your profile, goals and sign-in. This can&apos;t be undone.</li>
        </ul>
        <p className="t-cap text-fg-2">
          <button type="button" className="-my-3 inline-flex min-h-11 items-center font-bold text-fg" onClick={onExport}>
            Export a copy first
          </button>
        </p>
        <TypeDelete value={typed} onChange={setTyped} disabled={pending} />
        {error && <ErrorNote className={cn(pending && "opacity-60")}>{error}</ErrorNote>}
      </div>
    </Sheet>
  );
}

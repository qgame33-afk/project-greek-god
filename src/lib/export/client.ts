"use client";

// Browser-side data export and "delete all logged data". Every query runs as the signed-in
// user under row-level security, so only their own rows and files are ever touched.

import { zip, zipSync } from "fflate";
import { fetchAll, sb } from "@/lib/data/core";
import { assembleExport, exportFilename, mealPhotoArchiveName, photoArchiveName, type ExportPhoto, type ExportTables } from "./assemble";
import { listAllFiles, removeFiles, splitThumbnails, type StoredFile } from "./storage";
import { EXPORT_TABLES, PHOTO_BUCKETS, WIPE_TABLES, type PhotoBucket, type UserTable, type WipeReport } from "./tables";

type Res<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>;
interface LooseQuery {
  select(cols: string, opts?: { count?: "exact"; head?: boolean }): LooseQuery & Res<Record<string, unknown>>;
  order(col: string, opts?: { ascending?: boolean }): LooseQuery;
  range(a: number, b: number): Res<Record<string, unknown>>;
  delete(opts?: { count?: "exact" }): LooseQuery;
  eq(col: string, v: string): LooseQuery & Res<Record<string, unknown>>;
}
/** The typed client can't index `.from()` with a union of table names; this narrow view can. */
const table = (t: UserTable) => (sb() as unknown as { from(t: string): LooseQuery }).from(t);

export interface ExportProgress {
  label: string;
  done: number;
  total: number;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  bytes: number;
  counts: Record<string, number>;
  photos: number;
  mealPhotos: number;
  photosSkipped: number;
}

/** Progress-photo files under the user's folder (thumbnails excluded), for the count and size warning before export. */
export async function progressPhotoFiles(userId: string): Promise<StoredFile[]> {
  return splitThumbnails(await listAllFiles(sb().storage.from("progress-photos"), userId)).main;
}

/** Meal-photo files under the user's folder (scans and Food Coach uploads). */
export async function mealPhotoFiles(userId: string): Promise<StoredFile[]> {
  return listAllFiles(sb().storage.from("meal-photos"), userId);
}

/**
 * Download private files through short-lived signed URLs, four at a time. A file that can't be
 * fetched is counted as skipped (and listed in the README); cancelling stops everything.
 */
async function downloadFiles(
  bucket: PhotoBucket,
  items: { path: string; name: (mime: string | null) => string }[],
  progress: (done: number) => void,
  signal?: AbortSignal,
): Promise<{ files: ExportPhoto[]; skipped: number }> {
  const files: ExportPhoto[] = [];
  let skipped = 0;
  for (let i = 0; i < items.length; i += 100) {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    const chunk = items.slice(i, i + 100);
    const { data, error } = await sb().storage.from(bucket).createSignedUrls(chunk.map((r) => r.path), 600);
    if (error) throw new Error(error.message);
    const urls = new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl]));
    let next = 0;
    const worker = async () => {
      while (next < chunk.length) {
        const it = chunk[next++];
        progress(files.length + skipped);
        const url = urls.get(it.path);
        if (!url) {
          skipped++;
          continue;
        }
        try {
          const res = await fetch(url, { signal });
          if (!res.ok) throw new Error(String(res.status));
          files.push({ name: it.name(res.headers.get("content-type")), bytes: new Uint8Array(await res.arrayBuffer()) });
        } catch (e) {
          if ((e as Error).name === "AbortError") throw e;
          skipped++;
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }
  return { files, skipped };
}

export async function buildExport(opts: {
  userId: string;
  email: string | null;
  today: string;
  includePhotos: boolean;
  includeMealPhotos?: boolean;
  appVersion?: string;
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
}): Promise<ExportResult> {
  const { userId, onProgress, signal } = opts;
  const tables: ExportTables = {};
  let done = 0;
  const total = EXPORT_TABLES.length;
  for (const t of EXPORT_TABLES) {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    onProgress?.({ label: `Reading ${t.replace(/_/g, " ")}`, done, total });
    tables[t] = await fetchAll((a, b) => table(t).select("*").order("id").range(a, b));
    done++;
  }

  const photos: ExportPhoto[] = [];
  let skipped = 0;
  let mealPhotos = 0;
  if (opts.includePhotos) {
    const rows = (tables.progress_photos ?? []) as { id: string; local_date: string; pose: string; storage_path: string }[];
    const r = await downloadFiles(
      "progress-photos",
      rows.map((row) => ({ path: row.storage_path, name: (mime: string | null) => photoArchiveName(row, mime) })),
      (d) => onProgress?.({ label: `Downloading progress photo ${Math.min(d + 1, rows.length)} of ${rows.length}`, done: d, total: rows.length }),
      signal,
    );
    photos.push(...r.files);
    skipped += r.skipped;
  }
  if (opts.includeMealPhotos) {
    const list = await mealPhotoFiles(userId);
    const r = await downloadFiles(
      "meal-photos",
      list.map((f) => ({ path: f.path, name: () => mealPhotoArchiveName(f.path, userId) })),
      (d) => onProgress?.({ label: `Downloading meal photo ${Math.min(d + 1, list.length)} of ${list.length}`, done: d, total: list.length }),
      signal,
    );
    photos.push(...r.files);
    mealPhotos = r.files.length;
    skipped += r.skipped;
  }

  onProgress?.({ label: "Packing the archive", done: 1, total: 1 });
  const { files, counts } = assembleExport(
    { userId, email: opts.email, exportedAt: new Date().toISOString(), appVersion: opts.appVersion },
    tables,
    photos,
    skipped,
  );
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    try {
      zip(files, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)));
    } catch {
      // workers unavailable (very old browsers / strict CSP): pack on the main thread
      try {
        resolve(zipSync(files, { level: 6 }));
      } catch (e) {
        reject(e);
      }
    }
  });
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  return { blob, filename: exportFilename(opts.today), bytes: blob.size, counts, photos: photos.length - mealPhotos, mealPhotos, photosSkipped: skipped };
}

/** Trigger a download. Returns false if the browser refused (caller can offer Share). */
export function saveBlob(blob: Blob, filename: string) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

/** iOS Home Screen apps can't always download blobs; the share sheet can save to Files. */
export function canShareFile(blob: Blob, filename: string) {
  try {
    const f = new File([blob], filename, { type: "application/zip" });
    return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [f] });
  } catch {
    return false;
  }
}

export async function shareBlob(blob: Blob, filename: string) {
  const f = new File([blob], filename, { type: "application/zip" });
  await navigator.share({ files: [f], title: filename });
}

/* ------------------------------------------------------------- wipe data */

export interface WipePreview {
  rows: Partial<Record<UserTable, number>>;
  files: Partial<Record<PhotoBucket, number>>;
  thumbs: Partial<Record<PhotoBucket, number>>;
}

/** Exact counts of what "Delete all logged data" would remove. */
export async function previewWipe(userId: string): Promise<WipePreview> {
  const rows: Partial<Record<UserTable, number>> = {};
  await Promise.all(
    WIPE_TABLES.map(async (t) => {
      const { count, error } = await table(t).select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      rows[t] = count ?? 0;
    }),
  );
  const files: Partial<Record<PhotoBucket, number>> = {};
  const thumbs: Partial<Record<PhotoBucket, number>> = {};
  await Promise.all(
    PHOTO_BUCKETS.map(async (b) => {
      const { main, thumbs: t } = splitThumbnails(await listAllFiles(sb().storage.from(b), userId));
      files[b] = main.length;
      thumbs[b] = t.length;
    }),
  );
  return { rows, files, thumbs };
}

/**
 * Delete every logged row (table by table, children first) and every photo file under the
 * user's folder in both buckets. Keeps the account, profile, templates and habit list.
 * Continues past a failing table and reports exactly what was and wasn't removed.
 */
export async function wipeLoggedData(userId: string, onProgress?: (p: ExportProgress) => void): Promise<WipeReport> {
  const report: WipeReport = { rows: {}, files: {}, thumbs: {}, failed: [] };
  const total = WIPE_TABLES.length + PHOTO_BUCKETS.length;
  let done = 0;
  for (const t of WIPE_TABLES) {
    onProgress?.({ label: `Deleting ${t.replace(/_/g, " ")}`, done, total });
    try {
      const { count, error } = await table(t).delete({ count: "exact" }).eq("user_id", userId);
      if (error) throw new Error(error.message);
      report.rows[t] = count ?? 0;
    } catch (e) {
      report.failed.push({ what: t.replace(/_/g, " "), message: e instanceof Error ? e.message : String(e) });
    }
    done++;
  }
  for (const b of PHOTO_BUCKETS) {
    onProgress?.({ label: `Deleting ${b.replace("-", " ")}`, done, total });
    try {
      const store = sb().storage.from(b);
      const { main, thumbs } = splitThumbnails(await listAllFiles(store, userId));
      report.files[b] = await removeFiles(store, main.map((f) => f.path));
      report.thumbs![b] = await removeFiles(store, thumbs.map((f) => f.path));
    } catch (e) {
      report.failed.push({ what: b.replace("-", " "), message: e instanceof Error ? e.message : String(e) });
    }
    done++;
  }
  return report;
}

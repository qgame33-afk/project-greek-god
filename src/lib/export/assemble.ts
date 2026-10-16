// Pure layout of the export archive: data.json, one CSV per table, a README and optional
// photo files. The browser fetches the data and zips it (see ./client.ts).

import { toCSV } from "./csv";
import { EXPORT_TABLES, type UserTable } from "./tables";

export interface ExportMeta {
  userId: string;
  email: string | null;
  exportedAt: string; // ISO timestamp
  appVersion?: string;
}

export interface ExportPhoto {
  /** Path inside the archive, e.g. photos/progress/2026-10-16_front_ab12cd34.jpg */
  name: string;
  bytes: Uint8Array;
}

export type ExportTables = Partial<Record<UserTable, Record<string, unknown>[]>>;

const enc = new TextEncoder();

/** File name for a progress photo inside the archive. */
export function photoArchiveName(row: { local_date: string; pose: string; id: string; storage_path: string }, mimetype?: string | null) {
  const ext = extFor(row.storage_path, mimetype);
  return `photos/progress/${row.local_date}_${row.pose}_${row.id.slice(0, 8)}.${ext}`;
}

function extFor(path: string, mimetype?: string | null) {
  const m = /\.([a-z0-9]{2,5})$/i.exec(path);
  if (m) return m[1].toLowerCase();
  if (mimetype === "image/png") return "png";
  if (mimetype === "image/webp") return "webp";
  if (mimetype === "image/heic") return "heic";
  return "jpg";
}

/** A meal photo keeps its storage folders inside photos/meals/ (the user-id folder is dropped). */
export function mealPhotoArchiveName(storagePath: string, userId: string) {
  const rel = storagePath.startsWith(`${userId}/`) ? storagePath.slice(userId.length + 1) : storagePath;
  return `photos/meals/${rel.replace(/^\/+/, "")}`;
}

export function exportFilename(date: string) {
  return `greek-god-export-${date}.zip`;
}

export function readme(meta: ExportMeta, counts: Record<string, number>, photoCount: number, photosSkipped: number, mealPhotoCount = 0) {
  const lines = [
    "PROJECT GREEK GOD · THE ASCENT — data export",
    "",
    `Exported: ${meta.exportedAt}`,
    `Account:  ${meta.email ?? meta.userId}`,
    meta.appVersion ? `App:      ${meta.appVersion}` : null,
    "",
    "What's inside",
    "  data.json        Every table, exactly as stored (weights in lb, lengths in inches, water in mL).",
    "  csv/<table>.csv  The same rows as spreadsheets, one file per table. Empty tables are empty files.",
    photoCount ? "  photos/progress  Your progress photos, named date_pose_id." : "  Progress photos are listed in progress_photos (metadata only).",
    mealPhotoCount ? "  photos/meals     Your meal photos, in their date folders." : "  Meal photos are referenced by food_entries.photo_path (not included).",
    "",
    "Rows per table",
    ...EXPORT_TABLES.map((t) => `  ${t.padEnd(22)} ${counts[t] ?? 0}`),
    photoCount || mealPhotoCount || photosSkipped ? "" : null,
    photoCount || mealPhotoCount ? `Photo files included: ${photoCount + mealPhotoCount}` : null,
    photosSkipped ? `Photo files that could not be downloaded: ${photosSkipped}` : null,
    "",
    "Private by default. Keep this file somewhere safe — it contains your health and body data.",
  ];
  return lines.filter((l): l is string => l !== null).join("\n") + "\n";
}

/** The archive's directory tree. Text is deflated; photos are stored as-is (already compressed). */
export function assembleExport(meta: ExportMeta, tables: ExportTables, photos: ExportPhoto[] = [], photosSkipped = 0) {
  const counts: Record<string, number> = {};
  for (const t of EXPORT_TABLES) counts[t] = tables[t]?.length ?? 0;
  const data = {
    format: "project-greek-god-export",
    version: 1,
    exported_at: meta.exportedAt,
    user: { id: meta.userId, email: meta.email },
    units: { weight: "lb", length: "in", water: "mL", dates: "YYYY-MM-DD in your time zone" },
    counts,
    tables: Object.fromEntries(EXPORT_TABLES.map((t) => [t, tables[t] ?? []])),
  };
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    "README.txt": enc.encode(
      readme(
        meta,
        counts,
        photos.filter((p) => !p.name.startsWith("photos/meals/")).length,
        photosSkipped,
        photos.filter((p) => p.name.startsWith("photos/meals/")).length,
      ),
    ),
    "data.json": enc.encode(JSON.stringify(data, null, 2)),
  };
  for (const t of EXPORT_TABLES) files[`csv/${t}.csv`] = enc.encode(toCSV(tables[t] ?? []));
  for (const p of photos) files[p.name] = [p.bytes, { level: 0 }];
  return { files, counts };
}

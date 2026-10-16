// Progress photo helpers: storage naming, downscale maths, month grouping and the
// "nearest value to this date" lookups used by the comparison placards. Pure.

import { daysBetween, monthStart, type ISODate } from "@/lib/dates";

export type Pose = "front" | "side" | "back" | "flex_front" | "flex_back";

export const POSES: { key: Pose; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
  { key: "flex_front", label: "Front flex" },
  { key: "flex_back", label: "Back flex" },
];

export const POSE_LABEL: Record<string, string> = { ...Object.fromEntries(POSES.map((p) => [p.key, p.label])), other: "Other" };

export const isPose = (v: unknown): v is Pose => POSES.some((p) => p.key === v);

export const MAX_EDGE = 2000;
export const THUMB_EDGE = 600;
/** Bytes accepted before decoding — larger files are refused early with a clear message. */
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;

/**
 * Object key inside the private bucket. The first folder must be the user's id — storage
 * RLS only lets a user touch objects under their own folder.
 */
export function photoPath(userId: string, date: ISODate, pose: Pose, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid user id");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  if (!isPose(pose)) throw new Error("Invalid pose");
  const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
  return `${userId}/${date}-${pose}-${safeId}.jpg`;
}

/** The small preview stored next to each photo. */
export function thumbPath(path: string) {
  return /\.jpe?g$/i.test(path) ? path.replace(/\.jpe?g$/i, ".thumb.jpg") : `${path}.thumb.jpg`;
}

/** Scale (w, h) down so the longest edge is ≤ max. Never upscales. */
export function fitWithin(w: number, h: number, max: number) {
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0, scale: 0 };
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

export interface PhotoLike {
  id: string;
  local_date: ISODate;
  pose: string;
  created_at?: string;
}

/** Photos grouped by calendar month, newest month first; inside a month newest first. */
export function groupPhotosByMonth<T extends PhotoLike>(photos: T[]): { month: ISODate; photos: T[] }[] {
  const by = new Map<ISODate, T[]>();
  for (const p of photos) {
    const m = monthStart(p.local_date);
    if (!by.has(m)) by.set(m, []);
    by.get(m)!.push(p);
  }
  return [...by.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, list]) => ({
      month,
      photos: list.sort((a, b) => b.local_date.localeCompare(a.local_date) || (b.created_at ?? "").localeCompare(a.created_at ?? "")),
    }));
}

/** The row dated closest to `date` within `maxDays` (ties prefer the earlier row). */
export function nearestByDate<T extends { local_date: ISODate }>(rows: T[], date: ISODate, maxDays: number): { row: T; days: number } | null {
  let best: { row: T; days: number } | null = null;
  for (const r of rows) {
    const d = Math.abs(daysBetween(date, r.local_date));
    if (d > maxDays) continue;
    if (!best || d < best.days || (d === best.days && r.local_date < best.row.local_date)) best = { row: r, days: d };
  }
  return best;
}

/** Default comparison: the oldest and newest photo of the most-photographed pose. */
export function defaultComparePair<T extends PhotoLike>(photos: T[], pose?: string): [T, T] | null {
  const counts = new Map<string, number>();
  for (const p of photos) counts.set(p.pose, (counts.get(p.pose) ?? 0) + 1);
  const chosen =
    pose && (counts.get(pose) ?? 0) >= 2
      ? pose
      : [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || (a[0] === "front" ? -1 : b[0] === "front" ? 1 : 0))[0]?.[0];
  if (!chosen) return null;
  const list = photos.filter((p) => p.pose === chosen).sort((a, b) => a.local_date.localeCompare(b.local_date) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  if (list.length < 2) return null;
  return [list[0], list[list.length - 1]];
}

/** Clamp the wipe divider position to 0–100 (percent). */
export const clampPct = (v: number) => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 50));

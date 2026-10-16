// Recursive listing of a user's private storage folder (Supabase Storage lists one level at
// a time, 1000 entries per page). Works with the browser client (RLS) and the admin client.

export interface StorageEntry {
  name: string;
  id: string | null;
  metadata?: { size?: number; mimetype?: string } | null;
}

export interface Lister {
  list(
    path: string,
    options: { limit: number; offset: number; sortBy?: { column: string; order: string } },
  ): PromiseLike<{ data: StorageEntry[] | null; error: { message: string } | null }>;
}

export interface StoredFile {
  path: string;
  size: number;
  mimetype: string | null;
}

/**
 * Progress photos are stored with a small preview next to them ("<name>.thumb.jpg"). Previews
 * are counted and deleted, but they aren't photos: they're never exported or counted as one.
 */
export function isThumbnail(path: string) {
  return /\.thumb\.[a-z0-9]{2,5}$/i.test(path);
}

/** Split a listing into photos and their thumbnails. */
export function splitThumbnails<T extends { path: string }>(files: T[]): { main: T[]; thumbs: T[] } {
  const main: T[] = [];
  const thumbs: T[] = [];
  for (const f of files) (isThumbnail(f.path) ? thumbs : main).push(f);
  return { main, thumbs };
}

/** Every file under `prefix` (e.g. the user's id), depth-first, with sizes when known. */
export async function listAllFiles(bucket: Lister, prefix: string, maxFiles = 50_000): Promise<StoredFile[]> {
  const out: StoredFile[] = [];
  const folders = [prefix.replace(/\/+$/, "")];
  const PAGE = 1000;
  while (folders.length) {
    const dir = folders.shift()!;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await bucket.list(dir, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(error.message);
      const items = data ?? [];
      for (const it of items) {
        if (!it.name || it.name === ".emptyFolderPlaceholder") continue;
        const path = dir ? `${dir}/${it.name}` : it.name;
        // folders come back with a null id and no metadata
        if (it.id == null && !it.metadata) folders.push(path);
        else out.push({ path, size: Number(it.metadata?.size ?? 0), mimetype: it.metadata?.mimetype ?? null });
        if (out.length >= maxFiles) return out;
      }
      if (items.length < PAGE) break;
    }
  }
  return out;
}

/** Remove paths in batches; returns how many were removed. */
export async function removeFiles(
  bucket: { remove(paths: string[]): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> },
  paths: string[],
  batch = 100,
): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += batch) {
    const chunk = paths.slice(i, i + batch);
    const { data, error } = await bucket.remove(chunk);
    if (error) throw new Error(error.message);
    removed += data?.length ?? chunk.length;
  }
  return removed;
}

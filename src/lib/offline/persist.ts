// The offline query cache (DESIGN-V2 §5.2 F-B.6): a hand-written persister on the
// dehydrate/hydrate functions TanStack Query already ships (no new package). It keeps the
// queries an offline cold start needs (Now's first screen, plus Train/Fuel/Ascent basics)
// in IndexedDB, throttled to one write per 2 s, for at most 7 days, for one user only.
// The storage is injectable so the logic is tested without a browser.

import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from "@tanstack/react-query";

export const PERSIST_VERSION = 1;
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const PERSIST_THROTTLE_MS = 2_000;

/**
 * Query-key roots worth keeping (the first element of each key). Everything else — AI
 * conversations, search results, signed photo URLs, exports — is refetched online only.
 */
export const PERSIST_ROOTS: ReadonlySet<string> = new Set([
  "profile",
  "weights",
  "food", // today's entries, and the planned-meal links under "food"
  "food-days",
  "water",
  "water-days",
  "templates",
  "day-plans",
  "sessions", // includes ["sessions", "active", userId]
  "recovery",
  "habit-defs",
  "habit-logs",
  "pr-events",
  "goal-changes",
  "meal-plan",
  "meal-planned-range",
  "meal-prefs",
  "meal-recipes",
  "meal-grocery", // the Market list, for a store with no signal
  "exercise-bests",
  "custom-exercises",
  "measurements",
]);

export interface PersistedCache {
  v: number;
  userId: string;
  savedAt: number;
  state: DehydratedState;
}

/** Where the cache lives. The default is IndexedDB; tests pass an in-memory store. */
export interface CacheStore {
  get(): Promise<unknown>;
  set(value: PersistedCache): Promise<void>;
  del(): Promise<void>;
}

/** Keep a query? Allow-listed root, successful, fresh enough and belonging to this user. */
export function shouldPersist(q: Pick<Query, "queryKey" | "state">, userId: string, now = Date.now()): boolean {
  const root = q.queryKey[0];
  if (typeof root !== "string" || !PERSIST_ROOTS.has(root)) return false;
  if (q.state.status !== "success" || q.state.data === undefined) return false;
  if (now - q.state.dataUpdatedAt > PERSIST_MAX_AGE_MS) return false;
  return q.queryKey.includes(userId);
}

/** A stored cache may be restored: right version, same user, not older than 7 days. */
export function isUsable(c: unknown, userId: string, now = Date.now()): c is PersistedCache {
  if (!c || typeof c !== "object") return false;
  const x = c as Partial<PersistedCache>;
  return x.v === PERSIST_VERSION && x.userId === userId && typeof x.savedAt === "number" && now - x.savedAt <= PERSIST_MAX_AGE_MS && !!x.state && Array.isArray(x.state.queries);
}

/** The persistable part of the cache right now. */
export function snapshot(client: QueryClient, userId: string, now = Date.now()): PersistedCache {
  const state = dehydrate(client, { shouldDehydrateQuery: (q) => shouldPersist(q, userId, now), shouldDehydrateMutation: () => false });
  return { v: PERSIST_VERSION, userId, savedAt: now, state };
}

/**
 * Put the stored cache back into the client before the shell renders. Only for the user
 * whose session is on this device; anything else (another user, too old, a new version)
 * is deleted. Returns whether anything was restored. Never throws.
 */
export async function restoreQueryCache(client: QueryClient, userId: string | null, store: CacheStore = idbStore(), now = Date.now()): Promise<boolean> {
  try {
    const c = await store.get();
    if (!c) return false;
    if (!userId || !isUsable(c, userId, now)) {
      await store.del();
      return false;
    }
    // hydrate() never overwrites newer data already in the client
    hydrate(client, c.state);
    // Restored data shows at once but is revalidated as soon as a screen uses it (online): a
    // snapshot written just before the app closed can be a step behind the server, and its
    // timestamps alone would keep it "fresh" for the staleTime.
    for (const q of c.state.queries) {
      if (client.getQueryState(q.queryKey)?.dataUpdatedAt === q.state.dataUpdatedAt) void client.invalidateQueries({ queryKey: q.queryKey, exact: true, refetchType: "none" });
    }
    return c.state.queries.length > 0;
  } catch {
    return false;
  }
}

/**
 * Persist the allow-listed queries whenever the cache changes, at most once per 2 s, and
 * once more when the page is hidden. `getUserId` is read at write time, so nothing is
 * written while signed out. Returns the unsubscribe function.
 */
export function persistQueryCache(
  client: QueryClient,
  getUserId: () => string | null,
  store: CacheStore = idbStore(),
  opts: { throttleMs?: number; now?: () => number } = {},
): () => void {
  const throttle = opts.throttleMs ?? PERSIST_THROTTLE_MS;
  const now = opts.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const save = () => {
    timer = null;
    const userId = getUserId();
    if (stopped || !userId) return;
    store.set(snapshot(client, userId, now())).catch(() => {});
  };
  const unsubscribe = client.getQueryCache().subscribe((e) => {
    if (e.type !== "updated" && e.type !== "removed" && e.type !== "added") return;
    if (!timer) timer = setTimeout(save, throttle);
  });
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      save();
    }
  };
  const onHide = () => {
    if (typeof document === "undefined" || document.visibilityState === "hidden") flush();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onHide);
  if (typeof window !== "undefined") window.addEventListener("pagehide", flush);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    unsubscribe();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onHide);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", flush);
  };
}

/** Forget the stored cache (sign-out, user change). Never throws. */
export async function clearQueryCache(store: CacheStore = idbStore()): Promise<void> {
  try {
    await store.del();
  } catch {
    /* storage unavailable */
  }
}

/* ---------------------------------------------------------------- IndexedDB */

const DB_NAME = "pgg-offline";
const STORE = "query-cache";
const KEY = "v1";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null); // private mode in some browsers
    }
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | null): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        if (!db) return resolve(undefined);
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req?.result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
        t.onabort = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

/** The IndexedDB-backed store (a no-op where IndexedDB is unavailable). */
export function idbStore(): CacheStore {
  return {
    get: () => tx<unknown>("readonly", (s) => s.get(KEY)),
    set: (v) => tx("readwrite", (s) => s.put(v, KEY)).then(() => undefined),
    del: () => tx("readwrite", (s) => s.delete(KEY)).then(() => undefined),
  };
}

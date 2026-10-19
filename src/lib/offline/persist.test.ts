import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearQueryCache, isUsable, persistQueryCache, PERSIST_MAX_AGE_MS, PERSIST_VERSION, restoreQueryCache, shouldPersist, snapshot, type CacheStore, type PersistedCache } from "./persist";

const U = "user-1";

function memStore() {
  let v: unknown = undefined;
  const store: CacheStore & { value: () => unknown; writes: number } = {
    writes: 0,
    get: async () => v,
    set: async (x) => {
      store.writes++;
      v = structuredClone(x);
    },
    del: async () => {
      v = undefined;
    },
    value: () => v,
  };
  return store;
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

afterEach(() => vi.useRealTimers());

describe("shouldPersist", () => {
  const q = (key: unknown[], over: Partial<{ status: string; data: unknown; dataUpdatedAt: number }> = {}) =>
    ({ queryKey: key, state: { status: "success", data: [1], dataUpdatedAt: Date.now(), ...over } }) as unknown as Parameters<typeof shouldPersist>[0];

  it("keeps allow-listed queries of this user only", () => {
    expect(shouldPersist(q(["profile", U]), U)).toBe(true);
    expect(shouldPersist(q(["food", "2026-10-17", U]), U)).toBe(true);
    expect(shouldPersist(q(["sessions", "active", U]), U)).toBe(true);
    expect(shouldPersist(q(["profile", "someone-else"]), U)).toBe(false);
    expect(shouldPersist(q(["coach-msgs", "c1", U]), U)).toBe(false); // AI threads stay online-only
    expect(shouldPersist(q(["food-search", "eggs", U]), U)).toBe(false);
    expect(shouldPersist(q(["auth-user"]), U)).toBe(false);
  });

  it("skips failed, empty and stale queries", () => {
    expect(shouldPersist(q(["weights", U], { status: "error" }), U)).toBe(false);
    expect(shouldPersist(q(["weights", U], { data: undefined }), U)).toBe(false);
    expect(shouldPersist(q(["weights", U], { dataUpdatedAt: Date.now() - PERSIST_MAX_AGE_MS - 1 }), U)).toBe(false);
  });
});

describe("isUsable", () => {
  const good: PersistedCache = { v: PERSIST_VERSION, userId: U, savedAt: Date.now(), state: { mutations: [], queries: [] } };
  it("needs the same version and user, and at most 7 days old", () => {
    expect(isUsable(good, U)).toBe(true);
    expect(isUsable({ ...good, v: 0 }, U)).toBe(false);
    expect(isUsable(good, "other")).toBe(false);
    expect(isUsable({ ...good, savedAt: Date.now() - PERSIST_MAX_AGE_MS - 1 }, U)).toBe(false);
    expect(isUsable(null, U)).toBe(false);
    expect(isUsable({ v: 1 }, U)).toBe(false);
  });
});

describe("snapshot → restore", () => {
  it("round-trips allow-listed data into a fresh client (an offline cold start)", async () => {
    const a = client();
    a.setQueryData(["profile", U], { id: U, calorie_goal: 3300 });
    a.setQueryData(["weights", U], [{ local_date: "2026-10-17", weight_lb: 168.4 }]);
    a.setQueryData(["coach-msgs", "c1", U], ["not kept"]);
    const store = memStore();
    await store.set(snapshot(a, U));

    const b = client();
    expect(await restoreQueryCache(b, U, store)).toBe(true);
    expect(b.getQueryData(["profile", U])).toEqual({ id: U, calorie_goal: 3300 });
    expect(b.getQueryData(["weights", U])).toEqual([{ local_date: "2026-10-17", weight_lb: 168.4 }]);
    expect(b.getQueryData(["coach-msgs", "c1", U])).toBeUndefined();
  });

  it("another user's cache is deleted, never shown", async () => {
    const a = client();
    a.setQueryData(["profile", U], { id: U });
    const store = memStore();
    await store.set(snapshot(a, U));
    const b = client();
    expect(await restoreQueryCache(b, "user-2", store)).toBe(false);
    expect(b.getQueryData(["profile", U])).toBeUndefined();
    expect(store.value()).toBeUndefined();
    // signed out: nothing restored, cache removed
    await store.set(snapshot(a, U));
    expect(await restoreQueryCache(client(), null, store)).toBe(false);
    expect(store.value()).toBeUndefined();
  });

  it("does not overwrite fresher data already in the client", async () => {
    const a = client();
    a.setQueryData(["profile", U], { v: "old" });
    const store = memStore();
    await store.set(snapshot(a, U, Date.now() - 60_000));
    const b = client();
    b.setQueryData(["profile", U], { v: "new" });
    await restoreQueryCache(b, U, store);
    expect(b.getQueryData(["profile", U])).toEqual({ v: "new" });
  });

  it("restored data is stale, so a screen that uses it revalidates (a snapshot can lag the server)", async () => {
    const a = client();
    a.setQueryData(["meal-grocery", "p1", U], [{ key: "eggs", checked: false }]);
    const store = memStore();
    await store.set(snapshot(a, U));
    const b = client(); // staleTime: Infinity, so only invalidation can make it stale
    await restoreQueryCache(b, U, store);
    expect(b.getQueryData(["meal-grocery", "p1", U])).toEqual([{ key: "eggs", checked: false }]);
    expect(b.getQueryState(["meal-grocery", "p1", U])?.isInvalidated).toBe(true);
  });

  it("never throws when storage fails", async () => {
    const broken: CacheStore = { get: () => Promise.reject(new Error("no idb")), set: () => Promise.reject(new Error("x")), del: () => Promise.reject(new Error("x")) };
    expect(await restoreQueryCache(client(), U, broken)).toBe(false);
    await expect(clearQueryCache(broken)).resolves.toBeUndefined();
  });
});

describe("persistQueryCache", () => {
  it("writes at most once per throttle window, only when signed in", async () => {
    vi.useFakeTimers();
    const c = client();
    const store = memStore();
    let user: string | null = U;
    const stop = persistQueryCache(c, () => user, store, { throttleMs: 2000 });
    c.setQueryData(["profile", U], { a: 1 });
    c.setQueryData(["weights", U], [1]);
    c.setQueryData(["weights", U], [1, 2]);
    expect(store.writes).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.writes).toBe(1);
    expect((store.value() as PersistedCache).state.queries.map((q) => q.queryKey[0]).sort()).toEqual(["profile", "weights"]);
    // signed out: no writes
    user = null;
    c.setQueryData(["profile", U], { a: 2 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.writes).toBe(1);
    stop();
    user = U;
    c.setQueryData(["profile", U], { a: 3 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(store.writes).toBe(1); // unsubscribed
  });
});

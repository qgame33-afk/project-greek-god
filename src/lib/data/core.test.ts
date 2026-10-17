import { describe, expect, it } from "vitest";
import { isNetworkError } from "@/lib/workout/sync";
import { fetchAll, friendlyError, saveErrorKind } from "./core";

describe("saveErrorKind", () => {
  it("tells a dropped connection from a database limit", () => {
    expect(saveErrorKind(new Error(friendlyError("TypeError: Failed to fetch")))).toBe("offline");
    expect(saveErrorKind(new Error(friendlyError('new row for relation "food_entries" violates check constraint "food_entries_calories_check"')))).toBe("invalid");
    expect(saveErrorKind(new Error(friendlyError("JWT expired")))).toBe("auth");
    expect(saveErrorKind(new Error("boom"))).toBe("other");
  });
});

type Page = { data: number[] | null; error: { message: string } | null };

describe("fetchAll", () => {
  it("pages until a short page and keeps the order", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => i);
    const out = await fetchAll<number>(async (from, to): Promise<Page> => ({ data: rows.slice(from, to + 1), error: null }), 2);
    expect(out).toEqual([0, 1, 2, 3, 4]);
  });

  it("turns a dropped connection into words a person can act on", async () => {
    const failing = async (): Promise<Page> => ({ data: null, error: { message: "TypeError: Failed to fetch" } });
    await expect(fetchAll<number>(failing)).rejects.toThrow("You're offline or the connection dropped. Nothing was lost — try again.");
  });

  it("passes other database errors through unchanged", async () => {
    const failing = async (): Promise<Page> => ({ data: null, error: { message: 'relation "x" does not exist' } });
    await expect(fetchAll<number>(failing)).rejects.toThrow('relation "x" does not exist');
  });
});

describe("friendlyError", () => {
  it("still reads as a network error to the workout's offline handling", () => {
    // the live workout falls back to its on-device copy when a read fails for network reasons
    expect(isNetworkError(friendlyError("TypeError: Failed to fetch"))).toBe(true);
    expect(isNetworkError(friendlyError("TypeError: NetworkError when attempting to fetch resource."))).toBe(true);
  });

  it("maps sessions and constraint errors, and leaves the rest", () => {
    expect(friendlyError("JWT expired")).toBe("Your session expired. Sign in again.");
    expect(friendlyError('duplicate key value violates unique constraint "x"')).toBe("That entry already exists.");
    expect(friendlyError("new row violates check constraint")).toBe("One of those values is out of range.");
    expect(friendlyError("something else")).toBe("something else");
  });
});

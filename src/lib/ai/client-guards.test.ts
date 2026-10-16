import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_CLIENT_TIMEOUT_MS, DeadlineError, failureFor, fetchJson, isChatReply, isPhotoAnalysis } from "./client-guards";

const macros = { calories: 281, protein: 53, carbs: 0, fat: 6 };
const item = { id: "a1", name: "Grilled chicken", macros, provenance: "estimate" };
const photo = { items: [item], totals: macros, overall_confidence: 0.6, caveats: [], questions: [], not_food: false, model: "m", lookup: { usda: "ok", off: "skipped" } };
const row = (role: "user" | "assistant") => ({ id: `${role}-1`, conversation_id: "c1", role, content: "hi", created_at: "2026-10-16T12:00:00Z" });

describe("isPhotoAnalysis", () => {
  it("accepts a real analysis, including a not-food photo with no items", () => {
    expect(isPhotoAnalysis(photo)).toBe(true);
    expect(isPhotoAnalysis({ ...photo, items: [], not_food: true })).toBe(true);
  });
  it("rejects proxy pages, wrong shapes and items without numbers", () => {
    expect(isPhotoAnalysis(null)).toBe(false);
    expect(isPhotoAnalysis({ hello: "world" })).toBe(false);
    expect(isPhotoAnalysis({ ...photo, totals: { calories: "713" } })).toBe(false);
    expect(isPhotoAnalysis({ ...photo, items: [{ ...item, macros: { ...macros, fat: Number.NaN } }] })).toBe(false);
    expect(isPhotoAnalysis({ ...photo, lookup: undefined })).toBe(false);
  });
});

describe("isChatReply", () => {
  it("needs the conversation id and both saved turns", () => {
    expect(isChatReply({ conversationId: "c1", userMessage: row("user"), assistantMessage: row("assistant") })).toBe(true);
    expect(isChatReply({ hello: "world" })).toBe(false);
    expect(isChatReply({ conversationId: "c1", userMessage: row("user") })).toBe(false);
    expect(isChatReply({ conversationId: "c1", userMessage: row("assistant"), assistantMessage: row("assistant") })).toBe(false);
  });
});

describe("failureFor", () => {
  it("explains unusable responses in words, never 'failed (200)'", () => {
    expect(failureFor(200, true)).toEqual({ code: "bad_output", message: "The answer came back incomplete. Try again." });
    expect(failureFor(504, false).code).toBe("timeout");
    expect(failureFor(401, false).code).toBe("unauthorized");
    expect(failureFor(413, false).code).toBe("too_large");
    expect(failureFor(500, false)).toEqual({ code: "upstream", message: "The server had a problem (error 500). Try again." });
    for (const s of [200, 500, 502, 503, 504]) expect(failureFor(s, s === 200).message).not.toMatch(/failed \(\d+\)/);
  });
});

describe("fetchJson", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A fetch that never answers until its signal aborts (a stalled mobile connection). */
  const hangingFetch = () =>
    vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))));

  it("gives up with DeadlineError when the connection stalls", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    const p = fetchJson("/api/ai/food-chat", { method: "POST" }, 1000);
    const assertion = expect(p).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it("uses a deadline longer than the routes' 60 s limit", () => {
    expect(AI_CLIENT_TIMEOUT_MS).toBeGreaterThan(60_000);
  });

  it("passes the caller's own cancel through as an AbortError, not a timeout", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const ctl = new AbortController();
    const p = fetchJson("/api/ai/food-photo", { signal: ctl.signal }, 60_000);
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns body null for a non-JSON error page, and the parsed body otherwise", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Gateway Timeout</html>", { status: 504 })));
    const bad = await fetchJson("/x");
    expect(bad.res.status).toBe(504);
    expect(bad.body).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"conversationId": ', { status: 200 })));
    expect((await fetchJson("/x")).body).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: 1 })));
    expect((await fetchJson("/x")).body).toEqual({ ok: 1 });
  });

  it("surfaces a dropped connection as the network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(fetchJson("/x")).rejects.toBeInstanceOf(TypeError);
  });
});

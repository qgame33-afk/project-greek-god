// Client-side checks on what the AI routes send back. The routes validate model output, but a
// proxy error page, a truncated body or a stalled connection can still reach the app; these
// helpers turn that into an honest, retryable error instead of a crash or an endless spinner.

import type { PhotoAnalysis } from "./food-schemas";

/** Longest the app waits for an AI route. The routes themselves stop at 60 s (maxDuration). */
export const AI_CLIENT_TIMEOUT_MS = 75_000;

export interface ClientFailure {
  code: "timeout" | "unauthorized" | "bad_output" | "upstream" | "too_large";
  message: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isMacros = (v: unknown) => isObj(v) && isNum(v.calories) && isNum(v.protein) && isNum(v.carbs) && isNum(v.fat);

/** A response the app can't use (no JSON error body): say what happened in words, never "failed (200)". */
export function failureFor(status: number, ok: boolean): ClientFailure {
  if (ok) return { code: "bad_output", message: "The answer came back incomplete. Try again." };
  if (status === 401) return { code: "unauthorized", message: "Your session expired. Sign in again." };
  if (status === 413) return { code: "too_large", message: "That photo is too large to send. Try another photo." };
  if (status === 408 || status === 504) return { code: "timeout", message: "The AI took too long to answer. Try again." };
  return { code: "upstream", message: `The server had a problem (error ${status}). Try again.` };
}

export const TIMEOUT_FAILURE: ClientFailure = {
  code: "timeout",
  message: `No answer after ${AI_CLIENT_TIMEOUT_MS / 1000} seconds. Check your connection and try again.`,
};

function isFoodItem(v: unknown) {
  return isObj(v) && typeof v.id === "string" && typeof v.name === "string" && isMacros(v.macros) && typeof v.provenance === "string";
}

/** POST /api/ai/food-photo success body. */
export function isPhotoAnalysis(v: unknown): v is PhotoAnalysis {
  return (
    isObj(v) &&
    Array.isArray(v.items) &&
    v.items.every(isFoodItem) &&
    isMacros(v.totals) &&
    Array.isArray(v.questions) &&
    Array.isArray(v.caveats) &&
    isObj(v.lookup) &&
    typeof v.not_food === "boolean"
  );
}

function isMessageRow(v: unknown, role: "user" | "assistant") {
  return isObj(v) && typeof v.id === "string" && v.role === role && typeof v.content === "string" && typeof v.conversation_id === "string";
}

/** POST /api/ai/food-chat and /api/ai/coach success bodies: the saved user + assistant turns. */
export function isChatReply(v: unknown): v is { conversationId: string; userMessage: unknown; assistantMessage: unknown } {
  return isObj(v) && typeof v.conversationId === "string" && isMessageRow(v.userMessage, "user") && isMessageRow(v.assistantMessage, "assistant");
}

/** Thrown by fetchJson when the deadline passes. */
export class DeadlineError extends Error {
  constructor() {
    super(TIMEOUT_FAILURE.message);
    this.name = "DeadlineError";
  }
}

/**
 * fetch + JSON with a hard deadline covering the whole exchange (headers and body), while still
 * honouring the caller's own AbortSignal. `body` is null when the response isn't JSON. Rejects
 * with DeadlineError (deadline), the caller's AbortError, or the network error.
 */
export async function fetchJson(url: string, init: RequestInit = {}, ms = AI_CLIENT_TIMEOUT_MS): Promise<{ res: Response; body: unknown }> {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, ms);
  const outer = init.signal;
  const forward = () => ctl.abort();
  if (outer?.aborted) ctl.abort();
  else outer?.addEventListener("abort", forward, { once: true });
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch (e) {
      if (ctl.signal.aborted) throw e; // deadline or the caller gave up mid-body
    }
    return { res, body };
  } catch (e) {
    if (timedOut) throw new DeadlineError();
    throw e;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", forward);
  }
}

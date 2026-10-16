"use client";

// Typed client wrappers for the food AI + search routes. Errors carry the server's code
// so the UI can say exactly what happened (not configured, quota, offline...).

import type { PhotoAnalysis } from "@/lib/ai/food-schemas";
import { DeadlineError, TIMEOUT_FAILURE, failureFor, fetchJson, isChatReply, isPhotoAnalysis } from "@/lib/ai/client-guards";
import type { LookupKind, SearchResponse } from "@/lib/food/types";
import type { Row } from "@/lib/data/core";

export class FoodAIRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Dev-only: `localStorage["pgg.aiMock"]="1"` asks the server for the deterministic mock. */
function devHeaders(): Record<string, string> {
  if (process.env.NODE_ENV !== "development") return {};
  try {
    return localStorage.getItem("pgg.aiMock") === "1" ? { "x-pgg-ai-mock": "1" } : {};
  } catch {
    return {};
  }
}

/**
 * JSON request with a deadline. `valid` checks a success body's shape, so a proxy page or a
 * truncated answer becomes a readable, retryable error instead of a crash.
 */
async function call<T>(url: string, init: RequestInit = {}, valid?: (body: unknown) => boolean): Promise<T> {
  let res: Response;
  let raw: unknown;
  try {
    ({ res, body: raw } = await fetchJson(url, {
      ...init,
      headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...devHeaders(), ...(init.headers as Record<string, string> | undefined) },
      cache: "no-store",
    }));
  } catch (e) {
    if (e instanceof DeadlineError) throw new FoodAIRequestError(TIMEOUT_FAILURE.code, TIMEOUT_FAILURE.message, 0);
    if ((e as Error).name === "AbortError") throw e;
    throw new FoodAIRequestError("network", "You're offline or the connection dropped.", 0);
  }
  const body = raw as (T & { error?: string; code?: string }) | null;
  if (!res.ok && typeof body?.error === "string") throw new FoodAIRequestError(body.code ?? "upstream", body.error, res.status);
  if (!res.ok || !body || (valid && !valid(body))) {
    const f = failureFor(res.status, res.ok);
    throw new FoodAIRequestError(f.code, f.message, res.status);
  }
  return body;
}

export interface AICapability {
  configured: boolean;
  mock: boolean;
  usda?: "key" | "demo_key";
  webSearch?: boolean;
}

export const getCapability = (kind: "photo" | "chat") => call<AICapability>(kind === "photo" ? "/api/ai/food-photo" : "/api/ai/food-chat");

export interface PhotoRequest {
  image: string;
  localDate: string;
  answers?: { questionId: string; question?: string; answer: string }[];
  context?: string;
}

export const analysePhoto = (body: PhotoRequest, signal?: AbortSignal) =>
  call<PhotoAnalysis>("/api/ai/food-photo", { method: "POST", body: JSON.stringify(body), signal }, isPhotoAnalysis);

export interface ChatRequest {
  conversationId?: string | null;
  clientMessageId: string;
  message: string;
  image?: string | null;
  localDate: string;
}

export interface ChatResponse {
  conversationId: string;
  userMessage: Row<"ai_messages">;
  assistantMessage: Row<"ai_messages">;
}

export const sendFoodChat = (body: ChatRequest) => call<ChatResponse>("/api/ai/food-chat", { method: "POST", body: JSON.stringify(body) }, isChatReply);

export const searchFoodDb = (q: string, kind: LookupKind = "all", signal?: AbortSignal) =>
  call<SearchResponse>(`/api/food/search?q=${encodeURIComponent(q)}&kind=${kind}`, { signal });

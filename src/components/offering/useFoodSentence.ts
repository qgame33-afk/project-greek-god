"use client";

// The Offering's natural-language log (docs/DESIGN-V2.md §3.9.1): one sentence goes to the
// existing Food Coach backend (/api/ai/food-chat via sendFoodChat), and the reply comes back as a
// draft that nothing has saved. Follow-ups (answers to its questions, quick fixes) continue the
// same food conversation, so it stays in the Food Coach history too.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { FoodAIRequestError, getCapability, sendFoodChat } from "@/components/food-ai/api";
import type { AIMessage } from "@/components/food-ai/hooks";
import type { FoodChatPayload } from "@/lib/ai/food-schemas";
import { newId, useUser } from "@/lib/data/core";
import type { ISODate } from "@/lib/dates";

export interface SentenceReply {
  /** The sentence that started this draft (the first one, for "Replaces" detection). */
  said: string;
  conversationId: string;
  message: AIMessage;
  payload: FoodChatPayload;
}

export interface SentenceError {
  code: string;
  message: string;
  text: string;
  /** Reused on Retry, so a reply the server saved but the phone never got comes back once. */
  id: string;
}

/** Retrying can't fix a missing key, a used-up quota or an expired session. */
export const retryable = (code: string) => code !== "not_configured" && code !== "quota" && code !== "unauthorized";

export function useFoodCapability() {
  return useQuery({ queryKey: ["food-ai-cap", "chat"], queryFn: () => getCapability("chat"), staleTime: 5 * 60_000, retry: 0 });
}

export function useFoodSentence(date: ISODate) {
  const qc = useQueryClient();
  const { userId } = useUser();
  const [reply, setReply] = useState<SentenceReply | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<SentenceError | null>(null);
  const sending = useRef(false);

  /**
   * Send a sentence. `follow` continues the current draft's conversation (an answer to its
   * question, a quick fix); otherwise a new draft starts in a new conversation.
   */
  const send = useCallback(
    async (raw: string, o: { follow?: boolean; retry?: SentenceError | null } = {}) => {
      const text = raw.trim();
      if (!text || sending.current) return false;
      sending.current = true;
      const conversationId = o.follow ? (reply?.conversationId ?? null) : null;
      const clientMessageId = o.retry && o.retry.text === text ? o.retry.id : newId();
      setPending(text);
      setError(null);
      try {
        const res = await sendFoodChat({ conversationId, clientMessageId, message: text, image: null, localDate: date });
        // the Food Coach screen reads the same cache: the conversation is there if he opens it
        qc.setQueryData<AIMessage[]>(["food-msgs", res.conversationId, userId], (prev) => {
          const base = (prev ?? []).filter((m) => m.id !== res.userMessage.id && m.id !== res.assistantMessage.id);
          return [...base, res.userMessage, res.assistantMessage];
        });
        qc.invalidateQueries({ queryKey: ["food-convs"] });
        const payload = res.assistantMessage.payload as unknown as FoodChatPayload | null;
        if (!payload) throw new FoodAIRequestError("bad_output", "The answer came back empty. Try again.", 200);
        setReply({ said: o.follow && reply ? reply.said : text, conversationId: res.conversationId, message: res.assistantMessage, payload });
        return true;
      } catch (e) {
        const err = e instanceof FoodAIRequestError ? e : new FoodAIRequestError("upstream", "Couldn't reach the food estimate. Try again.", 0);
        setError({ code: err.code, message: err.message, text, id: clientMessageId });
        return false;
      } finally {
        setPending(null);
        sending.current = false;
      }
    },
    [date, qc, reply, userId],
  );

  const clear = useCallback(() => {
    setReply(null);
    setError(null);
  }, []);

  /** The draft row changed (claimed by a save, released by Undo). */
  const patchMessage = useCallback((m: Partial<AIMessage>) => setReply((r) => (r ? { ...r, message: { ...r.message, ...m } } : r)), []);

  return { reply, pending, error, send, clear, patchMessage };
}

"use client";

// The Oracle's conversation state over the coach backend (/api/ai/coach): the open conversation,
// the question in flight, a failed send kept for Retry (same client id, so a saved-but-lost answer
// comes back once instead of twice), and what he did with each proposal. Shared by the Ask sheet
// and the /coach page; the page also mirrors the conversation into ?c=.

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoachRequestError, askCoach, useCoachStatus, useConversations, useMessages, useReceiveReply, useSetSuggestionStatus } from "@/lib/coach/hooks";
import { MAX_MESSAGE_CHARS } from "@/lib/coach/schema";
import type { CoachErrorCode, SuggestionStatus } from "@/lib/coach/types";
import { newId } from "@/lib/data/core";
import { today } from "@/lib/dates";
import type { OracleContext } from "@/components/offering/store";
import { withContext } from "./context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isConvId = (v: string | null | undefined): v is string => !!v && UUID.test(v);

const pad = (n: number) => String(n).padStart(2, "0");
const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
};

export interface Pending {
  text: string;
  convId: string | null;
  /** Set once the server answered; the optimistic bubble hides when this id is in the list. */
  savedId?: string;
}

export interface SendError {
  code: CoachErrorCode;
  message: string;
  text: string;
  convId: string | null;
  id: string;
}

export function useCoachChat({ initialConv = null, initialDraft = "", context = null }: { initialConv?: string | null; initialDraft?: string; context?: OracleContext | null }) {
  const qc = useQueryClient();
  const status = useCoachStatus();
  const convs = useConversations();
  const setStatus = useSetSuggestionStatus();
  const receive = useReceiveReply();
  const [convId, setConvId] = useState<string | null>(isConvId(initialConv) ? initialConv : null);
  const [draft, setDraft] = useState(initialDraft.slice(0, MAX_MESSAGE_CHARS));
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<SendError | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const sending = useRef(false);

  const messages = useMessages(convId);
  const msgs = useMemo(() => messages.data ?? [], [messages.data]);
  const notConnected = status.data?.configured === false;
  const mock = status.data?.mock === true;

  // a conversation deleted on another device → back to a new one
  useEffect(() => {
    if (!convId || !convs.data || messages.isLoading || pending) return;
    if (!convs.data.some((c) => c.id === convId) && msgs.length === 0) setConvId(null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [convId, convs.data, messages.isLoading, msgs.length, pending]);

  // drop the optimistic bubble once the saved message is rendered from the cache
  useEffect(() => {
    if (pending?.savedId && msgs.some((m) => m.id === pending.savedId)) setPending(null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [pending, msgs]);

  const send = useCallback(
    async (raw: string, failed?: SendError | null) => {
      const typed = raw.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!typed || sending.current) return;
      sending.current = true;
      const from = convId;
      // the first question of a conversation carries the screen it was asked from
      const text = !from && context && !failed ? withContext(typed, context) : failed && failed.text.endsWith(typed) ? failed.text : typed;
      const clientMessageId = failed && failed.code !== "not_found" && failed.text === text && failed.convId === from ? failed.id : newId();
      setError(null);
      setPending({ text, convId: from });
      setDraft("");
      try {
        const now = new Date();
        const r = await askCoach({ conversationId: from, clientMessageId, message: text, localDate: today(now), localTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`, timeZone: deviceZone() });
        receive(r);
        setPending({ text, convId: r.conversationId, savedId: r.userMessage.id });
        setConvId((cur) => (cur === from ? r.conversationId : cur));
        setScrollTo(r.userMessage.id);
        setFreshId(r.assistantMessage.id);
      } catch (e) {
        const err = e instanceof CoachRequestError ? e : new CoachRequestError("upstream", "Something went wrong. Your question is kept — try again.");
        setPending(null);
        setError({ code: err.code, message: err.message, text, convId: err.code === "not_found" ? null : from, id: clientMessageId });
        setDraft((d) => d || typed);
        if (err.code === "not_configured") qc.invalidateQueries({ queryKey: ["coach-status"] });
        if (err.code === "not_found") {
          setConvId(null);
          qc.invalidateQueries({ queryKey: ["coach-convs"] });
        }
      } finally {
        sending.current = false;
      }
    },
    [convId, context, qc, receive],
  );

  const { mutate: mutateStatus } = setStatus;
  const onStatus = useCallback(
    (conversationId: string, messageId: string, suggestionId: string, st: SuggestionStatus) => mutateStatus({ convId: conversationId, messageId, suggestionId, status: st }),
    [mutateStatus],
  );

  const newChat = useCallback(() => {
    setConvId(null);
    setError(null);
  }, []);
  const select = useCallback((id: string) => {
    setError(null);
    setConvId(id);
  }, []);

  const waiting = !!pending && !pending.savedId;
  const showPending = !!pending && pending.convId === convId && !msgs.some((m) => m.id === pending.savedId);
  const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant")?.id ?? null;

  return {
    convId,
    select,
    newChat,
    messages,
    msgs,
    draft,
    setDraft,
    pending,
    showPending,
    waiting,
    error,
    setError,
    send,
    onStatus,
    notConnected,
    mock,
    freshId,
    scrollTo,
    clearScrollTo: () => setScrollTo(null),
    lastAssistant,
    statusLoaded: !!status.data,
  };
}

export type CoachChat = ReturnType<typeof useCoachChat>;

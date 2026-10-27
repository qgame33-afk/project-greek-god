"use client";

// The Food Coach conversation (the Oracle with Fuel context, docs/DESIGN-V2.md §3.9.2), shared by
// the /nutrition/coach page (conversation in ?c=) and the Offering sheet's Ask mode (conversation
// in local state). Sending, Retry with the same client id, photo attachments, the diary state of
// every logged draft, and deleting a chat.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { FoodChatPayload } from "@/lib/ai/food-schemas";
import { newId, useToday, useUser } from "@/lib/data/core";
import { FoodAIRequestError, getCapability, sendFoodChat } from "../api";
import { ImagePrepError, prepareImage, type PreparedImage } from "../image";
import { useDeleteConversation, useFoodConversations, useFoodMessages, useLoggedGroups, type AIMessage } from "../hooks";

export interface FoodPending {
  id: string;
  /** Conversation it was sent from (null = a new chat). */
  conv: string | null;
  text: string;
  image: string | null;
  startedAt: number;
}

export interface FoodSendError {
  code: string;
  message: string;
  /** Chip or question answer to resend (not in the composer). */
  retry: string | null;
  /** The failed send: resending the same text reuses its id, so a saved-but-lost reply comes back instead of a duplicate. */
  sent: { id: string; text: string };
}

/** Quota, a missing key or an expired session won't be fixed by sending again. */
export const foodRetryable = (code: string) => code !== "not_configured" && code !== "quota" && code !== "unauthorized";

export function useFoodChat({ convId, setConvId }: { convId: string | null; setConvId: (id: string | null, how?: "push" | "replace") => void }) {
  const qc = useQueryClient();
  const todayDate = useToday();
  const { userId } = useUser();
  const cap = useQuery({ queryKey: ["food-ai-cap", "chat"], queryFn: () => getCapability("chat"), staleTime: 5 * 60_000, retry: 0 });
  const convs = useFoodConversations();
  const msgs = useFoodMessages(convId);
  const del = useDeleteConversation();

  const [text, setText] = useState("");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pending, setPending] = useState<FoodPending | null>(null);
  const [error, setError] = useState<FoodSendError | null>(null);
  const sendingRef = useRef(false);
  // the conversation on screen right now (a reply can land after he moved to another chat)
  const viewingRef = useRef(convId);
  useEffect(() => {
    viewingRef.current = convId;
  }, [convId]);

  const messages = useMemo(() => msgs.data ?? [], [msgs.data]);
  // a stale ?c= (deleted here or on another device) behaves like a new chat
  const convMissing = !!convId && !!convs.data && !convs.data.some((c) => c.id === convId) && !!msgs.data && msgs.data.length === 0;
  useEffect(() => {
    if (convMissing) setConvId(null);
  }, [convMissing, setConvId]);

  const configured = cap.data?.configured ?? true;
  const isMock = !!cap.data?.mock || messages.some((m) => (m.payload as { mock?: boolean } | null)?.mock);
  const loggedIds = useMemo(() => messages.map((m) => m.logged_group_id).filter((g): g is string => !!g), [messages]);
  const groups = useLoggedGroups(loggedIds);

  const view = useMemo(() => {
    const revisedBy = new Map<string, string>();
    for (const m of messages) {
      const r = (m.payload as FoodChatPayload | null)?.revises;
      if (r) revisedBy.set(r, m.id);
    }
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;
    return { revisedBy, lastAssistant };
  }, [messages]);

  const pickImage = async (f: File) => {
    setPreparing(true);
    try {
      setImage(await prepareImage(f, 1600, 0.82));
    } catch (e) {
      toast.error(e instanceof ImagePrepError ? e.message : "That photo couldn't be read.");
    } finally {
      setPreparing(false);
    }
  };

  const send = async (raw?: string, failed?: FoodSendError["sent"]) => {
    const msg = (raw ?? text).trim();
    if (!msg || sendingRef.current || !configured) return;
    sendingRef.current = true;
    const fromComposer = raw === undefined;
    const img = fromComposer ? image : null;
    const clientMessageId = failed && failed.text === msg ? failed.id : newId();
    setPending({ id: clientMessageId, conv: convId, text: msg, image: img?.dataUrl ?? null, startedAt: Date.now() });
    setError(null);
    if (fromComposer) {
      setText("");
      setImage(null);
    }
    try {
      const res = await sendFoodChat({ conversationId: convId, clientMessageId, message: msg, image: img?.dataUrl ?? null, localDate: todayDate });
      qc.setQueryData<AIMessage[]>(["food-msgs", res.conversationId, userId], (prev) => {
        const base = (prev ?? []).filter((m) => m.id !== res.userMessage.id && m.id !== res.assistantMessage.id);
        return [...base, res.userMessage, res.assistantMessage];
      });
      // open the new chat only if he is still looking at the one he sent from
      if (res.conversationId !== convId && viewingRef.current === convId) setConvId(res.conversationId);
      qc.invalidateQueries({ queryKey: ["food-convs"] });
    } catch (e) {
      const err = e instanceof FoodAIRequestError ? e : new FoodAIRequestError("upstream", "Couldn't reach Coach. Try again.", 0);
      if (fromComposer) {
        setText(msg);
        setImage(img);
      }
      setError({ code: err.code, message: err.message, retry: fromComposer ? null : msg, sent: { id: clientMessageId, text: msg } });
      if (err.code === "not_found") setConvId(null);
    } finally {
      setPending(null);
      sendingRef.current = false;
    }
  };

  const newChat = () => {
    setError(null);
    setConvId(null, "push");
  };
  const openConv = (id: string) => {
    setError(null);
    setConvId(id, "push");
  };
  const deleteConv = (id: string) =>
    del.mutate(id, {
      onSuccess: () => {
        toast("Chat deleted");
        if (id === convId) setConvId(null);
      },
      onError: (e) => toast.error("Couldn't delete the chat", { description: (e as Error).message }),
    });

  // "no data yet" (not isLoading) so the server render and the first client render agree
  const msgsLoading = !!convId && !msgs.data && !msgs.isError;
  const shownPending = pending && pending.conv === convId ? pending : null;
  const showEmpty = !shownPending && (!convId || (!!msgs.data && messages.length === 0));

  return {
    convId,
    cap,
    convs,
    msgs,
    messages,
    groups,
    loggedIds,
    view,
    configured,
    isMock,
    text,
    setText,
    image,
    setImage,
    preparing,
    pickImage,
    pending,
    shownPending,
    error,
    send,
    newChat,
    openConv,
    deleteConv,
    msgsLoading,
    showEmpty,
  };
}

export type FoodChat = ReturnType<typeof useFoodChat>;

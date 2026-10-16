"use client";

// Coach data on the client: conversation history (RLS, synced across devices), sending a
// question through the server route, deleting with Undo, and recording what the user did
// with each suggestion.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAll, must, sb, useUser, type Update } from "@/lib/data/core";
import type { Json } from "@/lib/supabase/database.types";
import type { CoachErrorCode, CoachMessageRow, CoachPayload, CoachReplyResponse, SuggestionStatus } from "./types";

export interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export const convsKey = (userId: string | null) => ["coach-convs", userId] as const;
export const msgsKey = (convId: string | null, userId: string | null) => ["coach-msgs", convId, userId] as const;

/** Whether the server has an AI key (or the local dev mock). */
export function useCoachStatus() {
  return useQuery({
    queryKey: ["coach-status"],
    queryFn: async () => {
      const r = await fetch("/api/ai/coach", { cache: "no-store" });
      if (!r.ok) throw new Error(`status ${r.status}`);
      return (await r.json()) as { configured: boolean; mock: boolean };
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useConversations() {
  const { userId } = useUser();
  return useQuery({
    queryKey: convsKey(userId),
    enabled: !!userId,
    queryFn: async () =>
      must(await sb().from("ai_conversations").select("id,title,created_at,updated_at").eq("kind", "coach").order("updated_at", { ascending: false }).limit(200)) as Conversation[],
  });
}

export function useMessages(convId: string | null) {
  const { userId } = useUser();
  return useQuery({
    queryKey: msgsKey(convId, userId),
    enabled: !!userId && !!convId,
    queryFn: async () =>
      (await fetchAll((a, b) =>
        sb().from("ai_messages").select("id,conversation_id,role,content,payload,created_at").eq("conversation_id", convId!).order("created_at").range(a, b),
      )) as unknown as CoachMessageRow[],
  });
}

export class CoachRequestError extends Error {
  constructor(
    public code: CoachErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** POST a question. Throws CoachRequestError with a user-readable message. */
export async function askCoach(body: { conversationId: string | null; message: string; localDate: string; localTime: string }): Promise<CoachReplyResponse> {
  let res: Response;
  try {
    res = await fetch("/api/ai/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new CoachRequestError("offline", "You're offline or the connection dropped. Your question is kept — try again.");
  }
  let json: { error?: string; code?: CoachErrorCode } & Partial<CoachReplyResponse> = {};
  try {
    json = await res.json();
  } catch {
    // non-JSON (proxy error page)
  }
  if (!res.ok || !json.assistantMessage) {
    const code = json.code ?? (res.status === 401 ? "unauthorized" : "upstream");
    throw new CoachRequestError(code, json.error ?? `The coach couldn't answer (${res.status}). Your question is kept — try again.`);
  }
  return json as CoachReplyResponse;
}

/** Put a fresh reply into the caches (messages + top of the conversation list). */
export function useReceiveReply() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return (r: CoachReplyResponse) => {
    qc.setQueryData<CoachMessageRow[]>(msgsKey(r.conversationId, userId), (prev) => {
      const list = prev ?? [];
      const ids = new Set(list.map((m) => m.id));
      return [...list, ...[r.userMessage, r.assistantMessage].filter((m) => !ids.has(m.id))];
    });
    qc.setQueryData<Conversation[]>(convsKey(userId), (prev) => {
      const now = r.assistantMessage.created_at;
      const existing = prev?.find((c) => c.id === r.conversationId);
      const row: Conversation = existing ? { ...existing, updated_at: now } : { id: r.conversationId, title: r.title, created_at: now, updated_at: now };
      return [row, ...(prev ?? []).filter((c) => c.id !== r.conversationId)];
    });
    qc.invalidateQueries({ queryKey: ["coach-convs"] });
  };
}

/** Delete a conversation (and its messages) with an Undo that restores it exactly. */
export function useDeleteConversation() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const restore = useMutation({
    mutationFn: async ({ conv, msgs }: { conv: Conversation; msgs: Record<string, unknown>[] }) => {
      must(await sb().from("ai_conversations").insert({ id: conv.id, kind: "coach", title: conv.title, created_at: conv.created_at, updated_at: conv.updated_at }).select("id").single());
      if (msgs.length) {
        const rows = msgs.map((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== "user_id"))) as never[];
        must(await sb().from("ai_messages").insert(rows).select("id"));
      }
    },
    onSuccess: () => toast("Conversation restored"),
    onError: (e: Error) => toast.error("Couldn't restore it", { description: e.message }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["coach-convs"] }),
  });
  const del = useMutation({
    mutationFn: async (conv: Conversation) => {
      // snapshot first so Undo can put back the exact rows
      const msgs = await fetchAll((a, b) => sb().from("ai_messages").select("*").eq("conversation_id", conv.id).order("created_at").range(a, b));
      must(await sb().from("ai_conversations").delete().eq("id", conv.id).select("id"));
      return { conv, msgs: msgs as unknown as Record<string, unknown>[] };
    },
    onMutate: async (conv) => {
      const key = convsKey(userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Conversation[]>(key);
      if (prev) qc.setQueryData<Conversation[]>(key, prev.filter((c) => c.id !== conv.id));
      return { prev };
    },
    onSuccess: (snap) => {
      qc.removeQueries({ queryKey: ["coach-msgs", snap.conv.id] });
      toast("Conversation deleted", { duration: 6000, action: { label: "Undo", onClick: () => restore.mutate(snap) } });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(convsKey(userId), ctx.prev);
      toast.error("Couldn't delete it", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["coach-convs"] }),
  });
  return { del, restore };
}

/** Record Applied / Not now on a suggestion (stored in the message payload, so it syncs). */
export function useSetSuggestionStatus() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    mutationFn: async ({ convId, messageId }: { convId: string; messageId: string; suggestionId: string; status: SuggestionStatus }) => {
      // onMutate already wrote the new status into the cache; persist that payload
      const msg = qc.getQueryData<CoachMessageRow[]>(msgsKey(convId, userId))?.find((m) => m.id === messageId);
      if (!msg?.payload) return;
      must(await sb().from("ai_messages").update({ payload: msg.payload as unknown as Json }).eq("id", messageId).select("id").single());
    },
    onMutate: async ({ convId, messageId, suggestionId, status }) => {
      const key = msgsKey(convId, userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<CoachMessageRow[]>(key);
      if (prev)
        qc.setQueryData<CoachMessageRow[]>(
          key,
          prev.map((m) =>
            m.id === messageId && m.payload
              ? {
                  ...m,
                  payload: {
                    ...m.payload,
                    suggestions: m.payload.suggestions.map((s) => (s.id === suggestionId ? { ...s, status, decidedAt: status === "open" ? null : new Date().toISOString() } : s)),
                  } satisfies CoachPayload,
                }
              : m,
          ),
        );
      return { prev, key };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't save that", { description: e.message });
    },
  });
}

const GOAL_FIELDS = ["calorie_goal", "protein_goal", "carb_goal", "fat_goal", "goal_weight_lb", "water_goal_ml", "sleep_goal_h", "steps_goal"];

/**
 * Apply a confirmed coach suggestion to the profile and record it in goal_changes.
 * Local equivalent of useSaveProfile: that hook reads the "previous" values after its own
 * optimistic update, so it never sees a difference and writes no goal history. Here the old
 * values are read from the database first, so the audit trail (and the 14-day calorie
 * cooldown that depends on it) is correct.
 */
export function useApplyProfileChange() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    mutationFn: async ({ values, reason, source }: { values: Record<string, number | string>; reason: string; source: "suggestion" | "user" }) => {
      const fields = Object.keys(values);
      const before = must(await sb().from("profiles").select(fields.join(",")).eq("id", userId!).single()) as unknown as Record<string, unknown>;
      must(await sb().from("profiles").update(values as Update<"profiles">).eq("id", userId!).select("id").single());
      const changes = fields
        .filter((k) => GOAL_FIELDS.includes(k) && Number(before[k]) !== Number(values[k]))
        .map((k) => ({ field: k, old_value: Number(before[k]), new_value: Number(values[k]), reason, source }));
      if (changes.length) must(await sb().from("goal_changes").insert(changes).select("id"));
    },
    onMutate: async ({ values }) => {
      const key = ["profile", userId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Record<string, unknown>>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...values });
      return { prev, key };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't change that", { description: e.message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["goal-changes"] });
    },
  });
}

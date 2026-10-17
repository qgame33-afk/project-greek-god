"use client";

// Data hooks for the food AI screens (TanStack Query + the browser client under RLS).
// Logging uses the shared optimistic useAddFood, whose inserts are idempotent by row id; chat
// drafts are claimed atomically via ai_messages.logged_group_id so one estimate can never be
// logged twice, even when a retry follows a response the network dropped.

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchAll, isOffline, must, newId, sb, useUser, type Row } from "@/lib/data/core";
import { useAddFood, type FoodEntry } from "@/lib/data/nutrition";
import type { FoodEntryInsert } from "@/lib/ai/food-log";

export type AIMessage = Row<"ai_messages">;
export type AIConversation = Pick<Row<"ai_conversations">, "id" | "title" | "created_at" | "updated_at">;

export function invalidateFood(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["food"] });
  qc.invalidateQueries({ queryKey: ["food-days"] });
  qc.invalidateQueries({ queryKey: ["food-recent"] });
}

/* ------------------------------------------------------------- logging */

/** A deleted row, ready to re-insert with its original id (Undo). */
function stripMeta(row: FoodEntry): FoodEntryInsert {
  const copy: Partial<FoodEntry> = { ...row };
  delete copy.user_id;
  delete copy.created_at;
  delete copy.updated_at;
  return copy as FoodEntryInsert;
}

/** Upload a meal photo privately at <uid>/<date>/<uuid>.jpg. Returns the storage path. */
export async function uploadMealPhoto(userId: string, localDate: string, blob: Blob): Promise<string> {
  const path = `${userId}/${localDate}/${newId()}.jpg`;
  const { error } = await sb().storage.from("meal-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** Delete logged rows (Undo) and their private photo. */
export async function deleteLogged(ids: string[], photoPath?: string | null) {
  if (ids.length) must(await sb().from("food_entries").delete().in("id", ids));
  if (photoPath) await sb().storage.from("meal-photos").remove([photoPath]);
}

/** The AI screens explain failures themselves, so the shared hook's error toast is off. */
export function useInsertEntries() {
  const add = useAddFood({ quiet: true });
  return { insert: (rows: FoodEntryInsert[]) => add.mutateAsync(rows as Parameters<typeof add.mutateAsync>[0]), pending: add.isPending };
}

/** Diary rows carrying a meal group, or null when the diary can't be reached to ask. */
export async function groupRows(groupId: string): Promise<{ id: string; calories: number }[] | null> {
  try {
    const { data, error } = await sb().from("food_entries").select("id, calories").eq("meal_group_id", groupId);
    return error ? null : (data ?? []).map((r) => ({ id: r.id, calories: Number(r.calories) || 0 }));
  } catch {
    return null;
  }
}

/** Thrown when a save may or may not have landed (the connection dropped mid-way). */
export const UNSURE_SAVE = "The connection dropped before the diary answered. Try again once you're online: it can't be added twice.";

/* ---------------------------------------------------------------- chat */

export function useFoodConversations() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["food-convs", userId],
    enabled: !!userId,
    queryFn: async () =>
      must(
        await sb().from("ai_conversations").select("id, title, created_at, updated_at").eq("kind", "food").order("updated_at", { ascending: false }).limit(60),
      ) as AIConversation[],
  });
}

export function useFoodMessages(conversationId: string | null) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["food-msgs", conversationId, userId],
    enabled: !!userId && !!conversationId,
    queryFn: async () =>
      fetchAll<AIMessage>((a, b) =>
        sb().from("ai_messages").select("*").eq("conversation_id", conversationId!).order("created_at", { ascending: true }).range(a, b),
      ),
  });
}

/** Which logged groups still exist in the diary (and under which meal/date). */
export function useLoggedGroups(groupIds: string[]) {
  const { userId } = useUser();
  const key = [...groupIds].sort().join(",");
  return useQuery({
    queryKey: ["food-ai-groups", key, userId],
    enabled: !!userId && groupIds.length > 0,
    queryFn: async () => {
      const rows = must(await sb().from("food_entries").select("id, meal_group_id, meal, local_date, calories").in("meal_group_id", groupIds));
      const map = new Map<string, { meal: string; date: string; ids: string[]; kcal: number }>();
      for (const r of rows) {
        if (!r.meal_group_id) continue;
        const g = map.get(r.meal_group_id) ?? { meal: r.meal, date: r.local_date, ids: [], kcal: 0 };
        g.ids.push(r.id);
        g.kcal += Number(r.calories) || 0;
        map.set(r.meal_group_id, g);
      }
      return map;
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    mutationFn: async (id: string) => {
      const imgs = must(await sb().from("ai_messages").select("image_path").eq("conversation_id", id).not("image_path", "is", null));
      must(await sb().from("ai_conversations").delete().eq("id", id));
      const paths = imgs.map((m) => m.image_path).filter((p): p is string => !!p);
      if (paths.length) await sb().storage.from("meal-photos").remove(paths);
    },
    onMutate: async (id) => {
      const key = ["food-convs", userId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AIConversation[]>(key);
      if (prev)
        qc.setQueryData<AIConversation[]>(
          key,
          prev.filter((c) => c.id !== id),
        );
      return { prev, key };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["food-convs"] }),
  });
}

export interface LogDraftArgs {
  message: AIMessage;
  rows: FoodEntryInsert[];
  groupId: string;
  /** Group already in the diary that this draft replaces (a logged meal being corrected). */
  replaceGroupId?: string | null;
  /** The group this message was claimed with before, when re-adding after a diary delete. */
  previousGroupId?: string | null;
}

/**
 * Claim the message (compare-and-swap on logged_group_id), then insert the rows. Rows and
 * the group id are the caller's and stay the same on a retry, so a retry after a lost answer
 * finishes the same save instead of adding a second copy. The claim is released only once
 * the diary confirms nothing landed. Returns undo context.
 */
export function useLogDraft(conversationId: string | null) {
  const qc = useQueryClient();
  const { userId } = useUser();
  const { insert } = useInsertEntries();
  const msgKey = ["food-msgs", conversationId, userId];

  const setLogged = (id: string, group: string | null) =>
    qc.setQueryData<AIMessage[]>(msgKey, (prev) => prev?.map((m) => (m.id === id ? { ...m, logged_group_id: group } : m)));

  return useMutation({
    networkMode: "always",
    mutationFn: async ({ message, rows, groupId, replaceGroupId, previousGroupId }: LogDraftArgs) => {
      // nothing is sent offline, so it's certain nothing was saved
      if (isOffline()) throw new Error("You're offline, so nothing was added. Try again once you're back online.");
      const claim = sb().from("ai_messages").update({ logged_group_id: groupId }).eq("id", message.id);
      const claimed = must(await (previousGroupId ? claim.eq("logged_group_id", previousGroupId) : claim.is("logged_group_id", null)).select("id"));
      if (!claimed.length) {
        // a retry of this same save (its first answer was lost) already holds the claim
        const cur = must(await sb().from("ai_messages").select("logged_group_id").eq("id", message.id)) as { logged_group_id: string | null }[];
        if (cur[0]?.logged_group_id !== groupId) throw new Error("This meal was already added to your diary.");
      }
      setLogged(message.id, groupId);

      let replaced: FoodEntry[] = [];
      try {
        if (replaceGroupId) {
          replaced = must(await sb().from("food_entries").select("*").eq("meal_group_id", replaceGroupId));
          if (replaced.length) must(await sb().from("food_entries").delete().eq("meal_group_id", replaceGroupId));
        }
        const inserted = await insert(rows);
        return { groupId, ids: inserted.map((r) => r.id), replaced };
      } catch (e) {
        const landed = await groupRows(groupId);
        // the rows are in the diary after all: the save worked, only its answer was lost
        if (landed?.length) return { groupId, ids: landed.map((r) => r.id), replaced };
        // can't tell: keep the claim, so a retry finishes this save rather than doubling it
        if (landed === null) throw new Error(UNSURE_SAVE);
        // certainly not saved: release the claim and put back anything we removed
        await sb()
          .from("ai_messages")
          .update({ logged_group_id: previousGroupId ?? null })
          .eq("id", message.id)
          .eq("logged_group_id", groupId);
        setLogged(message.id, previousGroupId ?? null);
        if (replaced.length) await sb().from("food_entries").upsert(replaced.map(stripMeta), { onConflict: "id", ignoreDuplicates: true });
        throw e;
      }
    },
    onSettled: () => {
      invalidateFood(qc);
      qc.invalidateQueries({ queryKey: ["food-ai-groups"] });
    },
  });
}

/** Undo a chat log: delete the rows, release the claim, restore a replaced meal. */
export async function undoChatLog(
  qc: QueryClient,
  args: { messageId: string; groupId: string; ids: string[]; replaced: FoodEntry[]; conversationId: string | null; userId: string | null },
) {
  await deleteLogged(args.ids);
  await sb().from("ai_messages").update({ logged_group_id: null }).eq("id", args.messageId).eq("logged_group_id", args.groupId);
  if (args.replaced.length) await sb().from("food_entries").insert(args.replaced.map(stripMeta));
  qc.setQueryData<AIMessage[]>(["food-msgs", args.conversationId, args.userId], (prev) =>
    prev?.map((m) => (m.id === args.messageId ? { ...m, logged_group_id: null } : m)),
  );
  invalidateFood(qc);
  qc.invalidateQueries({ queryKey: ["food-ai-groups"] });
}

/** Signed URL for a private meal photo (chat attachments). */
export function useMealPhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["meal-photo-url", path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb().storage.from("meal-photos").createSignedUrl(path!, 3600);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
  });
}

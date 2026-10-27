"use client";

import Link from "next/link";
import { Info, Sparkle } from "lucide-react";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { promptsFor } from "@/components/oracle/context";
import { SuggestionChip } from "@/components/oracle/OracleThread";
import { Skeleton } from "@/components/ui/misc";
import { useProfile } from "@/lib/data/profile";
import type { FoodChatPayload } from "@/lib/ai/food-schemas";
import { AssistantMessage, UserBubble } from "./ChatMessage";
import { Composer, type ComposerHandle } from "./Composer";
import { foodRetryable, type FoodChat } from "./useFoodChat";

export const EXAMPLES = [
  "I just ate three eggs, two bagels, and a protein shake",
  "250 g cooked chicken and two cups of rice",
  "Medium Domino's pepperoni pizza and eight boneless wings",
  "A large bowl of homemade bolognese",
];

/**
 * Coach with food context (docs/DESIGN-V3-SIMPLE.md §4.8, `/nutrition/coach`): two suggested
 * questions, then the conversation, its meal drafts as AI cards that save nothing until the gold
 * "Add as …".
 */
export function FoodThread({ chat, lead, onNavigate, scrollRoot }: { chat: FoodChat; lead?: string; onNavigate?: () => void; scrollRoot?: RefObject<HTMLElement | null> }) {
  const end = useRef<HTMLDivElement>(null);
  const { messages, view, groups, loggedIds, convId, shownPending, showEmpty, msgsLoading, msgs, configured } = chat;

  // keep the newest turn in view
  useLayoutEffect(() => {
    const root = scrollRoot?.current;
    if (root) root.scrollTo({ top: root.scrollHeight, behavior: messages.length > 0 && shownPending ? "smooth" : "auto" });
    else end.current?.scrollIntoView({ block: "end", behavior: messages.length > 0 && shownPending ? "smooth" : "auto" });
  }, [messages.length, shownPending, convId, scrollRoot]);

  if (showEmpty) return <EmptyFood configured={configured} lead={lead} onExample={(e) => void chat.send(e)} onNavigate={onNavigate} />;
  if (msgsLoading)
    return (
      <div className="space-y-6" aria-hidden>
        <Skeleton className="ml-auto h-11 w-3/5 rounded-card" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-4/5 rounded-full" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      </div>
    );
  if (msgs.isError)
    return (
      <p className="t-label py-10 text-center">
        Couldn&apos;t load this chat.{" "}
        <button type="button" className="press inline-flex h-11 items-center font-semibold text-fg underline decoration-ui-line underline-offset-4" onClick={() => msgs.refetch()}>
          Try again
        </button>
      </p>
    );

  return (
    <>
      <ol className="space-y-7" aria-live="polite">
        {messages.map((m, idx) => {
          if (m.role === "user") {
            return (
              <li key={m.id}>
                <UserBubble text={m.content} imagePath={m.image_path} />
              </li>
            );
          }
          const p = m.payload as FoodChatPayload | null;
          const revised = p?.revises ? messages.find((x) => x.id === p.revises) : null;
          const revisedGroup = revised?.logged_group_id && groups.data?.has(revised.logged_group_id) ? revised.logged_group_id : null;
          // what he said about THIS meal (first description, answers, corrections) for the hand-off
          const lineage = new Set<string>();
          for (let r = p?.revises ?? null; r && !lineage.has(r); ) {
            lineage.add(r);
            r = (messages.find((x) => x.id === r)?.payload as FoodChatPayload | null)?.revises ?? null;
          }
          const said: string[] = [];
          for (let j = idx - 1; j >= 0; j--) {
            const x = messages[j];
            if (x.role === "user") said.unshift(x.content);
            else if (((x.payload as FoodChatPayload | null)?.items?.length ?? 0) > 0 && !lineage.has(x.id)) break;
          }
          return (
            <li key={m.id} id={`msg-${m.id}`}>
              <AssistantMessage
                message={m}
                conversationId={convId}
                userText={said.slice(-4).join(" — ")}
                latest={view.lastAssistant === m.id}
                superseded={view.revisedBy.has(m.id)}
                replacesGroup={revisedGroup}
                group={m.logged_group_id ? (groups.data?.get(m.logged_group_id) ?? null) : null}
                groupsLoaded={groups.isSuccess || loggedIds.length === 0}
                onSend={(t) => void chat.send(t)}
              />
              {p?.refers_to && (
                <button
                  type="button"
                  onClick={() => document.getElementById(`msg-${p.refers_to}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  className="press t-label mt-1 h-11 font-semibold text-fg underline decoration-ui-line underline-offset-4"
                >
                  Show the meal
                </button>
              )}
            </li>
          );
        })}
        {shownPending && (
          <>
            <li>
              <UserBubble text={shownPending.text} localImage={shownPending.image} pending />
            </li>
            <li className="flex items-center gap-2.5" role="status">
              <Sparkle className="size-4 text-ai" strokeWidth={2.2} aria-hidden />
              <span className="t-label">Working out the numbers…</span>
            </li>
          </>
        )}
      </ol>
      <div ref={end} className="h-px" aria-hidden />
    </>
  );
}

/** The error line and the composer: the page's bottom bar, or the sheet's footer. */
export function FoodComposerBlock({ chat, composerRef, placeholder }: { chat: FoodChat; composerRef?: RefObject<ComposerHandle | null>; placeholder?: string }) {
  const { error } = chat;
  return (
    <>
      {error && (
        <div className="t-label mb-2.5 flex items-start justify-between gap-3 rounded-tile-lg bg-card px-4 py-2.5 text-fg" role="alert">
          <span className="py-1">
            {error.message}
            {foodRetryable(error.code) && !error.retry ? " Your message is kept." : ""}
          </span>
          {foodRetryable(error.code) ? (
            <button type="button" onClick={() => void chat.send(error.retry ?? undefined, error.sent)} className="press -my-1 h-11 shrink-0 px-1 font-semibold text-fg underline decoration-ui-line underline-offset-4">
              Try again
            </button>
          ) : (
            <Link href={error.code === "unauthorized" ? "/sign-in" : "/nutrition?add=1"} className="press -my-1 inline-flex h-11 shrink-0 items-center px-1 font-semibold text-fg underline decoration-ui-line underline-offset-4">
              {error.code === "unauthorized" ? "Sign in" : "Search food"}
            </Link>
          )}
        </div>
      )}
      <Composer
        ref={composerRef}
        value={chat.text}
        onChange={chat.setText}
        onSend={() => void chat.send(undefined, error?.sent)}
        onPickImage={chat.pickImage}
        onRemoveImage={() => chat.setImage(null)}
        image={chat.image?.dataUrl ?? null}
        preparingImage={chat.preparing}
        disabled={!chat.configured}
        sending={!!chat.pending}
        placeholder={chat.configured ? placeholder : "Coach isn't set up yet"}
      />
    </>
  );
}

function EmptyFood({ configured, lead, onExample, onNavigate }: { configured: boolean; lead?: string; onExample: (e: string) => void; onNavigate?: () => void }) {
  const { profile } = useProfile();
  const list = [lead ?? promptsFor("fuel", { proteinGoal: profile?.protein_goal ?? null }).lead, EXAMPLES[0]];
  if (!configured)
    return (
      <p role="status" className="t-label flex items-start gap-2.5 rounded-tile-lg bg-card px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-fg-3" strokeWidth={2} aria-hidden />
        <span>
          Coach isn&apos;t set up yet. It needs an AI key on the server.{" "}
          <Link href="/nutrition?add=1&tab=search" onClick={onNavigate} className="font-semibold text-fg underline decoration-ui-line underline-offset-4">
            Search food
          </Link>{" "}
          works now.
        </span>
      </p>
    );
  return (
    <div className="flex flex-col items-start gap-2.5" aria-label="Suggested questions">
      {list.map((e) => (
        <SuggestionChip key={e} onClick={() => onExample(e)}>
          {e}
        </SuggestionChip>
      ))}
    </div>
  );
}

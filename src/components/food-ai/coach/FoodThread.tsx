"use client";

import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { OracleSparkles } from "@/components/art/icons";
import { Skeleton } from "@/components/ui/misc";
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
 * The Food Coach thread (the Oracle with Fuel context): empty state, the conversation and its
 * meal drafts as ESTIMATE cards. Used by the /nutrition/coach page and the Offering sheet.
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
      <p className="t-callout py-10 text-center text-stone">
        Couldn&apos;t load this chat.{" "}
        <button type="button" className="press inline-flex h-11 items-center font-semibold text-ivory underline decoration-ui-line underline-offset-4" onClick={() => msgs.refetch()}>
          Retry
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
                  className="press t-callout mt-1 h-11 font-semibold text-ivory underline decoration-ui-line underline-offset-4"
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
              <OracleSparkles className="size-4 animate-pulse text-aegean" />
              <span className="t-callout text-stone">Working out the numbers…</span>
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
        <div className="t-callout mb-2.5 flex items-start justify-between gap-3 rounded-field border border-cinnabar-line bg-cinnabar-tint px-3.5 py-2.5 text-ivory" role="alert">
          <span className="py-1">
            {error.message}
            {foodRetryable(error.code) && !error.retry ? " Your message is kept." : ""}
          </span>
          {foodRetryable(error.code) ? (
            <button type="button" onClick={() => void chat.send(error.retry ?? undefined, error.sent)} className="press -my-1 h-11 shrink-0 px-1 font-semibold text-ivory underline decoration-ui-line underline-offset-4">
              Retry
            </button>
          ) : (
            <Link href={error.code === "unauthorized" ? "/sign-in" : "/nutrition?add=1"} className="press -my-1 inline-flex h-11 shrink-0 items-center px-1 font-semibold text-ivory underline decoration-ui-line underline-offset-4">
              {error.code === "unauthorized" ? "Sign in" : "Log by search"}
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
        placeholder={chat.configured ? placeholder : "The Food Coach needs an AI key"}
      />
    </>
  );
}

function EmptyFood({ configured, lead, onExample, onNavigate }: { configured: boolean; lead?: string; onExample: (e: string) => void; onNavigate?: () => void }) {
  const list = lead ? [lead, ...EXAMPLES.slice(0, 3)] : EXAMPLES;
  return (
    <div className="rise">
      <OracleSparkles className="size-7 text-aegean" />
      <p className="t-verdict mt-3 text-ivory">Tell it what you ate, or ask about food.</p>
      <p className="t-callout mt-2 max-w-[38ch] text-stone">Plain words work. Quantities and restaurant names make it sharper. Nothing is logged until you add it.</p>
      {configured ? (
        <>
          <p className="t-eyebrow mb-1 mt-7">Try</p>
          <ul className="divide-y divide-vein border-y border-vein">
            {list.map((e, i) => (
              <li key={e}>
                <button type="button" onClick={() => onExample(e)} className="press-soft flex min-h-14 w-full items-center gap-3 py-2.5 text-left">
                  <span className={i === 0 && lead ? "t-title-3 min-w-0 flex-1 text-ivory" : "t-callout min-w-0 flex-1 font-semibold text-ivory"}>{e}</span>
                  <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div role="status" className="t-callout mt-6 flex items-start gap-2.5 rounded-field bg-m2 px-3.5 py-3 text-stone shadow-(--e1)">
          <Info className="mt-0.5 size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
          <p>
            <span className="font-semibold text-ivory">The Food Coach isn&apos;t connected.</span> It needs an AI key on the server.{" "}
            <Link href="/nutrition?add=1" onClick={onNavigate} className="font-semibold text-ivory underline decoration-ui-line underline-offset-4">
              Log by search
            </Link>{" "}
            works now.
          </p>
        </div>
      )}
    </div>
  );
}

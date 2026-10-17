"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConversationList } from "@/components/coach/ConversationList";
import { ConversationList as FoodConversationList } from "@/components/food-ai/coach/ConversationList";
import { FoodComposerBlock, FoodThread } from "@/components/food-ai/coach/FoodThread";
import { useFoodChat } from "@/components/food-ai/coach/useFoodChat";
import { CoachAsk, ContextChip } from "@/components/oracle/CoachAsk";
import { contextKey, promptsFor, usesFoodCoach } from "@/components/oracle/context";
import { OracleComposer, type ComposerHandle } from "@/components/oracle/OracleComposer";
import { useCoachChat } from "@/components/oracle/useCoachChat";
import { useProfile } from "@/lib/data/profile";
import type { OracleContext } from "./store";

export type AskView = "thread" | "history";

/**
 * The conversation last open in the sheet, so closing it by mistake and opening ✦ again from the
 * same screen comes back to the same thread (for half an hour). A deep link's conversation wins.
 */
const memory: { key: string; convId: string | null; at: number } = { key: "", convId: null, at: 0 };
const REMEMBER_MS = 30 * 60_000;
function remembered(key: string) {
  return memory.key === key && Date.now() - memory.at < REMEMBER_MS ? memory.convId : null;
}
function remember(key: string, convId: string | null) {
  memory.key = key;
  memory.convId = convId;
  memory.at = Date.now();
}

/**
 * Ask mode, the Oracle (docs/DESIGN-V2.md §3.9.2). Fuel context talks to the Food Coach backend
 * (its meal drafts are ESTIMATE cards that log through the idempotent claim); every other context
 * talks to the coach. Removing the context chip asks without it. The composer is portalled into
 * the sheet's pinned footer; History swaps the thread for the conversation list.
 */
export function AskMode({
  context: initialContext,
  prompt,
  conversationId,
  footerEl,
  view,
  setView,
  onNavigate,
}: {
  context: OracleContext | null;
  prompt?: string;
  conversationId?: string;
  footerEl: HTMLElement | null;
  view: AskView;
  setView: (v: AskView) => void;
  onNavigate: () => void;
}) {
  const [context, setContext] = useState<OracleContext | null>(initialContext);
  const food = usesFoodCoach(context);
  const key = `${food ? "food" : "coach"}|${contextKey(context)}`;
  const props = { context, onClearContext: () => setContext(null), memoryKey: key, prompt, conversationId, footerEl, view, setView, onNavigate };
  return food ? <FoodAsk key={key} {...props} /> : <CoachAskPanel key={key} {...props} />;
}

interface PanelProps {
  context: OracleContext | null;
  onClearContext: () => void;
  memoryKey: string;
  prompt?: string;
  conversationId?: string;
  footerEl: HTMLElement | null;
  view: AskView;
  setView: (v: AskView) => void;
  onNavigate: () => void;
}

function CoachAskPanel({ context, onClearContext, memoryKey, prompt, conversationId, footerEl, view, setView, onNavigate }: PanelProps) {
  const chat = useCoachChat({ initialConv: conversationId ?? remembered(memoryKey), initialDraft: prompt ?? "", context });
  const composer = useRef<ComposerHandle>(null);
  const { profile } = useProfile();
  useEffect(() => remember(memoryKey, chat.convId), [memoryKey, chat.convId]);

  const composerEl = (
    <>
      <OracleComposer
        ref={composer}
        value={chat.draft}
        onChange={(v) => {
          chat.setDraft(v);
          if (chat.error && chat.error.code !== "not_configured") chat.setError(null);
        }}
        onSend={() => {
          setView("thread");
          void chat.send(chat.draft, chat.error);
        }}
        busy={chat.waiting}
        disabled={chat.notConnected || !profile}
        placeholder={chat.notConnected ? "The Oracle needs an AI key on the server" : chat.convId ? "Ask a follow-up" : context ? promptsFor(context.kind).lead : "Ask the Oracle"}
      />
    </>
  );

  return (
    <>
      {view === "history" ? (
        <ConversationList
          currentId={chat.convId}
          onSelect={(id) => {
            chat.select(id);
            setView("thread");
          }}
          onNew={() => {
            chat.newChat();
            setView("thread");
            requestAnimationFrame(() => composer.current?.focus());
          }}
          onDeleted={(id) => id === chat.convId && chat.newChat()}
          disabled={chat.waiting}
          className="pt-1"
        />
      ) : (
        <CoachAsk
          chat={chat}
          context={context}
          onClearContext={onClearContext}
          onNavigate={onNavigate}
          onNewQuestion={() => {
            chat.newChat();
            requestAnimationFrame(() => composer.current?.focus());
          }}
        />
      )}
      {footerEl && createPortal(composerEl, footerEl)}
    </>
  );
}

function FoodAsk({ context, onClearContext, memoryKey, conversationId, prompt, footerEl, view, setView, onNavigate }: PanelProps) {
  const [convId, setConvIdState] = useState<string | null>(conversationId ?? remembered(memoryKey));
  const chat = useFoodChat({ convId, setConvId: (id) => setConvIdState(id) });
  const { profile } = useProfile();
  useEffect(() => remember(memoryKey, convId), [memoryKey, convId]);
  const [seeded, setSeeded] = useState(false);
  if (!seeded && prompt) {
    setSeeded(true);
    chat.setText(prompt);
  }
  const lead = promptsFor("fuel", { proteinGoal: profile?.protein_goal ?? null }).lead;

  return (
    <>
      {view === "history" ? (
        <div className="flex min-h-[50dvh] flex-col pt-1">
          <FoodConversationList
            conversations={chat.convs.data ?? []}
            loading={!chat.convs.data && !chat.convs.isError}
            activeId={convId}
            onOpen={(id) => {
              chat.openConv(id);
              setView("thread");
            }}
            onNew={() => {
              chat.newChat();
              setView("thread");
            }}
            onDelete={chat.deleteConv}
          />
        </div>
      ) : (
        <div className="pb-2">
          {context && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <ContextChip context={context} onClear={onClearContext} />
            </div>
          )}
          <FoodThread chat={chat} lead={lead} onNavigate={onNavigate} />
          {convId && !chat.pending && (
            <button type="button" onClick={chat.newChat} className="press t-callout mt-6 inline-flex h-11 items-center font-semibold text-stone underline decoration-ui-line underline-offset-4 hover:text-ivory">
              New chat
            </button>
          )}
        </div>
      )}
      {footerEl &&
        createPortal(
          <FoodComposerBlock chat={chat} placeholder={convId ? "Correct it, or ask about food" : "What did you eat, or what should you?"} />,
          footerEl,
        )}
    </>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import { COACH_SUBTITLE, ComposerDock } from "@/components/coach/CoachScreen";
import { BackHeader } from "@/components/shell/BackHeader";
import { Sheet } from "@/components/ui/sheet";
import type { ComposerHandle } from "./Composer";
import { ConversationList } from "./ConversationList";
import { FoodComposerBlock, FoodThread } from "./FoodThread";
import { SourcesSheet } from "./SourcesSheet";
import { useFoodChat } from "./useFoodChat";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Coach with food context (docs/DESIGN-V3-SIMPLE.md §4.8, `/nutrition/coach?c=`): the same screen
 * as /coach with "‹ Food" and the food coach backend, whose meal drafts are AI cards with a gold
 * "Add as …" (nothing is logged before it). The tab bar hides on this route, so the composer sits
 * on the bottom edge. Past chats and "Where the numbers come from" are behind the clock.
 */
export function FoodCoach() {
  const params = useSearchParams();
  const rawConv = params.get("c");
  // a hand-edited or stale ?c= that isn't a conversation id behaves like a new chat
  const convId = rawConv && UUID_RE.test(rawConv) ? rawConv : null;
  // ?c= is client state: the native history API (which Next keeps in sync with useSearchParams)
  // switches chats without a server round trip
  const setConvId = useCallback((id: string | null, how: "push" | "replace" = "replace") => {
    const url = id ? `/nutrition/coach?c=${id}` : "/nutrition/coach";
    if (how === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);
  useEffect(() => {
    if (rawConv && !convId) setConvId(null);
  }, [rawConv, convId, setConvId]);

  const chat = useFoodChat({ convId, setConvId });
  const [listOpen, setListOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const composerRef = useRef<ComposerHandle>(null);

  const newChat = () => {
    setListOpen(false);
    chat.newChat();
    window.setTimeout(() => composerRef.current?.focus(), 60);
  };

  return (
    <div className="pt-(--safe-top) lg:pt-0">
      <BackHeader
        href="/nutrition"
        parent="Food"
        title="Coach"
        subtitle={COACH_SUBTITLE}
        right={
          <button type="button" onClick={() => setListOpen(true)} aria-label="Past chats" className="press grid size-11 place-items-center rounded-full bg-card-2 text-fg">
            <History className="size-5" strokeWidth={1.9} />
          </button>
        }
      />
      <div className="mt-6">
        <FoodThread chat={chat} />
      </div>

      <ComposerDock bottom="0px">
        <div className="pb-(--safe-bottom)">
          <FoodComposerBlock chat={chat} composerRef={composerRef} />
        </div>
      </ComposerDock>

      <Sheet open={listOpen} onOpenChange={setListOpen} title="Past chats" description="Food chats, kept on your account.">
        <div className="flex max-h-[60dvh] min-h-[40dvh] flex-col">
          <ConversationList
            conversations={chat.convs.data ?? []}
            loading={!chat.convs.data && !chat.convs.isError}
            activeId={convId}
            onOpen={(id) => {
              setListOpen(false);
              chat.openConv(id);
            }}
            onNew={newChat}
            onDelete={chat.deleteConv}
          />
          <button
            type="button"
            onClick={() => {
              setListOpen(false);
              setSourcesOpen(true);
            }}
            className="press t-label mt-2 inline-flex h-11 items-center self-start font-semibold text-fg"
          >
            Where the numbers come from
          </button>
        </div>
      </Sheet>
      <SourcesSheet open={sourcesOpen} onOpenChange={setSourcesOpen} usda={chat.cap.data?.usda} />
    </div>
  );
}

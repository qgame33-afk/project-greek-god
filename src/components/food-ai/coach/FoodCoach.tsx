"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { MessageSquareText, SquarePen } from "lucide-react";
import { ContextChip } from "@/components/oracle/CoachAsk";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { DevMockBadge, FocusScreen } from "../parts";
import type { ComposerHandle } from "./Composer";
import { ConversationList } from "./ConversationList";
import { FoodComposerBlock, FoodThread } from "./FoodThread";
import { SourcesSheet } from "./SourcesSheet";
import { useFoodChat } from "./useFoodChat";

/** Keeps the phone layout above the iOS keyboard (the visual viewport shrinks, fixed boxes don't). */
function useKeyboardSafeBox(): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>();
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (window.innerWidth >= 768 || window.innerHeight - vv.height < 120) setStyle(undefined);
        else setStyle({ height: vv.height, top: vv.offsetTop, bottom: "auto" });
      });
    };
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  return style;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The Oracle with Fuel context, as a full page (docs/DESIGN-V2.md §3.9.2, §2.3 `/nutrition/coach`):
 * the Food Coach backend, its meal drafts as ESTIMATE cards, the conversation in ?c=. On phones a
 * full-screen layer (the capsule hides on this route) with its own back button and the composer on
 * the bottom edge; from 768 px the history column sits beside the thread.
 */
export function FoodCoach() {
  const params = useSearchParams();
  const rawConv = params.get("c");
  // a hand-edited or stale ?c= that isn't a conversation id behaves like a new chat
  const convId = rawConv && UUID_RE.test(rawConv) ? rawConv : null;
  // ?c= is client state: the native history API (which Next keeps in sync with useSearchParams)
  // switches chats without a server round trip, or a hard reload when the connection drops
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
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const kbStyle = useKeyboardSafeBox();

  const newChat = () => {
    setListOpen(false);
    chat.newChat();
    window.setTimeout(() => composerRef.current?.focus(), 60);
  };
  const list = (
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
  );

  return (
    <FocusScreen
      title="The Oracle"
      eyebrow="Fuel · food"
      style={kbStyle}
      bodyClassName="max-md:!overflow-hidden max-md:flex max-md:flex-col"
      right={
        <>
          {chat.isMock && <DevMockBadge />}
          <button type="button" onClick={() => setListOpen(true)} aria-label="Your food chats" className="press grid size-11 place-items-center rounded-full text-stone hover:text-ivory md:hidden">
            <MessageSquareText className="size-5" strokeWidth={1.6} />
          </button>
          <button type="button" onClick={newChat} aria-label="New chat" className="press grid size-11 place-items-center rounded-full text-stone hover:text-ivory md:hidden">
            <SquarePen className="size-5" strokeWidth={1.6} />
          </button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col md:grid md:h-[calc(100dvh-12rem)] md:min-h-[32rem] md:grid-cols-[15.5rem_minmax(0,1fr)] md:gap-6 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col md:flex" aria-label="Food chats">
          {list}
        </aside>

        <section className="relative flex min-h-0 flex-1 flex-col md:overflow-hidden md:rounded-card md:bg-m1 md:shadow-(--e1)" aria-label="Conversation">
          <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 hidden h-px bg-[linear-gradient(90deg,transparent,var(--aegean-line)_20%,var(--aegean)_50%,var(--aegean-line)_80%,transparent)] md:block" />
          <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-gutter pb-6 pt-4 md:px-7 md:pt-6">
            <div className="mx-auto max-w-[45rem]">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <ContextChip context={{ kind: "fuel", label: "Today's food" }} />
                <button
                  type="button"
                  onClick={() => setSourcesOpen(true)}
                  className="press t-meta inline-flex min-h-11 items-center rounded-full px-3.5 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory"
                >
                  Where the numbers come from
                </button>
              </div>
              <FoodThread chat={chat} scrollRoot={threadRef} />
            </div>
          </div>

          <div className={cn("shrink-0 border-t border-vein bg-night px-3 pt-2.5 md:bg-transparent md:px-6 md:pb-5")} style={{ paddingBottom: kbStyle ? 8 : "calc(10px + var(--safe-bottom))" }}>
            <div className="mx-auto max-w-[45rem]">
              <FoodComposerBlock chat={chat} composerRef={composerRef} />
            </div>
          </div>
        </section>
      </div>

      <Sheet open={listOpen} onOpenChange={setListOpen} title="Food chats">
        <div className="flex max-h-[60dvh] min-h-[40dvh] flex-col">{list}</div>
      </Sheet>
      <SourcesSheet open={sourcesOpen} onOpenChange={setSourcesOpen} usda={chat.cap.data?.usda} />
    </FocusScreen>
  );
}

"use client";

import { History } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { OracleContext } from "@/components/offering/store";
import { CoachAsk } from "@/components/oracle/CoachAsk";
import { contextFromPath } from "@/components/oracle/context";
import { OracleComposer, type ComposerHandle } from "@/components/oracle/OracleComposer";
import { isConvId, useCoachChat } from "@/components/oracle/useCoachChat";
import { BackHeader } from "@/components/shell/BackHeader";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useProfile } from "@/lib/data/profile";
import { cn } from "@/lib/cn";
import { ConversationList } from "./ConversationList";

const SESSION_KEY = "pgg.coach.conversation";
const session = {
  get(): string | null {
    try {
      return window.sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set(v: string | null) {
    try {
      if (v) window.sessionStorage.setItem(SESSION_KEY, v);
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // private mode — the URL still carries ?c=
    }
  },
};

/** ?about=<screen> → the screen "Ask coach" came from (the first question carries it). */
const ABOUT_PATH: Record<string, string> = { now: "/", train: "/training", ascent: "/progress", gym: "/workout/x", recipe: "/nutrition/meals/recipe/x" };
function aboutContext(kind: string | null): OracleContext | null {
  return kind && ABOUT_PATH[kind] ? contextFromPath(ABOUT_PATH[kind]) : null;
}

const noop = () => () => {};
/** false while hydrating (and on the server), true after — so cached query data never causes a mismatch. */
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export const COACH_SUBTITLE = "Answers from your own logs. Changes need your OK.";

/**
 * Coach (docs/DESIGN-V3-SIMPLE.md §4.8, `/coach` with ?c=, ?q= and ?about=): BackHeader "Today"
 * with a clock button for past chats, the title and its one line, the thread, and the composer
 * fixed at the bottom ("Ask anything"). Desktop: the past chats column beside the thread.
 */
export function CoachScreen() {
  const hydrated = useHydrated();
  return hydrated ? <CoachScreenInner /> : <CoachSkeleton />;
}

function Header({ onHistory }: { onHistory?: () => void }) {
  return (
    <BackHeader
      href="/"
      parent="Today"
      title="Coach"
      subtitle={COACH_SUBTITLE}
      right={
        onHistory ? (
          <button type="button" onClick={onHistory} aria-label="Past chats" className="press grid size-11 place-items-center rounded-full bg-card-2 text-fg lg:hidden">
            <History className="size-5" strokeWidth={1.9} />
          </button>
        ) : undefined
      }
    />
  );
}

function CoachSkeleton() {
  return (
    <div aria-busy="true">
      <Header />
      <div className="mt-6 flex flex-col items-start gap-2.5">
        <Skeleton className="h-11 w-64 rounded-pill" />
        <Skeleton className="h-11 w-52 rounded-pill" />
      </div>
    </div>
  );
}

function CoachScreenInner() {
  const { profile } = useProfile();
  // client-only (mounted after hydration): ?c= deep link or this tab's last conversation, ?q= prefill
  const [initial] = useState(() => {
    const url = new URL(window.location.href);
    const c = url.searchParams.get("c") ?? session.get();
    return { conv: isConvId(c) ? c : null, q: url.searchParams.get("q") ?? "", about: aboutContext(url.searchParams.get("about")) };
  });
  const chat = useCoachChat({ initialConv: initial.conv, initialDraft: initial.q, context: initial.about });
  const [historyOpen, setHistoryOpen] = useState(false);
  const composer = useRef<ComposerHandle>(null);
  const { convId } = chat;

  // keep the URL and this tab's memory in step with the open conversation
  useEffect(() => {
    session.set(convId);
    const url = new URL(window.location.href);
    if (convId) url.searchParams.set("c", convId);
    else url.searchParams.delete("c");
    url.searchParams.delete("q");
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [convId]);

  const newChat = () => {
    chat.newChat();
    setHistoryOpen(false);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      composer.current?.focus();
    });
  };
  const select = (id: string) => {
    setHistoryOpen(false);
    chat.select(id);
  };

  return (
    <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-8">
      <aside className="hidden lg:block" aria-label="Past chats">
        <div className="sticky top-8">
          <ConversationList currentId={convId} onSelect={select} onNew={newChat} onDeleted={(id) => id === convId && newChat()} disabled={chat.waiting} className="max-h-[80dvh]" />
        </div>
      </aside>

      <section className="min-w-0">
        <Header onHistory={() => setHistoryOpen(true)} />
        <div className="mt-6">
          <CoachAsk chat={chat} context={initial.about} onNewQuestion={newChat} />
        </div>
        <ComposerDock>
          <OracleComposer
            ref={composer}
            value={chat.draft}
            onChange={(v) => {
              chat.setDraft(v);
              if (chat.error && chat.error.code !== "not_configured") chat.setError(null);
            }}
            onSend={() => void chat.send(chat.draft, chat.error)}
            busy={chat.waiting}
            disabled={chat.notConnected || !profile}
            placeholder={chat.notConnected ? "Coach isn't set up yet" : convId ? "Ask a follow-up" : "Ask anything"}
          />
        </ComposerDock>
      </section>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen} title="Past chats" description="Kept on your account, on every device.">
        <ConversationList currentId={convId} onSelect={select} onNew={newChat} onDeleted={(id) => id === convId && newChat()} disabled={chat.waiting} className="max-h-[70dvh]" />
      </Sheet>
    </div>
  );
}

/**
 * Phones: fixed above the tab bar (--chrome-clear grows by the workout bar while one shows), lifted
 * above the on-screen keyboard, on an opaque --bg strip, with a spacer so the last answer never
 * hides behind it. Desktop: sticky at the bottom of the column.
 */
export function ComposerDock({ children, bottom = "var(--chrome-clear)" }: { children: ReactNode; bottom?: string }) {
  const [kb, setKb] = useState(0);
  const [spacer, setSpacer] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const kbRef = useRef(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      kbRef.current = inset > 120 ? Math.round(inset) : 0;
      setKb(kbRef.current);
    };
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);

  // room under the thread: how far the composer reaches above <main>'s own bottom padding
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (kbRef.current) return; // keep the resting layout while typing
      const main = el.closest("main");
      const pill = el.querySelector("form");
      if (!pill || getComputedStyle(el).position !== "fixed") return setSpacer(0);
      const pb = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      setSpacer(Math.max(0, Math.round(window.innerHeight - pill.getBoundingClientRect().top + 16 - pb)));
    };
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <>
      <div aria-hidden className="lg:hidden" style={{ height: spacer }} />
      <div
        ref={ref}
        data-composer-dock=""
        className={cn("fixed inset-x-0 z-(--z-sticky) bg-bg px-gutter pt-3 lg:sticky lg:bottom-0 lg:px-0 lg:pb-6", kb ? "pb-2" : "pb-2")}
        style={{ bottom: kb ? kb : bottom }}
      >
        <div className="mx-auto max-w-col">{children}</div>
      </div>
    </>
  );
}

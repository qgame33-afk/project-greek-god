"use client";

import { Clock, SquarePen } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { OracleSparkles } from "@/components/art/icons";
import { CoachAsk } from "@/components/oracle/CoachAsk";
import { OracleComposer, type ComposerHandle } from "@/components/oracle/OracleComposer";
import { isConvId, useCoachChat } from "@/components/oracle/useCoachChat";
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

const noop = () => () => {};
/** false while hydrating (and on the server), true after — so cached query data never causes a mismatch. */
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/**
 * The Oracle as a full page (docs/DESIGN-V2.md §3.9.2, `/coach` with ?c= and ?q=): the same Ask
 * content as the sheet, for deep links and desktop. Phones: the composer floats above the capsule
 * (and the live slot), lifted over the keyboard. Desktop: history column + the conversation pane.
 */
export function CoachScreen() {
  const hydrated = useHydrated();
  return hydrated ? <CoachScreenInner /> : <CoachSkeleton />;
}

function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="t-eyebrow mb-1.5 flex items-center gap-2">
          <OracleSparkles className="size-3.5 text-aegean" />
          The Oracle
        </p>
        <h1 className="t-title-1 text-ivory">Ask</h1>
      </div>
      {right}
    </header>
  );
}

function CoachSkeleton() {
  return (
    <div aria-busy="true">
      <Header />
      <Skeleton className="h-11 w-60 rounded-full" />
      <Skeleton className="mt-7 h-8 w-[80%] rounded-field" />
      <Skeleton className="mt-3 h-4 w-[70%] rounded-full" />
      <div className="mt-8 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-field" />
        ))}
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
    return { conv: isConvId(c) ? c : null, q: url.searchParams.get("q") ?? "" };
  });
  const chat = useCoachChat({ initialConv: initial.conv, initialDraft: initial.q });
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
    <div className="lg:grid lg:h-[calc(100dvh-6rem)] lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-6">
      <aside className="hidden lg:flex lg:min-h-0 lg:flex-col" aria-label="Conversations">
        <ConversationList currentId={convId} onSelect={select} onNew={newChat} onDeleted={(id) => id === convId && newChat()} disabled={chat.waiting} className="h-full" />
      </aside>

      <section className="relative flex min-h-0 flex-col lg:overflow-hidden lg:rounded-card lg:bg-m1 lg:shadow-(--e1)">
        <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 hidden h-px bg-[linear-gradient(90deg,transparent,var(--aegean-line)_20%,var(--aegean)_50%,var(--aegean-line)_80%,transparent)] lg:block" />
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:px-8 lg:pt-7">
          <div className="mx-auto w-full max-w-[45rem] lg:pb-8">
            <Header
              right={
                <div className="-mr-2 flex items-center lg:hidden">
                  <button type="button" onClick={() => setHistoryOpen(true)} aria-label="Conversation history" className="press grid size-11 place-items-center rounded-full text-stone hover:text-ivory">
                    <Clock className="size-5" strokeWidth={1.6} />
                  </button>
                  <button type="button" onClick={newChat} disabled={!convId || chat.waiting} aria-label="New question" className="press grid size-11 place-items-center rounded-full text-stone hover:text-ivory disabled:opacity-40">
                    <SquarePen className="size-5" strokeWidth={1.6} />
                  </button>
                </div>
              }
            />
            <CoachAsk chat={chat} context={null} onNewQuestion={newChat} />
          </div>
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
            placeholder={chat.notConnected ? "The Oracle needs an AI key on the server" : convId ? "Ask a follow-up" : "Ask the Oracle"}
          />
        </ComposerDock>
      </section>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen} title="Conversations" description="Kept on your account, on every device.">
        <ConversationList currentId={convId} onSelect={select} onNew={newChat} onDeleted={(id) => id === convId && newChat()} disabled={chat.waiting} className="max-h-[70dvh]" />
      </Sheet>
    </div>
  );
}

/**
 * Phones: fixed above the capsule (--chrome-clear grows by the live slot while one shows), lifted
 * above the on-screen keyboard, with a spacer so the last answer never hides behind it. Desktop: a
 * static footer of the conversation pane.
 */
function ComposerDock({ children }: { children: ReactNode }) {
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
      if (!main || !pill || getComputedStyle(el).position !== "fixed") return setSpacer(0);
      const pb = parseFloat(getComputedStyle(main).paddingBottom) || 0;
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
        className={cn(
          "pointer-events-none fixed inset-x-0 z-(--z-sticky) bg-[linear-gradient(to_bottom,transparent,var(--night)_38%)] px-gutter pt-5 md:left-[76px] lg:pointer-events-auto lg:static lg:bg-none lg:px-8 lg:pb-6 lg:pt-3",
          kb ? "pb-2" : "bottom-(--chrome-clear) pb-1 md:bottom-0 md:pb-[calc(var(--safe-bottom)+1rem)]",
        )}
        style={kb ? { bottom: kb } : undefined}
      >
        <div className="pointer-events-auto mx-auto max-w-[45rem]">{children}</div>
      </div>
    </>
  );
}

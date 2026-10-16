"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Clock, SquarePen } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { CoachRequestError, askCoach, useCoachStatus, useConversations, useMessages, useReceiveReply, useSetSuggestionStatus } from "@/lib/coach/hooks";
import { MAX_MESSAGE_CHARS } from "@/lib/coach/schema";
import type { CoachErrorCode, SuggestionStatus } from "@/lib/coach/types";
import { useProfile, useSaveProfile } from "@/lib/data/profile";
import type { Json } from "@/lib/supabase/database.types";
import { localDateOf, today } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { AccessChip } from "./AccessSheet";
import { Composer, type ComposerHandle } from "./Composer";
import { ConversationList } from "./ConversationList";
import { AssistantMessage, CoachError, DaySeparator, DevMockBadge, EmptyThread, Footnote, NotConnected, Thinking, UserBubble } from "./Thread";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

const pad = (n: number) => String(n).padStart(2, "0");
const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
};

interface Pending {
  text: string;
  convId: string | null;
  /** set once the server answered; the bubble hides when this id is in the list */
  savedId?: string;
}

interface SendError {
  code: CoachErrorCode;
  message: string;
  text: string;
  convId: string | null;
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

export function CoachScreen() {
  const hydrated = useHydrated();
  return hydrated ? <CoachScreenInner /> : <CoachSkeleton />;
}

/** Same frame as the real screen, so first paint doesn't jump. */
function CoachSkeleton() {
  return (
    <div className="lg:grid lg:h-[calc(100dvh-96px)] lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-6" aria-busy="true">
      <aside className="hidden lg:block">
        <Skeleton className="h-12 rounded-[14px]" />
        <div className="mt-8 space-y-2">
          <Skeleton className="h-14 rounded-[12px]" />
          <Skeleton className="h-14 rounded-[12px]" />
        </div>
      </aside>
      <section className="lg:rounded-[24px] lg:border lg:border-line-hair lg:px-8 lg:pt-7">
        <div className="mx-auto w-full max-w-[760px]">
          <p className="eyebrow mb-2">AI coach</p>
          <h1 className="t-title">Coach</h1>
          <Skeleton className="mt-4 h-9 w-[78%] max-w-[360px] rounded-full" />
          <div className="mt-7 flex gap-4">
            <Skeleton className="size-16 rounded-[18px]" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-5 w-[85%]" />
              <Skeleton className="h-4 w-[70%]" />
            </div>
          </div>
          <Skeleton className="mt-6 h-[78px] rounded-[20px]" />
          <div className="mt-8 grid gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-[16px]" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function CoachScreenInner() {
  const qc = useQueryClient();
  const profile = useProfile().profile ?? undefined;
  const status = useCoachStatus();
  const convs = useConversations();
  const save = useSaveProfile();
  const setStatus = useSetSuggestionStatus();
  const receive = useReceiveReply();

  // client-only (mounted after hydration): ?c= deep link or this tab's last conversation, ?q= prefill
  const [convId, setConvId] = useState<string | null>(() => {
    const c = new URL(window.location.href).searchParams.get("c") ?? session.get();
    return c && UUID.test(c) ? c : null;
  });
  const [draft, setDraft] = useState(() => (new URL(window.location.href).searchParams.get("q") ?? "").slice(0, MAX_MESSAGE_CHARS));
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<SendError | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const sending = useRef(false);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const messages = useMessages(convId);
  const msgs = useMemo(() => messages.data ?? [], [messages.data]);
  const notConnected = status.data?.configured === false;
  const mock = status.data?.mock === true;
  const noteSeen = (profile?.prefs as Record<string, unknown> | undefined)?.coachNoteSeen === true;

  /* ------------------------------------------- keep URL / tab in sync */
  useEffect(() => {
    session.set(convId);
    const url = new URL(window.location.href);
    if (convId) url.searchParams.set("c", convId);
    else url.searchParams.delete("c");
    url.searchParams.delete("q");
    if (url.toString() !== window.location.href) window.history.replaceState(null, "", url);
  }, [convId]);

  // a conversation deleted on another device → back to a new one
  useEffect(() => {
    if (!convId || !convs.data || messages.isLoading || pending) return;
    if (!convs.data.some((c) => c.id === convId) && msgs.length === 0) setConvId(null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [convId, convs.data, messages.isLoading, msgs.length, pending]);

  // drop the optimistic bubble once the saved message is rendered from the cache
  useEffect(() => {
    if (pending?.savedId && msgs.some((m) => m.id === pending.savedId)) setPending(null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [pending, msgs]);

  /* ------------------------------------------------------------- scroll */
  const scrollToEnd = useCallback((smooth: boolean, top = false) => {
    const el = scroller.current;
    const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
    if (el && getComputedStyle(el).overflowY !== "visible") el.scrollTo({ top: top ? 0 : el.scrollHeight, behavior });
    else window.scrollTo({ top: top ? 0 : document.documentElement.scrollHeight, behavior });
  }, []);

  // opening a conversation lands at its end
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!convId || !msgs.length || opened.current === convId) return;
    opened.current = convId;
    if (!scrollTo) scrollToEnd(false);
  }, [convId, msgs.length, scrollTo, scrollToEnd]);

  // a new answer scrolls so its first line is in view (long answers read top-down)
  useEffect(() => {
    if (!scrollTo) return;
    const el = document.querySelector(`[data-msg-id="${scrollTo}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setScrollTo(null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [scrollTo, msgs]);

  // the question bubble + thinking state, or an error, land in view once they're rendered
  // (scrolling before the commit would stop short of content that isn't laid out yet)
  const waiting = !!pending && !pending.savedId;
  useEffect(() => {
    if (waiting) scrollToEnd(true);
  }, [waiting, scrollToEnd]);
  // a failed first question shows its error at the top of the new chat; later ones at the end
  useEffect(() => {
    if (error) scrollToEnd(true, !error.convId);
  }, [error, scrollToEnd]);

  /* --------------------------------------------------------------- send */
  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!text || sending.current) return;
      sending.current = true;
      const from = convId;
      setError(null);
      setPending({ text, convId: from });
      setDraft("");
      try {
        const now = new Date();
        const r = await askCoach({ conversationId: from, message: text, localDate: today(now), localTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`, timeZone: deviceZone() });
        receive(r);
        setPending({ text, convId: r.conversationId, savedId: r.userMessage.id });
        opened.current = r.conversationId;
        setConvId((cur) => (cur === from ? r.conversationId : cur));
        setScrollTo(r.userMessage.id);
        setFreshId(r.assistantMessage.id);
      } catch (e) {
        const err = e instanceof CoachRequestError ? e : new CoachRequestError("upstream", "Something went wrong. Your question is kept — try again.");
        setPending(null);
        setError({ code: err.code, message: err.message, text, convId: err.code === "not_found" ? null : from });
        setDraft((d) => d || text);
        if (err.code === "not_configured") qc.invalidateQueries({ queryKey: ["coach-status"] });
        if (err.code === "not_found") {
          setConvId(null);
          qc.invalidateQueries({ queryKey: ["coach-convs"] });
        }
      } finally {
        sending.current = false;
      }
    },
    [convId, qc, receive],
  );

  // keyed by the message's own conversation, so a late Undo still lands on the right message
  const { mutate: mutateStatus } = setStatus;
  const onStatus = useCallback(
    (conversationId: string, messageId: string, suggestionId: string, st: SuggestionStatus) => {
      mutateStatus({ convId: conversationId, messageId, suggestionId, status: st });
    },
    [mutateStatus],
  );

  const dismissNote = () => {
    if (!profile) return;
    const prefs = (profile.prefs && typeof profile.prefs === "object" && !Array.isArray(profile.prefs) ? profile.prefs : {}) as Record<string, Json>;
    save.mutate({ values: { prefs: { ...prefs, coachNoteSeen: true } } });
  };

  const newChat = () => {
    setConvId(null);
    setError(null);
    setHistoryOpen(false);
    opened.current = null;
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      composer.current?.focus();
    });
  };
  const select = (id: string) => {
    setHistoryOpen(false);
    setError(null);
    opened.current = null;
    setConvId(id);
  };

  /* ------------------------------------------------------------- render */
  const busy = waiting;
  const showPending = !!pending && pending.convId === convId && !msgs.some((m) => m.id === pending.savedId);
  const loadingThread = !!convId && messages.isLoading;
  const empty = !convId && !showPending;
  const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant")?.id;
  const footnote = !noteSeen && profile ? <Footnote onDismiss={dismissNote} /> : null;
  const composerDisabled = notConnected || !profile;
  const errorNote =
    error && error.convId === convId ? (
      error.code === "not_configured" ? (
        <NotConnected compact />
      ) : (
        <CoachError onRetry={error.code === "quota" ? undefined : () => send(error.text)}>{error.message}</CoachError>
      )
    ) : null;

  return (
    <div className="lg:grid lg:h-[calc(100dvh-96px)] lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-6">
      {/* desktop history column */}
      <aside className="hidden lg:flex lg:min-h-0 lg:flex-col" aria-label="Conversations">
        <ConversationList currentId={convId} onSelect={select} onNew={newChat} onDeleted={(id) => id === convId && newChat()} disabled={busy} className="h-full" />
      </aside>

      <section className="flex min-h-0 flex-col lg:rounded-[24px] lg:border lg:border-line-hair lg:bg-[var(--surface-1)]/40">
        <div
          ref={scroller}
          className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:px-8 lg:pt-7 lg:[mask-image:linear-gradient(to_bottom,transparent,#000_20px,#000_calc(100%-32px),transparent)]"
        >
          <div className="mx-auto w-full max-w-[760px] lg:pb-8">
            <header className="mb-5">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow mb-2 flex items-center gap-2">
                    AI coach
                    {mock && <DevMockBadge />}
                  </p>
                  <h1 className="t-title">Coach</h1>
                </div>
                <div className="-mr-2 flex items-center lg:hidden">
                  <button type="button" onClick={() => setHistoryOpen(true)} aria-label="Conversation history" className="grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg">
                    <Clock className="size-[21px]" />
                  </button>
                  <button
                    type="button"
                    onClick={newChat}
                    disabled={!convId || busy}
                    aria-label="New conversation"
                    className="grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg disabled:opacity-35"
                  >
                    <SquarePen className="size-[20px]" />
                  </button>
                </div>
              </div>
              <AccessChip profile={profile} className="mt-3" />
            </header>

            {empty ? (
              <>
                {errorNote && !(error?.code === "not_configured" && notConnected) && <div className="mb-6">{errorNote}</div>}
                <EmptyThread profile={profile} onAsk={send} disabled={!profile || busy} notConnected={notConnected} footnote={footnote} />
              </>
            ) : (
              <div className="space-y-6 pb-2" aria-live="polite" aria-busy={busy}>
                {loadingThread && (
                  <div className="space-y-6" aria-label="Loading conversation">
                    <div className="flex justify-end">
                      <Skeleton className="h-11 w-[62%] rounded-[18px]" />
                    </div>
                    <div className="flex gap-3">
                      <Skeleton className="size-7 rounded-full" />
                      <div className="flex-1 space-y-2.5">
                        <Skeleton className="h-4 w-[92%]" />
                        <Skeleton className="h-4 w-[84%]" />
                        <Skeleton className="h-4 w-[60%]" />
                      </div>
                    </div>
                  </div>
                )}
                {messages.error && <CoachError onRetry={() => messages.refetch()}>Couldn&apos;t load this conversation. Check your connection.</CoachError>}
                {msgs.map((m, i) => {
                  const day = localDateOf(m.created_at);
                  const sep = m.role === "user" && (i === 0 ? msgs.length > 2 || day !== today() : localDateOf(msgs[i - 1].created_at) !== day);
                  return m.role === "user" ? (
                    <Fragment key={m.id}>
                      {sep && <DaySeparator date={day} />}
                      <UserBubble id={m.id} text={m.content} />
                    </Fragment>
                  ) : (
                    <AssistantMessage
                      key={m.id}
                      message={m}
                      profile={profile}
                      last={m.id === lastAssistant && !showPending}
                      fresh={m.id === freshId}
                      onStatus={onStatus}
                      onFollowUp={send}
                      followUpsDisabled={busy || notConnected}
                    />
                  );
                })}
                {showPending && (
                  <>
                    <UserBubble text={pending.text} pending />
                    {!pending.savedId && <Thinking />}
                  </>
                )}
                {footnote && msgs.length > 0 && !busy && footnote}
              </div>
            )}

            {!empty && errorNote && <div className="mt-4">{errorNote}</div>}
            {!empty && notConnected && !error && <NotConnected compact className="mt-5" />}
          </div>
        </div>

        {/* composer: fixed above the tab bar / keyboard on phones, docked in the pane on desktop */}
        <ComposerDock>
          <Composer
            ref={composer}
            value={draft}
            onChange={(v) => {
              setDraft(v);
              if (error && error.code !== "not_configured") setError(null);
            }}
            onSend={() => send(draft)}
            busy={busy}
            disabled={composerDisabled}
            placeholder={notConnected ? "Coach needs an AI key on the server" : convId ? "Ask a follow-up" : "Ask your coach"}
          />
        </ComposerDock>
      </section>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen} title="Conversations" description="Saved to your account on every device.">
        <ConversationList currentId={convId} onSelect={select} onNew={newChat} onDeleted={(id) => id === convId && newChat()} disabled={busy} className="max-h-[70dvh]" />
      </Sheet>
    </div>
  );
}

/** True while the shell's Live Session Dock is on screen (an active workout elsewhere). */
const subscribeDom = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.body, { childList: true, subtree: true });
  return () => mo.disconnect();
};
const liveDockSnapshot = () => !!document.querySelector("[data-live-dock]");
const noLiveDock = () => false;
function useLiveDockShown() {
  return useSyncExternalStore(subscribeDom, liveDockSnapshot, noLiveDock);
}

/**
 * Phones: fixed above the tab bar (and above the Live Session Dock when a workout is running),
 * lifted above the on-screen keyboard (visualViewport), with a spacer so the last message never
 * hides behind it. Desktop: a static footer of the chat pane. Horizontal padding mirrors <main>
 * so the pill lines up with the content column.
 */
function ComposerDock({ children }: { children: React.ReactNode }) {
  const [kb, setKb] = useState(0);
  const [spacer, setSpacer] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const kbRef = useRef(0);
  const liveDock = useLiveDockShown();

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

  // Room under the thread = how far the pill reaches up past <main>'s own bottom padding (which
  // already accounts for the tab bar and, on phones, the Live Dock), plus a little air.
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
  }, [liveDock]);

  return (
    <>
      <div aria-hidden className="lg:hidden" style={{ height: spacer }} />
      <div
        ref={ref}
        className={cn(
          "pointer-events-none fixed inset-x-0 z-[25] bg-[linear-gradient(to_bottom,transparent,var(--bg)_42%)] pt-5 lg:pointer-events-auto lg:static lg:z-auto lg:rounded-b-[24px] lg:bg-none lg:px-8 lg:pb-6 lg:pt-3",
          kb
            ? "pb-2"
            : liveDock
              ? // the dock sits 14px above the tab bar (52px tall) on phones, 24px from the corner on tablets
                "bottom-[calc(var(--tabbar-h)+var(--safe-bottom))] pb-[74px] md:bottom-0 md:pb-[calc(var(--safe-bottom)+88px)]"
              : "bottom-[calc(var(--tabbar-h)+var(--safe-bottom))] pb-2 md:bottom-0 md:pb-[calc(var(--safe-bottom)+16px)]",
        )}
        style={kb ? { bottom: kb } : undefined}
      >
        <div className="mx-auto w-full max-w-[1180px] px-4 md:pl-[100px] md:pr-6 lg:max-w-none lg:p-0">
          <div className="pointer-events-auto mx-auto max-w-[760px]">{children}</div>
        </div>
      </div>
    </>
  );
}

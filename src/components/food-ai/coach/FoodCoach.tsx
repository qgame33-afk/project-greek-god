"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { Info, MessageSquareText, PenLine, SquarePen } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/misc";
import { EmptyArt } from "@/components/art/Motifs";
import { cn } from "@/lib/cn";
import { newId, useToday, useUser } from "@/lib/data/core";
import type { FoodChatPayload } from "@/lib/ai/food-schemas";
import { FoodAIRequestError, getCapability, sendFoodChat } from "../api";
import { ImagePrepError, prepareImage, type PreparedImage } from "../image";
import { useDeleteConversation, useFoodConversations, useFoodMessages, useLoggedGroups, type AIMessage } from "../hooks";
import { CoachAvatar, DevMockBadge, FocusScreen } from "../parts";
import { AssistantMessage, UserBubble } from "./ChatMessage";
import { Composer, type ComposerHandle } from "./Composer";
import { ConversationList } from "./ConversationList";

export const EXAMPLES = [
  "I just ate three eggs, two bagels, and a protein shake",
  "250 g cooked chicken and two cups of rice",
  "Medium Domino's pepperoni pizza and eight boneless wings",
  "A large bowl of homemade bolognese",
];

interface Pending {
  id: string;
  /** Conversation it was sent from (null = a new chat). */
  conv: string | null;
  text: string;
  image: string | null;
  startedAt: number;
}

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

export function FoodCoach() {
  const router = useRouter();
  const params = useSearchParams();
  const rawConv = params.get("c");
  // a hand-edited or stale ?c= that isn't a conversation id behaves like a new chat
  const convId = rawConv && UUID_RE.test(rawConv) ? rawConv : null;
  const qc = useQueryClient();
  const todayDate = useToday();
  const { userId } = useUser();
  const cap = useQuery({ queryKey: ["food-ai-cap", "chat"], queryFn: () => getCapability("chat"), staleTime: 5 * 60_000, retry: 0 });
  const convs = useFoodConversations();
  const msgs = useFoodMessages(convId);
  const del = useDeleteConversation();

  const [text, setText] = useState("");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<{ code: string; message: string; retry: string | null } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sendingRef = useRef(false);
  // the conversation on screen right now (a reply can land after the user moved to another chat)
  const viewingRef = useRef(convId);
  useEffect(() => {
    viewingRef.current = convId;
  }, [convId]);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const kbStyle = useKeyboardSafeBox();

  const messages = useMemo(() => msgs.data ?? [], [msgs.data]);

  // ?c= pointing at a malformed id, or at a chat that was deleted (here or on another device)
  const convMissing = !!convId && !!convs.data && !convs.data.some((c) => c.id === convId) && !!msgs.data && msgs.data.length === 0;
  useEffect(() => {
    if ((rawConv && !convId) || convMissing) router.replace("/nutrition/coach", { scroll: false });
  }, [rawConv, convId, convMissing, router]);
  const configured = cap.data?.configured ?? true;
  const isMock = !!cap.data?.mock || messages.some((m) => (m.payload as { mock?: boolean } | null)?.mock);

  // diary state of every logged draft in this chat (detects rows deleted from the diary)
  const loggedIds = useMemo(() => messages.map((m) => m.logged_group_id).filter((g): g is string => !!g), [messages]);
  const groups = useLoggedGroups(loggedIds);

  // derived per-message context
  const view = useMemo(() => {
    const revisedBy = new Map<string, string>();
    for (const m of messages) {
      const r = (m.payload as FoodChatPayload | null)?.revises;
      if (r) revisedBy.set(r, m.id);
    }
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;
    return { revisedBy, lastAssistant };
  }, [messages]);

  // keep the newest turn in view
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: messages.length > 0 && pending ? "smooth" : "auto" });
  }, [messages.length, pending, convId]);

  const pickImage = async (f: File) => {
    setPreparing(true);
    try {
      setImage(await prepareImage(f, 1600, 0.82));
    } catch (e) {
      toast.error(e instanceof ImagePrepError ? e.message : "That photo couldn't be read.");
    } finally {
      setPreparing(false);
    }
  };

  const send = async (raw?: string) => {
    const msg = (raw ?? text).trim();
    if (!msg || sendingRef.current || !configured) return;
    sendingRef.current = true;
    const fromComposer = raw === undefined;
    const img = fromComposer ? image : null;
    const clientMessageId = newId();
    setPending({ id: clientMessageId, conv: convId, text: msg, image: img?.dataUrl ?? null, startedAt: Date.now() });
    setError(null);
    if (fromComposer) {
      setText("");
      setImage(null);
    }
    try {
      const res = await sendFoodChat({ conversationId: convId, clientMessageId, message: msg, image: img?.dataUrl ?? null, localDate: todayDate });
      qc.setQueryData<AIMessage[]>(["food-msgs", res.conversationId, userId], (prev) => {
        const base = (prev ?? []).filter((m) => m.id !== res.userMessage.id && m.id !== res.assistantMessage.id);
        return [...base, res.userMessage, res.assistantMessage];
      });
      // open the new chat only if the user is still looking at the one they sent from
      if (res.conversationId !== convId && viewingRef.current === convId) router.replace(`/nutrition/coach?c=${res.conversationId}`, { scroll: false });
      qc.invalidateQueries({ queryKey: ["food-convs"] });
    } catch (e) {
      const err = e instanceof FoodAIRequestError ? e : new FoodAIRequestError("upstream", "Couldn't reach Food Coach. Try again.", 0);
      if (fromComposer) {
        setText(msg);
        setImage(img);
      }
      // chips and question answers aren't in the composer: remember them for Retry
      setError({ code: err.code, message: err.message, retry: fromComposer ? null : msg });
      if (err.code === "not_found") router.replace("/nutrition/coach", { scroll: false });
    } finally {
      setPending(null);
      sendingRef.current = false;
    }
  };

  const newChat = () => {
    setListOpen(false);
    setError(null);
    router.push("/nutrition/coach", { scroll: false });
    window.setTimeout(() => composerRef.current?.focus(), 60);
  };
  const openConv = (id: string) => {
    setListOpen(false);
    setError(null);
    router.push(`/nutrition/coach?c=${id}`, { scroll: false });
  };
  const deleteConv = (id: string) =>
    del.mutate(id, {
      onSuccess: () => {
        toast("Chat deleted");
        if (id === convId) router.replace("/nutrition/coach", { scroll: false });
      },
      onError: (e) => toast.error("Couldn't delete the chat", { description: (e as Error).message }),
    });

  // "no data yet" (not isLoading) so the server render and the first client render agree
  const msgsLoading = !!convId && !msgs.data && !msgs.isError;
  const shownPending = pending && pending.conv === convId ? pending : null;
  const showEmpty = !shownPending && (!convId || (!!msgs.data && messages.length === 0));
  const list = (
    <ConversationList
      conversations={convs.data ?? []}
      loading={!convs.data && !convs.isError}
      activeId={convId}
      onOpen={openConv}
      onNew={newChat}
      onDelete={deleteConv}
    />
  );

  return (
    <FocusScreen
      title="Food coach"
      eyebrow="Nutrition"
      style={kbStyle}
      bodyClassName="max-md:!overflow-hidden max-md:flex max-md:flex-col"
      right={
        <>
          {isMock && <DevMockBadge />}
          <button
            type="button"
            onClick={() => setListOpen(true)}
            aria-label="Your food chats"
            className="grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg md:hidden"
          >
            <MessageSquareText className="size-[21px]" />
          </button>
          <button
            type="button"
            onClick={newChat}
            aria-label="New chat"
            className="grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg md:hidden"
          >
            <SquarePen className="size-[21px]" />
          </button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col md:grid md:h-[calc(100dvh-188px)] md:min-h-[520px] md:grid-cols-[248px_minmax(0,1fr)] md:gap-5 lg:h-[calc(100dvh-196px)] lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="card hidden min-h-0 flex-col p-2 md:flex" aria-label="Food chats">
          {list}
        </aside>

        <section className="flex min-h-0 flex-1 flex-col md:card md:overflow-hidden" aria-label="Conversation">
          <CapabilityBanner configured={configured} onSources={() => setSourcesOpen(true)} />

          <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 md:px-6" aria-live="polite">
            {showEmpty ? (
              <EmptyCoach configured={configured} onExample={(e) => void send(e)} />
            ) : msgsLoading ? (
              <ThreadSkeleton />
            ) : msgs.isError ? (
              <p className="py-10 text-center text-[13px] text-fg-2">
                Couldn&apos;t load this chat.{" "}
                <button type="button" className="font-bold text-gold-300" onClick={() => msgs.refetch()}>
                  Retry
                </button>
              </p>
            ) : (
              <ol className="mx-auto max-w-[720px] space-y-6">
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
                  // what the user said about THIS meal (first description, answers, corrections) for the
                  // hand-off prompt: walk back until an earlier, unrelated draft
                  const lineage = new Set<string>();
                  for (let r = p?.revises ?? null; r && !lineage.has(r);) {
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
                        onSend={(t) => void send(t)}
                      />
                      {p?.refers_to && (
                        <button
                          type="button"
                          onClick={() => document.getElementById(`msg-${p.refers_to}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                          className="ml-[42px] mt-1 h-10 text-[13px] font-bold text-lapis-text"
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
                      <CoachAvatar loading />
                      <span className="text-[14px] text-fg-3">Working out the numbers…</span>
                    </li>
                  </>
                )}
              </ol>
            )}
          </div>

          <div
            className="shrink-0 border-t border-line-hair bg-bg/80 px-3 pt-2.5 md:bg-transparent md:px-5 md:pb-4"
            style={{ paddingBottom: kbStyle ? 8 : "calc(10px + var(--safe-bottom))" }}
          >
            {error && (
              <div
                className="mb-2.5 flex items-start justify-between gap-3 rounded-[12px] border border-danger/30 bg-danger-tint px-3.5 py-2.5 text-[13px] text-fg"
                role="alert"
              >
                <span>
                  {error.message}
                  {error.code !== "not_configured" && error.code !== "quota" && !error.retry ? " Your message is kept." : ""}
                </span>
                {error.code !== "not_configured" && error.code !== "quota" && (
                  <button type="button" onClick={() => void send(error.retry ?? undefined)} className="-my-1 h-11 shrink-0 px-1 font-bold text-gold-300">
                    Retry
                  </button>
                )}
              </div>
            )}
            <Composer
              ref={composerRef}
              value={text}
              onChange={setText}
              onSend={() => void send()}
              onPickImage={pickImage}
              onRemoveImage={() => setImage(null)}
              image={image?.dataUrl ?? null}
              preparingImage={preparing}
              disabled={!configured}
              sending={!!pending}
              placeholder={configured ? undefined : "Food Coach needs an AI key"}
            />
          </div>
        </section>
      </div>

      <Sheet open={listOpen} onOpenChange={setListOpen} title="Food chats">
        <div className="flex max-h-[60dvh] min-h-[40dvh] flex-col">{list}</div>
      </Sheet>
      <SourcesSheet open={sourcesOpen} onOpenChange={setSourcesOpen} usda={cap.data?.usda} />
    </FocusScreen>
  );
}

function CapabilityBanner({ configured, onSources }: { configured: boolean; onSources: () => void }) {
  if (!configured) {
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-line-hair bg-s1 py-2 pl-4 pr-2 md:pl-6 md:pr-4" role="status">
        <Info className="size-4 shrink-0 text-fg-3" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-fg">Food Coach isn&apos;t connected yet.</p>
          <p className="text-[12px] leading-snug text-fg-2">It needs a Gemini API key on the server. Manual logging works now.</p>
        </div>
        <Link
          href="/nutrition?add=1"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[12px] px-2.5 text-[13px] font-bold text-gold-300 hover:bg-gold-tint"
        >
          <PenLine className="size-4" aria-hidden />
          Log manually
        </Link>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onSources}
      className="flex min-h-11 w-full shrink-0 items-center gap-2.5 border-b border-line-hair bg-s1 px-4 py-2 text-left md:px-6"
    >
      <Info className="size-4 shrink-0 text-fg-3" aria-hidden />
      <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg-2">Live restaurant lookup is off. Answers use labelled estimates.</span>
      <span className="shrink-0 text-[12px] font-bold text-gold-300">Sources</span>
    </button>
  );
}

function EmptyCoach({ configured, onExample }: { configured: boolean; onExample: (e: string) => void }) {
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center pt-6 text-center md:pt-12">
      <EmptyArt kind="kylix" size={72} />
      <h2 className="t-h2 mt-4 text-[22px]">Describe what you ate.</h2>
      <p className="mt-1.5 max-w-[34ch] text-[14px] leading-relaxed text-fg-2">
        Plain words work. Quantities and restaurant names make it sharper. Nothing is logged until you confirm.
      </p>
      <ul className="mt-6 grid w-full gap-2 md:grid-cols-2">
        {EXAMPLES.map((e) => (
          <li key={e}>
            <button
              type="button"
              disabled={!configured}
              onClick={() => onExample(e)}
              className="press-soft flex min-h-[52px] w-full items-center rounded-[14px] border border-line bg-s2 px-4 py-3 text-left text-[14px] font-semibold leading-snug text-fg-2 transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50"
            >
              {e}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="mx-auto max-w-[720px] space-y-6" aria-hidden>
      <Skeleton className="ml-auto h-11 w-3/5 rounded-[18px]" />
      <div className="flex gap-2.5">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-40 w-full rounded-[14px]" />
        </div>
      </div>
    </div>
  );
}

function SourcesSheet({ open, onOpenChange, usda }: { open: boolean; onOpenChange: (o: boolean) => void; usda?: "key" | "demo_key" }) {
  const row = (title: string, body: React.ReactNode, cls?: string) => (
    <div className={cn("rounded-[14px] bg-s3 p-3.5", cls)}>
      <p className="text-[14px] font-bold text-fg">{title}</p>
      <div className="mt-1 text-[13px] leading-relaxed text-fg-2">{body}</div>
    </div>
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Where the numbers come from">
      <div className="space-y-2.5 pb-2">
        {row(
          "Database values",
          <>
            Generic foods are checked against USDA FoodData Central, packaged products against Open Food Facts. Matched rows link to the exact record.
            {usda === "demo_key" && " USDA is running on a shared demo key, so some lookups may fall back to estimates."}
          </>,
        )}
        {row(
          "Estimates",
          "When nothing matches confidently — and for every restaurant item — the row is an AI estimate with a confidence meter. Check portions before logging.",
        )}
        {row(
          "Published restaurant numbers",
          "Food Coach can't browse the web. On a restaurant row, tap Research it to hand the question to ChatGPT or Claude, then paste the answer back. Their links are shown as reported, because we didn't open those pages ourselves.",
        )}
        {row("Privacy", "Chats and photos are stored in your account only. Deleting a chat deletes its photos; logged food stays in your diary.")}
      </div>
    </Sheet>
  );
}

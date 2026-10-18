"use client";

import { ChevronRight, X } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { OracleSparkles } from "@/components/art/icons";
import { AccessChip } from "@/components/coach/AccessSheet";
import type { OracleContext } from "@/components/offering/store";
import { useProfile, useSavePrefs, type Profile } from "@/lib/data/profile";
import { localDateOf, today } from "@/lib/dates";
import { formatBodyweight, type WeightUnit } from "@/lib/units";
import { WEEKLY_SUMMARY_PROMPT, promptsFor } from "./context";
import { AskedLine, DaySeparator, Footnote, NotConnected, OracleAnswer, OracleError, Thinking, ThreadSkeleton } from "./OracleThread";
import type { CoachChat } from "./useCoachChat";

/**
 * The Oracle over the coach backend (docs/DESIGN-V2.md §3.9.2): the context chip, suggestions for
 * the screen it was opened from, then the thread. The composer is the caller's (the sheet's footer,
 * or the page's dock). Scrolling uses scrollIntoView, so it works in the sheet's body and the page.
 */
export function CoachAsk({
  chat,
  context,
  onClearContext,
  onNavigate,
  onNewQuestion,
}: {
  chat: CoachChat;
  context: OracleContext | null;
  onClearContext?: () => void;
  onNavigate?: () => void;
  /** Start a new conversation (the end of a thread offers it). */
  onNewQuestion?: () => void;
}) {
  const { profile } = useProfile();
  const savePrefs = useSavePrefs({ quiet: true });
  const end = useRef<HTMLDivElement>(null);
  const { convId, msgs, messages, error, send, waiting, showPending, pending, notConnected, freshId, lastAssistant } = chat;
  const noteSeen = (profile?.prefs as Record<string, unknown> | undefined)?.coachNoteSeen === true;
  const footnote = !noteSeen && profile ? <Footnote onDismiss={() => savePrefs.mutate({ coachNoteSeen: true })} /> : null;
  const empty = !convId && !showPending;
  const loadingThread = !!convId && messages.isLoading;

  // opening a conversation lands at its end
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!convId || !msgs.length || opened.current === convId) return;
    opened.current = convId;
    end.current?.scrollIntoView({ block: "end" });
  }, [convId, msgs.length]);
  // a new answer scrolls so his question is at the top (long answers read top-down)
  const { scrollTo, clearScrollTo } = chat;
  useEffect(() => {
    if (!scrollTo) return;
    const el = document.querySelector(`[data-msg-id="${scrollTo}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    clearScrollTo();
  }, [scrollTo, msgs, clearScrollTo]);
  useEffect(() => {
    if (waiting || error) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [waiting, error]);

  const errorNote =
    error && error.convId === convId ? (
      error.code === "not_configured" ? (
        <NotConnected compact />
      ) : (
        <OracleError onRetry={error.code === "quota" || error.code === "unauthorized" ? undefined : () => send(error.text, error)}>{error.message}</OracleError>
      )
    ) : null;

  return (
    <div className="pb-2">
      {(context || profile) && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {context && <ContextChip context={context} onClear={onClearContext} />}
          <AccessChip profile={profile ?? undefined} />
        </div>
      )}

      {empty ? (
        <>
          {errorNote && <div className="mb-5">{errorNote}</div>}
          <EmptyOracle profile={profile ?? undefined} context={context} onAsk={send} disabled={!profile || waiting} notConnected={notConnected} onNavigate={onNavigate} />
          {footnote && <div className="mt-6">{footnote}</div>}
        </>
      ) : (
        <div className="space-y-7" aria-live="polite" aria-busy={waiting}>
          {loadingThread && <ThreadSkeleton />}
          {messages.error && <OracleError onRetry={() => messages.refetch()}>Couldn&apos;t load this conversation. Check your connection.</OracleError>}
          {msgs.map((m, i) => {
            const day = localDateOf(m.created_at);
            const sep = m.role === "user" && (i === 0 ? msgs.length > 2 || day !== today() : localDateOf(msgs[i - 1].created_at) !== day);
            return m.role === "user" ? (
              <Fragment key={m.id}>
                {sep && <DaySeparator date={day} />}
                <AskedLine id={m.id} text={m.content} />
              </Fragment>
            ) : (
              <OracleAnswer
                key={m.id}
                message={m}
                profile={profile ?? undefined}
                last={m.id === lastAssistant && !showPending}
                fresh={m.id === freshId}
                onStatus={chat.onStatus}
                onFollowUp={send}
                followUpsDisabled={waiting || notConnected}
                onNavigate={onNavigate}
              />
            );
          })}
          {showPending && pending && (
            <>
              <AskedLine text={pending.text} pending />
              {!pending.savedId && <Thinking />}
            </>
          )}
          {errorNote}
          {notConnected && !error && <NotConnected compact />}
          {footnote && msgs.length > 0 && !waiting && footnote}
          {onNewQuestion && msgs.length > 0 && !waiting && (
            <button type="button" onClick={onNewQuestion} className="press t-callout inline-flex h-11 items-center font-semibold text-stone underline decoration-ui-line underline-offset-4 hover:text-ivory">
              New question
            </button>
          )}
        </div>
      )}
      <div ref={end} className="h-px" aria-hidden />
    </div>
  );
}

/** "About: Push A today" — the screen the question comes from; ✕ asks without it. */
export function ContextChip({ context, onClear }: { context: OracleContext; onClear?: () => void }) {
  return (
    <span className="t-meta inline-flex min-h-11 max-w-full items-center gap-1 rounded-full bg-m3 pl-3.5 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] @max-[19rem]:rounded-card">
      <span className="truncate py-2 @max-[19rem]:whitespace-normal">
        About: <span className="font-semibold text-ivory">{context.label}</span>
      </span>
      {onClear ? (
        <button type="button" onClick={onClear} aria-label={`Ask without “${context.label}”`} className="press grid size-11 shrink-0 place-items-center rounded-full text-ash hover:text-ivory">
          <X className="size-4" strokeWidth={1.8} />
        </button>
      ) : (
        <span className="w-3.5" />
      )}
    </span>
  );
}

function EmptyOracle({
  profile,
  context,
  onAsk,
  disabled,
  notConnected,
  onNavigate,
}: {
  profile: Profile | undefined;
  context: OracleContext | null;
  onAsk: (q: string) => void;
  disabled?: boolean;
  notConnected?: boolean;
  onNavigate?: () => void;
}) {
  const unit: WeightUnit = profile?.weight_unit === "kg" ? "kg" : "lb";
  const prompts = promptsFor(context?.kind, {
    proteinGoal: profile?.protein_goal ?? null,
    goalWeight: profile?.goal_weight_lb != null ? formatBodyweight(Number(profile.goal_weight_lb), unit) : null,
  });
  return (
    <div className="rise">
      <OracleSparkles className="size-7 text-aegean" />
      <p className="t-verdict mt-3 text-ivory">Ask, and it reads your records.</p>
      <p className="t-callout mt-2 max-w-[38ch] text-stone">Answers come from your own logs. Anything about the future is marked PROJ. Nothing changes until you confirm it.</p>
      {notConnected ? (
        <NotConnected className="mt-6" onNavigate={onNavigate} />
      ) : (
        <>
          <p className="t-eyebrow mb-1 mt-7">{context ? "For this screen" : "Try asking"}</p>
          <ul className="divide-y divide-vein border-y border-vein">
            {[prompts.lead, ...prompts.more].map((q, i) => (
              <li key={q}>
                <PromptRow onClick={() => onAsk(q)} disabled={disabled} lead={i === 0}>
                  {q}
                </PromptRow>
              </li>
            ))}
            <li>
              <PromptRow onClick={() => onAsk(WEEKLY_SUMMARY_PROMPT)} disabled={disabled} detail="Training, food, weight and recovery, last 7 days">
                Weekly summary
              </PromptRow>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}

function PromptRow({ children, detail, onClick, disabled, lead }: { children: ReactNode; detail?: string; onClick: () => void; disabled?: boolean; lead?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="press-soft flex min-h-14 w-full items-center gap-3 py-2.5 text-left disabled:opacity-50">
      <span className="min-w-0 flex-1">
        <span className={lead ? "t-title-3 block text-ivory" : "t-callout block font-semibold text-ivory"}>{children}</span>
        {detail && <span className="t-meta mt-0.5 block text-stone">{detail}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
    </button>
  );
}

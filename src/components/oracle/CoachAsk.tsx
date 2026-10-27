"use client";

import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import type { OracleContext } from "@/components/offering/store";
import { useProfile, useSavePrefs } from "@/lib/data/profile";
import { localDateOf, today } from "@/lib/dates";
import { formatBodyweight, type WeightUnit } from "@/lib/units";
import { promptsFor } from "./context";
import { AskedLine, DaySeparator, Footnote, NotConnected, OracleAnswer, OracleError, SuggestionChip, Thinking, ThreadSkeleton } from "./OracleThread";
import type { CoachChat } from "./useCoachChat";
import { useProgramDays } from "./useProgramDays";

/**
 * Coach's thread over the coach backend (docs/DESIGN-V3-SIMPLE.md §4.8): two suggested questions
 * for the screen it was opened from (PROGRAM's two on Today and Train, with the active program's
 * day names), then the conversation. The composer is the page's. Scrolling uses scrollIntoView.
 */
export function CoachAsk({
  chat,
  context,
  onNavigate,
  onNewQuestion,
}: {
  chat: CoachChat;
  context: OracleContext | null;
  onNavigate?: () => void;
  /** Start a new conversation (the end of a thread offers it). */
  onNewQuestion?: () => void;
}) {
  const { profile } = useProfile();
  const savePrefs = useSavePrefs({ quiet: true });
  const days = useProgramDays();
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

  const unit: WeightUnit = profile?.weight_unit === "lb" ? "lb" : "kg";
  const prompts = promptsFor(context?.kind, {
    proteinGoal: profile?.protein_goal ?? null,
    goalWeight: profile?.goal_weight_lb != null ? formatBodyweight(Number(profile.goal_weight_lb), unit) : null,
    days,
  });
  const chips = [prompts.lead, ...prompts.more].slice(0, 2);

  return (
    <div className="pb-2">
      {empty ? (
        <>
          {errorNote && <div className="mb-5">{errorNote}</div>}
          {notConnected ? (
            <NotConnected onNavigate={onNavigate} />
          ) : (
            <div className="flex flex-col items-start gap-2.5" aria-label="Suggested questions">
              {chips.map((q) => (
                <SuggestionChip key={q} onClick={() => send(q)} disabled={!profile || waiting}>
                  {q}
                </SuggestionChip>
              ))}
            </div>
          )}
          {footnote && <div className="mt-6">{footnote}</div>}
        </>
      ) : (
        <div className="space-y-6" aria-live="polite" aria-busy={waiting}>
          {loadingThread && <ThreadSkeleton />}
          {messages.error && <OracleError onRetry={() => messages.refetch()}>Couldn&apos;t load this conversation.</OracleError>}
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
            <button type="button" onClick={onNewQuestion} className="press t-label inline-flex h-11 items-center font-semibold text-fg-2 hover:text-fg">
              New question
            </button>
          )}
        </div>
      )}
      <div ref={end} className="h-px" aria-hidden />
    </div>
  );
}

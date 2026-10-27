"use client";

import Link from "next/link";
import { ChevronRight, Info, RotateCcw, Sparkle } from "lucide-react";
import { memo, useState, type ReactNode } from "react";
import { FactChips, sourcesLine } from "@/components/coach/FactChips";
import { Markdown } from "@/components/coach/Markdown";
import { AiChip } from "@/components/ui/ai-chip";
import { Skeleton } from "@/components/ui/misc";
import type { CoachMessageRow, SuggestionStatus } from "@/lib/coach/types";
import type { Profile } from "@/lib/data/profile";
import { relativeDay, today } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { splitContext, splitVerdict } from "./context";
import { Proposal } from "./Proposal";

/* --------------------------------------------------------------- his side */

/** His question, right-aligned on --card-2; the screen it was asked from sits above it as a small line. */
export function AskedLine({ text, pending, id }: { text: string; pending?: boolean; id?: string }) {
  const { about, question } = splitContext(text);
  return (
    <div data-msg-id={id} className={cn("flex scroll-mt-4 flex-col items-end gap-1.5", pending && "opacity-80")}>
      {about && <span className="t-cap max-w-[82%] truncate">About: {about}</span>}
      <p className="t-body max-w-[86%] whitespace-pre-wrap rounded-tile-lg rounded-br-md bg-card-2 px-4 py-3 text-fg [overflow-wrap:anywhere]">{question}</p>
    </div>
  );
}

/* ------------------------------------------------------------- the answer */

/**
 * One answer (docs/DESIGN-V3-SIMPLE.md §4.8): a card with the AI chip and where it came from
 * ("From your weigh-ins and food"), the first sentence in bold, then the body. What it was based
 * on (the server's own facts, never the model's numbers) opens under "Based on". Suggested changes
 * follow as their own AI cards, then follow-up chips.
 */
export const OracleAnswer = memo(function OracleAnswer({
  message,
  profile,
  last,
  fresh,
  onStatus,
  onFollowUp,
  followUpsDisabled,
  onNavigate,
}: {
  message: CoachMessageRow;
  profile: Profile | undefined;
  last: boolean;
  fresh?: boolean;
  onStatus: (conversationId: string, messageId: string, suggestionId: string, status: SuggestionStatus) => void;
  onFollowUp: (q: string) => void;
  followUpsDisabled?: boolean;
  /** Called when a fact link is followed. */
  onNavigate?: () => void;
}) {
  const p = message.payload;
  const { verdict, rest } = splitVerdict(message.content);
  const [based, setBased] = useState(false);
  const facts = p?.facts ?? [];
  const sources = sourcesLine(facts);
  return (
    <article data-msg-id={message.id} className={cn("scroll-mt-4", fresh && "rise")} aria-label="Coach's answer">
      <div className="rounded-card bg-card p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <AiChip label="AI" />
          {sources && <span className="t-label min-w-0">{sources}</span>}
          {p?.mock && <span className="t-cap inline-flex h-6 items-center rounded-pill border border-dashed border-ui-line px-2">Dev mock</span>}
        </div>
        <div data-ai-answer="" data-budget-group="">
          {verdict && <p className="t-section mt-3 text-fg">{verdict}</p>}
          {rest && (
            <div className={cn("text-fg-2", verdict ? "mt-2" : "mt-3")}>
              <Markdown>{rest}</Markdown>
            </div>
          )}
        </div>
        {facts.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setBased((v) => !v)}
              aria-expanded={based}
              className="press t-label -mb-2 mt-2 inline-flex h-11 items-center gap-1 font-semibold hover:text-fg"
            >
              Based on
              <ChevronRight className={cn("size-4 transition-transform duration-(--dur-fast)", based && "rotate-90")} strokeWidth={2.2} aria-hidden />
            </button>
            {based && <FactChips facts={facts} asOf={p?.as_of} onNavigate={onNavigate} />}
          </>
        )}
      </div>
      {p?.suggestions?.map((s) => <Proposal key={s.id} suggestion={s} profile={profile} onStatus={(st) => onStatus(message.conversation_id, message.id, s.id, st)} />)}
      {last && !!p?.follow_ups?.length && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Follow-up questions">
          {p.follow_ups.map((q) => (
            <SuggestionChip key={q} disabled={followUpsDisabled} onClick={() => onFollowUp(q)}>
              {q}
            </SuggestionChip>
          ))}
        </div>
      )}
    </article>
  );
});

/** A suggested question: a --card-2 pill in `t-row` (the mockup's "What should dinner be?"). */
export function SuggestionChip({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="press t-row inline-flex min-h-11 max-w-full items-center rounded-pill bg-card-2 px-4 py-2 text-left hover:bg-card-3 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function DaySeparator({ date }: { date: string }) {
  const label = relativeDay(date, today());
  return (
    <div className="flex items-center gap-3 py-1" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-line" />
      <span className="t-cap">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function Thinking() {
  return (
    <div className="flex items-center gap-2.5" role="status" aria-live="polite">
      <Sparkle className="size-4 text-ai" strokeWidth={2.2} aria-hidden />
      <span className="t-label">Reading your logs…</span>
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading the conversation">
      <div className="flex justify-end">
        <Skeleton className="h-12 w-[62%] rounded-tile-lg" />
      </div>
      <Skeleton className="h-44 w-full rounded-card" />
    </div>
  );
}

/** A failed question or load: one plain line, and Try again when retrying can help. */
export function OracleError({ children, onRetry, className }: { children: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("t-label flex items-center gap-2 rounded-tile-lg bg-card py-1 pl-4 pr-1 text-fg", className)}>
      <span className="min-w-0 flex-1 py-2.5">{children}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-pill px-3 font-semibold text-fg">
          <RotateCcw className="size-4" strokeWidth={2} aria-hidden />
          Try again
        </button>
      )}
    </div>
  );
}

export function Footnote({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className="t-cap flex items-start gap-2.5">
      <Info className="mt-0.5 size-4 shrink-0 text-fg-3" strokeWidth={2} aria-hidden />
      <p className="flex-1">Coaching, not medical advice. Stop and get checked if something hurts.</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="press -my-3 -mr-1 inline-flex h-11 shrink-0 items-center px-2 font-semibold text-fg">
          Got it
        </button>
      )}
    </div>
  );
}

const STILL_WORKS = [
  { href: "/nutrition", label: "Food, calories and protein" },
  { href: "/training", label: "Workouts and progression" },
  { href: "/progress", label: "Weight and bests" },
  { href: "/recovery", label: "Check-ins and habits" },
];

/** No AI key on the server: one plain line, with what still works when there is room. */
export function NotConnected({ compact, className, onNavigate }: { compact?: boolean; className?: string; onNavigate?: () => void }) {
  if (compact)
    return (
      <p role="status" className={cn("t-label flex items-start gap-2.5 rounded-tile-lg bg-card px-4 py-3", className)}>
        <Info className="mt-0.5 size-4 shrink-0 text-fg-3" strokeWidth={2} aria-hidden />
        <span>Coach isn&apos;t set up yet. It needs an AI key on the server. Past answers stay readable.</span>
      </p>
    );
  return (
    <section role="status" className={cn("rounded-card bg-card p-5", className)}>
      <p className="t-row">Coach isn&apos;t set up yet.</p>
      <p className="t-label mt-1">It needs an AI key on the server. These still work:</p>
      <ul className="mt-2">
        {STILL_WORKS.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} onClick={onNavigate} className="press-soft t-row flex min-h-11 items-center gap-3">
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-5 text-fg-3" strokeWidth={1.9} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

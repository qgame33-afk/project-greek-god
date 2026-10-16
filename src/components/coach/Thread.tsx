"use client";

import Link from "next/link";
import {
  Beef,
  CalendarDays,
  ChartLine,
  ChartNoAxesColumn,
  ChevronRight,
  Dumbbell,
  Flame,
  HeartPulse,
  Info,
  Scale,
  TrendingUp,
  Utensils,
  UtensilsCrossed,
  Volleyball,
  type LucideIcon,
} from "lucide-react";
import { memo } from "react";
import type { CoachMessageRow, SuggestionStatus } from "@/lib/coach/types";
import type { Profile } from "@/lib/data/profile";
import { monthName, relativeDay, today } from "@/lib/dates";
import { round } from "@/lib/units";
import { lbToKg } from "@/lib/units";
import { cn } from "@/lib/cn";
import { FactChips } from "./FactChips";
import { Markdown } from "./Markdown";
import { SuggestionCard } from "./SuggestionCard";
import { CoachAvatar, TempleGlyph } from "./TempleMark";

/* ------------------------------------------------------------- messages */

export function UserBubble({ text, pending, id }: { text: string; pending?: boolean; id?: string }) {
  return (
    <div data-msg-id={id} className="flex scroll-mt-[calc(var(--safe-top)+68px)] justify-end lg:scroll-mt-4">
      <p
        className={cn(
          "max-w-[82%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] bg-s4 px-4 py-2.5 text-[15px] leading-[1.45] text-fg [overflow-wrap:anywhere]",
          pending && "opacity-80",
        )}
      >
        {text}
      </p>
    </div>
  );
}

export function DevMockBadge() {
  return (
    <span className="inline-flex h-5 items-center rounded-[6px] border border-dashed border-warning/60 px-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-warning" title="Local fixture built from your real records. Not AI.">
      Dev mock
    </span>
  );
}

export const AssistantMessage = memo(function AssistantMessage({
  message,
  profile,
  last,
  fresh,
  onStatus,
  onFollowUp,
  followUpsDisabled,
}: {
  message: CoachMessageRow;
  profile: Profile | undefined;
  last: boolean;
  /** just arrived in this session — rises in once */
  fresh?: boolean;
  onStatus: (messageId: string, suggestionId: string, status: SuggestionStatus) => void;
  onFollowUp: (q: string) => void;
  followUpsDisabled?: boolean;
}) {
  const p = message.payload;
  return (
    <article data-msg-id={message.id} className={cn("flex scroll-mt-[calc(var(--safe-top)+72px)] gap-3 lg:scroll-mt-4", fresh && "rise")} aria-label="Coach answer">
      <CoachAvatar className="mt-0.5" />
      <div className="min-w-0 max-w-[640px] flex-1">
        {p?.mock && (
          <div className="mb-2">
            <DevMockBadge />
          </div>
        )}
        <Markdown>{message.content}</Markdown>
        {p && <FactChips facts={p.facts ?? []} asOf={p.as_of} />}
        {p?.suggestions?.map((s) => <SuggestionCard key={s.id} suggestion={s} profile={profile} onStatus={(st) => onStatus(message.id, s.id, st)} />)}
        {last && !!p?.follow_ups?.length && (
          <div className="mt-3 flex flex-wrap gap-x-2" aria-label="Follow-up questions">
            {p.follow_ups.map((q) => (
              <button key={q} type="button" disabled={followUpsDisabled} onClick={() => onFollowUp(q)} className="group flex h-11 max-w-full items-center disabled:opacity-50">
                <span className="press inline-flex h-9 max-w-full items-center rounded-full border border-line bg-s2 px-3.5 text-[13px] font-semibold text-fg-2 transition-colors group-hover:border-line-strong group-hover:text-fg">
                  <span className="truncate">{q}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
});

/** Centered day label between messages from different days. */
export function DaySeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator" aria-label={relativeDay(date, today())}>
      <span className="h-px flex-1 bg-line-hair" />
      <span className="eyebrow">{relativeDay(date, today())}</span>
      <span className="h-px flex-1 bg-line-hair" />
    </div>
  );
}

export function Thinking() {
  return (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <CoachAvatar thinking />
      <span className="text-[13px] font-medium text-fg-3">Reading your records…</span>
    </div>
  );
}

export function Footnote({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[12px] px-1 text-[12.5px] leading-relaxed text-fg-3">
      <Info className="mt-[2px] size-3.5 shrink-0" aria-hidden />
      <p className="flex-1">Coaching, not medical advice. Stop and get checked if something hurts.</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="-my-3 -mr-1 inline-flex h-11 shrink-0 items-center px-2 font-bold text-fg-2 hover:text-fg">
          Got it
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------- empty state */

interface Prompt {
  q: string;
  icon: LucideIcon;
}

export function examplePrompts(profile: Profile | undefined): Prompt[] {
  const goalLb = Number(profile?.goal_weight_lb ?? 183);
  const goal = profile?.weight_unit === "kg" ? `${round(lbToKg(goalLb), 1)} kg` : `${round(goalLb, 1)} pounds`;
  const since = profile?.start_date ? monthName(profile.start_date) : "I started";
  return [
    { q: "What should I train today?", icon: Dumbbell },
    { q: "How much protein do I have left today?", icon: Beef },
    { q: `Am I eating enough to reach ${goal}?`, icon: Utensils },
    { q: "Should I increase calories?", icon: Flame },
    { q: "Why hasn't my bench press improved?", icon: ChartLine },
    { q: "Am I doing enough volume for my biceps?", icon: ChartNoAxesColumn },
    { q: "Should I reduce leg training because I played volleyball yesterday?", icon: Volleyball },
    { q: `How much weight have I gained since ${since}?`, icon: Scale },
  ];
}

export const WEEKLY_SUMMARY_PROMPT = "Give me my weekly summary: training, nutrition, bodyweight and recovery for the last 7 days, and what to focus on next week.";

export function EmptyThread({
  profile,
  onAsk,
  disabled,
  notConnected,
  footnote,
}: {
  profile: Profile | undefined;
  onAsk: (q: string) => void;
  disabled?: boolean;
  notConnected?: boolean;
  footnote?: React.ReactNode;
}) {
  const prompts = examplePrompts(profile);
  return (
    <div className="rise">
      <div className="flex items-start gap-4">
        <div className="shrink-0 rounded-[18px] bg-s1 p-1.5 ring-1 ring-line">
          <TempleGlyph size={52} />
        </div>
        <div className="min-w-0 pt-1">
          <p className="text-[17px] font-bold leading-snug text-fg">Ask about your training, food and recovery.</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-fg-2">Answers come from your own logs. Anything about the future is labelled as a projection.</p>
        </div>
      </div>

      {notConnected ? (
        <NotConnected className="mt-6" />
      ) : (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAsk(WEEKLY_SUMMARY_PROMPT)}
            className="card-accent press-soft group mt-6 flex w-full items-center gap-3.5 p-4 text-left transition-colors hover:border-line-strong disabled:opacity-50"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-[12px] border border-line-gold bg-gold-tint text-gold-300">
              <CalendarDays className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="eyebrow block text-gold-300">Weekly summary</span>
              <span className="mt-1 block text-[15px] font-semibold leading-snug text-fg">Training, food, weight and recovery — last 7 days</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </button>

          <p className="eyebrow mb-2.5 mt-6 px-0.5">Try asking</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {prompts.map(({ q, icon: Icon }) => (
              <li key={q}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAsk(q)}
                  className="card-instrument press-soft group flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-s2 disabled:opacity-50"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-s3 text-gold-300">
                    <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug text-fg">{q}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {footnote && <div className="mt-5">{footnote}</div>}
    </div>
  );
}

const STILL_WORKS = [
  { href: "/nutrition", label: "Food log, calories and protein left", icon: UtensilsCrossed },
  { href: "/training", label: "Workouts, progression and PRs", icon: Dumbbell },
  { href: "/progress?tab=weight", label: "Bodyweight trend and roadmap", icon: TrendingUp },
  { href: "/recovery", label: "Recovery check-ins and habits", icon: HeartPulse },
];

/** Shown when the server has no AI key. Honest, and points at everything that still works. */
export function NotConnected({ className, compact }: { className?: string; compact?: boolean }) {
  if (compact)
    return (
      <div className={cn("flex items-start gap-2.5 rounded-[12px] border border-line bg-s1 px-3.5 py-3 text-[13px] leading-relaxed text-fg-2", className)} role="status">
        <Info className="mt-[2px] size-4 shrink-0 text-fg-3" aria-hidden />
        <p>
          <span className="font-semibold text-fg">Coach isn&apos;t connected yet.</span> It needs an AI key on the server. Your past conversations stay readable.
        </p>
      </div>
    );
  return (
    <section className={cn("card-inset px-4 py-4", className)} role="status">
      <p className="text-[15px] font-bold text-fg">Coach isn&apos;t connected yet.</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-fg-2">It needs an AI key on the server. Nothing here pretends to answer without one.</p>
      <p className="eyebrow mb-1 mt-4">Still works without AI</p>
      <ul className="-mx-1">
        {STILL_WORKS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="press-soft flex min-h-11 items-center gap-3 rounded-[10px] px-1 text-[14px] font-semibold text-fg hover:bg-white/[.03]">
              <Icon className="size-[18px] text-fg-3" aria-hidden />
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 text-fg-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

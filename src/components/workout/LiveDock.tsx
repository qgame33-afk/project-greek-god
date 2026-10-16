"use client";

// Live Session Dock: a 52px bar the AppShell shows while a workout is active and you are on
// another screen. "PUSH A · 32:14 · 9/19 sets", "REST 1:12" while resting. Tap to resume.

import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { ChevronRight, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { useActiveSession } from "@/lib/data/training";
import { formatDuration, shortDate } from "@/lib/dates";
import { parsePrefs } from "@/lib/workout/prefs";
import { endedAgoSec, formatClock, remainingSec, type RestState } from "@/lib/workout/rest";
import { useLiveSession } from "./data";
import { RestWatcher, useClockSec } from "./rest";
import { useRest } from "./stores";
import { WorkoutStyles } from "./styles";

export function LiveDock() {
  const pathname = usePathname();
  const active = useActiveSession();
  const s = active.data;
  const hidden = !s || pathname.startsWith("/workout/") || pathname.startsWith("/onboarding") || pathname.startsWith("/sign-in");
  if (hidden) return null;
  return <LiveDockBar sessionId={s.id} name={s.name} startedAt={s.started_at} localDate={s.local_date} />;
}

/** The bar itself, for a shell that decides visibility on its own (e.g. a sidebar card). */
export function LiveDockBar({ sessionId, name, startedAt, localDate }: { sessionId: string; name: string; startedAt: string; localDate: string }) {
  const router = useRouter();
  const today = useToday();
  const { profile } = useProfile();
  const prefs = parsePrefs(profile?.prefs);
  const live = useLiveSession(sessionId);
  const rest = useRest(sessionId);
  const counts = useMemo(() => {
    const sets = live.data?.sets ?? [];
    const working = sets.filter((x) => x.kind !== "warmup");
    return { done: working.filter((x) => x.completed).length, total: working.length, ready: !!live.data };
  }, [live.data]);
  const stale = localDate !== today;

  return (
    <>
      <WorkoutStyles />
      <RestWatcher sessionId={sessionId} chimeOn={prefs.restChime} hapticsOn={prefs.haptics} />
      <button
        type="button"
        onClick={() => router.push(`/workout/${sessionId}`)}
        aria-label={`Resume ${name}`}
        data-live-dock
        className={cn(
          "wk-up press-soft fixed z-[35] flex h-[52px] items-center gap-2.5 overflow-hidden rounded-[16px] border border-line bg-s2 pl-4 pr-2.5 text-left shadow-[var(--e2)]",
          "left-3 right-[80px] bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+14px)]",
          "md:left-auto md:right-6 md:bottom-6 md:w-[360px]",
          "lg:left-4 lg:right-auto lg:bottom-[104px] lg:w-[216px]",
        )}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-gold-400" />
        <span className="min-w-0 flex-1 truncate">
          {rest ? (
            <RestLine rest={rest} />
          ) : (
            <span className="num flex items-baseline gap-1.5 whitespace-nowrap text-[15px] font-semibold">
              <span className="font-num text-[15px] font-bold uppercase tracking-[0.06em] text-fg">{name}</span>
              <span className="text-fg-3">·</span>
              {stale ? <span className="text-fg-2">{shortDate(localDate)}</span> : <DockElapsed startedAt={startedAt} />}
              {counts.ready && (
                <>
                  <span className="text-fg-3 lg:hidden">·</span>
                  <span className="text-fg-2 lg:hidden">
                    {counts.done}/{counts.total} sets
                  </span>
                </>
              )}
            </span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
      </button>
    </>
  );
}

function DockElapsed({ startedAt }: { startedAt: string }) {
  const now = useClockSec();
  return <span className="text-gold-300">{formatDuration(Math.max(0, now - Math.floor(Date.parse(startedAt) / 1000)))}</span>;
}

function RestLine({ rest }: { rest: RestState }) {
  const now = useClockSec();
  const rem = remainingSec(rest, now);
  const next = rest.next ? rest.next.set.toUpperCase() : "NEXT";
  if (rem === 0) {
    const ago = endedAgoSec(rest, now);
    return (
      <span className="num flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold uppercase tracking-[0.06em] text-gold-200">
        <Timer className="size-4" aria-hidden /> Rest done · {next}
        {ago > 3 && <span className="normal-case tracking-normal text-fg-3">{formatClock(ago)} ago</span>}
      </span>
    );
  }
  return (
    <span className="num flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold uppercase tracking-[0.06em]">
      <Timer className="size-4 text-fg-2" aria-hidden />
      <span className="text-fg-2">{rest.pausedRemaining != null ? "Paused" : "Rest"}</span>
      <span className={cn("text-[17px]", rem <= 10 ? "text-gold-200" : "text-fg")}>{formatClock(rem)}</span>
      {rest.next && (
        <span className="truncate text-fg-3">
          · {rest.next.set}
          {rest.next.load ? ` · ${rest.next.load}` : ""}
        </span>
      )}
    </span>
  );
}

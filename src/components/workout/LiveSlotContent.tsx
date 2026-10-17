"use client";

// SEED (Foundation → Gym at the F-B hand-off). What the shell's live slot shows while a session is
// active on another screen (docs/DESIGN-V2.md §2.1): "PUSH A · rest 1:12 · Set 3 · 190 × 5", the
// rest seconds ticking (tabular), the last 10 s brightened. No log button (prevents misfires): the
// whole slot returns to Gym Mode. It also keeps the rest watcher (end chime, announcements) mounted
// off the workout screen, as the old LiveDock did. The Gym stream restyles and extends it
// ("Rest ended 0:42 ago", sets left).

import { useMemo } from "react";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { formatDuration, shortDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { parsePrefs } from "@/lib/workout/prefs";
import { formatClock, remainingSec, type RestState } from "@/lib/workout/rest";
import { isStaleSession, lastCompletedAt } from "@/lib/workout/summary";
import { useLiveSession } from "./data";
import { RestWatcher, useClockSec } from "./rest";
import { useNowMinute, useRest } from "./stores";

export interface LiveSlotSession {
  id: string;
  name: string;
  started_at: string;
  local_date: string;
}

/** The slot's accessible name ("Return to Push A"); the visible line is the content below. */
export function liveSlotLabel(s: LiveSlotSession) {
  return `Return to ${s.name}`;
}

export function LiveSlotContent({ session, compact }: { session: LiveSlotSession; compact?: boolean }) {
  const today = useToday();
  const { profile } = useProfile();
  const prefs = parsePrefs(profile?.prefs);
  const live = useLiveSession(session.id);
  const rest = useRest(session.id);
  const counts = useMemo(() => {
    const sets = live.data?.sets ?? [];
    const working = sets.filter((x) => x.kind !== "warmup");
    return { done: working.filter((x) => x.completed).length, total: working.length, ready: !!live.data };
  }, [live.data]);
  const minute = useNowMinute();
  const stale = isStaleSession(session.local_date, today, session.started_at, lastCompletedAt(live.data?.sets ?? []), minute * 60000);

  return (
    <>
      <RestWatcher sessionId={session.id} chimeOn={prefs.restChime} hapticsOn={false} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden whitespace-nowrap">
        <span className="t-eyebrow shrink-0 text-ivory">{session.name}</span>
        {rest ? (
          <RestLine rest={rest} compact={compact} />
        ) : (
          <span className="t-callout tnum min-w-0 truncate text-stone">
            {stale ? shortDate(session.local_date) : <Elapsed startedAt={session.started_at} />}
            {counts.ready && counts.total > 0 && !compact && (
              <>
                {" · "}
                {counts.done}/{counts.total} sets
              </>
            )}
          </span>
        )}
      </span>
    </>
  );
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const now = useClockSec();
  return <span className="text-ivory">{formatDuration(Math.max(0, now - Math.floor(Date.parse(startedAt) / 1000)))}</span>;
}

function RestLine({ rest, compact }: { rest: RestState; compact?: boolean }) {
  const now = useClockSec();
  const rem = remainingSec(rest, now);
  if (rem === 0) return <span className="t-callout min-w-0 truncate text-leaf-200">Rest done{rest.next ? ` · ${rest.next.set}` : ""}</span>;
  return (
    <span className="t-callout tnum min-w-0 truncate text-stone">
      {rest.pausedRemaining != null ? "paused " : "rest "}
      <span className={cn("t-num-s", rem <= 10 ? "text-leaf-200" : "text-ivory")}>{formatClock(rem)}</span>
      {rest.next && !compact && (
        <>
          {" · "}
          {rest.next.set}
          {rest.next.load ? ` · ${rest.next.load}` : ""}
        </>
      )}
    </span>
  );
}

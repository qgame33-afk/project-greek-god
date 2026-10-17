"use client";

// What the shell's live slot shows while a session is active on another screen
// (docs/DESIGN-V2.md §2.1): the rest digits ticking (tabular, leaf in the last ten seconds) over
// "PUSH A · rest" and the next set, "Rest ended 0:42 ago" once it is over, else the elapsed
// time and sets logged. No log button (prevents misfires): the whole slot returns to Gym Mode.
// It keeps the rest watcher (end chime, announcements) mounted off the workout screen, and it
// runs Gym Mode auto (§3.2.8): opening the installed app, or coming back to it, with a session
// active lands in Gym Mode.

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { formatDuration } from "@/lib/dates";
import { parseAppPrefs } from "@/lib/prefs";
import { gymDate } from "@/lib/workout/gym";
import { endedAgoSec, formatClock, remainingSec, type RestState } from "@/lib/workout/rest";
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
  const prefs = parseAppPrefs(profile?.prefs);
  const live = useLiveSession(session.id);
  const rest = useRest(session.id);
  const counts = useMemo(() => {
    const sets = live.data?.sets ?? [];
    const working = sets.filter((x) => x.kind !== "warmup");
    return { done: working.filter((x) => x.completed).length, total: working.length, ready: !!live.data };
  }, [live.data]);
  const minute = useNowMinute();
  const stale = isStaleSession(session.local_date, today, session.started_at, lastCompletedAt(live.data?.sets ?? []), minute * 60000);
  useGymAuto(session.id, !!profile && prefs.gymAuto && !stale);

  const name = <span className="t-eyebrow truncate !text-ivory">{session.name}</span>;
  return (
    <>
      {/* keep: a rest that ends while he is on another screen stays as "Rest ended 0:42 ago" */}
      <RestWatcher sessionId={session.id} chimeOn={prefs.restChime} hapticsOn={false} keep />
      {rest ? (
        <RestBody rest={rest} name={session.name} compact={compact} />
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="t-num-m shrink-0 text-ivory">{stale ? "—" : <Elapsed startedAt={session.started_at} />}</span>
          <span className="flex min-w-0 flex-col leading-tight">
            {name}
            <span className="t-meta tnum truncate text-stone">
              {stale ? `Open since ${gymDate(session.local_date)}` : counts.ready && counts.total > 0 ? `${counts.done} / ${counts.total} sets` : "In progress"}
            </span>
          </span>
        </span>
      )}
    </>
  );
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const now = useClockSec();
  return <>{formatDuration(Math.max(0, now - Math.floor(Date.parse(startedAt) / 1000)))}</>;
}

function RestBody({ rest, name, compact }: { rest: RestState; name: string; compact?: boolean }) {
  const now = useClockSec();
  const rem = remainingSec(rest, now);
  const paused = rest.pausedRemaining != null;
  const ended = rem === 0 && !paused;
  const ago = endedAgoSec(rest, now);
  const switching = !!rest.next && rest.next.exercise !== rest.exercise;
  const next = rest.next ? `${switching ? `${rest.next.exercise} · ` : ""}${rest.next.set}${rest.next.load ? ` · ${rest.next.load}` : ""}` : "Last set done";
  const word = ended ? (ago > 3 ? "rest ended" : "rest over") : paused ? "paused" : "rest";
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3" role="timer" aria-label={ended ? `Rest ended ${formatClock(ago)} ago` : `${formatClock(rem)} of rest left`}>
      <span aria-hidden className={cn("t-num-m shrink-0", ended ? (ago > 3 ? "text-stone" : "text-leaf-200") : rem <= 10 && !paused ? "text-leaf-200" : paused ? "text-stone" : "text-ivory")}>
        {ended ? (ago > 3 ? formatClock(ago) : "GO") : formatClock(rem)}
      </span>
      <span aria-hidden className="flex min-w-0 flex-col leading-tight">
        <span className="t-eyebrow truncate">
          <span className="!text-ivory">{name}</span> · {word}
          {ended && ago > 3 ? " · ago" : ""}
        </span>
        {!compact && <span className="t-meta tnum truncate text-stone">{next}</span>}
      </span>
    </span>
  );
}

/* --------------------------------------------------------- Gym Mode auto */

/** Set once per page load: the app-open redirect is considered only on the first mount. */
let launchChecked = false;
/** Away at least this long before coming back lands in Gym Mode (a glance at a text doesn't). */
const AWAY_MS = 30_000;

function standalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function busyWithInput() {
  const a = document.activeElement;
  return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement || !!document.querySelector('[role="dialog"][data-state="open"]');
}

/**
 * Gym Mode auto (Settings, default on; prefs.gymAuto): when the installed app opens on Now, or
 * comes back to the foreground after a while, with a session active, it goes to Gym Mode. Only
 * in the home-screen app (a browser tab is left where it is), never into a stale session, and
 * never while a field or a sheet has his attention.
 */
function useGymAuto(sessionId: string, enabled: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!enabled || !standalone()) return;
    const go = () => router.push(`/workout/${sessionId}`);
    if (!launchChecked) {
      launchChecked = true;
      if (performance.now() < 6000 && window.location.pathname === "/" && !busyWithInput()) go();
    }
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS && !busyWithInput()) go();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled, sessionId, router, pathname]);
}

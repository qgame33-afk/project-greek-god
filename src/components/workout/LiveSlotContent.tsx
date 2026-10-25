"use client";

// What the workout bar says (docs/DESIGN-V3-SIMPLE.md §3.3) while a workout is live on another
// screen: the workout's short name, then "Rest 1:12" (ticking) and "Set 4 of 19". When space runs
// out it drops the set first, then the rest, then shortens the name. No log button: the whole bar
// returns to the workout ("Back to …" for VoiceOver). It keeps the rest watcher (the end chime)
// mounted off the workout screen, and it runs "Open the workout when the app opens" (gymAuto).

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { parseAppPrefs } from "@/lib/prefs";
import { templateLabels } from "@/lib/training/programs";
import { gymDate } from "@/lib/workout/gym";
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

/** The bar's VoiceOver name: "Back to Shoulders, Biceps & Triceps B". */
export function liveSlotLabel(s: LiveSlotSession) {
  return `Back to ${s.name}`;
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

  const short = templateLabels({ key: live.data?.session.template_key ?? "", name: session.name }).short;
  const setText = stale ? `Open since ${gymDate(session.local_date)}` : counts.ready && counts.total > 0 ? (counts.done >= counts.total ? "All sets logged" : `Set ${counts.done + 1} of ${counts.total}`) : null;
  return (
    <>
      {/* keep: a rest that ends while he is on another screen reads "Rest over" until the next set */}
      <RestWatcher sessionId={session.id} chimeOn={prefs.restChime} hapticsOn={false} keep />
      <BarLine name={short} rest={stale ? null : rest} setText={setText} compact={compact} />
    </>
  );
}

function RestText({ rest }: { rest: RestState }) {
  const now = useClockSec();
  const rem = remainingSec(rest, now);
  return <>{rem > 0 ? `Rest ${formatClock(rem)}` : "Rest over"}</>;
}

/** Name, rest, set — measured, so the set drops first, then the rest, then the name shortens. */
function BarLine({ name, rest, setText, compact }: { name: string; rest: RestState | null; setText: string | null; compact?: boolean }) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const rowRef = useRef<HTMLSpanElement>(null);
  const [level, setLevel] = useState(0);
  const shape = `${name}|${!!rest}|${setText ?? ""}`;
  const [seen, setSeen] = useState(shape);
  if (seen !== shape) {
    setSeen(shape);
    setLevel(0);
  }
  useLayoutEffect(() => {
    const el = nameRef.current;
    if (el && level < 2 && el.scrollWidth > el.clientWidth + 1) setLevel((l) => Math.min(2, l + 1));
  }, [level, shape]);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let w = row.clientWidth;
    const ro = new ResizeObserver(() => {
      if (row.clientWidth > w + 1) setLevel(0);
      w = row.clientWidth;
    });
    ro.observe(row);
    return () => ro.disconnect();
  }, []);
  const showSet = !!setText && level < 1;
  const showRest = !!rest && level < 2;
  const tail = (
    <>
      {showRest && rest && <RestText rest={rest} />}
      {showRest && showSet && " · "}
      {showSet && setText}
    </>
  );
  if (compact)
    return (
      <span ref={rowRef} className="flex min-w-0 flex-1 flex-col leading-tight">
        <span ref={nameRef} className="t-row min-w-0 truncate" data-budget-name="">
          {name}
        </span>
        {(showRest || showSet) && <span className="t-cap truncate tabular-nums">{tail}</span>}
      </span>
    );
  return (
    <span ref={rowRef} className="flex min-w-0 flex-1 items-center gap-2">
      <span ref={nameRef} className="t-row min-w-0 truncate" data-budget-name="">
        {name}
      </span>
      {(showRest || showSet) && <span className="t-label shrink-0 whitespace-nowrap tabular-nums">{tail}</span>}
    </span>
  );
}

/* --------------------------------------------------------- the workout opens when the app opens */

/** Set once per page load: the app-open redirect is considered only on the first mount. */
let launchChecked = false;
/** Away at least this long before coming back opens the workout (a glance at a text doesn't). */
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
 * "Open the workout when the app opens" (Settings, default on; prefs.gymAuto): when the installed app opens on Today, or
 * comes back to the foreground after a while, with a workout live, it opens the workout. Only
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

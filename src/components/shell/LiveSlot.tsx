"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Dumbbell } from "lucide-react";
import { LiveSlotContent, liveSlotLabel } from "@/components/workout/LiveSlotContent";
import { cn } from "@/lib/cn";
import { useActiveSession } from "@/lib/data/training";

/**
 * The workout bar (docs/DESIGN-V3-SIMPLE.md §3.3): while a workout is live and the route is not the
 * workout, a 56 px --card-3 bar (radius 18, 12 px side insets) sits 8 px above the tab bar: a 44 px
 * tile with `Dumbbell`, then WORKOUT's <LiveSlotContent> (the name, then "Rest 1:12" or "Set 4 of
 * 19"; it truncates the set first, then the rest, then the name), and a chevron. No log button; a
 * tap returns to the workout. It steps aside while Today's Up next "Return" card
 * ([data-today-resume]) is on screen. `variant="rail"` is the desktop version at the rail's foot.
 *
 * The bar carries `data-live-slot` (the shell adds 64 px to --chrome-clear) and the old
 * `data-live-dock`. The shell mounts exactly one variant at a time (each keeps the rest watcher).
 */
export function LiveSlot({ variant = "float", hidden }: { variant?: "float" | "rail"; hidden?: boolean }) {
  const router = useRouter();
  const s = useActiveSession().data;
  const resumeOnScreen = useTodayResumeVisible(variant === "float" && !!s && !hidden);
  if (!s || hidden) return null;
  const session = { id: s.id, name: s.name, started_at: s.started_at, local_date: s.local_date };
  const open = () => router.push(`/workout/${s.id}`);
  if (variant === "rail") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={liveSlotLabel(session)}
        className="press-soft flex min-h-14 w-full items-center gap-3 rounded-field bg-card-3 px-2.5 text-left hover:bg-card-2"
      >
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-tile bg-card-2 text-fg">
          <Dumbbell className="size-5" strokeWidth={1.9} />
        </span>
        <span className="flex min-w-0 flex-1">
          <LiveSlotContent session={session} compact />
        </span>
        <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
      </button>
    );
  }
  // While Today's own Return control ([data-today-resume]) is on screen the slot steps aside (the
  // content stays mounted, hidden, so the rest watcher and its chime keep running).
  if (resumeOnScreen)
    return (
      <div hidden>
        <LiveSlotContent session={session} />
      </div>
    );
  return (
    <button
      type="button"
      onClick={open}
      aria-label={liveSlotLabel(session)}
      data-live-slot=""
      data-live-dock=""
      className={cn("press-soft fixed inset-x-3 z-(--z-chrome) flex h-14 items-center gap-3 rounded-field bg-card-3 pl-1.5 pr-2.5 text-left lg:hidden")}
      style={{ bottom: "calc(var(--safe-bottom) + var(--tab-bar-h) + 8px)" }}
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-tile bg-card-2 text-fg">
        <Dumbbell className="size-5" strokeWidth={1.9} />
      </span>
      <span className="flex min-w-0 flex-1 items-center">
        <LiveSlotContent session={session} />
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
    </button>
  );
}

/** True while Now's Return/Resume control ([data-today-resume]) is in the viewport. */
function useTodayResumeVisible(enabled: boolean) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let io: IntersectionObserver | null = null;
    let observed: Element | null = null;
    const attach = () => {
      const el = document.querySelector("[data-today-resume]");
      if (el === observed) return;
      io?.disconnect();
      observed = el;
      if (!el) {
        setVisible(false);
        return;
      }
      io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.01 });
      io.observe(el);
    };
    attach();
    // The control mounts after its queries resolve; re-attach when it appears or is replaced.
    const mo = new MutationObserver(attach);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io?.disconnect();
      setVisible(false);
    };
  }, [enabled]);
  return enabled && visible;
}

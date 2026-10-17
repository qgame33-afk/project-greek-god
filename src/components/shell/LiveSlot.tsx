"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { LiveSlotContent, liveSlotLabel } from "@/components/workout/LiveSlotContent";
import { cn } from "@/lib/cn";
import { useActiveSession } from "@/lib/data/training";

/**
 * The live slot (docs/DESIGN-V2.md §2.1): while a session is active and you are on another screen,
 * a 52 px glass pill sits above the capsule (the bottom edge never stacks more than capsule + slot).
 * Its content is the Gym stream's <LiveSlotContent>; a tap returns to Gym Mode. No log button.
 * `variant="rail"` is the desktop version: a card at the bottom of the rail.
 *
 * The floating slot carries `data-live-slot` (the shell adds its height to --chrome-clear) and the
 * old `data-live-dock` (screens that lift their own bottom bars above it still find it). The shell
 * mounts exactly one variant at a time (each one keeps the rest watcher and its chime alive).
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
        className="press-soft flex min-h-14 w-full items-center gap-2 rounded-btn bg-m2 px-3 text-left shadow-[inset_0_0_0_1px_var(--leaf-line)] hover:bg-m3"
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-leaf-300" />
        <span className="hidden min-w-0 flex-1 lg:flex">
          <LiveSlotContent session={session} compact />
        </span>
        <ChevronRight className="hidden size-4 shrink-0 text-ash lg:block" strokeWidth={1.6} aria-hidden />
      </button>
    );
  }
  // While Now's own Return control ([data-today-resume]) is on screen the slot steps aside (the
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
      className={cn(
        "glass press-soft fixed left-[14px] right-[calc(14px+56px+10px)] z-(--z-chrome) flex h-(--slot-h) items-center gap-2.5 rounded-capsule pl-4 pr-3 text-left md:hidden",
      )}
      style={{ bottom: "calc(var(--safe-bottom) + var(--capsule-gap) + var(--capsule-h) + 8px)" }}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-leaf-300 shadow-[0_0_0_3px_var(--leaf-tint)]" />
      <LiveSlotContent session={session} />
      <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
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

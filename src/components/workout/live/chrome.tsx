"use client";

import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { Bar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { useNowMinute } from "../stores";

/**
 * The workout's top bar (docs/DESIGN-V3-SIMPLE.md §4.2.2): a 56 px row with ⌄ (minimise), the
 * workout's short name over "3 of 19 sets · 14 min" (one button that opens the Lifts sheet; it
 * speaks the full name), and a Finish pill. Under it a 4 px bar: sets logged / sets planned.
 * Opaque --bg, never blurred.
 */
export const TopBar = forwardRef<
  HTMLElement,
  {
    short: string;
    fullName: string;
    done: number;
    total: number;
    startedAt: string;
    /** Shown instead of the minutes (an edit, or a workout from another day). */
    dateLabel: string | null;
    finishLabel: string;
    minimizeLabel: string;
    minimizeIcon: "down" | "close";
    onMinimize: () => void;
    onFinish: () => void;
    onLifts: () => void;
    children?: ReactNode;
  }
>(function TopBar({ short, fullName, done, total, startedAt, dateLabel, finishLabel, minimizeLabel, minimizeIcon, onMinimize, onFinish, onLifts, children }, ref) {
  const minute = useNowMinute();
  const mins = minute ? Math.max(0, Math.floor((minute * 60000 - Date.parse(startedAt)) / 60000)) : 0;
  const second = dateLabel ?? `${mins} min`;
  return (
    <header ref={ref} className="sticky top-0 z-(--z-sticky) bg-bg" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="mx-auto max-w-col px-4">
        <div className="flex min-h-14 items-center gap-2">
          <button type="button" onClick={onMinimize} aria-label={minimizeLabel} className="press grid size-11 shrink-0 place-items-center rounded-full bg-control text-fg">
            {minimizeIcon === "down" ? <ChevronDown className="size-5" strokeWidth={2.2} aria-hidden /> : <X className="size-5" strokeWidth={2.2} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={onLifts}
            aria-label={`${fullName}, ${done} of ${total} sets, ${dateLabel ?? `${mins} ${mins === 1 ? "minute" : "minutes"}`}. Shows all lifts`}
            className="press-soft flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-field px-1 text-center"
          >
            <span className="t-label block w-full truncate font-semibold leading-tight text-fg" data-budget-name="">
              {short}
            </span>
            <span className="t-cap block w-full truncate tabular-nums">
              {done} of {total} sets · {second}
            </span>
          </button>
          <button type="button" onClick={onFinish} className="press t-button h-11 shrink-0 rounded-pill bg-control px-[18px] text-fg">
            {finishLabel}
          </button>
        </div>
        <Bar value={total ? done / total : 0} thin className="mt-1.5" label={`${done} of ${total} sets logged`} />
      </div>
      {children}
    </header>
  );
});

/** "Offline · sets sync when you're back" (§4.2.13): a 36 px strip under the top bar. */
export function OfflineStrip({ pending }: { pending: number }) {
  return (
    <p role="status" className="t-label mx-auto mt-2 flex min-h-9 max-w-col items-center px-4 text-fg">
      <span className="flex min-h-9 w-full items-center rounded-field bg-card-3 px-3.5">
        Offline · sets sync when you&apos;re back{pending > 0 ? ` · ${pending} waiting` : ""}
      </span>
    </p>
  );
}

/**
 * The bottom dock (§4.2.3): fixed to the bottom with 16 px gutters and safe-area padding, a short
 * fade above it so the top block scrolls under softly (`data-dock-fade`, the one gradient the
 * gates allow). `data-dock` is what G-3 measures (56 px controls, the 64 px gold button) and G-9
 * measures to. Its height is written to --wk-dock-h so the page can pad above it.
 */
export const Dock = forwardRef<HTMLDivElement, { children: ReactNode; hidden?: boolean; label?: string }>(function Dock({ children, hidden, label = "Log the set" }, ref) {
  const inner = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = inner.current;
    const root = document.documentElement;
    if (!el) return;
    const set = () => root.style.setProperty("--wk-dock-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--wk-dock-h");
    };
  }, []);
  return (
    <div
      ref={(n) => {
        inner.current = n;
        if (typeof ref === "function") ref(n);
        else if (ref) ref.current = n;
      }}
      role="region"
      aria-label={label}
      aria-hidden={hidden || undefined}
      inert={hidden}
      data-dock=""
      className={cn("fixed inset-x-0 bottom-0 z-(--z-deck) bg-bg", hidden && "invisible")}
      style={{ paddingBottom: "calc(var(--safe-bottom) + 12px)" }}
    >
      <div aria-hidden data-dock-fade="" className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-[linear-gradient(to_top,var(--bg),transparent)]" />
      <div className="mx-auto max-w-col space-y-2.5 px-4 pt-1">{children}</div>
    </div>
  );
});

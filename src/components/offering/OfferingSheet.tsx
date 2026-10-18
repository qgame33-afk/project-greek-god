"use client";

import { Dialog } from "radix-ui";
import { Clock, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { OracleSparkles } from "@/components/art/icons";
import { Segmented } from "@/components/ui/controls";
import { useMediaQuery } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

export type OfferingMode = "log" | "ask";

/** Taps on a toast (its Undo) never dismiss the sheet underneath. */
function keepOpenForToasts(e: { target: EventTarget | null; preventDefault: () => void }) {
  const el = e.target as Element | null;
  if (el?.closest?.("[data-sonner-toaster]")) e.preventDefault();
}

/**
 * The on-screen keyboard's height on phones (the visual viewport shrinks; fixed boxes don't), so
 * the sheet can sit on top of it with its own field and composer in view. 0 when closed.
 */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState({ kb: 0, vh: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        setInset(kb > 120 ? { kb: Math.round(kb), vh: Math.round(vv.height) } : { kb: 0, vh: 0 });
      });
    };
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
      setInset({ kb: 0, vh: 0 });
    };
  }, [active]);
  return inset;
}

/**
 * The Offering sheet's frame (docs/DESIGN-V2.md §3.9): one vaul sheet at 92% of the screen with the
 * Log · Ask segments in its header. Ask draws the Oracle's aegean hairline across the top edge and
 * shows History. Desktop: a centred dialog of the same content. The body scrolls; `footer` (the
 * Oracle's composer) stays pinned at the bottom, above the keyboard.
 */
export function OfferingSheet({
  open,
  onOpenChange,
  mode,
  onMode,
  onHistory,
  historyActive,
  footerRef,
  hasFooter,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: OfferingMode;
  onMode: (m: OfferingMode) => void;
  onHistory?: () => void;
  /** History is showing (the button reads as pressed). */
  historyActive?: boolean;
  /** The pinned footer's element: Ask mode portals its composer into it. */
  footerRef?: (el: HTMLDivElement | null) => void;
  hasFooter?: boolean;
  children: ReactNode;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { kb, vh } = useKeyboardInset(open && !desktop);
  const ask = mode === "ask";
  const title = ask ? "Ask the Oracle" : "Log something";
  const description = ask ? "Answers come from your own logs. Nothing changes until you confirm." : "Describe a meal, or pick a quick action.";

  const header = (Title: typeof Dialog.Title, Desc: typeof Dialog.Description, Close: typeof Dialog.Close) => (
    <div className="relative flex min-h-14 shrink-0 items-center gap-2 px-4 pb-2 pt-1">
      <Title className="sr-only">{title}</Title>
      <Desc className="sr-only">{description}</Desc>
      <Segmented<OfferingMode>
        ariaLabel="Log or ask"
        value={mode}
        onChange={onMode}
        className="w-[12.5rem] max-w-[60%]"
        options={[
          { value: "log", label: "Log" },
          {
            value: "ask",
            label: (
              // align-top: an inline-flex box takes the icon's bottom as its baseline, which lifts "Ask" above "Log"
              <span className="inline-flex items-center gap-1.5 align-top">
                <OracleSparkles className="size-4 text-aegean" />
                Ask
              </span>
            ),
          },
        ]}
      />
      <span className="flex-1" />
      {ask && onHistory && (
        <button
          type="button"
          onClick={onHistory}
          aria-label="Conversation history"
          aria-pressed={!!historyActive}
          className={cn("press grid size-11 place-items-center rounded-full hover:text-ivory", historyActive ? "bg-m3 text-ivory" : "text-stone")}
        >
          <Clock className="size-5" strokeWidth={1.6} />
        </button>
      )}
      <Close className="press -mr-1.5 grid size-11 place-items-center rounded-full text-stone hover:bg-white/[.04] hover:text-ivory" aria-label="Close">
        <X className="size-5" strokeWidth={1.6} />
      </Close>
    </div>
  );

  const body = (
    <>
      <div className={cn("@container min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 lg:pb-6", hasFooter ? "pb-6" : "pb-[calc(24px+var(--safe-bottom))]")}>{children}</div>
      <div ref={footerRef} hidden={!hasFooter} className={cn("shrink-0 border-t border-vein bg-m1 px-4 pt-2.5 lg:pb-4", kb ? "pb-2" : "pb-[calc(10px+var(--safe-bottom))]")} />
    </>
  );

  const hairline = ask && (
    <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--aegean-line)_20%,var(--aegean)_50%,var(--aegean-line)_80%,transparent)]" />
  );

  if (desktop) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-(--z-sheet) bg-(--scrim)" />
          <Dialog.Content
            onPointerDownOutside={keepOpenForToasts}
            onInteractOutside={keepOpenForToasts}
            onOpenAutoFocus={(e) => e.preventDefault()}
            data-offering-sheet={mode}
            className="anim-dialog fixed left-1/2 top-1/2 z-(--z-sheet) flex h-[min(86dvh,54rem)] w-[calc(100vw-48px)] max-w-[40rem] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-sheet border border-vein-2 bg-m1 pt-3 shadow-(--e3) outline-none"
          >
            {hairline}
            {header(Dialog.Title, Dialog.Description, Dialog.Close)}
            {body}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-(--z-sheet) bg-(--scrim)" />
        <Drawer.Content
          onPointerDownOutside={keepOpenForToasts}
          onInteractOutside={keepOpenForToasts}
          data-offering-sheet={mode}
          style={kb ? { height: Math.max(240, vh - 8), bottom: kb } : undefined}
          className="fixed inset-x-0 bottom-0 z-(--z-sheet) flex h-[92dvh] flex-col rounded-t-sheet border-t border-vein-2 bg-m1 shadow-(--e3) outline-none"
        >
          {hairline}
          <div className="mx-auto mt-2.5 h-[5px] w-9 shrink-0 rounded-full bg-ui-line/70" aria-hidden />
          {header(Drawer.Title as unknown as typeof Dialog.Title, Drawer.Description as unknown as typeof Dialog.Description, Drawer.Close as unknown as typeof Dialog.Close)}
          {body}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

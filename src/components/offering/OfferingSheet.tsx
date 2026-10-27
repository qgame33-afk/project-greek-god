"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { useMediaQuery } from "@/components/ui/sheet";

/** Taps on a toast (its Undo) never dismiss the sheet underneath. */
function keepOpenForToasts(e: { target: EventTarget | null; preventDefault: () => void }) {
  const el = e.target as Element | null;
  if (el?.closest?.("[data-sonner-toaster]")) e.preventDefault();
}

/**
 * The on-screen keyboard's height on phones (the visual viewport shrinks; fixed boxes don't), so
 * the sheet can sit on top of it with its field in view. 0 when closed.
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
 * The Add sheet's frame (docs/DESIGN-V3-SIMPLE.md §4.7.1): a --sheet body with a 36×5 grabber, the
 * title "Add" in `t-sheet` and a 44 px close button. It sits above the keyboard on phones, so the
 * AI field stays in view while he types. Desktop: a centred dialog of the same content.
 */
export function OfferingSheet({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode }) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { kb, vh } = useKeyboardInset(open && !desktop);

  const header = (Title: typeof Dialog.Title, Desc: typeof Dialog.Description, Close: typeof Dialog.Close) => (
    <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 px-5 pb-1 pt-1">
      <Title className="t-sheet text-fg">Add</Title>
      <Desc className="sr-only">Describe a meal for an AI estimate, or pick a quick action.</Desc>
      <Close className="press grid size-11 shrink-0 place-items-center rounded-full bg-sheet-control text-fg hover:bg-card-3" aria-label="Close">
        <X className="size-5" strokeWidth={1.9} />
      </Close>
    </div>
  );

  const body = (
    <div data-sheet-body="" className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(24px+var(--safe-bottom))] lg:pb-6">
      {children}
    </div>
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
            data-offering-sheet="add"
            className="anim-dialog fixed left-1/2 top-1/2 z-(--z-sheet) flex max-h-[86dvh] w-[calc(100vw-48px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-sheet bg-sheet pt-3 outline-none"
          >
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
          data-offering-sheet="add"
          style={kb ? { maxHeight: Math.max(240, vh - 8), bottom: kb } : undefined}
          className="fixed inset-x-0 bottom-0 z-(--z-sheet) flex max-h-[92dvh] min-h-[64dvh] flex-col rounded-t-sheet bg-sheet outline-none"
        >
          <div className="mx-auto mb-1 mt-2 h-[5px] w-9 shrink-0 rounded-full bg-band" aria-hidden />
          {header(Drawer.Title as unknown as typeof Dialog.Title, Drawer.Description as unknown as typeof Dialog.Description, Drawer.Close as unknown as typeof Dialog.Close)}
          {body}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

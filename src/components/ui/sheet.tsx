"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/cn";

/** Taps on a toast (e.g. its Undo) must never dismiss the sheet underneath. */
function keepOpenForToasts(e: { target: EventTarget | null; preventDefault: () => void }) {
  const el = e.target as Element | null;
  if (el?.closest?.("[data-sonner-toaster]")) e.preventDefault();
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky footer (primary action). */
  footer?: ReactNode;
  className?: string;
  /** Wider desktop dialog. */
  wide?: boolean;
}

/**
 * Sheet (docs/DESIGN-V3-SIMPLE.md §1.4.17): a bottom sheet on phones (vaul), a centred dialog on
 * desktop. --sheet body, top radius 28, a 36×5 grabber, the title in `t-sheet` and a 44 px close
 * button, the --scrim backdrop. Cards inside use --sheet-card (the body sets `data-sheet-body`,
 * so kit cards and controls step up a shade by themselves). A sheet is its own viewport for the
 * one-gold-fill rule. Sits above the chrome (--z-sheet); confirms sit above sheets (--z-confirm).
 */
export function Sheet({ open, onOpenChange, title, description, children, footer, className, wide }: SheetProps) {
  const desktop = useMediaQuery("(min-width: 1024px)");

  const header = (Title: typeof Dialog.Title, Desc: typeof Dialog.Description, Close: typeof Dialog.Close) => (
    <div className="flex min-h-14 items-center justify-between gap-3 px-5 pb-1 pt-1">
      <div className="min-w-0">
        <Title className="t-sheet text-fg">{title}</Title>
        {description ? (
          <Desc className="t-label mt-1">{description}</Desc>
        ) : (
          <Desc className="sr-only">{typeof title === "string" ? title : "Dialog"}</Desc>
        )}
      </div>
      <Close className="press grid size-11 shrink-0 place-items-center rounded-full bg-sheet-control text-fg hover:bg-card-3" aria-label="Close">
        <X className="size-5" strokeWidth={1.9} />
      </Close>
    </div>
  );

  // A phone sheet without a footer runs its body to the screen's bottom edge, so the body's
  // padding clears the home indicator. --sheet-pb is that padding: action bars that stick to the
  // bottom inside the body (SheetFooterBar) pull themselves down by it.
  const sheetPb = footer || desktop ? "16px" : "calc(16px + var(--safe-bottom))";
  const body = (
    <>
      <div ref={clearStickyFooter} data-sheet-body="" className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-(--sheet-pb)", className)} style={{ "--sheet-pb": sheetPb } as CSSProperties}>
        {children}
      </div>
      {footer && (
        <div data-sheet-body="" className="bg-sheet px-5 pt-3 pb-[calc(16px+var(--safe-bottom))] lg:pb-5">
          {footer}
        </div>
      )}
    </>
  );

  if (desktop) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-(--z-sheet) bg-(--scrim)" />
          <Dialog.Content
            onPointerDownOutside={keepOpenForToasts}
            onInteractOutside={keepOpenForToasts}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement | null)?.focus();
            }}
            tabIndex={-1}
            className={cn(
              "anim-dialog fixed left-1/2 top-1/2 z-(--z-sheet) flex max-h-[86dvh] w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-sheet bg-sheet pt-3 outline-none",
              wide ? "max-w-[720px]" : "max-w-[560px]",
            )}
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
          className="fixed inset-x-0 bottom-0 z-(--z-sheet) flex max-h-[92dvh] flex-col rounded-t-sheet bg-sheet outline-none">
          <div className="mx-auto mb-1 mt-2 h-[5px] w-9 shrink-0 rounded-full bg-band" aria-hidden />
          {header(Drawer.Title as unknown as typeof Dialog.Title, Drawer.Description as unknown as typeof Dialog.Description, Drawer.Close as unknown as typeof Dialog.Close)}
          {body}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * The primary action bar of a sheet whose action lives inside its scrolling body (so it can sit
 * right under the form on tall screens): it sticks to the bottom edge, past the body's bottom
 * padding. The Sheet keeps focused fields clear of it.
 */
export function SheetFooterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-sheet-footer=""
      className={cn(
        "sticky bottom-[calc(var(--sheet-pb)*-1)] z-10 -mx-5 mb-[calc(var(--sheet-pb)*-1)] bg-sheet px-5 pt-3 pb-[calc(16px+var(--safe-bottom))] lg:pb-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Ref for a sheet's scrolling body: while a SheetFooterBar is inside it, the body's
 * scroll-padding-bottom is the bar's height, so a field the browser scrolls into view (on focus,
 * or when the keyboard shrinks the viewport) lands above the bar instead of behind it.
 */
function clearStickyFooter(body: HTMLDivElement | null) {
  if (!body) return;
  let bar: HTMLElement | null = null;
  const sync = () => {
    const next = body.querySelector<HTMLElement>("[data-sheet-footer]");
    if (next !== bar) {
      if (bar) ro.unobserve(bar);
      bar = next;
      if (bar) ro.observe(bar);
    }
    body.style.scrollPaddingBottom = bar ? `${bar.offsetHeight + 12}px` : "";
  };
  const ro = new ResizeObserver(sync);
  const mo = new MutationObserver(sync);
  sync();
  mo.observe(body, { childList: true, subtree: true });
  return () => {
    ro.disconnect();
    mo.disconnect();
  };
}

/** Small confirm dialog for destructive actions. */
export function Confirm({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = "Delete",
  onConfirm,
  destructive = true,
  cancelLabel = "Cancel",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
  cancelLabel?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-(--z-confirm) bg-(--scrim)" />
        <Dialog.Content data-sheet-body="" className="anim-dialog fixed left-1/2 top-1/2 z-(--z-confirm) w-[calc(100vw-40px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-card bg-sheet p-6 outline-none">
          <Dialog.Title className="t-sheet text-fg">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="t-body mt-2 text-fg-2">{body}</div>
          </Dialog.Description>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Dialog.Close className="press t-button h-[52px] rounded-pill bg-sheet-control text-fg">{cancelLabel}</Dialog.Close>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              data-gold={destructive ? undefined : "fill"}
              className={cn("press t-button h-[52px] rounded-pill", destructive ? "bg-danger-soft text-danger" : "bg-gold text-gold-ink")}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

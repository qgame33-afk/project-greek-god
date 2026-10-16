"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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

/** Bottom sheet on phones, centred dialog on desktop. */
export function Sheet({ open, onOpenChange, title, description, children, footer, className, wide }: SheetProps) {
  const desktop = useMediaQuery("(min-width: 1024px)");

  const header = (Title: typeof Dialog.Title, Desc: typeof Dialog.Description, Close: typeof Dialog.Close) => (
    <div className="flex min-h-14 items-center justify-between gap-3 px-5 pt-1">
      <div className="min-w-0">
        <Title className="t-h2 truncate">{title}</Title>
        {description ? (
          <Desc className="text-[13px] text-fg-2">{description}</Desc>
        ) : (
          <Desc className="sr-only">{typeof title === "string" ? title : "Dialog"}</Desc>
        )}
      </div>
      <Close className="press -mr-2 grid size-11 place-items-center rounded-[12px] text-fg-2 hover:bg-white/[.04] hover:text-fg" aria-label="Close">
        <X className="size-5" />
      </Close>
    </div>
  );

  const body = (
    <>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4", className)}>{children}</div>
      {footer && <div className="border-t border-line-hair bg-s2 px-5 pt-3 pb-[calc(16px+var(--safe-bottom))] lg:pb-5">{footer}</div>}
    </>
  );

  if (desktop) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-[var(--scrim)]" />
          <Dialog.Content
            onPointerDownOutside={keepOpenForToasts}
            onInteractOutside={keepOpenForToasts}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement | null)?.focus();
            }}
            tabIndex={-1}
            className={cn(
              "anim-dialog fixed left-1/2 top-1/2 z-[51] flex max-h-[86dvh] w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[24px] border border-line bg-s2 shadow-[var(--e3)] outline-none",
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
        <Drawer.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
        <Drawer.Content
          onPointerDownOutside={keepOpenForToasts}
          onInteractOutside={keepOpenForToasts}
          className="fixed inset-x-0 bottom-0 z-[51] flex max-h-[92dvh] flex-col rounded-t-[28px] border-t border-line bg-s2 shadow-[var(--e3)] outline-none">
          <div className="mx-auto mt-2.5 h-[5px] w-9 shrink-0 rounded-full bg-white/20" aria-hidden />
          {header(Drawer.Title as unknown as typeof Dialog.Title, Drawer.Description as unknown as typeof Dialog.Description, Drawer.Close as unknown as typeof Dialog.Close)}
          {body}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-[60] bg-[var(--scrim)]" />
        <Dialog.Content className="anim-dialog fixed left-1/2 top-1/2 z-[61] w-[calc(100vw-40px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] border border-line bg-s2 p-6 shadow-[var(--e3)] outline-none">
          <Dialog.Title className="t-h3">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-2 text-[14px] leading-relaxed text-fg-2">{body}</div>
          </Dialog.Description>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Dialog.Close className="press h-12 rounded-[14px] border border-line-strong bg-s3 text-[15px] font-bold text-fg">Cancel</Dialog.Close>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              className={cn(
                "press h-12 rounded-[14px] text-[15px] font-extrabold",
                destructive ? "bg-danger text-ink" : "bg-[image:var(--grad-leaf)] text-ink",
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Switch } from "@/components/ui/controls";
import { cn } from "@/lib/cn";

/** Inset grouped list section: eyebrow title, a rounded group of 52px rows, optional footnote. */
export function Group({
  id,
  title,
  footer,
  children,
  className,
  action,
}: {
  id?: string;
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 lg:scroll-mt-8", className)} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {title && (
        <div className="mb-2 flex min-h-5 items-end justify-between px-1">
          <h2 id={id ? `${id}-title` : undefined} className="eyebrow">
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className="overflow-hidden rounded-[20px] border border-line bg-s1 shadow-[var(--e1)]">{children}</div>
      {footer && <div className="mt-2 px-1 text-[12px] leading-relaxed font-medium text-fg-3">{footer}</div>}
    </section>
  );
}

const rowBase =
  "relative flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:left-4 [&:not(:first-child)]:before:right-0 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line-hair";

function Labels({ label, detail, danger }: { label: ReactNode; detail?: ReactNode; danger?: boolean }) {
  return (
    <span className="min-w-0 flex-1">
      <span className={cn("block text-[15px] font-semibold leading-snug", danger ? "text-danger" : "text-fg")}>{label}</span>
      {detail && <span className="mt-0.5 block text-[12.5px] leading-snug font-medium text-fg-3">{detail}</span>}
    </span>
  );
}

/** Tappable row that opens a sheet. */
export function NavRow({
  label,
  detail,
  value,
  onClick,
  danger,
  badge,
  disabled,
  chevron = true,
}: {
  label: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  badge?: ReactNode;
  disabled?: boolean;
  chevron?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(rowBase, "press-soft transition-colors hover:bg-white/[.025] active:bg-white/[.04] disabled:opacity-50")}>
      <Labels label={label} detail={detail} danger={danger} />
      {badge}
      {value != null && <span className="max-w-[55%] shrink-0 truncate text-right text-[15px] font-medium text-fg-2">{value}</span>}
      {chevron && <ChevronRight className="-mr-1 size-4 shrink-0 text-fg-3" aria-hidden />}
    </button>
  );
}

/** Static row with any control on the right (segmented, mini stepper...). */
export function ControlRow({ label, detail, children, stack }: { label: ReactNode; detail?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cn(rowBase, stack && "flex-col items-stretch gap-2.5 py-3 lg:flex-row lg:items-center lg:gap-6")}>
      <Labels label={label} detail={detail} />
      <div className={cn("shrink-0", stack && "w-full lg:w-[340px]")}>{children}</div>
    </div>
  );
}

/** Label + gold switch. The whole row toggles. */
export function SwitchRow({
  label,
  detail,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  detail?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(rowBase, "cursor-pointer", disabled && "pointer-events-none opacity-50")}
      onClick={(e) => {
        // the switch handles its own clicks; inside a <form> Radix also fires a synthetic click on
        // a hidden checkbox, which must not toggle the row a second time
        if ((e.target as HTMLElement).closest("button, input, a")) return;
        onChange(!checked);
      }}
    >
      <Labels label={label} detail={detail} />
      <Switch checked={checked} onCheckedChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

/** Read-only value row. */
export function InfoRow({ label, value, detail }: { label: ReactNode; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className={rowBase}>
      <Labels label={label} detail={detail} />
      <span className="max-w-[60%] shrink-0 truncate text-right text-[15px] font-medium text-fg-2">{value}</span>
    </div>
  );
}

/** Row skeleton used while the profile loads. */
export function GroupSkeleton({ rows = 3, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div aria-hidden>
      {title && <div className="skeleton mb-2 ml-1 h-3 w-24 rounded-full" />}
      <div className="overflow-hidden rounded-[20px] border border-line bg-s1">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={cn("flex h-[52px] items-center justify-between px-4", i > 0 && "border-t border-line-hair")}>
            <div className="skeleton h-3.5 w-32 rounded-full" />
            <div className="skeleton h-3.5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

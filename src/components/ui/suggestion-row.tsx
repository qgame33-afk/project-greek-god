"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The suggestion row (docs/DESIGN-V3-SIMPLE.md §1.4.22): a calm --card row with a 44 px tile and a
 * neutral glyph (`Moon`, `Activity`, `Info`), the title in `t-row`, one line of reason in
 * `t-label`, and a chevron. Never gold, never red. It opens a sheet with the options (RadioRows),
 * a gold "Use for today" / "Start…" and a ghost "Not now".
 *
 *   <SuggestionRow icon={Moon} title="Light week suggested" reason="5 hard weeks in a row" onClick={open} />
 */
export function SuggestionRow({ icon: Icon, title, reason, onClick, href, className }: { icon: LucideIcon; title: ReactNode; reason?: ReactNode; onClick?: () => void; href?: string; className?: string }) {
  const inner = (
    <>
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-tile bg-control text-fg">
        <Icon className="size-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-row block">{title}</span>
        {reason != null && (
          <span className="t-label mt-0.5 block truncate" data-program-text="">
            {reason}
          </span>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
    </>
  );
  const cls = cn("press-soft flex w-full items-center gap-3.5 rounded-card bg-surface px-4 py-3.5 text-left", className);
  if (href)
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" className={cls}>
      {inner}
    </button>
  );
}

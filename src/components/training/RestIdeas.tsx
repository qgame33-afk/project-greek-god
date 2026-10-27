"use client";

import { Activity, Bed, ChartLine, ChevronRight, Footprints, ListChecks, Moon, Utensils, type LucideIcon } from "lucide-react";
import { createElement, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { SUNDAY_RECOVERY } from "@/lib/training/programs";
import { Caption } from "./parts";

/**
 * Rest-day ideas (docs/DESIGN-V3-SIMPLE.md §4.3.3, PROGRAM-ARNOLD §1.5), shared by Train's rest day
 * and Today's rest-day Up next ("Ideas"). Everything comes from `SUNDAY_RECOVERY`, verbatim; no
 * tick circles, nothing counts against him.
 *
 *   <RestIdeas open={open} onOpenChange={setOpen} />           every idea, in a sheet (Today, "3 more ideas")
 *   <RestIdeasList />                                            "If you feel like it": the first three + "N more ideas"
 */

type Idea = (typeof SUNDAY_RECOVERY.items)[number];

/** A neutral glyph per idea, by what it is about (data-driven, never a hardcoded list order). */
export function ideaIcon(label: string): LucideIcon {
  const l = label.toLowerCase();
  if (l.includes("walk")) return Footprints;
  if (l.includes("mobility") || l.includes("stretch")) return Activity;
  if (l.includes("sleep")) return Bed;
  if (l.includes("food") || l.includes("water") || l.includes("eat")) return Utensils;
  if (l.includes("look back") || l.includes("week")) return ChartLine;
  return Moon;
}

function IdeaRow({ idea, clamp }: { idea: Idea; clamp?: boolean }) {
  return (
    <li className="flex min-h-[68px] items-start gap-3.5 px-4 py-3.5">
      <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-icon bg-card-3 text-fg">
        {createElement(ideaIcon(idea.label), { className: "size-5", strokeWidth: 1.9 })}
      </span>
      {/* a rest idea is PROGRAM's data, verbatim: one name for the budget (§5.1) */}
      <span className="min-w-0 flex-1" data-program-text="" data-budget-name="">
        <span className="t-row block">
          {idea.label}
        </span>
        <span className={clamp ? "t-label mt-0.5 line-clamp-2 block" : "t-label mt-0.5 block"}>{idea.detail}</span>
      </span>
    </li>
  );
}

/** Every rest-day idea in a sheet. */
export function RestIdeas({ open, onOpenChange, title = "Rest day ideas" }: { open: boolean; onOpenChange: (open: boolean) => void; title?: string }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <ul className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
        {SUNDAY_RECOVERY.items.map((i) => (
          <IdeaRow key={i.label} idea={i} />
        ))}
      </ul>
      <Caption className="pb-2">Nothing here counts against you.</Caption>
    </Sheet>
  );
}

/**
 * Train's "If you feel like it": the first three ideas (detail clamped to two lines; VoiceOver
 * reads it whole) and a fourth row "3 more ideas ›" that opens every idea in a sheet.
 */
export function RestIdeasList({ show = 3 }: { show?: number }) {
  const [open, setOpen] = useState(false);
  const items = SUNDAY_RECOVERY.items;
  const more = Math.max(0, items.length - show);
  return (
    <>
      <ul className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">
        {items.slice(0, show).map((i) => (
          <IdeaRow key={i.label} idea={i} clamp />
        ))}
        {more > 0 && (
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="press-soft flex min-h-14 w-full items-center gap-3.5 px-4 py-2.5 text-left">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-icon bg-card-3 text-fg">
                <ListChecks className="size-5" strokeWidth={1.9} />
              </span>
              <span className="t-row min-w-0 flex-1">{more === 1 ? "1 more idea" : `${more} more ideas`}</span>
              <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
            </button>
          </li>
        )}
      </ul>
      <Caption>Nothing here counts against you.</Caption>
      <RestIdeas open={open} onOpenChange={setOpen} />
    </>
  );
}


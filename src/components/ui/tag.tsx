"use client";

import { Popover } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TAG_MEANING, spokenTag, tagText, type TagKind } from "@/lib/provenance";

export { spokenTag };

/**
 * The provenance Tag (docs/DESIGN-V2.md §1.7): one small-caps pill with a fixed vocabulary,
 * put on derived numbers and calls — never on every raw value, never gold, and never the only
 * carrier of meaning (the sentence around it says the same thing).
 *
 *   <Tag kind="PROJ" />                                   PROJ
 *   <Tag kind="AI" detail="estimate" />                   AI · ESTIMATE
 *   <Tag kind="CALC" explain="2,140 eaten + 380 planned" />  tappable: opens the arithmetic
 */
export interface TagProps {
  kind: TagKind;
  /** Second word after a middot: AI · ESTIMATE, RULE · DELOAD. */
  detail?: string;
  /** The working behind the number. Makes the tag a 44 px button that opens a small popover. */
  explain?: ReactNode;
  className?: string;
}

const LOOK: Record<TagKind, string> = {
  LOG: "text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]",
  PLAN: "text-ivory border border-dashed border-ui-line",
  RULE: "text-stone border border-ui-line",
  CALC: "text-stone border border-dotted border-ui-line",
  PROJ: "text-ivory border border-dashed border-ui-line",
  AI: "text-aegean border border-aegean-line bg-aegean-tint",
};

function Glyph({ kind }: { kind: TagKind }) {
  if (kind === "RULE")
    return (
      <svg aria-hidden viewBox="0 0 8 8" className="size-2 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
        <path d="M2.6 0.8v6.4M5.4 0.8v6.4M0.8 2.6h6.4M0.8 5.4h6.4" />
      </svg>
    );
  if (kind === "PROJ")
    return (
      <svg aria-hidden viewBox="0 0 10 8" className="h-2 w-2.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0.8 6.2c1.6-3 3.6-4 6.6-4" strokeDasharray="1.6 1.4" />
        <path d="M5.8 0.8l1.8 1.4-1.4 1.8" />
      </svg>
    );
  return null;
}

const PILL = "t-tag inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-tag px-1.5 align-middle";

export function Tag({ kind, detail, explain, className }: TagProps) {
  const text = tagText(kind, detail);
  const body = (
    <>
      <Glyph kind={kind} />
      <span aria-hidden>{text}</span>
    </>
  );
  if (!explain) {
    return (
      <span className={cn(PILL, LOOK[kind], className)} data-tag={kind}>
        {body}
        <span className="sr-only">{spokenTag(kind, detail)}</span>
      </span>
    );
  }
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        data-tag={kind}
        aria-label={`${spokenTag(kind, detail)}. Show how this is worked out`}
        className={cn(PILL, LOOK[kind], "press hit-44 cursor-pointer", className)}
      >
        {body}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="anim-pop z-(--z-confirm) max-w-[min(18rem,calc(100vw-32px))] rounded-field border border-vein-3 bg-m3 px-3.5 py-3 shadow-(--e3) outline-none"
        >
          <p className="t-eyebrow mb-1.5 text-stone">{text}</p>
          <div className="t-callout text-ivory">{explain}</div>
          <p className="t-meta mt-2 text-stone">{TAG_MEANING[kind]}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

import { BadgeCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { TagKind } from "@/lib/provenance";
import { RecordMark } from "./record-mark";
import { Tag, spokenTag } from "./tag";

// Compatibility wrappers (docs/DESIGN-V2.md §1.7): the old badges now render the provenance Tag
// or a source chip. Owning streams replace their calls with <Tag> as they rebuild each screen.

/** Plain text of simple children ("Estimate · via ", "ChatGPT") for the AI heuristics below. */
function textOf(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  return "";
}

const CHIP = "t-tag inline-flex h-5 shrink-0 items-center gap-1 rounded-tag px-1.5 align-middle";

/** Recorded by the user → Tag LOG. */
export function LoggedBadge({ className }: { className?: string }) {
  return <Tag kind="LOG" className={className} />;
}

/** Planned value, never data → Tag PLAN (children replace the word, e.g. "Planned · not eaten"). */
export function PlanBadge({ className, children }: { className?: string; children?: ReactNode }) {
  if (children == null) return <Tag kind="PLAN" className={className} />;
  return (
    <span className={cn(CHIP, "border border-dashed border-ui-line text-ivory", className)} data-tag="PLAN">
      {children}
    </span>
  );
}

/**
 * An estimate. With a `confidence` (the AI scanner and food coach pass one) it is AI · ESTIMATE
 * with a 3-pip meter; text naming an assistant ("Estimate · via …") is AI too. Otherwise it is a
 * neutral "≈ Estimate" chip, because not every estimate is AI (recipe macros from the ingredient
 * database are CALC, and their owners switch to <Tag kind="CALC" />).
 */
export function EstimateBadge({ confidence, className, children }: { confidence?: number; className?: string; children?: ReactNode }) {
  const pips = confidence == null ? null : confidence >= 0.75 ? 3 : confidence >= 0.45 ? 2 : 1;
  const level = pips === 1 ? "low" : pips === 2 ? "medium" : "high";
  const ai = pips != null || /\bvia\b|\bAI\b/.test(textOf(children));
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 align-middle", className)}>
      {ai && (children == null || children === "Estimate") ? (
        <Tag kind="AI" detail="Estimate" />
      ) : ai ? (
        <span className={cn(CHIP, "border border-aegean-line bg-aegean-tint text-aegean")} data-tag="AI">
          {children}
          <span className="sr-only">, {spokenTag("AI")}</span>
        </span>
      ) : (
        <span className={cn(CHIP, "border border-dotted border-ui-line text-stone")}>
          <span aria-hidden>≈</span>
          {children ?? "Estimate"}
        </span>
      )}
      {pips != null && (
        <span className="t-tag inline-flex items-center gap-[2px] text-stone">
          <span aria-hidden className="inline-flex items-center gap-[2px]">
            {[1, 2, 3].map((i) => (
              <span key={i} className={cn("h-2 w-[3px] rounded-[1px]", i <= pips ? "bg-aegean" : "bg-vein-3")} />
            ))}
          </span>
          {pips === 1 && <span aria-hidden className="ml-0.5">Low</span>}
          <span className="sr-only">{level} confidence</span>
        </span>
      )}
    </span>
  );
}

/** A published, retrieved source (a chip, not a tag). Only render when a real URL exists. */
export function SourceBadge({ name, url, className }: { name: string; url: string; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(CHIP, "hit-44 max-w-full border border-vein-3 text-ivory normal-case tracking-[0.02em] hover:border-ui-line", className)}
    >
      <BadgeCheck className="size-3 text-stone" aria-hidden />
      <span className="truncate">Source · {name}</span>
    </a>
  );
}

/** Database match (USDA / Open Food Facts): data, not a guess (a source chip). */
export function DatabaseBadge({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  const inner = (
    <>
      <BadgeCheck className="size-3 text-stone" aria-hidden />
      <span className="truncate">{name}</span>
    </>
  );
  const cls = cn(CHIP, "max-w-full border border-vein-3 text-ivory normal-case tracking-[0.02em]", className);
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cn(cls, "hit-44 hover:border-ui-line")}>
      {inner}
    </a>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

/**
 * A recommendation, never applied automatically. Rule engines (deload, progression, the calorie
 * rule) are RULE; the coach's are AI — pass `kind="AI"`. Text containing "AI" is shown as AI.
 */
export function SuggestedBadge({ className, children, kind }: { className?: string; children?: ReactNode; kind?: Extract<TagKind, "RULE" | "AI"> }) {
  const k = kind ?? (/\bAI\b/.test(textOf(children)) ? "AI" : "RULE");
  if (children == null) return <Tag kind={k} className={className} />;
  return (
    <span
      className={cn(CHIP, k === "AI" ? "border border-aegean-line bg-aegean-tint text-aegean" : "border border-ui-line text-stone", className)}
      data-tag={k}
    >
      {children}
      {k === "AI" && <span className="sr-only">, {spokenTag(k)}</span>}
    </span>
  );
}

/** A record → the laurel RecordMark. */
export function PRBadge({ className }: { className?: string }) {
  return <RecordMark compact className={className} />;
}

export function OptionalBadge({ className, children }: { className?: string; children?: ReactNode }) {
  return <span className={cn(CHIP, "border border-vein-3 text-stone", className)}>{children ?? "Optional"}</span>;
}

export function AutoBadge({ className }: { className?: string }) {
  return <span className={cn(CHIP, "border border-vein-3 text-stone", className)}>Auto</span>;
}

/** First-ever log of an exercise: a baseline, not a record (never gold). */
export function FirstBenchmarkBadge({ className }: { className?: string }) {
  return <span className={cn("t-tag inline-flex h-5 shrink-0 items-center text-ivory", className)}>First benchmark</span>;
}

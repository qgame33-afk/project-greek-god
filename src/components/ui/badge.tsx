import { BadgeCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { TagKind } from "@/lib/provenance";
import { AiChip } from "./ai-chip";

// The old badges (docs/DESIGN-V3-SIMPLE.md §1.7.5). No provenance tags except the AI label:
// Logged, Plan, rule-Suggested, Optional and Auto render nothing; Estimate and AI-Suggested render
// the AI chip; Source and Database stay small source chips; First benchmark
// reads "First time". Deleted at integration (§6.7) once nothing imports them.

/** Plain text of simple children ("Estimate · via ", "ChatGPT") for the AI heuristics below. */
function textOf(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  return "";
}

const SOURCE_CHIP = "t-cap inline-flex h-[30px] max-w-full shrink-0 items-center gap-1.5 rounded-pill bg-card-2 px-3 font-semibold text-fg align-middle";

export function LoggedBadge(_props: { className?: string }) {
  return null;
}

export function PlanBadge(_props: { className?: string; children?: ReactNode }) {
  return null;
}

/**
 * An estimate. With a `confidence` (the AI scanner and food coach pass one) or text naming an
 * assistant it is AI: the AI chip. Other estimates (database maths) render nothing.
 */
export function EstimateBadge({ confidence, className, children }: { confidence?: number; className?: string; children?: ReactNode }) {
  const ai = confidence != null || /\bvia\b|\bAI\b/.test(textOf(children));
  if (!ai) return null;
  return <AiChip label="AI estimate" className={className} />;
}

/** A published, retrieved source (a chip, not a tag). Only render when a real URL exists. */
export function SourceBadge({ name, url, className }: { name: string; url: string; className?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cn(SOURCE_CHIP, "hit-44 hover:bg-card-3", className)}>
      <BadgeCheck className="size-3.5 shrink-0 text-fg-2" aria-hidden />
      <span className="truncate">{name}</span>
    </a>
  );
}

/** Database match (USDA / Open Food Facts): data, not a guess (a source chip). */
export function DatabaseBadge({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  const inner = (
    <>
      <BadgeCheck className="size-3.5 shrink-0 text-fg-2" aria-hidden />
      <span className="truncate">{name}</span>
    </>
  );
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cn(SOURCE_CHIP, "hit-44 hover:bg-card-3", className)}>
      {inner}
    </a>
  ) : (
    <span className={cn(SOURCE_CHIP, className)}>{inner}</span>
  );
}

/** A recommendation, never applied automatically: the AI chip for the coach's, nothing for rules. */
export function SuggestedBadge({ className, children, kind }: { className?: string; children?: ReactNode; kind?: Extract<TagKind, "RULE" | "AI"> }) {
  const k = kind ?? (/\bAI\b/.test(textOf(children)) ? "AI" : "RULE");
  if (k !== "AI") return null;
  return <AiChip label="AI" className={className} />;
}

export function OptionalBadge(_props: { className?: string; children?: ReactNode }) {
  return null;
}

export function AutoBadge(_props: { className?: string }) {
  return null;
}

/** First-ever log of an exercise: a baseline, not a best (never gold). */
export function FirstBenchmarkBadge({ className }: { className?: string }) {
  return <span className={cn("t-cap inline-flex shrink-0 items-center font-semibold text-fg", className)}>First time</span>;
}

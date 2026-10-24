"use client";

import type { ReactNode } from "react";
import { spokenTag, type TagKind } from "@/lib/provenance";
import { AiChip } from "./ai-chip";
import { InfoButton } from "./details-sheet";

export { spokenTag };

/**
 * The old provenance Tag, rewired (docs/DESIGN-V3-SIMPLE.md §1.7.5, law 5). The API is unchanged:
 *   - `LOG | PLAN | RULE | CALC | PROJ` render nothing. With `explain`, a 44 px Info button that
 *     opens a "How we got this" sheet, so the working is not lost before the owning stream adds
 *     its own DetailsSheet.
 *   - `AI` renders the AI chip ("AI", or "AI estimate" with `detail="estimate"`).
 * Deleted at integration (§6.7) once nothing imports it.
 */
export interface TagProps {
  kind: TagKind;
  /** Second word: AI · ESTIMATE → "AI estimate". */
  detail?: string;
  /** The working behind the number: opens a "How we got this" sheet. */
  explain?: ReactNode;
  className?: string;
}

export function Tag({ kind, detail, explain, className }: TagProps) {
  if (kind === "AI") return <AiChip label={detail ? `AI ${detail.toLowerCase()}` : "AI"} className={className} />;
  if (explain == null || explain === false) return null;
  return <InfoButton how={explain} label={`How this is worked out (${spokenTag(kind, detail)})`} className={className} />;
}

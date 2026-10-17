// The "USDA didn't answer" caveat under a photo review or a chat draft. Pure (unit-tested).

import type { SourceStatus } from "@/lib/food/types";
import type { AIFoodItem } from "./food-schemas";

const DOWN: SourceStatus[] = ["rate_limited", "error", "timeout"];

/**
 * Null unless the USDA lookup failed and a generic food fell back to an estimate because of
 * it. When another row in the same result is a real USDA match, the note says "some foods",
 * so the page never contradicts its own USDA link.
 */
export function usdaDownNote(usda: SourceStatus | null | undefined, items: Pick<AIFoodItem, "kind" | "provenance" | "source">[], where: "photo" | "chat"): string | null {
  if (!usda || !DOWN.includes(usda)) return null;
  if (!items.some((i) => i.kind === "generic" && i.provenance === "estimate")) return null;
  const someMatched = items.some((i) => i.provenance === "database" && i.source?.name === "USDA");
  if (someMatched) return where === "photo" ? "USDA didn't answer for some foods, so those use the photo estimate." : "USDA didn't answer for some foods, so those are estimates.";
  return where === "photo" ? "USDA didn't answer this time, so generic foods use the photo estimate." : "USDA didn't answer this time, so generic foods are estimates.";
}

// Inline copy for a failed add or save in a nutrition sheet. Pure (unit-tested).

import type { SaveErrorKind } from "@/lib/data/core";

/**
 * What a sheet says when an add or save fails. Retry is only offered when retrying can
 * work: never for a value the database rejects as out of range.
 */
export function saveFailure(r: { kind: SaveErrorKind; message: string }, kept: "entry" | "changes" | "meal" = "entry"): { text: string; retry: boolean } {
  const what = kept === "changes" ? "Your changes are kept" : kept === "meal" ? "Nothing was added" : "Your entry is kept";
  if (r.kind === "offline") {
    const head = kept === "meal" ? "You're offline, so nothing was added." : `You're offline, so this wasn't saved. ${what}.`;
    return { text: `${head} Retry once you're back online.`, retry: true };
  }
  if (r.kind === "invalid") return { text: `${r.message} Lower the amount or the numbers, then save.`, retry: false };
  if (r.kind === "auth") return { text: r.message, retry: false };
  return { text: `Couldn't save. ${what}. Retry.`, retry: true };
}

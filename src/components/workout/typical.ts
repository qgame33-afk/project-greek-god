"use client";

import { useTypicalDurations } from "@/components/training/hooks";

/**
 * The usual length of a template (§2.4: the median of recent sessions, one definition, from
 * Train's useTypicalDurations), in minutes — null until there are enough sessions.
 */
export function useTypicalMinutes(templateKey: string | null | undefined): number | null {
  const typical = useTypicalDurations();
  return templateKey ? (typical[templateKey] ?? null) : null;
}

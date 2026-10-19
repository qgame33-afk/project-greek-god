"use client";

import { toast } from "sonner";
import { isOffline } from "@/lib/data/core";

export const OFFLINE_NOTE = "You're offline. Nothing was saved and your entry is kept. Save again once you're back online.";

/**
 * Settings writes say "offline" at once instead of waiting (a paused save would spin until the
 * connection came back). True when the write was stopped; the control then shows the stored value.
 */
export function blockedOffline(): boolean {
  if (!isOffline()) return false;
  toast.error("You're offline", { description: "Nothing changed. Try again once you're back online." });
  return true;
}

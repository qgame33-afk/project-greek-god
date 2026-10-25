"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/components/workout/stores";

/**
 * The offline banner (docs/DESIGN-V3-SIMPLE.md §4.12): a 36 px opaque --card-3 strip at the top of
 * every app screen while the device has no connection, never a toast. Screens keep showing their
 * saved data; logging queues as it does now. The workout shows its own strip (§4.2.13).
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="t-label mb-3 flex min-h-9 items-center gap-2 rounded-tile bg-card-3 px-3.5 py-1.5 text-fg">
      <WifiOff className="size-4 shrink-0 text-fg-2" strokeWidth={2.2} aria-hidden />
      <p>Offline · changes sync when you&apos;re back</p>
    </div>
  );
}

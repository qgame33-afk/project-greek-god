"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/components/workout/stores";

/**
 * Shown at the top of every app screen while the device has no connection. Reads pause
 * offline (TanStack Query's default), so without this a screen with nothing cached would sit
 * on skeletons with no explanation. Entries made now are held and sent on reconnect while
 * the app stays open; the live workout has its own on-device queue and sync line.
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-[14px] border border-line bg-s2 px-3.5 py-2.5 text-[13px] leading-snug text-fg-2">
      <WifiOff className="mt-px size-[18px] shrink-0 text-fg-3" aria-hidden />
      <p>
        <span className="font-bold text-fg">You&apos;re offline.</span> Screens finish loading and new entries send once
        you&apos;re back. Keep the app open.
      </p>
    </div>
  );
}

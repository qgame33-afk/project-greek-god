"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/components/workout/stores";

/**
 * Shown at the top of every app screen while the device has no connection. Reads pause
 * offline (TanStack Query's default), so without this a screen with nothing cached would sit
 * on skeletons with no explanation. Food and water writes fail at once offline (their sheets
 * say so and keep what was typed); other entries are held and sent on reconnect while the app
 * stays open; the live workout has its own on-device queue and sync line.
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-[14px] border border-line bg-s2 px-3.5 py-2.5 text-[13px] leading-snug text-fg-2">
      <WifiOff className="mt-px size-[18px] shrink-0 text-fg-3" aria-hidden />
      <p>
        <span className="font-bold text-fg">You&apos;re offline.</span> Screens finish loading once you&apos;re back. Food and
        water need a connection to save; other entries send when you reconnect with the app open.
      </p>
    </div>
  );
}

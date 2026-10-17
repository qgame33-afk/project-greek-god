"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/components/workout/stores";

/**
 * The offline strip (docs/DESIGN-V2.md §2.1): a 36 px opaque strip under the header on every app
 * screen while the device has no connection — never a toast. Screens keep showing the data saved
 * on this device. Honest about writes: food and water need a connection (their sheets say so and
 * keep what was typed); the live workout queues its sets on the device and syncs when back.
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="t-meta mb-4 flex min-h-9 items-center gap-2.5 rounded-field bg-m2 px-3 py-1.5 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)]">
      <WifiOff className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
      <p>
        <span className="font-semibold text-ivory">Offline</span> · showing saved data · food needs a connection; workouts sync when you&apos;re back
      </p>
    </div>
  );
}

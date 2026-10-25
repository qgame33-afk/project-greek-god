"use client";

import type { OracleContext } from "@/components/offering/store";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";

/**
 * The old header actions (docs/DESIGN-V3-SIMPLE.md §3.2: the ✦ button is gone from every header).
 * Renders only the avatar. Kept for old callers until integration (§6.7); new pages use
 * <PageHeader accessory={<Avatar />} />.
 */
export function HeaderActions({ className }: { oracle?: OracleContext; className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center", className)}>
      <Avatar />
    </div>
  );
}

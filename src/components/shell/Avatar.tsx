"use client";

import Link from "next/link";
import { useProfile } from "@/lib/data/profile";
import { avatarInitial } from "./nav";

/**
 * Today's header accessory (docs/DESIGN-V3-SIMPLE.md §3.2): a 40 px --card-2 circle with the
 * display name's initial (never the email's), a 44 px target, opening Settings.
 */
export function Avatar() {
  const { profile } = useProfile();
  return (
    <Link href="/settings" aria-label="Settings" className="press grid size-11 shrink-0 place-items-center rounded-full">
      <span aria-hidden className="t-row grid size-10 place-items-center rounded-full bg-card-2 font-bold">
        {avatarInitial(profile?.display_name)}
      </span>
    </Link>
  );
}

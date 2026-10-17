"use client";

import Link from "next/link";
import { OracleSparkles } from "@/components/art/icons";
import { openOffering, type OracleContext } from "@/components/offering/store";
import { cn } from "@/lib/cn";
import { useProfile } from "@/lib/data/profile";
import { avatarInitial } from "./nav";

/**
 * The right end of every tab's header row (docs/DESIGN-V2.md §2.1): ✦ (aegean, 44 px, "Ask the
 * Oracle", opens the Offering in Ask mode with this screen's context) and the avatar (44 px, the
 * display name's initial — never the email's — linking to Settings). Sized in px like the rest of
 * the chrome, so the header row keeps its 52 px height at any text size.
 */
export function HeaderActions({ oracle, className }: { oracle?: OracleContext; className?: string }) {
  const { profile } = useProfile();
  const initial = avatarInitial(profile?.display_name);
  return (
    <div className={cn("flex shrink-0 items-center gap-[8px]", className)}>
      <button
        type="button"
        aria-label="Ask the Oracle"
        onClick={() => openOffering({ mode: "ask", context: oracle })}
        className="press grid size-[44px] place-items-center rounded-full bg-m2/70 text-aegean shadow-[inset_0_0_0_1px_var(--aegean-line)] hover:bg-m3"
      >
        <OracleSparkles className="size-[22px]" />
      </button>
      <Link
        href="/settings"
        aria-label="Settings and profile"
        className="press grid size-[44px] place-items-center rounded-full bg-m2/70 font-voice text-[19px] font-semibold leading-none text-leaf-200 shadow-[inset_0_0_0_1px_var(--leaf-line)] hover:bg-m3"
      >
        <span aria-hidden className="-mt-px">
          {initial}
        </span>
      </Link>
    </div>
  );
}

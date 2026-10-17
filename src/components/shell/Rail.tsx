"use client";

import Link from "next/link";
import { useState } from "react";
import { Mark } from "@/components/art/Mark";
import { cn } from "@/lib/cn";
import { useProfile } from "@/lib/data/profile";
import { LiveSlot } from "./LiveSlot";
import { OfferingButton } from "./OfferingButton";
import { PRIMARY_NAV, SECONDARY_NAV, avatarInitial, isActive, type NavItem } from "./nav";

/**
 * The desktop rail (docs/DESIGN-V2.md §2.1): replaces the capsule from 768 px — 76 px of icons,
 * 248 px with labels from 1024 px. The Offering sits at the top; Now, Train, Fuel, Ascent; a
 * hairline; Oracle, Chronicle, Recovery, Settings; the live slot as a card at the bottom.
 * Opaque m1 (no glass). The active row has an m4 pill that glides (translate only) and leaf-300.
 */
export function Rail({ pathname, showLiveSlot }: { pathname: string; showLiveSlot: boolean }) {
  const { profile } = useProfile();
  return (
    <aside className="vt-sidebar fixed inset-y-0 left-0 z-(--z-chrome) hidden w-[76px] flex-col border-r border-vein bg-m1 px-3 py-5 md:flex lg:w-[248px] lg:px-4">
      <Link href="/" className="mb-6 flex min-h-11 items-center gap-2.5 px-1 md:justify-center lg:justify-start" aria-label="Project Greek God, Now">
        <Mark size={30} className="shrink-0" />
        <span className="hidden min-w-0 leading-none lg:block">
          <span className="block whitespace-nowrap font-voice text-[length:max(14px,0.875rem)] font-semibold tracking-[0.12em] text-ivory">PROJECT GREEK GOD</span>
          <span className="t-eyebrow mt-1 block tracking-[0.3em]">The Ascent</span>
        </span>
      </Link>
      <div className="mb-5">
        <OfferingButton variant="rail" />
      </div>
      <RailGroup label="Primary" items={PRIMARY_NAV} pathname={pathname} />
      <div className="my-4 h-px bg-vein" />
      <RailGroup label="More" items={SECONDARY_NAV} pathname={pathname} />
      <div className="mt-auto space-y-3">
        {showLiveSlot && <LiveSlot variant="rail" />}
        <Link href="/settings" className="press-soft flex min-h-11 items-center gap-3 rounded-btn px-1 text-stone hover:text-ivory md:justify-center lg:justify-start">
          <span className="grid size-9 shrink-0 place-items-center rounded-full font-voice text-[length:max(17px,1.0625rem)] font-semibold text-leaf-200 shadow-[inset_0_0_0_1px_var(--leaf-line)]">
            {avatarInitial(profile?.display_name)}
          </span>
          <span className="hidden truncate text-[length:max(14px,0.875rem)] font-semibold lg:block">{profile?.display_name || "Settings"}</span>
        </Link>
      </div>
    </aside>
  );
}

function RailGroup({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  const index = items.findIndex((n) => isActive(pathname, n.href));
  const [last, setLast] = useState(Math.max(index, 0));
  if (index >= 0 && index !== last) setLast(index);
  const at = index >= 0 ? index : last;
  return (
    <nav aria-label={label} className="relative flex flex-col gap-1">
      {/* one pill that glides between the 44 px rows (+4 px gap) on a translate-only spring */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-11 rounded-btn bg-m4 transition-[translate,opacity] duration-(--dur-lift) ease-spring"
        style={{ translate: `0 ${at * 48}px`, opacity: index >= 0 ? 1 : 0 }}
      />
      {items.map(({ href, label: name, icon: Icon }) => {
        const active = isActive(pathname, href);
        const oracle = href === "/coach";
        return (
          <Link
            key={href}
            href={href}
            title={name}
            aria-current={active ? "page" : undefined}
            className={cn(
              "press-soft relative z-10 flex h-11 items-center gap-3 rounded-btn px-3 text-[length:max(14px,0.875rem)] font-semibold md:justify-center lg:justify-start",
              active ? "text-ivory" : "text-stone hover:bg-white/[.03] hover:text-ivory",
            )}
          >
            <Icon className={cn("size-[22px] shrink-0", active ? "text-leaf-300" : oracle ? "text-aegean" : undefined)} strokeWidth={active ? 1.8 : 1.6} />
            <span className="md:hidden lg:inline">{name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

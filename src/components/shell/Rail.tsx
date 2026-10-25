"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { useProfile } from "@/lib/data/profile";
import { LiveSlot } from "./LiveSlot";
import { PlusButton } from "./PlusButton";
import { PRIMARY_NAV, SECONDARY_NAV, avatarInitial, isActive, type NavItem } from "./nav";

/**
 * The desktop rail (docs/DESIGN-V3-SIMPLE.md §3.5), from 1024 px: Today, Train, Food, Progress, a
 * hairline, then Add (the white +), Coach and Settings; the workout bar as a card at the foot.
 * Opaque --bg with a --line edge; the active row is a --card-2 pill with --text, the others
 * --tab-off. No brand mark, no gold.
 */
export function Rail({ pathname, showLiveSlot }: { pathname: string; showLiveSlot: boolean }) {
  const { profile } = useProfile();
  return (
    <aside className="vt-sidebar fixed inset-y-0 left-0 z-(--z-chrome) hidden w-[248px] flex-col border-r border-line bg-bg px-4 py-6 lg:flex">
      <Link href="/" className="t-section mb-6 flex min-h-11 items-center px-2 text-fg" aria-label="Project Greek God, Today">
        Project Greek God
      </Link>
      <RailGroup label="Primary" items={PRIMARY_NAV} pathname={pathname} />
      <div className="my-4 h-px bg-line" />
      <div className="flex flex-col gap-1">
        <PlusButton variant="rail" />
        <RailGroup label="More" items={SECONDARY_NAV} pathname={pathname} />
      </div>
      <div className="mt-auto space-y-3">
        {showLiveSlot && <LiveSlot variant="rail" />}
        <Link href="/settings" className="press-soft flex min-h-11 items-center gap-3 rounded-pill px-2 text-tab-off hover:text-fg">
          <span className="t-row grid size-9 shrink-0 place-items-center rounded-full bg-card-2 font-bold text-fg">{avatarInitial(profile?.display_name)}</span>
          <span className="t-label truncate font-semibold">{profile?.display_name || "Settings"}</span>
        </Link>
      </div>
    </aside>
  );
}

function RailGroup({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {items.map(({ href, label: name, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("press-soft t-row flex h-11 items-center gap-3 rounded-pill px-3", active ? "bg-card-2 text-fg" : "text-tab-off hover:bg-white/5 hover:text-fg")}
          >
            <Icon className="size-[22px] shrink-0" strokeWidth={1.9} />
            {name}
          </Link>
        );
      })}
    </nav>
  );
}

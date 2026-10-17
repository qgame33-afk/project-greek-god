"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import type { OracleContext } from "@/components/offering/store";
import { cn } from "@/lib/cn";
import { clearHeader, setHeader } from "./chrome";
import { HeaderActions } from "./HeaderActions";

/**
 * A tab's header row (docs/DESIGN-V2.md §2.1): the eyebrow on the left (date or section), ✦ and the
 * avatar on the right. Put it at the top of a tab page, before the page's <h1>:
 *
 *   <TabHeader eyebrow="SAT 17 OCT · DAY 41" oracle={{ kind: "now", label: "Push A today" }} />
 *   <h1 className="t-title-1">…</h1>
 *
 * On phones the row IS the shell's sticky top bar (so ✦ and the avatar are on every screen, even
 * before a screen adopts this): this component hands the bar its eyebrow and Oracle context and
 * renders nothing in place. From 768 px (no top bar) it renders the row in the page.
 */
export function TabHeader({ eyebrow, oracle, className }: { eyebrow?: string; oracle?: OracleContext; className?: string }) {
  const pathname = usePathname();
  const ctxKey = oracle ? `${oracle.kind}|${oracle.label}|${(oracle.facts ?? []).join("|")}` : "";
  useLayoutEffect(() => {
    setHeader({ path: pathname, eyebrow, oracle });
    return () => clearHeader(pathname);
    // the context object may be re-created each render; its content is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, eyebrow, ctxKey]);
  return (
    <div className={cn("mb-4 hidden min-h-11 items-center justify-between gap-3 md:flex", className)}>
      <p className="t-eyebrow truncate">{eyebrow}</p>
      <HeaderActions oracle={oracle} />
    </div>
  );
}

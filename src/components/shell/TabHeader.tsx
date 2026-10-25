"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import type { OracleContext } from "@/components/offering/store";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";
import { clearHeader, setHeader } from "./chrome";

/**
 * The old tab header, retired (docs/DESIGN-V3-SIMPLE.md §3.2: no eyebrow, no ✦). Until each
 * screen moves to <PageHeader>, it keeps Today's avatar reachable: on `/` it renders a row with the
 * avatar; elsewhere it renders nothing. It still registers the page's coach context (chrome.ts).
 * Deleted at integration (§6.7).
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
  if (pathname !== "/") return null;
  return (
    <div className={cn("flex min-h-14 items-center justify-end", className)}>
      <Avatar />
    </div>
  );
}

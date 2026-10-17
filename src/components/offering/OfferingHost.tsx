"use client";

// SEED (Foundation → Sheets at the F-B hand-off). Mounted once by the shell. Log mode opens the
// seeded OfferingSheet (the old quick-log actions); Ask mode goes to the Oracle page (/coach) until
// the Sheets stream builds the Ask sheet (docs/DESIGN-V2.md §3.9).

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OfferingSheet } from "./OfferingSheet";
import { closeOffering, openOffering, useOffering } from "./store";

export function OfferingHost() {
  const router = useRouter();
  const { open, close } = useOffering();

  useEffect(() => {
    if (open?.mode !== "ask") return;
    const q = open.prompt ? `?q=${encodeURIComponent(open.prompt)}` : open.conversationId ? `?c=${encodeURIComponent(open.conversationId)}` : "";
    closeOffering();
    router.push(`/coach${q}`);
  }, [open, router]);

  return <OfferingSheet open={open?.mode === "log"} onOpenChange={(o) => !o && close()} onAsk={() => openOffering({ mode: "ask" })} />;
}

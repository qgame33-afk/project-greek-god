"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogSheet, type LogRequestState } from "@/components/nutrition/LogSheet";
import { FuelProvider } from "@/components/nutrition/context";
import { contextFromPath, usesFoodCoach } from "@/components/oracle/context";
import { WeightLogSheet } from "@/components/shared/WeightLogSheet";
import { useHeader } from "@/components/shell/chrome";
import { useToday } from "@/lib/data/core";
import type { ISODate } from "@/lib/dates";
import type { Meal } from "@/lib/nutrition";
import { AddMode } from "./AddMode";
import { OfferingSheet } from "./OfferingSheet";
import { closeOffering, openOffering, useOffering, type OracleContext, type OfferingOpen } from "./store";

const noop = () => {};

/** Where "Ask coach" goes from a screen: food questions to the food coach, the rest to Coach with the screen as context. */
export function coachHref(c: OracleContext, o: { prompt?: string; conversationId?: string } = {}) {
  const q = new URLSearchParams();
  if (o.conversationId) q.set("c", o.conversationId);
  if (o.prompt) q.set("q", o.prompt);
  if (usesFoodCoach(c)) return `/nutrition/coach${q.size ? `?${q}` : ""}`;
  q.set("about", c.kind);
  return `/coach?${q}`;
}

/**
 * The Add sheet, mounted once by the shell (docs/DESIGN-V3-SIMPLE.md §4.7). + opens it; a request
 * with a `panel` (Search food, /nutrition?add=1&tab=…) opens FOOD's log panels (Search · Recent ·
 * Saved · Manual) directly, for that slot and date. The weigh-in is TODAY's sheet. An "ask"
 * request (the old ✦) goes to the Coach screen with the screen it came from as context.
 */
export function OfferingHost() {
  const { open, close } = useOffering();
  const pathname = usePathname();
  const router = useRouter();
  const header = useHeader(pathname);
  const today = useToday();
  const [weightOpen, setWeightOpen] = useState(false);
  const screenContext = header?.oracle ?? contextFromPath(pathname);

  // Ask: the Coach screen, not a sheet
  const ask = open?.mode === "ask" ? open : null;
  useEffect(() => {
    if (!ask) return;
    closeOffering();
    router.push(coachHref(ask.context ?? screenContext, { prompt: ask.prompt, conversationId: ask.conversationId }));
  }, [ask, router, screenContext]);

  // the sheet keeps showing what it was opened with while it animates closed
  const panel = open?.mode === "log" && open.panel ? open : null;
  const sheetOpen = open?.mode === "log" && !panel;
  const [shown, setShown] = useState<OfferingOpen | null>(null);
  if (sheetOpen && open !== shown) setShown(open);

  // the log panels: a fresh panel state per request
  const [panelReq, setPanelReq] = useState<{ req: OfferingOpen | null; state: LogRequestState; date: ISODate | null }>({ req: null, state: { open: false, nonce: 0 }, date: null });
  if (panel && panel !== panelReq.req) {
    setPanelReq((p) => ({ req: panel, date: panel.mode === "log" ? (panel.date ?? null) : null, state: { open: true, nonce: p.state.nonce + 1, meal: panel.mode === "log" ? panel.slot : undefined, tab: panel.mode === "log" ? panel.panel : undefined } }));
  } else if (!panel && panelReq.state.open) {
    setPanelReq((p) => ({ ...p, req: null, state: { ...p.state, open: false } }));
  }

  const logDate = (shown?.mode === "log" ? shown.date : undefined) ?? today;

  return (
    <>
      <OfferingSheet open={!!sheetOpen} onOpenChange={(o) => !o && close()}>
        <AddMode
          date={logDate}
          onClose={close}
          onWeighIn={() => {
            close();
            setWeightOpen(true);
          }}
          onSearch={(meal?: Meal) => openOffering({ mode: "log", panel: "search", slot: meal, date: logDate === today ? undefined : logDate })}
          onAsk={() => {
            close();
            router.push(coachHref(screenContext));
          }}
        />
      </OfferingSheet>

      <WeightLogSheet open={weightOpen} onOpenChange={setWeightOpen} />

      {panelReq.state.nonce > 0 && (
        <FuelProvider date={panelReq.date ?? today} today={today} goals={null} entries={[]} openLog={noop} openEdit={noop} setDate={noop}>
          <LogSheet state={panelReq.state} onOpenChange={(o) => !o && closeOffering()} />
        </FuelProvider>
      )}
    </>
  );
}

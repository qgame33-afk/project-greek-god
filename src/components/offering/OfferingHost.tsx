"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogSheet, type LogRequestState } from "@/components/nutrition/LogSheet";
import { FuelProvider } from "@/components/nutrition/context";
import { contextFromPath, contextKey } from "@/components/oracle/context";
import { WeightLogSheet } from "@/components/shared/WeightLogSheet";
import { useHeader } from "@/components/shell/chrome";
import { useToday } from "@/lib/data/core";
import type { ISODate } from "@/lib/dates";
import type { Meal } from "@/lib/nutrition";
import { AskMode, type AskView } from "./AskMode";
import { LogMode } from "./LogMode";
import { OfferingSheet, type OfferingMode } from "./OfferingSheet";
import { closeOffering, openOffering, useOffering, type OfferingOpen } from "./store";

const noop = () => {};

/**
 * The Offering, mounted once by the shell (docs/DESIGN-V2.md §3.9). `+` opens it in Log mode,
 * ✦ in Ask mode with the screen's context; one segmented control switches. A Log request with a
 * `panel` (Search food, /nutrition?add=1) opens the existing log panels (Search · Saved · Recent ·
 * Manual) directly, for that slot and date. The weigh-in is its own sheet.
 */
export function OfferingHost() {
  const { open, close } = useOffering();
  const pathname = usePathname();
  const header = useHeader(pathname);
  const today = useToday();
  const [weightOpen, setWeightOpen] = useState(false);
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const [askView, setAskView] = useState<AskView>("thread");

  // the sheet keeps showing what it was opened with while it animates closed
  const panel = open?.mode === "log" && open.panel ? open : null;
  const sheetOpen = !!open && !panel;
  const [shown, setShown] = useState<OfferingOpen | null>(null);
  if (sheetOpen && open !== shown) {
    setShown(open);
    setAskView("thread");
  }
  const mode: OfferingMode = shown?.mode ?? "log";

  // the log panels: a fresh panel state per request
  const [panelReq, setPanelReq] = useState<{ req: OfferingOpen | null; state: LogRequestState; date: ISODate | null }>({ req: null, state: { open: false, nonce: 0 }, date: null });
  if (panel && panel !== panelReq.req) {
    setPanelReq((p) => ({ req: panel, date: panel.mode === "log" ? (panel.date ?? null) : null, state: { open: true, nonce: p.state.nonce + 1, meal: panel.mode === "log" ? panel.slot : undefined, tab: panel.mode === "log" ? panel.panel : undefined } }));
  } else if (!panel && panelReq.state.open) {
    setPanelReq((p) => ({ ...p, req: null, state: { ...p.state, open: false } }));
  }

  const screenContext = header?.oracle ?? contextFromPath(pathname);
  const askContext = shown?.mode === "ask" ? (shown.context ?? screenContext) : screenContext;
  const logDate = (shown?.mode === "log" ? shown.date : undefined) ?? today;

  const switchMode = (m: OfferingMode) => {
    if (m === mode) return;
    openOffering(m === "ask" ? { mode: "ask", context: screenContext } : { mode: "log" });
  };

  return (
    <>
      <OfferingSheet
        open={sheetOpen}
        onOpenChange={(o) => !o && close()}
        mode={mode}
        onMode={switchMode}
        onHistory={() => setAskView((v) => (v === "history" ? "thread" : "history"))}
        historyActive={askView === "history"}
        footerRef={setFooterEl}
        hasFooter={mode === "ask"}
      >
        {mode === "ask" && shown?.mode === "ask" ? (
          <AskMode
            key={`${contextKey(askContext)}|${shown.conversationId ?? ""}|${shown.prompt ?? ""}`}
            context={askContext}
            prompt={shown.prompt}
            conversationId={shown.conversationId}
            footerEl={footerEl}
            view={askView}
            setView={setAskView}
            onNavigate={close}
          />
        ) : (
          <LogMode
            date={logDate}
            onClose={close}
            onWeighIn={() => {
              close();
              setWeightOpen(true);
            }}
            onSearch={(meal?: Meal) => openOffering({ mode: "log", panel: "search", slot: meal, date: logDate === today ? undefined : logDate })}
          />
        )}
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

"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { WeightLogSheet } from "@/components/shared/WeightLogSheet";
import { PageHeader } from "@/components/shell/PageHeader";
import { Segmented } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/misc";
import type { Measurement } from "@/lib/data/body";
import type { ISODate } from "@/lib/dates";
import { useSwapIn } from "@/lib/motion";
import { BodyTab } from "./body/BodyTab";
import { MeasurementSheet } from "./body/MeasurementSheet";
import { ProgressActionsProvider, TABS, tabFromParam, type ProgressActions, type ProgressSection, type ProgressTab } from "./context";
import { PhotoUploadSheet } from "./photos/PhotoUploadSheet";
import { StrengthTab } from "./strength/StrengthTab";
import { WeightSkeleton, WeightTab } from "./weight/WeightTab";

/**
 * /progress (docs/DESIGN-V3-SIMPLE.md §4.5): PageHeader "Progress" and Weight · Strength · Body.
 * Deep links (§3.7): ?tab=weight|mountain|roadmap, strength|hall|athletic, body|photos|gallery
 * (photos scrolled to), and ?log=1 (the weigh-in sheet). Any other query (an old
 * retired sheet) is ignored.
 */
export function ProgressScreen() {
  const hydrated = useHydrated();
  // All data is client-fetched; render the skeleton until hydration so cached data can't mismatch the server HTML.
  return hydrated ? <Progress /> : <ProgressFallback />;
}

function Progress() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { tab, section } = tabFromParam(params.get("tab"));
  const panelRef = useSwapIn<HTMLDivElement, number>(TABS.findIndex((t) => t.key === tab));

  const [weight, setWeight] = useState<{ open: boolean; date?: ISODate }>({ open: false });
  const [measure, setMeasure] = useState<{ open: boolean; entry: Measurement | null }>({ open: false, entry: null });
  const [photo, setPhoto] = useState(false);

  const replace = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) sp.delete(k);
        else sp.set(k, v);
      }
      const qs = sp.toString();
      // The native History API (kept in sync with useSearchParams by the router): switching a
      // segment never asks the server for the page, so it works with no signal.
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [params, pathname],
  );

  const goTab = useCallback((t: ProgressTab) => replace({ tab: t === "weight" ? null : t, log: null }), [replace]);

  // Deep link: ?log=1 opens the weigh-in sheet once (also on client navigation to the same
  // route), then the param is dropped so a refresh doesn't reopen it.
  const logParam = params.get("log");
  const [seenLog, setSeenLog] = useState(false);
  if (logParam === "1" && !seenLog) {
    setSeenLog(true);
    setWeight({ open: true });
  } else if (logParam !== "1" && seenLog) setSeenLog(false);
  useEffect(() => {
    if (logParam === "1") replace({ log: null });
  }, [logParam, replace]);

  useScrollToSection(section, params.get("tab"));

  const actions = useMemo<ProgressActions>(
    () => ({
      logWeight: (date) => setWeight({ open: true, date }),
      logMeasurements: (entry) => setMeasure({ open: true, entry: entry ?? null }),
      logPhoto: () => setPhoto(true),
      goTab,
    }),
    [goTab],
  );

  return (
    <ProgressActionsProvider value={actions}>
      <PageHeader title="Progress" />
      <Segmented
        ariaLabel="Progress sections"
        value={tab}
        onChange={(v) => {
          goTab(v);
          window.scrollTo({ top: 0 });
        }}
        options={TABS.map((t) => ({ value: t.key, label: t.label }))}
        className="mb-4 mt-2"
      />

      <div ref={panelRef} id="progress-panel" role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {tab === "weight" && <WeightTab />}
        {tab === "strength" && <StrengthTab />}
        {tab === "body" && <BodyTab />}
      </div>

      <WeightLogSheet open={weight.open} onOpenChange={(o) => setWeight((s) => ({ ...s, open: o }))} date={weight.date} />
      <MeasurementSheet open={measure.open} entry={measure.entry} onOpenChange={(o: boolean) => setMeasure((s) => ({ ...s, open: o }))} />
      <PhotoUploadSheet open={photo} onOpenChange={setPhoto} />
    </ProgressActionsProvider>
  );
}

/** Bring an old URL's block into view once it has rendered (data arrives after mount). */
function useScrollToSection(section: ProgressSection, key: string | null) {
  useEffect(() => {
    if (!section) return;
    let tries = 0;
    let frame = 0;
    const look = () => {
      const el = document.getElementById(`progress-${section}`);
      if (el && el.getBoundingClientRect().height > 0) {
        el.scrollIntoView({ block: "start" });
        return;
      }
      if (tries++ < 120) frame = requestAnimationFrame(look);
    };
    frame = requestAnimationFrame(look);
    return () => cancelAnimationFrame(frame);
  }, [section, key]);
}

const noop = () => () => {};
/** False during SSR and hydration, true afterwards. */
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** Server-rendered placeholder while the client screen hydrates: the Weight segment's shapes. */
export function ProgressFallback() {
  return (
    <div aria-busy="true" aria-label="Loading Progress">
      <PageHeader title="Progress" />
      <Skeleton className="mb-4 mt-2 h-11 w-full rounded-pill" />
      <WeightSkeleton />
    </div>
  );
}


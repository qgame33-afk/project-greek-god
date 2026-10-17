"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { WeightLogSheet } from "@/components/shared/WeightLogSheet";
import { TabHeader } from "@/components/shell/TabHeader";
import { Segmented } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/misc";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import type { Measurement } from "@/lib/data/body";
import type { ISODate } from "@/lib/dates";
import { useSwapIn } from "@/lib/motion";
import type { TestType } from "@/lib/progress/athletic";
import { planFromProfile, programmeWeek } from "@/lib/progress/plan";
import { ProgressActionsProvider, TABS, tabFromParam, type AscentSection, type AscentTab, type ProgressActions } from "./context";
import { MeasurementSheet } from "./body/MeasurementSheet";
import { PhotoUploadSheet } from "./photos/PhotoUploadSheet";
import { AthleticLogSheet } from "./athletic/AthleticLogSheet";
import { MountainTab } from "./mountain/MountainTab";
import { HallTab } from "./hall/HallTab";
import { GalleryTab } from "./gallery/GalleryTab";

/**
 * /progress — Ascent (docs/DESIGN-V2.md §3.6): Mountain · Hall · Gallery.
 * Deep links: ?tab=mountain|hall|gallery, the old ?tab=weight|roadmap|strength|athletic|body|photos
 * (mapped to a segment with that section scrolled into view), and ?log=1 (the weigh-in sheet).
 */
export function ProgressScreen() {
  const hydrated = useHydrated();
  // All data is client-fetched; render the skeleton until hydration so cached data can't mismatch the server HTML.
  return hydrated ? <Ascent /> : <ProgressFallback />;
}

function Ascent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = useToday();
  const { profile } = useProfile();
  const { tab, section } = tabFromParam(params.get("tab"));
  const panelRef = useSwapIn<HTMLDivElement, number>(TABS.findIndex((t) => t.key === tab));

  const [weight, setWeight] = useState<{ open: boolean; date?: ISODate }>({ open: false });
  const [measure, setMeasure] = useState<{ open: boolean; entry: Measurement | null }>({ open: false, entry: null });
  const [photo, setPhoto] = useState(false);
  const [athletic, setAthletic] = useState<{ open: boolean; type?: TestType }>({ open: false });

  const replace = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) sp.delete(k);
        else sp.set(k, v);
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const goTab = useCallback((t: AscentTab) => replace({ tab: t === "mountain" ? null : t, log: null }), [replace]);

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
      logAthletic: (type) => setAthletic({ open: true, type }),
      goTab,
    }),
    [goTab],
  );

  const plan = planFromProfile(profile, today);
  const wk = profile ? programmeWeek(plan, today) : null;

  return (
    <ProgressActionsProvider value={actions}>
      <TabHeader eyebrow={wk ? `Ascent · week ${wk.week} of ${wk.total}` : "Ascent"} oracle={{ kind: "ascent", label: wk ? `Week ${wk.week} of the climb` : "The climb" }} />
      <h1 className="sr-only">Ascent</h1>
      <Segmented
        ariaLabel="Ascent sections"
        value={tab}
        onChange={(v) => {
          goTab(v);
          window.scrollTo({ top: 0 });
        }}
        options={TABS.map((t) => ({ value: t.key, label: t.label }))}
        className="mb-6 lg:max-w-sm"
      />

      <div ref={panelRef} id="ascent-panel" role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {tab === "mountain" && <MountainTab />}
        {tab === "hall" && <HallTab />}
        {tab === "gallery" && <GalleryTab />}
      </div>

      <WeightLogSheet open={weight.open} onOpenChange={(o) => setWeight((s) => ({ ...s, open: o }))} date={weight.date} />
      <MeasurementSheet open={measure.open} entry={measure.entry} onOpenChange={(o: boolean) => setMeasure((s) => ({ ...s, open: o }))} />
      <PhotoUploadSheet open={photo} onOpenChange={setPhoto} />
      <AthleticLogSheet open={athletic.open} type={athletic.type} onOpenChange={(o: boolean) => setAthletic((s) => ({ ...s, open: o }))} />
    </ProgressActionsProvider>
  );
}

/** Bring an old URL's section into view once its block has rendered (data arrives after mount). */
function useScrollToSection(section: AscentSection, key: string | null) {
  useEffect(() => {
    if (!section) return;
    let tries = 0;
    let frame = 0;
    const look = () => {
      const el = document.getElementById(`ascent-${section}`);
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

/** Server-rendered placeholder while the client screen hydrates: the Mountain's shapes. */
export function ProgressFallback() {
  return (
    <div aria-busy="true" aria-label="Loading Ascent">
      <Skeleton className="mb-6 h-11 w-full rounded-field lg:max-w-sm" />
      <Skeleton className="h-8 w-4/5 rounded-tag" />
      <Skeleton className="mt-2 h-8 w-3/5 rounded-tag" />
      <Skeleton className="mt-4 h-4 w-full rounded-tag" />
      <Skeleton className="mt-8 h-80 w-full rounded-card" />
    </div>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { Activity, Camera, Plus, Ruler, Scale } from "lucide-react";
import { WeightLogSheet } from "@/components/shared/WeightLogSheet";
import { Button } from "@/components/ui/button";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import type { Measurement } from "@/lib/data/body";
import type { ISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { TestType } from "@/lib/progress/athletic";
import { planFromProfile, programmeWeek } from "@/lib/progress/plan";
import { ProgressActionsProvider, TABS, isTab, type ProgressActions, type ProgressTab } from "./context";
import { WeightTab } from "./weight/WeightTab";
import { BodyTab } from "./body/BodyTab";
import { MeasurementSheet } from "./body/MeasurementSheet";
import { PhotosTab } from "./photos/PhotosTab";
import { PhotoUploadSheet } from "./photos/PhotoUploadSheet";
import { StrengthTab } from "./strength/StrengthTab";
import { AthleticTab } from "./athletic/AthleticTab";
import { AthleticLogSheet } from "./athletic/AthleticLogSheet";
import { RoadmapTab } from "./roadmap/RoadmapTab";

export function ProgressScreen() {
  const params = useSearchParams();
  const today = useToday();
  const { profile } = useProfile();
  const urlTab = params.get("tab");
  const tab: ProgressTab = isTab(urlTab) ? urlTab : "weight";

  const [chooser, setChooser] = useState(false);
  const [weight, setWeight] = useState<{ open: boolean; date?: ISODate }>({ open: false });
  const [measure, setMeasure] = useState<{ open: boolean; entry: Measurement | null }>({ open: false, entry: null });
  const [photo, setPhoto] = useState(false);
  const [athletic, setAthletic] = useState<{ open: boolean; type?: TestType }>({ open: false });

  const sentinelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const goTab = useCallback(
    (t: ProgressTab) => {
      const next = new URLSearchParams(params.toString());
      next.set("tab", t);
      next.delete("log");
      window.history.replaceState(null, "", `?${next.toString()}`);
      // keep the chips in view when switching from deep in a long tab
      const sentinel = sentinelRef.current;
      const bar = barRef.current;
      if (sentinel && bar) {
        const stickyTop = parseFloat(getComputedStyle(bar).top) || 0;
        const anchor = sentinel.getBoundingClientRect().top + window.scrollY - stickyTop;
        if (window.scrollY > anchor) window.scrollTo({ top: anchor });
      }
    },
    [params],
  );

  // Deep link: /progress?tab=weight&log=1 opens the weigh-in sheet once (also on client
  // navigation to the same route), then the param is dropped so a refresh doesn't reopen it.
  const logParam = params.get("log");
  const [seenLog, setSeenLog] = useState(false);
  if (logParam === "1" && !seenLog) {
    setSeenLog(true);
    setWeight({ open: true });
  } else if (logParam !== "1" && seenLog) setSeenLog(false);
  useEffect(() => {
    if (logParam !== "1") return;
    const next = new URLSearchParams(params.toString());
    next.delete("log");
    if (!next.get("tab")) next.set("tab", "weight");
    window.history.replaceState(null, "", `?${next.toString()}`);
  }, [logParam, params]);

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
  const hydrated = useHydrated();

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.key === tab);
    let j = -1;
    if (e.key === "ArrowRight") j = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = TABS.length - 1;
    if (j < 0) return;
    e.preventDefault();
    goTab(TABS[j].key);
    requestAnimationFrame(() => document.getElementById(`progress-tab-${TABS[j].key}`)?.focus());
  };

  // All data is client-fetched; render the skeleton until hydration so cached data can't mismatch the server HTML.
  if (!hydrated) return <ProgressFallback />;

  return (
    <ProgressActionsProvider value={actions}>
      <PageHeader
        eyebrow={wk ? `Week ${wk.week} of ${wk.total}` : "The ascent"}
        title="Progress"
        className="mb-4 lg:mb-5"
        action={
          <Button variant="outline-gold" size="md" onClick={() => setChooser(true)} aria-haspopup="dialog" className="h-11 px-4">
            <Plus className="size-[18px]" /> Log
          </Button>
        }
      />

      <div ref={sentinelRef} aria-hidden />
      <div
        ref={barRef}
        className="chrome sticky top-[calc(52px+var(--safe-top))] z-[15] -mx-4 mb-5 border-b border-line-hair px-4 md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:[backdrop-filter:none]"
      >
        <div role="tablist" aria-label="Progress sections" onKeyDown={onTabKey} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-2">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                id={`progress-tab-${t.key}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls="progress-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => goTab(t.key)}
                className={cn(
                  "press relative inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[13px] font-semibold transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
                  active ? "border-line-gold bg-gold-tint text-gold-300" : "border-line bg-s3 text-fg-2 hover:text-fg",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div id="progress-panel" role="tabpanel" aria-labelledby={`progress-tab-${tab}`} key={tab} className="animate-[rise_260ms_var(--ease-out)_both] motion-reduce:animate-none">
        {tab === "weight" && <WeightTab />}
        {tab === "body" && <BodyTab />}
        {tab === "photos" && <PhotosTab />}
        {tab === "strength" && <StrengthTab />}
        {tab === "athletic" && <AthleticTab />}
        {tab === "roadmap" && <RoadmapTab />}
      </div>

      <LogChooser
        open={chooser}
        onOpenChange={setChooser}
        onPick={(k) => {
          setChooser(false);
          // let the chooser close before the next sheet opens
          window.setTimeout(() => {
            if (k === "weight") {
              goTab("weight");
              setWeight({ open: true });
            } else if (k === "body") {
              goTab("body");
              setMeasure({ open: true, entry: null });
            } else if (k === "photo") {
              goTab("photos");
              setPhoto(true);
            } else {
              goTab("athletic");
              setAthletic({ open: true });
            }
          }, 180);
        }}
      />

      <WeightLogSheet open={weight.open} onOpenChange={(o) => setWeight((s) => ({ ...s, open: o }))} date={weight.date} />
      <MeasurementSheet open={measure.open} entry={measure.entry} onOpenChange={(o: boolean) => setMeasure((s) => ({ ...s, open: o }))} />
      <PhotoUploadSheet open={photo} onOpenChange={setPhoto} />
      <AthleticLogSheet open={athletic.open} type={athletic.type} onOpenChange={(o: boolean) => setAthletic((s) => ({ ...s, open: o }))} />
    </ProgressActionsProvider>
  );
}

function LogChooser({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (k: "weight" | "body" | "photo" | "athletic") => void }) {
  const tiles: { k: "weight" | "body" | "photo" | "athletic"; label: string; sub: string; icon: ReactNode }[] = [
    { k: "weight", label: "Weigh-in", sub: "Morning, after the bathroom", icon: <Scale className="size-6" /> },
    { k: "body", label: "Measurements", sub: "Tape, once a month", icon: <Ruler className="size-6" /> },
    { k: "photo", label: "Progress photo", sub: "Every 2–4 weeks", icon: <Camera className="size-6" /> },
    { k: "athletic", label: "Athletic test", sub: "Jumps, reach, sprint", icon: <Activity className="size-6" /> },
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Log progress">
      <div className="grid grid-cols-2 gap-3 py-2">
        {tiles.map((t) => (
          <button key={t.k} type="button" onClick={() => onPick(t.k)} className="card-inset press flex h-28 flex-col justify-between p-3.5 text-left transition-colors hover:bg-s4">
            <span className="text-gold-300">{t.icon}</span>
            <span>
              <span className="block text-[15px] font-bold text-fg">{t.label}</span>
              <span className="block text-[12px] font-medium text-fg-3">{t.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
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

/** Server-rendered placeholder while the client screen hydrates. */
export function ProgressFallback() {
  return (
    <div aria-busy="true">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <Skeleton className="mb-3 h-3 w-24" />
          <Skeleton className="h-8 w-44" />
        </div>
        <Skeleton className="h-11 w-20 rounded-[14px]" />
      </div>
      <div className="mb-5 flex gap-2">
        {TABS.map((t) => (
          <Skeleton key={t.key} className="h-9 w-20 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-[220px] w-full rounded-[20px]" />
    </div>
  );
}

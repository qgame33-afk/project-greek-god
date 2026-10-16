"use client";

import { useRef, useState } from "react";
import { Segmented } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import type { FoodEntry, SavedFood, SavedMeal } from "@/lib/data/nutrition";
import { mealForTime, type Meal } from "@/lib/nutrition";
import { timeValue } from "@/lib/nutrition-ui/format";
import { fromEntry, fromSavedFood, fromSearchResult, type FoodCandidate } from "@/lib/nutrition-ui/portion";
import type { SearchResult } from "@/lib/nutrition-ui/search";
import { useFuel } from "./context";
import { readPref, useFocusIntoSheet, writePref } from "./hooks";
import { scrollSheetTop, type When } from "./log-shared";
import { ManualPanel } from "./ManualPanel";
import { PortionPanel } from "./PortionPanel";
import { RecentPanel } from "./RecentPanel";
import { SavedPanel } from "./SavedPanel";
import { SavedFoodEditor, SavedMealPanel } from "./SavedSteps";
import { SearchPanel } from "./SearchPanel";

export type LogTab = "search" | "saved" | "recent" | "manual";
export const LOG_TABS: LogTab[] = ["search", "saved", "recent", "manual"];
const TAB_KEY = "pgg.fuel.logTab";

export interface LogRequestState {
  open: boolean;
  nonce: number;
  meal?: Meal;
  tab?: LogTab;
}

/** Search | Saved | Recent | Manual — every way to log food by hand. */
export function LogSheet({ state, onOpenChange }: { state: LogRequestState; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={state.open} onOpenChange={onOpenChange} title="Log food" className="min-h-[min(600px,72dvh)] lg:min-h-[560px]">
      <LogBody key={state.nonce} meal={state.meal} tab={state.tab} close={() => onOpenChange(false)} />
    </Sheet>
  );
}

type Step =
  | { kind: "list" }
  | { kind: "portion"; c: FoodCandidate; savedFood?: SavedFood }
  | { kind: "meal"; meal: SavedMeal }
  | { kind: "editSaved"; food: SavedFood };

function LogBody({ meal, tab: initialTab, close }: { meal?: Meal; tab?: LogTab; close: () => void }) {
  const { date } = useFuel();
  const root = useRef<HTMLDivElement>(null);
  useFocusIntoSheet(root);
  const [tab, setTab] = useState<LogTab>(() => {
    if (initialTab) return initialTab;
    const saved = readPref(TAB_KEY) as LogTab | null;
    return saved && LOG_TABS.includes(saved) ? saved : "search";
  });
  const [step, setStepRaw] = useState<Step>({ kind: "list" });
  const [when, setWhen] = useState<When>(() => ({ meal: meal ?? mealForTime(new Date()), date, time: timeValue(new Date()) }));
  const [q, setQ] = useState("");
  const [seed, setSeed] = useState({ name: "", nonce: 0 });

  const setStep = (s: Step) => {
    setStepRaw(s);
    scrollSheetTop(root.current);
  };
  const pickTab = (t: LogTab) => {
    setTab(t);
    writePref(TAB_KEY, t);
  };
  const back = () => setStep({ kind: "list" });

  return (
    <div ref={root}>
      {step.kind === "portion" && <PortionPanel key={step.c.key} c={step.c} savedFood={step.savedFood} when={when} setWhen={setWhen} onBack={back} onDone={close} />}
      {step.kind === "meal" && <SavedMealPanel meal={step.meal} when={when} setWhen={setWhen} onBack={back} onDone={close} />}
      {step.kind === "editSaved" && <SavedFoodEditor food={step.food} onBack={back} />}

      {/* Lists stay mounted while a step is open, so Back returns to the same results. */}
      <div hidden={step.kind !== "list"}>
        <div className="sticky top-0 z-10 -mx-5 bg-s2 px-5 pb-3 pt-1">
          <Segmented
            ariaLabel="Log food by"
            value={tab}
            onChange={pickTab}
            options={[
              { value: "search", label: "Search" },
              { value: "saved", label: "Saved" },
              { value: "recent", label: "Recent" },
              { value: "manual", label: "Manual" },
            ]}
          />
        </div>
        <div className="pt-2">
          <div hidden={tab !== "search"}>
            <SearchPanel
              q={q}
              setQ={setQ}
              onPick={(r: SearchResult) => setStep({ kind: "portion", c: fromSearchResult(r) })}
              onManual={(name) => {
                setSeed((s) => ({ name, nonce: s.nonce + 1 }));
                pickTab("manual");
              }}
            />
          </div>
          <div hidden={tab !== "saved"}>
            <SavedPanel
              onPickFood={(f) => setStep({ kind: "portion", c: fromSavedFood(f), savedFood: f })}
              onPickMeal={(m) => setStep({ kind: "meal", meal: m })}
              onEditFood={(f) => setStep({ kind: "editSaved", food: f })}
            />
          </div>
          <div hidden={tab !== "recent"}>
            <RecentPanel when={when} onPick={(e: FoodEntry) => setStep({ kind: "portion", c: fromEntry(e) })} />
          </div>
          <div hidden={tab !== "manual"}>
            <ManualPanel seed={seed} when={when} setWhen={setWhen} onDone={close} />
          </div>
        </div>
      </div>
    </div>
  );
}

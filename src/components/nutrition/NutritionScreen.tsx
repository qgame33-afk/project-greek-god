"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { GroceryScreen } from "@/components/meals/grocery/GroceryScreen";
import { WeekPlanner } from "@/components/meals/week/WeekPlanner";
import { TabHeader } from "@/components/shell/TabHeader";
import { Segmented } from "@/components/ui/controls";
import { useToday } from "@/lib/data/core";
import { TodayTab } from "./today/TodayTab";

export type FuelTab = "today" | "week" | "market";
const TABS: FuelTab[] = ["today", "week", "market"];

export function fuelTabOf(v: string | null | undefined): FuelTab | null {
  return TABS.includes(v as FuelTab) ? (v as FuelTab) : null;
}

/**
 * /nutrition — Fuel (docs/DESIGN-V2.md §3.5): Today · Week · Market. ?tab=week|market picks the
 * segment (?tab=search|recent|saved|manual stays the log sheet's panel with ?add=1). The old
 * /nutrition/meals and /nutrition/meals/grocery pages render this screen on Week and Market with
 * their params intact. Everything is per-user and per-timezone, so it renders after mount.
 */
export function NutritionScreen({ tab: forced }: { tab?: FuelTab }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <div className="mx-auto max-w-col min-h-[60dvh]" aria-busy="true" />;
  return <Screen forced={forced} />;
}

const noop = () => () => {};

function Screen({ forced }: { forced?: FuelTab }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = useToday();
  const tab: FuelTab = (pathname === "/nutrition" ? fuelTabOf(params.get("tab")) : null) ?? forced ?? "today";

  const setTab = (t: FuelTab) => {
    if (t === tab) return;
    // Today keeps the day being looked at; Week and Market start fresh
    const date = params.get("date");
    const href = t === "today" ? (date ? `/nutrition?date=${date}` : "/nutrition") : `/nutrition?tab=${t}`;
    // On /nutrition only the query changes: swap it in place (no server round trip, so the tabs
    // keep working offline in the kitchen or the store). The old /nutrition/meals URLs navigate.
    // State must be null: Next.js skips syncing useSearchParams for a state carrying its own __NA.
    if (pathname === "/nutrition") window.history.replaceState(null, "", href);
    else router.replace(href, { scroll: false });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-col">
      <TabHeader eyebrow="Fuel" oracle={{ kind: "fuel", label: tab === "today" ? "Today's food" : tab === "week" ? "This week's meals" : "The market list" }} />
      <Segmented<FuelTab>
        value={tab}
        onChange={setTab}
        ariaLabel="Fuel"
        className="mb-6"
        options={[
          { value: "today", label: "Today" },
          { value: "week", label: "Week" },
          { value: "market", label: "Market" },
        ]}
      />
      {tab === "today" ? <TodayTab today={today} /> : tab === "week" ? <WeekPlanner /> : <GroceryScreen />}
    </div>
  );
}

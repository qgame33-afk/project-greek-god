"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { GroceryScreen } from "@/components/meals/grocery/GroceryScreen";
import { FoodScreen } from "./food/FoodScreen";

export type FuelTab = "today" | "week" | "market";
const TABS: FuelTab[] = ["today", "week", "market"];

export function fuelTabOf(v: string | null | undefined): FuelTab | null {
  return TABS.includes(v as FuelTab) ? (v as FuelTab) : null;
}

/**
 * /nutrition and /nutrition/meals (docs/DESIGN-V3-SIMPLE.md §3.7): Food. The old segments are
 * gone; their URLs still land: `?tab=today` is Food, `?tab=week` is Food scrolled to "This week",
 * `?tab=market` is the grocery list (in place, so it opens with no signal in the store).
 * Everything is per-user and per-timezone, so it renders after mount.
 */
export function NutritionScreen({ tab: forced }: { tab?: FuelTab }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <div className="mx-auto max-w-col min-h-[60dvh]" aria-busy="true" />;
  return <Screen forced={forced} />;
}

const noop = () => () => {};

function Screen({ forced }: { forced?: FuelTab }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const tab: FuelTab = (pathname === "/nutrition" ? fuelTabOf(params.get("tab")) : null) ?? forced ?? "today";
  return tab === "market" ? <GroceryScreen /> : <FoodScreen />;
}

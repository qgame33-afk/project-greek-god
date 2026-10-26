"use client";

import { createContext, useContext } from "react";
import type { Measurement } from "@/lib/data/body";
import type { ISODate } from "@/lib/dates";

/** Progress's three segments (docs/DESIGN-V3-SIMPLE.md §4.5). */
export type ProgressTab = "weight" | "strength" | "body";
/** A block inside a segment that an old URL points at (scrolled to on arrival). */
export type ProgressSection = "photos" | "measurements" | null;

export const TABS: { key: ProgressTab; label: string }[] = [
  { key: "weight", label: "Weight" },
  { key: "strength", label: "Strength" },
  { key: "body", label: "Body" },
];

/**
 * Every Progress URL keeps working (§3.7): weight|mountain|roadmap → Weight; strength|hall and the
 * retired athletic tab → Strength (no error); body|photos|gallery → Body, with the photos or the
 * measurements in view. Anything else lands on Weight.
 */
export function tabFromParam(v: string | null): { tab: ProgressTab; section: ProgressSection } {
  switch (v) {
    case "strength":
    case "hall":
    case "athletic":
      return { tab: "strength", section: null };
    case "body":
    case "gallery":
      return { tab: "body", section: null };
    case "photos":
      return { tab: "body", section: "photos" };
    case "measurements":
      return { tab: "body", section: "measurements" };
    default:
      return { tab: "weight", section: null };
  }
}

export interface ProgressActions {
  /** Open the weigh-in sheet (optionally for an existing day). */
  logWeight: (date?: ISODate) => void;
  /** Open the measurement sheet: a new entry, or edit an existing one. */
  logMeasurements: (entry?: Measurement | null) => void;
  logPhoto: () => void;
  goTab: (tab: ProgressTab) => void;
}

const Ctx = createContext<ProgressActions | null>(null);
export const ProgressActionsProvider = Ctx.Provider;

export function useProgressActions(): ProgressActions {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProgressActions must be used inside the Progress screen");
  return v;
}

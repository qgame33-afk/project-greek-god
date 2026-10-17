"use client";

import { createContext, useContext } from "react";
import type { Measurement } from "@/lib/data/body";
import type { ISODate } from "@/lib/dates";
import type { TestType } from "@/lib/progress/athletic";

/** Ascent's three segments (docs/DESIGN-V2.md §3.6). */
export type AscentTab = "mountain" | "hall" | "gallery";
/** A section inside a segment that an old URL points at (scrolled to on arrival). */
export type AscentSection = "chronicles" | "strength" | "athletic" | "photos" | "measurements" | null;

export const TABS: { key: AscentTab; label: string }[] = [
  { key: "mountain", label: "Mountain" },
  { key: "hall", label: "Hall" },
  { key: "gallery", label: "Gallery" },
];

/**
 * Every Progress URL keeps working (§2.3): ?tab=weight|roadmap → Mountain (roadmap scrolls to the
 * Chronicles), strength|athletic → Hall, body|photos → Gallery, each with its section in view.
 */
export function tabFromParam(v: string | null): { tab: AscentTab; section: AscentSection } {
  switch (v) {
    case "hall":
      return { tab: "hall", section: null };
    case "gallery":
      return { tab: "gallery", section: null };
    case "roadmap":
      return { tab: "mountain", section: "chronicles" };
    case "strength":
      return { tab: "hall", section: "strength" };
    case "athletic":
      return { tab: "hall", section: "athletic" };
    case "body":
      return { tab: "gallery", section: "measurements" };
    case "photos":
      return { tab: "gallery", section: "photos" };
    default:
      return { tab: "mountain", section: null };
  }
}

export interface ProgressActions {
  /** Open the weigh-in sheet (optionally for an existing day). */
  logWeight: (date?: ISODate) => void;
  /** Open the measurement sheet — new entry, or edit an existing one. */
  logMeasurements: (entry?: Measurement | null) => void;
  logPhoto: () => void;
  logAthletic: (type?: TestType) => void;
  goTab: (tab: AscentTab) => void;
}

const Ctx = createContext<ProgressActions | null>(null);
export const ProgressActionsProvider = Ctx.Provider;

export function useProgressActions(): ProgressActions {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProgressActions must be used inside the Ascent screen");
  return v;
}

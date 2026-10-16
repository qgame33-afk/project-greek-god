"use client";

import { createContext, useContext } from "react";
import type { Measurement } from "@/lib/data/body";
import type { ISODate } from "@/lib/dates";
import type { TestType } from "@/lib/progress/athletic";

export type ProgressTab = "weight" | "body" | "photos" | "strength" | "athletic" | "roadmap";

export const TABS: { key: ProgressTab; label: string }[] = [
  { key: "weight", label: "Weight" },
  { key: "body", label: "Body" },
  { key: "photos", label: "Photos" },
  { key: "strength", label: "Strength" },
  { key: "athletic", label: "Athletic" },
  { key: "roadmap", label: "Roadmap" },
];

export const isTab = (v: unknown): v is ProgressTab => TABS.some((t) => t.key === v);

export interface ProgressActions {
  /** Open the weigh-in sheet (optionally for an existing day). */
  logWeight: (date?: ISODate) => void;
  /** Open the measurement sheet — new entry, or edit an existing one. */
  logMeasurements: (entry?: Measurement | null) => void;
  logPhoto: () => void;
  logAthletic: (type?: TestType) => void;
  goTab: (tab: ProgressTab) => void;
}

const Ctx = createContext<ProgressActions | null>(null);
export const ProgressActionsProvider = Ctx.Provider;

export function useProgressActions(): ProgressActions {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProgressActions must be used inside ProgressScreen");
  return v;
}

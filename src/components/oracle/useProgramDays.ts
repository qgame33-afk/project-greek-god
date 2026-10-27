"use client";

import { useMemo } from "react";
import { useTemplates } from "@/lib/data/training";
import { templateLabels } from "@/lib/training/programs";
import type { DayFamily } from "@/lib/training/types";
import type { ProgramDays } from "./context";

/**
 * The active program's day names for Coach's suggested questions, read through PROGRAM's interface
 * (useTemplates + templateLabels, `short`). A family the active program doesn't have gives null.
 */
export function useProgramDays(): ProgramDays {
  const { templates } = useTemplates();
  return useMemo(() => {
    const name = (family: DayFamily) => {
      const t = templates.find((x) => templateLabels(x).family === family);
      return t ? templateLabels(t).short : null;
    };
    return { arms: name("shoulders_arms"), chest: name("chest_back") };
  }, [templates]);
}

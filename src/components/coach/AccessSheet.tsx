"use client";

import { useId } from "react";
import { ListGroup } from "@/components/ui/list";
import { Switch } from "@/components/ui/controls";
import { CATEGORY_META, normalizeAccess } from "@/lib/coach/access";
import type { CoachAccess, CoachCategory } from "@/lib/coach/types";
import { isOffline } from "@/lib/data/core";
import { useSaveProfile, type Profile } from "@/lib/data/profile";
import { toast } from "sonner";

const ORDER: CoachCategory[] = ["profile", "training", "nutrition", "bodyweight", "recovery", "measurements"];

/**
 * Settings › Coach data (docs/DESIGN-V3-SIMPLE.md §4.9): what the AI can read, one switch per kind
 * of data, saved to profiles.coach_access. Turned-off data is never read or sent.
 */
export function CoachDataList({ profile }: { profile: Profile }) {
  const save = useSaveProfile();
  const id = useId();
  const access = normalizeAccess(profile.coach_access);
  const toggle = (k: CoachCategory, v: boolean) => {
    if (isOffline()) {
      toast.error("You're offline", { description: "Nothing changed. Try again once you're back online." });
      return;
    }
    // merge over the latest cached value so quick taps never undo each other
    const next: CoachAccess = { ...normalizeAccess(profile.coach_access), [k]: v };
    save.mutate({ values: { coach_access: next as unknown as Profile["coach_access"] }, reason: "Coach data" });
  };
  return (
    <ListGroup ariaLabel="What the AI can read">
      {ORDER.map((k) => (
        <div key={k} className="flex min-h-[68px] items-center gap-4 px-4 py-3">
          <label htmlFor={`${id}-${k}`} className="min-w-0 flex-1 cursor-pointer">
            <span className="t-row block">{CATEGORY_META[k].label}</span>
            <span className="t-label mt-0.5 block">{CATEGORY_META[k].description}</span>
          </label>
          <Switch id={`${id}-${k}`} checked={access[k]} onCheckedChange={(v) => toggle(k, v)} label={`Let the AI read ${CATEGORY_META[k].label.toLowerCase()}`} />
        </div>
      ))}
    </ListGroup>
  );
}

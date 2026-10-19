"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useRevertProfileChange } from "@/lib/coach/hooks";
import { isOffline, must, sb, type Update } from "@/lib/data/core";
import { useProfile, useSaveProfile, type Profile } from "@/lib/data/profile";
import { OFFLINE_NOTE, blockedOffline } from "./offline";
import { writtenRowIds, type GoalChangeRow } from "./written";

type Values = Update<"profiles">;

/**
 * Save profile fields through useSaveProfile (optimistic, rolls back on failure, records
 * goal_changes) with a double-submit guard, an inline error the sheet can show while keeping
 * the user's input, and an Undo toast that restores the previous values. Undo means "it never
 * happened": it also takes out the goal history rows the save wrote, so an undone calorie change
 * doesn't restart the calorie rule's wait or leave two entries in the history.
 */
export function useCommit({ inline = true }: { /** the caller renders `error` (e.g. in an EditSheet); else failures toast */ inline?: boolean } = {}) {
  const { profile } = useProfile();
  const save = useSaveProfile();
  const revert = useRevertProfileChange();
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const commit = (
    values: Values,
    opts: { message?: string; undo?: boolean; reason?: string; onDone?: () => void; quiet?: boolean; /** false for idempotent toggles that may fire in quick succession */ guard?: boolean } = {},
  ) => {
    const guard = opts.guard !== false;
    if (guard && busy.current) return;
    // offline: say so at once (a paused save would spin until the connection came back)
    if (isOffline()) {
      if (inline) setError(OFFLINE_NOTE);
      else blockedOffline();
      return;
    }
    if (guard) busy.current = true;
    setError(null);
    const prev = snapshot(profile, values);
    save.mutate(
      { values, reason: opts.reason?.trim() || undefined, quiet: inline },
      {
        onSuccess: () => {
          opts.onDone?.();
          if (opts.message && !opts.quiet) {
            toast.success(opts.message, {
              duration: opts.undo === false ? 4000 : 6000,
              action:
                opts.undo === false || !prev
                  ? undefined
                  : {
                      label: "Undo",
                      onClick: () =>
                        void writtenRows(values, prev)
                          .catch(() => [])
                          .then((goalChangeIds) =>
                            revert.mutate({ values: prev as Record<string, number | string>, goalChangeIds }, { onSuccess: () => toast("Change undone") }),
                          ),
                    },
            });
          }
        },
        onError: (e: Error) => setError(`Couldn't save. Your entry is kept. ${e.message}`),
        onSettled: () => {
          if (guard) busy.current = false;
        },
      },
    );
  };

  return { commit, pending: save.isPending, error, clearError: () => setError(null) };
}

function snapshot(profile: Profile | null | undefined, values: Values): Values | null {
  if (!profile) return null;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(values)) out[k] = (profile as Record<string, unknown>)[k];
  return out as Values;
}

/** The goal_changes rows a save just wrote (newest rows per field, matched by writtenRowIds). */
async function writtenRows(values: Values, prev: Values): Promise<string[]> {
  const fields = Object.keys(values);
  const rows = must(
    await sb().from("goal_changes").select("id, field, old_value, new_value").in("field", fields).order("changed_at", { ascending: false }).limit(fields.length * 4),
  ) as GoalChangeRow[];
  return writtenRowIds(rows, values as Record<string, unknown>, prev as Record<string, unknown>);
}

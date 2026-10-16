"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Update } from "@/lib/data/core";
import { useProfile, useSaveProfile, type Profile } from "@/lib/data/profile";

type Values = Update<"profiles">;

/**
 * Save profile fields through useSaveProfile (optimistic, rolls back on failure, records
 * goal_changes) with a double-submit guard, an inline error the sheet can show while keeping
 * the user's input, and an Undo toast that restores the previous values.
 */
export function useCommit({ inline = true }: { /** the caller renders `error` (e.g. in an EditSheet); else failures toast */ inline?: boolean } = {}) {
  const { profile } = useProfile();
  const save = useSaveProfile();
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const commit = (
    values: Values,
    opts: { message?: string; undo?: boolean; reason?: string; onDone?: () => void; quiet?: boolean; /** false for idempotent toggles that may fire in quick succession */ guard?: boolean } = {},
  ) => {
    const guard = opts.guard !== false;
    if (guard && busy.current) return;
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
                  : { label: "Undo", onClick: () => save.mutate({ values: prev, reason: "Undo" }, { onSuccess: () => toast("Change undone") }) },
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

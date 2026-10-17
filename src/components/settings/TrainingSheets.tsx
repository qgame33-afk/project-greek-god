"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import type { Profile } from "@/lib/data/profile";
import { EditSheet } from "./EditSheet";
import { useCommit } from "./useCommit";
import { useResetOnOpen } from "./useResetOnOpen";

type SheetProps = { open: boolean; onOpenChange: (o: boolean) => void; profile: Profile };

/** Every IANA zone the browser knows, with the detected one first. */
export function useTimezones() {
  return useMemo(() => {
    let detected = "UTC";
    let all: string[] = [];
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
      /* very old browser */
    }
    if (!all.length) all = [detected, "UTC"];
    if (!all.includes(detected)) all = [detected, ...all];
    return { detected, all };
  }, []);
}

export function TimezoneSheet({ open, onOpenChange, profile }: SheetProps) {
  const { commit, pending, error, clearError } = useCommit();
  const { detected, all } = useTimezones();
  const [tz, setTz] = useState(profile.timezone);
  useResetOnOpen(open, () => {
    setTz(profile.timezone);
    clearError();
  });
  const options = all.includes(tz) ? all : [tz, ...all];
  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Time zone"
      description="Used for reminders and to decide which day a late log belongs to."
      canSave={tz !== profile.timezone}
      pending={pending}
      error={error}
      onSave={() => commit({ timezone: tz }, { message: `Time zone ${tz.replace(/_/g, " ")}`, onDone: () => onOpenChange(false) })}
    >
      <div className="grid grid-cols-1 gap-3 pb-2">
        <Field label="Time zone">
          {(id) => (
            <Select id={id} value={tz} onChange={(e) => setTz(e.target.value)}>
              {options.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {detected !== tz && (
          <Button variant="secondary" block onClick={() => setTz(detected)}>
            Use this device&apos;s zone · {detected.replace(/_/g, " ")}
          </Button>
        )}
      </div>
    </EditSheet>
  );
}

"use client";

import { ChevronDown, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { Switch } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { CATEGORY_META, accessChipLabel, accessChipParts, normalizeAccess } from "@/lib/coach/access";
import type { CoachAccess, CoachCategory } from "@/lib/coach/types";
import { useSaveProfile, type Profile } from "@/lib/data/profile";
import { cn } from "@/lib/cn";

const ORDER: CoachCategory[] = ["training", "nutrition", "recovery", "bodyweight", "measurements", "profile"];

/** "Using: Training · Nutrition · Recovery · Weight" — opens the privacy toggles (profile.coach_access). */
export function AccessChip({ profile, className }: { profile: Profile | undefined; className?: string }) {
  const [open, setOpen] = useState(false);
  const access = normalizeAccess(profile?.coach_access);
  const parts = accessChipParts(access);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!profile}
        aria-haspopup="dialog"
        aria-label={profile ? `${accessChipLabel(access)}. Change what the Oracle can see` : "What the Oracle can see"}
        className={cn(
          "press t-meta inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full px-3.5 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory disabled:opacity-50",
          className,
        )}
      >
        <ShieldCheck className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
        <span className="truncate">{profile ? parts.text : "Using: …"}</span>
        {profile && parts.more > 0 && <span className="tnum shrink-0 rounded-full bg-m4 px-1.5 font-semibold text-ivory">+{parts.more}</span>}
        <ChevronDown className="size-3.5 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
      </button>
      <AccessSheet open={open} onOpenChange={setOpen} profile={profile} access={access} />
    </>
  );
}

function AccessSheet({ open, onOpenChange, profile, access }: { open: boolean; onOpenChange: (o: boolean) => void; profile: Profile | undefined; access: CoachAccess }) {
  const save = useSaveProfile();
  const id = useId();
  const toggle = (k: CoachCategory, v: boolean) => {
    if (!profile) return;
    // merge over the latest cached value so quick taps never undo each other
    const next: CoachAccess = { ...normalizeAccess(profile.coach_access), [k]: v };
    save.mutate({ values: { coach_access: next as unknown as Profile["coach_access"] }, reason: "Coach data access" });
  };
  const on = ORDER.filter((k) => access[k]).length;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="What the Oracle can see" description={`${on} of ${ORDER.length} shared. Saved to your account.`}>
      <ul className="divide-y divide-vein border-y border-vein">
        {ORDER.map((k) => (
          <li key={k} className="flex min-h-[4.25rem] items-center gap-4 py-2.5">
            <label htmlFor={`${id}-${k}`} className="min-w-0 flex-1 cursor-pointer">
              <span className="t-title-3 block text-ivory">{CATEGORY_META[k].label}</span>
              <span className="t-meta mt-0.5 block text-stone">{CATEGORY_META[k].description}</span>
            </label>
            <Switch id={`${id}-${k}`} checked={access[k]} onCheckedChange={(v) => toggle(k, v)} label={`Share ${CATEGORY_META[k].label.toLowerCase()} with the Oracle`} />
          </li>
        ))}
      </ul>
      <div className="t-meta mt-4 space-y-1.5 text-stone">
        <p>Turned-off data is never read or sent to the AI. The Oracle says when it can&apos;t see something instead of guessing.</p>
        <p>Your logs stay private either way. Changes apply to your next question.</p>
      </div>
    </Sheet>
  );
}

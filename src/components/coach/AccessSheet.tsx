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
        aria-label={profile ? `${accessChipLabel(access)}. Change what Coach can see` : "What Coach can see"}
        className={cn("group -my-1 inline-flex h-11 max-w-full items-center disabled:opacity-50", className)}
      >
        <span className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border border-line bg-s2 pl-3 pr-2 text-[12.5px] font-medium text-fg-2 sm:pl-2.5 sm:text-[13px] transition-colors group-hover:border-line-strong group-hover:text-fg">
          <ShieldCheck className="hidden size-[15px] shrink-0 text-gold-300 sm:block" aria-hidden />
          <span className="truncate">{profile ? parts.text : "Using: …"}</span>
          {profile && parts.more > 0 && <span className="shrink-0 rounded-full bg-s4 px-1.5 text-[11.5px] font-bold leading-[18px] text-fg-2">+{parts.more}</span>}
          <ChevronDown className="size-3.5 shrink-0 text-fg-3" aria-hidden />
        </span>
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
    <Sheet open={open} onOpenChange={onOpenChange} title="What Coach can see" description={`${on} of ${ORDER.length} shared. Saved to your account.`}>
      <ul className="-mx-1 divide-y divide-line-hair">
        {ORDER.map((k) => (
          <li key={k} className="flex min-h-[68px] items-center gap-4 px-1 py-2.5">
            <label htmlFor={`${id}-${k}`} className="min-w-0 flex-1 cursor-pointer">
              <span className="block text-[15px] font-semibold text-fg">{CATEGORY_META[k].label}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-fg-2">{CATEGORY_META[k].description}</span>
            </label>
            <Switch id={`${id}-${k}`} checked={access[k]} onCheckedChange={(v) => toggle(k, v)} label={`Share ${CATEGORY_META[k].label.toLowerCase()} with Coach`} />
          </li>
        ))}
      </ul>
      <div className="card-inset mt-3 space-y-1.5 px-3.5 py-3 text-[13px] leading-relaxed text-fg-2">
        <p>Turned-off data is never read or sent to the AI. Coach will say when it can&apos;t see something instead of guessing.</p>
        <p>Your logs stay private either way. Changes apply to your next question.</p>
      </div>
    </Sheet>
  );
}

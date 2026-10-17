"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useProfile, useSaveProfile } from "@/lib/data/profile";
import { monthName, type ISODate } from "@/lib/dates";
import type { Json } from "@/lib/supabase/database.types";
import { defaultMilestone, monthsBetween, parseRoadmap, removeOverride, upsertOverride } from "@/lib/progress/months";

export interface MilestoneEntry {
  month: ISODate;
  offset: number;
  title: string;
  detail: string;
  custom: boolean;
}

/**
 * Edit a month's milestone (the old Roadmap's editor, unchanged behaviour): saves into
 * profile.roadmap through useSaveProfile; text identical to the built-in milestone is not a
 * customisation; "Reset to original" removes the override.
 */
export function MilestoneSheet({ entry, total, onClose }: { entry: MilestoneEntry | null; total: number; onClose: () => void }) {
  const { profile } = useProfile();
  const save = useSaveProfile();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  // Keep the last entry while the sheet animates closed; start from the saved text on every open.
  const [shown, setShown] = useState<MilestoneEntry | null>(entry);
  const [openFor, setOpenFor] = useState<string | null>(null);
  if (entry && openFor !== entry.month) {
    setOpenFor(entry.month);
    setShown(entry);
    setTitle(entry.title);
    setDetail(entry.detail);
  } else if (!entry && openFor) setOpenFor(null);
  const e = entry ?? shown;
  if (!e) return null;
  const def = defaultMilestone(e.offset, total);
  const list = parseRoadmap(profile?.roadmap);

  const commit = (next: ReturnType<typeof parseRoadmap>) => {
    if (save.isPending) return;
    save.mutate({ values: { roadmap: next as unknown as NonNullable<Json> } }, { onSuccess: () => onClose() });
  };
  const saveText = () => {
    const t = title.trim().slice(0, 80);
    const d = detail.trim().slice(0, 400);
    if (!e.custom && t === e.title && d === e.detail) return onClose();
    if (def && t === def.title && d === def.detail) return commit(removeOverride(list, e.offset));
    commit(upsertOverride(list, { offset: e.offset, title: t, detail: d }));
  };

  return (
    <Sheet
      open={!!entry}
      onOpenChange={(o) => !o && onClose()}
      title={`${monthName(e.month)} ${e.month.slice(0, 4)}`}
      description="Your milestone for this month."
      footer={
        <Button variant="primary" size="lg" block loading={save.isPending} disabled={!title.trim() && !detail.trim()} onClick={saveText}>
          Save milestone
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 py-2">
        <Field label="Title">{(id) => <Input id={id} value={title} maxLength={80} onChange={(ev) => setTitle(ev.target.value)} placeholder="e.g. First progress review" autoComplete="off" />}</Field>
        <Field label="Detail" hint={`${detail.length}/400`}>
          {(id) => <Textarea id={id} rows={3} maxLength={400} value={detail} onChange={(ev) => setDetail(ev.target.value)} placeholder="What this month is for" />}
        </Field>
        {def && (
          <div className="rounded-field bg-m1 p-3.5 shadow-[inset_0_0_0_1px_var(--vein-2)]">
            <p className="t-eyebrow mb-1">Original plan</p>
            <p className="t-title-3 text-ivory">{def.title}</p>
            <p className="t-callout text-stone">{def.detail}</p>
          </div>
        )}
        {e.custom && (
          <Button variant="ghost" size="sm" className="justify-self-center" onClick={() => commit(removeOverride(list, e.offset))} disabled={save.isPending}>
            Reset to original
          </Button>
        )}
        <p className="t-meta text-stone">
          Months run {monthsBetween(profile?.start_date ?? e.month, profile?.target_date ?? e.month).length} in total, from your start date to your target date (Settings).
        </p>
      </div>
    </Sheet>
  );
}

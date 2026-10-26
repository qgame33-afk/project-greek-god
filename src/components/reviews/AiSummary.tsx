"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { AiChip } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { useToday } from "@/lib/data/core";
import { aiDigest, type Priority, type ReviewStats } from "@/lib/reviews/compute";
import { useAISummary, useSaveReview, useSaveSummary, type SavedReview } from "@/lib/reviews/hooks";
import type { WeightUnit } from "@/lib/units";

const savedAtLabel = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The month's optional written summary (docs/DESIGN-V3-SIMPLE.md §4.5.6, law 5): drafted by AI
 * from the recap's numbers only, shown in an AI card ("AI · Not saved yet") and saved only when he
 * taps "Keep summary". A kept summary keeps its AI label; Rewrite and Remove stay one tap away.
 * Without an AI key on the server it says so plainly and nothing else changes.
 */
export function AiSummary({ stats, priorities, savedRow, stale, unit }: { stats: ReviewStats; priorities: Priority[]; savedRow: SavedReview | null; stale: boolean; unit: WeightUnit }) {
  const today = useToday();
  const status = useQuery({
    queryKey: ["ai-review-status"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch("/api/ai/review");
      if (!r.ok) return { configured: false };
      return (await r.json()) as { configured: boolean };
    },
  });
  const ai = useAISummary();
  const { save } = useSaveReview();
  const summaryOnly = useSaveSummary();
  const [draft, setDraft] = useState<string | null>(null);
  const configured = status.data?.configured ?? false;
  const summary = savedRow?.summary ?? null;
  const optimistic = savedRow?.id === "optimistic";
  const busy = save.isPending || summaryOnly.isPending;

  const write = () => {
    if (ai.isPending) return;
    ai.mutate({ month: stats.month.slice(0, 7), localDate: today, digest: aiDigest(stats, priorities, unit) }, { onSuccess: (r) => setDraft(r.summary) });
  };
  // The draft describes the live numbers. Keeping it never leaves a summary next to numbers it
  // wasn't written from: with no snapshot (or a stale one) the snapshot is saved with today's
  // numbers too; with an up-to-date snapshot only the summary changes.
  const accept = () => {
    if (!draft || busy || optimistic) return;
    const done = { onSuccess: () => setDraft(null) };
    if (savedRow && !stale) summaryOnly.mutate({ row: savedRow, summary: draft, toast: "Summary kept" }, done);
    else save.mutate({ month: stats.month, stats, priorities, summary: draft, toast: savedRow ? "Summary kept · numbers updated to today's" : "Summary kept" }, done);
  };
  const remove = () => {
    if (!savedRow || busy || optimistic) return;
    summaryOnly.mutate({ row: savedRow, summary: null, toast: "Summary removed" });
  };

  return (
    <div data-print={summary && !draft ? undefined : "hide"}>
      {draft ? (
        <section className="rounded-tile-lg border border-ai-line bg-surface p-4" aria-live="polite" data-ai-card="">
          <AiChip label="AI" unsaved />
          <p className="t-body mt-3 whitespace-pre-line" data-ai-answer="" data-budget-group="">
            {draft}
          </p>
          <p className="t-cap mt-2">Written by AI from this month&apos;s numbers only. Read it before you keep it.</p>
          <div className="mt-4 grid gap-2" data-print="hide">
            <Button variant="primary" block onClick={accept} loading={busy} disabled={optimistic}>
              Keep summary
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={write} loading={ai.isPending} disabled={busy}>
                <RotateCcw aria-hidden />
                Rewrite
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                Discard
              </Button>
            </div>
          </div>
        </section>
      ) : summary ? (
        <section className="rounded-tile-lg border border-ai-line bg-surface p-4">
          <AiChip label="AI" />
          <p className="t-body mt-3 whitespace-pre-line" data-ai-answer="" data-budget-group="">
            {summary}
          </p>
          {stale && savedRow && <p className="t-cap mt-2">Written {savedAtLabel(savedRow.generated_at)}. Your logs changed since, so a few numbers may differ.</p>}
          <div className="mt-3 flex flex-wrap gap-2" data-print="hide">
            <Button variant="secondary" size="sm" onClick={write} loading={ai.isPending} disabled={!configured || busy}>
              Rewrite
            </Button>
            <Button variant="ghost" size="sm" onClick={remove} loading={summaryOnly.isPending} disabled={busy || optimistic}>
              Remove
            </Button>
          </div>
        </section>
      ) : (
        <div data-print="hide">
          <p className="t-label">Optional: a short written summary of this month, drafted by AI from these numbers. Nothing is sent but the numbers, and nothing is saved until you keep it.</p>
          <Button variant="secondary" className="mt-3" onClick={write} loading={ai.isPending} disabled={status.isLoading || !configured}>
            Write a summary with AI
          </Button>
          {!status.isLoading && !configured && <p className="t-cap mt-2">AI isn&apos;t set up yet. It needs an AI key on the server.</p>}
        </div>
      )}
      {ai.error && (
        <ErrorNote className="mt-3" onRetry={ai.error.code === "not_configured" ? undefined : write}>
          {ai.error.message}
        </ErrorNote>
      )}
    </div>
  );
}

"use client";

import { Hourglass, Layers, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Confirm } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import type { MealFeedback } from "@/lib/data/meals";
import { useToday } from "@/lib/data/core";
import { localDateOf, shortDate } from "@/lib/dates";
import { learnPrefs, summarizeLearning, type LearnedFeature } from "@/lib/meals/engine";
import { evidenceText, groupByEvidence, strengthPips, type EvidenceGroup } from "./model";
import { useResetLearning } from "./hooks";

const BLOCK_REASON: Record<"thumbs_down" | "dont_like" | "ate_recently", string> = {
  thumbs_down: "Not for you",
  dont_like: "You didn't like it",
  ate_recently: "Ate it recently",
};

function Pips({ n, tone }: { n: number; tone: "up" | "down" }) {
  return (
    <span className="flex shrink-0 items-end gap-0.5" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn("w-1 rounded-full", i < n ? (tone === "up" ? "bg-ivory" : "bg-stone") : "bg-vein-3")}
          style={{ height: 6 + i * 2.5 }}
        />
      ))}
    </span>
  );
}

function FeatureRow({ g, tone }: { g: EvidenceGroup<LearnedFeature["recipes"][number]>; tone: "up" | "down" }) {
  const n = strengthPips(g.weight);
  const from = g.recipes.map((r) => `${r.name} (${evidenceText(r.events)})`).join(" · ");
  return (
    <li className="flex min-h-14 items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="t-callout font-semibold text-ivory">{g.labels.join(" · ")}</p>
        <p className="t-meta mt-0.5 text-stone">From {from}</p>
      </div>
      <span className="mt-1.5" title={`Strength ${n} of 5`}>
        <span className="sr-only">Strength {n} of 5</span>
        <Pips n={n} tone={tone} />
      </span>
    </li>
  );
}

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <p className="t-callout flex items-center gap-2 font-semibold text-ivory">
        {icon}
        {title}
      </p>
      <ul className="divide-y divide-vein">{children}</ul>
    </div>
  );
}

/**
 * What the planner has learned, straight from the stored feedback (never invented): the
 * strongest likes and dislikes with the meals and actions behind them, the "simpler" lean,
 * and recipes resting after a thumbs down. Reset forgets it all (with Undo).
 */
export function LearnedPanel({ feedback, loading, nameOf }: { feedback: readonly MealFeedback[]; loading: boolean; nameOf: (key: string) => string | undefined }) {
  const summary = useMemo(() => summarizeLearning(learnPrefs(feedback), { nameOf, limit: 5 }), [feedback, nameOf]);
  const reset = useResetLearning();
  const [confirm, setConfirm] = useState(false);
  const nothing = summary.events === 0;
  const learnedAnything = summary.liked.length + summary.disliked.length + summary.blocked.length > 0 || summary.simpler.active;
  const ref = useToday();

  return (
    <section className="min-w-0" aria-labelledby="learned-title">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="learned-title" className="t-eyebrow">
          What the planner has learned
        </h2>
        {!nothing && <span className="t-meta shrink-0 whitespace-nowrap text-stone">From {summary.events} {summary.events === 1 ? "signal" : "signals"}</span>}
      </div>
      <div className="mt-3 border-t border-vein pt-4">

      {loading ? (
        <p className="t-meta text-stone">Loading…</p>
      ) : nothing || !learnedAnything ? (
        <p className="t-callout text-stone">
          {nothing ? "Nothing yet." : "Nothing strong enough to show yet."} Likes, favourites, swaps and the meals you log teach it what you enjoy. Every lean shows here with the meals behind it.
        </p>
      ) : (
        <>
          {summary.liked.length > 0 && (
            <Group icon={<ThumbsUp className="size-4 text-ivory" strokeWidth={1.6} aria-hidden />} title="More of">
              {groupByEvidence(summary.liked).map((g) => (
                <FeatureRow key={g.key} g={g} tone="up" />
              ))}
            </Group>
          )}
          {summary.disliked.length > 0 && (
            <Group icon={<ThumbsDown className="size-4 text-stone" strokeWidth={1.6} aria-hidden />} title="Less of">
              {groupByEvidence(summary.disliked).map((g) => (
                <FeatureRow key={g.key} g={g} tone="down" />
              ))}
            </Group>
          )}
          {summary.simpler.active && (
            <Group icon={<Layers className="size-4 text-stone" strokeWidth={1.6} aria-hidden />} title="Simpler meals">
              <li className="t-meta py-2.5 text-stone">
                Fewer ingredients and steps, because you said {summary.simpler.recipes.map((r) => r.name).join(", ") || "some meals"} {summary.simpler.recipes.length === 1 ? "was" : "were"} too complicated.
              </li>
            </Group>
          )}
          {summary.blocked.length > 0 && (
            <Group icon={<Hourglass className="size-4 text-stone" strokeWidth={1.6} aria-hidden />} title="Resting">
              {summary.blocked.slice(0, 6).map((b) => (
                <li key={b.recipe_key} className="flex min-h-14 flex-wrap items-baseline justify-between gap-x-3 py-2.5">
                  <span className="min-w-0">
                    <span className="t-callout block font-semibold text-ivory">{b.name}</span>
                    <span className="t-meta block text-stone">{BLOCK_REASON[b.reason]}</span>
                  </span>
                  <span className="t-meta shrink-0 text-stone">until {shortDate(localDateOf(b.until), ref)}</span>
                </li>
              ))}
            </Group>
          )}
        </>
      )}

      {!nothing && (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          disabled={reset.isPending}
          className="press t-callout -ml-1 mt-4 inline-flex h-11 items-center gap-2 rounded-field px-1 font-semibold text-stone hover:text-ivory disabled:opacity-50"
        >
          <RotateCcw className="size-4" strokeWidth={1.6} aria-hidden />
          Reset what it learned
        </button>
      )}
      </div>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Reset what the planner learned?"
        body="It forgets every like, swap and reason, and plans like it's new to you. Your preferences, dislikes and favourites stay. You can undo it."
        confirmLabel="Reset"
        onConfirm={() => reset.mutate()}
      />
    </section>
  );
}

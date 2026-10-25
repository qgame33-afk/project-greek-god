"use client";

import { ListGroup, Row } from "@/components/ui/list";
import { useToday } from "@/lib/data/core";
import { localDateOf, shortDate } from "@/lib/dates";
import type { LearnedSummary } from "@/lib/meals/engine";
import { evidenceText, groupByEvidence, strengthPips } from "./model";

const BLOCK_REASON: Record<"thumbs_down" | "dont_like" | "ate_recently", string> = {
  thumbs_down: "Not this again",
  dont_like: "You didn't like it",
  ate_recently: "Ate it recently",
};

/**
 * What the planner learned, straight from the stored feedback (never invented): for "More often"
 * the strongest likes with the meals and actions behind them; for "Less often" the dislikes, the
 * "simpler" lean and the meals resting after a "Not this again".
 */
export function LearnedDetail({ summary, side }: { summary: LearnedSummary; side: "more" | "less" }) {
  const ref = useToday();
  const features = side === "more" ? summary.liked : summary.disliked;
  const groups = groupByEvidence(features);
  const empty = !groups.length && (side === "more" || (!summary.simpler.active && !summary.blocked.length));
  if (empty) return <p className="t-body text-fg-2">Nothing strong enough to show yet.</p>;
  return (
    <div className="flex flex-col gap-5" data-food="">
      {groups.length > 0 && (
        <ListGroup>
          {groups.map((g) => (
            <Row
              key={g.key}
              title={g.labels.join(" · ")}
              subtitle={`From ${g.recipes.map((r) => `${r.name} (${evidenceText(r.events)})`).join(" · ")}`}
              value={`${strengthPips(g.weight)} of 5`}
              wrap
            />
          ))}
        </ListGroup>
      )}
      {side === "less" && summary.simpler.active && (
        <ListGroup>
          <Row
            title="Simpler meals"
            subtitle={`Fewer ingredients and steps, because you said ${summary.simpler.recipes.map((r) => r.name).join(", ") || "some meals"} ${summary.simpler.recipes.length === 1 ? "was" : "were"} too complicated.`}
            wrap
          />
        </ListGroup>
      )}
      {side === "less" && summary.blocked.length > 0 && (
        <section aria-label="Resting">
          <p className="t-section mb-3">Resting</p>
          <ListGroup>
            {summary.blocked.slice(0, 8).map((b) => (
              <Row key={b.recipe_key} title={b.name} subtitle={BLOCK_REASON[b.reason]} value={`until ${shortDate(localDateOf(b.until), ref)}`} wrap />
            ))}
          </ListGroup>
        </section>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePlanWeek, weekSpan, type GenerateKind } from "@/components/meals/week/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatInt } from "@/lib/units";

export interface PlanRequest {
  /** 0 = this week, 1 = next week. */
  offset: 0 | 1;
  kind: GenerateKind;
}

/**
 * The plan-week confirm (docs/DESIGN-V3-SIMPLE.md §4.4.1): what the planner will do, in one or two
 * sentences, and one gold button. `first` plans an empty week (from today on mid-week, with "Plan
 * the whole week instead"), `again` replaces everything except locked and eaten meals, `fill`
 * plans the days before today too. The engine and the save are the planner's own (usePlanWeek).
 */
export function PlanWeekSheet({ request, open, onOpenChange, onDone }: { request: PlanRequest; open: boolean; onOpenChange: (o: boolean) => void; onDone?: () => void }) {
  const { data, generate, generating, midWeek, ws } = usePlanWeek(request.offset);
  const { kind, offset } = request;
  const week = offset === 0 ? "this week" : "next week";
  const goals = data.goals;
  const locked = data.meals.filter((m) => m.locked).length;
  const eaten = data.meals.filter((m) => data.loggedIds.includes(m.id)).length;
  const keeps = [locked ? `${locked} locked` : "", eaten ? `${eaten} already eaten` : ""].filter(Boolean).join(" and ");
  const loading = !data.ready && !data.error;

  const run = async (whole = false) => {
    const ok = await generate(kind, whole);
    if (ok) {
      onOpenChange(false);
      onDone?.();
    }
  };

  const title = kind === "again" ? `Plan ${week} again?` : kind === "fill" ? `Plan ${midWeek?.earlier ?? "the earlier days"} too?` : offset === 0 ? "Plan this week" : "Plan next week";
  const action = kind === "again" ? "Plan again" : kind === "fill" ? "Plan them" : offset === 0 ? "Plan my week" : "Plan next week";

  const body = !data.hasGoals ? (
    <p className="t-body text-fg-2">
      The planner sizes meals to your calorie and protein goals. Set them first in{" "}
      <Link href="/settings?section=goals" className="font-semibold text-fg underline underline-offset-4">
        Settings › Goals
      </Link>
      .
    </p>
  ) : kind === "again" ? (
    <p className="t-body text-fg-2">
      Every meal {midWeek ? "from today on " : ""}gets a new pick{keeps ? `, except ${keeps}` : ""}. You can undo it.
    </p>
  ) : kind === "fill" ? (
    <p className="t-body text-fg-2">It plans {midWeek?.earlier ?? "the days before today"} and keeps every meal already planned.</p>
  ) : (
    <p className="t-body text-fg-2">
      {weekSpan(ws)}. Easy meals sized to {goals ? `${formatInt(goals.kcal)} kcal and ${Math.round(goals.protein)} g protein` : "your goals"} a day.
      {midWeek ? " It plans today to Sunday." : ""} Nothing goes in your food log until you eat it.
    </p>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !generating && onOpenChange(o)}
      title={title}
      footer={
        data.hasGoals || loading ? (
          <div className="flex flex-col gap-2">
            <Button variant="primary" size="lg" block loading={generating || loading} disabled={!!data.error} onClick={() => void run(false)}>
              {action}
            </Button>
            {kind === "first" && midWeek && (
              <Button variant="ghost" size="md" block disabled={generating || loading} onClick={() => void run(true)}>
                Plan the whole week instead
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="pb-2 pt-1">
        {data.error ? <p className="t-body text-fg-2">Couldn&apos;t load what the planner needs. Check your connection and try again.</p> : body}
      </div>
    </Sheet>
  );
}

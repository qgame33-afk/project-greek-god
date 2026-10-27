"use client";

import { Check, Circle } from "lucide-react";
import { useMemo, useState } from "react";
import { ListGroup, Row, SectionHead } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { useProfile } from "@/lib/data/profile";
import { monthName, type ISODate } from "@/lib/dates";
import { parseRoadmap, roadmapMonths } from "@/lib/progress/months";
import { dayMonth, type Terrace } from "@/lib/progress/pace";
import { planFromProfile } from "@/lib/progress/plan";
import { formatBodyweight, round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { weightWords } from "../kit";
import { MilestoneSheet, type MilestoneEntry } from "./MonthGoalSheet";

/**
 * Milestones (docs/DESIGN-V3-SIMPLE.md §2.2, §4.5.1 item 4): every 2.5 kg (5 lb) from the start weight up
 * to the bottom of the goal range, with the day the 7-day average first reached it, or the day it
 * would at the current pace ("if you keep this pace"), or "—". Below them, a goal for each month
 * of the plan (the old roadmap), each editable.
 */
export function MilestonesSheet({
  open,
  onOpenChange,
  milestones,
  today,
  unit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  milestones: Terrace[];
  today: ISODate;
  unit: WeightUnit;
}) {
  const { profile } = useProfile();
  const [editing, setEditing] = useState<MilestoneEntry | null>(null);
  const plan = planFromProfile(profile, today);
  const overrides = useMemo(() => parseRoadmap(profile?.roadmap), [profile?.roadmap]);
  const months = useMemo(
    () => roadmapMonths({ plan, today, overrides, weights: [], startLabel: formatBodyweight(plan.startLb, unit) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.startDate, plan.targetDate, plan.startLb, plan.goalLb, today, overrides, unit],
  );
  const shown = months.filter((m) => m.status !== "past");
  const plain = (lb: number) => {
    const v = round(toDisplayWeight(lb, unit), 1);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };

  return (
    <>
      <Sheet open={open && !editing} onOpenChange={onOpenChange} title="Milestones">
        {milestones.length === 0 ? (
          <p className="t-body pb-2 text-fg-2">Set your start weight and goal in Settings › Goals and your milestones show here.</p>
        ) : (
          <ListGroup ariaLabel="Weight milestones">
            {milestones.map((m) => (
              <Row
                key={m.lb}
                icon={m.reachedOn ? Check : Circle}
                title={`${plain(m.lb)} ${unit}${m.final ? " · goal range" : ""}`}
                subtitle={m.reachedOn ? `Reached ${dayMonth(m.reachedOn, today)}` : m.eta ? `About ${dayMonth(m.eta, today)} if you keep this pace` : "Not yet"}
                ariaLabel={`${plain(m.lb)} ${weightWords(unit)}${m.final ? ", the bottom of your goal range" : ""}: ${m.reachedOn ? `reached ${dayMonth(m.reachedOn, today, true)}` : m.eta ? `about ${dayMonth(m.eta, today, true)} if you keep this pace` : "not yet"}`}
              />
            ))}
          </ListGroup>
        )}
        {milestones.length > 0 && (
          <p className="t-cap mt-2" data-how="">
            A milestone is reached the first day your 7-day average gets there. Dates ahead carry your last 4 weeks&apos; pace forward.
          </p>
        )}

        {shown.length > 0 && (
          <>
            <SectionHead>Month by month</SectionHead>
            <ListGroup ariaLabel="Goals for each month">
              {shown.map((m) => (
                <Row
                  key={m.month}
                  title={`${monthName(m.month)}${m.status === "current" ? " · this month" : ""}`}
                  subtitle={m.title || "No goal yet"}
                  onClick={() => setEditing({ month: m.month, offset: m.offset, title: m.title, detail: m.detail, custom: m.custom })}
                  ariaLabel={`${monthName(m.month)}: ${m.title || "no goal yet"}. Edit`}
                />
              ))}
            </ListGroup>
          </>
        )}
      </Sheet>
      <MilestoneSheet entry={editing} total={months.length} onClose={() => setEditing(null)} />
    </>
  );
}

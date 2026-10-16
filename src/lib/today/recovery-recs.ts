// Rest-day recommendations: three items built from the programme's Sunday recovery protocol,
// adjusted by the latest check-in and pointed at the next planned session.

import { SUNDAY_RECOVERY } from "@/lib/training/program";
import { fmtHours, type CheckinFacts } from "./daily-line";

export interface Rec {
  key: string;
  label: string;
  detail: string;
}

export interface NextSession {
  name: string;
  /** "Tomorrow" / "Monday" */
  when: string;
  exercises: number;
  minutes: number;
}

const item = (label: string) => SUNDAY_RECOVERY.items.find((i) => i.label.toLowerCase().startsWith(label.toLowerCase()));

export function restDayRecommendations(checkin: CheckinFacts | null, sleepGoalH: number, next: NextSession | null): Rec[] {
  const walk = item("Easy walk");
  const mobility = item("Mobility");
  const sleep = item("Sleep");
  const fuel = item("Hydration");

  const out: Rec[] = [];
  const push = (r: Rec | null | undefined) => {
    if (r && !out.some((o) => o.key === r.key) && out.length < 2) out.push(r);
  };

  const shortNight = checkin?.sleepHours != null && checkin.sleepHours < sleepGoalH - 0.5;
  const sore = (checkin?.soreness ?? 0) >= 4 || (checkin?.fatigue ?? 0) >= 4;

  if (checkin?.pain) {
    push({ key: "pain", label: "Gentle movement only", detail: "You noted pain. Walk and stretch within comfort, and skip anything that aggravates it." });
  }
  if (shortNight && sleep) {
    push({ key: "sleep", label: "Sleep", detail: `Last night was ${fmtHours(checkin!.sleepHours!)} h. Aim for ${fmtHours(sleepGoalH)} h or more tonight.` });
  }
  if (sore && mobility) push({ key: "mobility", label: mobility.label, detail: mobility.detail });
  if (walk) push({ key: "walk", label: walk.label, detail: walk.detail });
  if (mobility) push({ key: "mobility", label: mobility.label, detail: mobility.detail });

  if (next) {
    out.push({
      key: "next",
      label: `Prep for ${next.name}`,
      detail: `${next.when} · ${next.exercises} exercises · ~${next.minutes} min. Eat to target today, rest days count for the gain.`,
    });
  } else if (fuel) {
    out.push({ key: "fuel", label: fuel.label, detail: fuel.detail });
  } else if (sleep) {
    out.push({ key: "sleep", label: sleep.label, detail: sleep.detail });
  }
  return out.slice(0, 3);
}

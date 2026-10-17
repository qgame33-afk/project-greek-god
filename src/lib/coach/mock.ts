// LOCAL UI TESTING ONLY. The route uses this only when isMock() is true (NODE_ENV=development
// and AI_MOCK=1), which can never happen in a production build. The reply is deterministic and
// built from the user's REAL context, and it is labelled as a mock everywhere it appears.

import type { RawProfile, Snapshot } from "./snapshot";
import { LB_PER_KG } from "@/lib/units";

interface MockReply {
  answer_markdown: string;
  cited_fact_ids: string[];
  suggestions: { kind: string; title: string; current?: string; proposed: string; rationale: string }[];
  follow_ups: string[];
}

const TOPICS: { test: RegExp; ids: (s: Snapshot) => string[]; follow: string }[] = [
  { test: /summary/, ids: () => ["plan.week", "tr.count7", "tr.prs", "nut.avg7", "bw.rate", "rec.sleep"], follow: "Give me my weekly summary" },
  { test: /protein (goal|target)/, ids: () => ["goal.protein", "bw.avg7", "nut.avg14"], follow: "Is my protein target right?" },
  { test: /protein|left today/, ids: () => ["nut.left.protein", "nut.today.protein", "goal.protein", "nut.left.kcal"], follow: "How much protein do I have left today?" },
  { test: /water|hydrat/, ids: () => ["nut.water", "goal.water", "nut.water7"], follow: "Am I drinking enough water?" },
  { test: /deload|tired|fatigue/, ids: () => ["rec.fatigue", "rec.soreness", "rec.sleep", "tr.mode", "tr.count7"], follow: "Do I need a deload week?" },
  { test: /bench|plateau|stall|improv/, ids: (s) => ["lift.barbell-bench-press", ...s.facts.filter((f) => f.id.startsWith("lift.") && /STALLED/.test(f.detail ?? "")).map((f) => f.id).slice(0, 2), "rec.sleep", "bw.rate"], follow: "Why hasn't my bench press improved?" },
  { test: /volume|biceps|sets/, ids: () => ["vol.biceps", "vol.brachialis", "vol.forearms", "tr.count7"], follow: "Am I doing enough volume for my biceps?" },
  { test: /volleyball|leg/, ids: () => ["vb.yesterday", "vb.14", "plan.today", "rec.soreness", "rec.fatigue"], follow: "Should I reduce leg training after volleyball?" },
  { test: /gain|since|weigh/, ids: (s) => ["bw.fromStart", "bw.first", "bw.avg7", ...s.facts.filter((f) => f.id.startsWith("bw.m.")).map((f) => f.id).slice(0, 2)], follow: "How much weight have I gained since I started?" },
  { test: /calorie|eating enough|increase|reach/, ids: () => ["bw.check", "bw.avg7", "bw.rate", "bw.required", "nut.avg14", "goal.kcal"], follow: "Should I increase calories?" },
  { test: /train|today|workout/, ids: () => ["plan.today", "plan.yesterday", "vb.yesterday", "rec.soreness", "tr.mode"], follow: "What should I train today?" },
];

export function buildMockReply(message: string, snap: Snapshot, profile: Pick<RawProfile, "calorie_goal" | "protein_goal" | "water_goal_ml" | "training_mode" | "start_weight_lb">): MockReply {
  // the Oracle's "[About: …]" prefix names the screen, not the topic
  const q = message.replace(/^\[About: [^\]\n]*\]\s*/, "").toLowerCase();
  const topic = TOPICS.find((t) => t.test.test(q));
  const wanted = topic ? topic.ids(snap) : ["plan.today", "bw.avg7", "nut.left.kcal", "rec.sleep"];
  const by = new Map(snap.facts.map((f) => [f.id, f]));
  const ids = [...new Set(wanted)].filter((id) => by.has(id));
  const lines = ids.map((id) => `- **${by.get(id)!.label}:** ${by.get(id)!.value}`);

  const suggestions: MockReply["suggestions"] = [];
  if (/calorie|eating enough|increase|reach/.test(q) && snap.derived.calorieCheck && (snap.derived.calorieCheck.kind === "increase" || snap.derived.calorieCheck.kind === "reassess")) {
    const d = snap.derived.calorieCheck.delta;
    suggestions.push({ kind: "calorie_goal", title: d > 0 ? "Raise your calorie target" : "Trim your calorie target", proposed: String(profile.calorie_goal + d), rationale: "From the app's bodyweight check (mock text)." });
  }
  if (/protein (goal|target)/.test(q)) {
    const lb = snap.derived.trendLb ?? profile.start_weight_lb;
    const g = Math.round(((lb / LB_PER_KG) * 2) / 5) * 5;
    if (Math.abs(g - profile.protein_goal) >= 5) suggestions.push({ kind: "protein_goal", title: "Set protein to 2.0 g/kg", proposed: String(g), rationale: "2.0 g per kg of your trend weight (mock text)." });
  }
  if (/water|hydrat/.test(q)) suggestions.push({ kind: "water_goal_ml", title: "Raise your water target", proposed: String(profile.water_goal_ml + 500), rationale: "Volleyball days add sweat losses (mock text)." });
  if (/deload/.test(q)) suggestions.push({ kind: "deload_week", title: "Take a deload week", proposed: "deload", rationale: "Fatigue and soreness facts above (mock text)." });
  if (/volleyball|leg/.test(q)) suggestions.push({ kind: "note", title: "Skip the optional jumps today", proposed: "", rationale: "Keep the heavy lifts, drop the optional plyometrics after a volleyball day (mock text)." });

  const follow = TOPICS.filter((t) => t !== topic)
    .slice(0, 3)
    .map((t) => t.follow);

  return {
    answer_markdown: [
      "**Dev mock — not AI.** This reply is a fixture built from your real records so the coach screen can be tested without an AI key.",
      lines.length ? lines.join("\n") : "No matching records yet. Log a few days and ask again.",
      "Add `GEMINI_API_KEY` on the server for real coaching.",
    ].join("\n\n"),
    cited_fact_ids: ids,
    suggestions,
    follow_ups: follow,
  };
}

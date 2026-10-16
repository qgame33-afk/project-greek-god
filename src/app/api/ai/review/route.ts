// Optional AI-written summary for a monthly review. The model sees ONLY the computed
// numbers (aiDigest in src/lib/reviews/compute.ts) — no raw logs, notes or photos — and
// its text is validated here. Nothing is stored: the client saves it only after the user
// accepts it.

import { z } from "zod";
import { AIError, aiConfigured, aiErrorResponse, generateJSON, isMock } from "@/lib/ai/gemini";
import { chargeUsage } from "@/lib/ai/usage";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_DEPTH = 3;
type Leaf = string | number | boolean | null;

/** Accepts only small trees of numbers and short labels — never free-text blobs. */
function cleanDigest(v: unknown, depth = 0): unknown {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    if (v.length > 120) throw new Error("label too long");
    return v;
  }
  if (depth >= MAX_DEPTH) throw new Error("too deep");
  if (Array.isArray(v)) {
    if (v.length > 12) throw new Error("list too long");
    return v.map((x) => cleanDigest(x, depth + 1));
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length > 40) throw new Error("too many fields");
    return Object.fromEntries(entries.map(([k, x]) => {
      if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) throw new Error("bad key");
      return [k, cleanDigest(x, depth + 1)];
    }));
  }
  throw new Error("unsupported value");
}

const Request_ = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  digest: z.record(z.string(), z.unknown()),
});

const Reply = z.object({ summary: z.string().min(200).max(1600) });

const SCHEMA = {
  type: "object",
  properties: { summary: { type: "string", description: "The review summary, 120–180 words, plain text." } },
  required: ["summary"],
};

function systemPrompt(unit: string) {
  return [
    "You write the summary paragraph of one person's monthly fitness transformation review.",
    "Use ONLY the numbers and labels in the JSON you are given. Never invent, estimate or round to new values. If something is null, missing or zero because it wasn't logged, either skip it or say it wasn't logged.",
    "Write 120 to 180 words in one or two short paragraphs. Second person. Plain, declarative sentences with numbers first.",
    "No emojis, no exclamation marks, no hype, no guilt, no praise inflation. No guarantees or predictions about future results. No medical advice or diagnosis.",
    "Bodyweight change is bodyweight, not muscle. Do not claim fat loss or muscle gain from the scale.",
    "Cover: bodyweight trend against the plan, training consistency and any records, nutrition consistency, sleep and recovery, then the listed priorities for next month in plain words.",
    `Weights are in ${unit}. Return JSON {"summary": "..."} with plain text only (no markdown).`,
  ].join("\n");
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function mockSummary(d: Record<string, unknown>) {
  // local UI testing only (NODE_ENV=development + AI_MOCK=1); built from the digest alone
  const t = (d.training ?? {}) as Record<string, unknown>;
  const n = (d.nutrition ?? {}) as Record<string, unknown>;
  const r = (d.recovery ?? {}) as Record<string, unknown>;
  const b = (d.bodyweight ?? {}) as Record<string, unknown>;
  const pr = Array.isArray(d.priorities) ? (d.priorities as string[]) : [];
  const base = `[Dev mock] ${d.month}: ${t.sessions ?? 0} of ${t.planned ?? 0} planned sessions, ${t.workingSets ?? 0} working sets and ${t.personalRecords ?? 0} records. Bodyweight moved ${b.change ?? "an unmeasured amount"} against a planned ${b.plannedRatePerWeek ?? "unknown"} per week. Food was logged on ${n.daysLogged ?? 0} days at ${n.avgCalories ?? "no"} kcal and ${n.avgProteinG ?? "no"} g protein on average. Sleep averaged ${r.avgSleepH ?? "an unlogged number of"} hours across ${r.checkIns ?? 0} check-ins. Next month: ${pr.join("; ") || "keep logging"}.`;
  const filler = " This text exists only so the accept and save flow can be exercised without an AI key, and it is never shown in production builds.";
  let out = base;
  while (words(out) < 125) out += filler;
  return out;
}

/** Whether summaries can be written (an AI key is set, or the local dev mock is on). */
export async function GET() {
  const { user } = await requireUser();
  if (!user) return Response.json({ error: "Sign in again.", code: "unauthorized" }, { status: 401 });
  return Response.json({ configured: aiConfigured(), mock: isMock() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Couldn't read that request.", code: "bad_request" }, { status: 400 });
    }
    const parsed = Request_.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid review data.", code: "bad_request" }, { status: 400 });

    const { supabase, user } = await requireUser();
    if (!user) return Response.json({ error: "Your session expired. Sign in again.", code: "unauthorized" }, { status: 401 });

    let digest: Record<string, unknown>;
    try {
      digest = cleanDigest(parsed.data.digest) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "The review data was too large to summarise.", code: "bad_request" }, { status: 400 });
    }
    const json = JSON.stringify(digest);
    if (json.length > 8000) return Response.json({ error: "The review data was too large to summarise.", code: "bad_request" }, { status: 400 });

    if (!aiConfigured()) throw new AIError("not_configured", "AI isn't connected yet. Add a GEMINI_API_KEY to the server settings to write summaries.", 503);

    if (isMock()) {
      return Response.json({ summary: mockSummary(digest), model: "dev-mock", words: words(mockSummary(digest)) });
    }

    await chargeUsage(supabase, "review", parsed.data.localDate);
    const unit = (digest.unit as Leaf) === "kg" ? "kilograms (kg)" : "pounds (lb)";
    const r = await generateJSON<unknown>({
      system: systemPrompt(unit),
      contents: [{ role: "user", parts: [{ text: `Monthly review numbers (JSON):\n${json}` }] }],
      schema: SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 1024,
      timeoutMs: 40_000,
    });
    const out = Reply.safeParse(r.data);
    if (!out.success) throw new AIError("bad_output", "The AI's summary couldn't be used. Try again.", 502);
    const summary = out.data.summary
      .replace(/[*_#`>]/g, "")
      .replace(/!/g, ".")
      .replace(/\s+\n/g, "\n")
      .trim();
    const n = words(summary);
    if (n < 90 || n > 240) throw new AIError("bad_output", "The AI's summary came back the wrong length. Try again.", 502);
    return Response.json({ summary, model: r.model, words: n });
  } catch (e) {
    return aiErrorResponse(e);
  }
}

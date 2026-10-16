// AI personal coach. Auth required. The model only sees a factual snapshot of the user's own
// records (respecting their privacy toggles) plus recent turns; its JSON reply is validated,
// cited fact ids are mapped back to server-side values, and suggestions are bounds-checked.
// Nothing here changes a goal — the user applies suggestions themselves after confirming.

import { AIError, aiConfigured, aiErrorResponse, generateJSON, isMock, type Content } from "@/lib/ai/gemini";
import { chargeUsage } from "@/lib/ai/usage";
import { buildCoachContext } from "@/lib/coach/context";
import { buildMockReply } from "@/lib/coach/mock";
import { buildSystemPrompt } from "@/lib/coach/prompt";
import { COACH_RESPONSE_SCHEMA, CoachModelReply, CoachRequest, sanitizeAnswer, sanitizeFollowUps, titleFrom } from "@/lib/coach/schema";
import { chipsFor } from "@/lib/coach/snapshot";
import { validateSuggestions } from "@/lib/coach/suggestions";
import type { CoachMessageRow, CoachPayload, CoachReplyResponse } from "@/lib/coach/types";
import { requireUser } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const maxDuration = 60;

/** Recent messages sent back to the model (6 exchanges). */
const HISTORY_MESSAGES = 12;

const fail = (status: number, code: string, error: string) => Response.json({ error, code }, { status });

/** Whether the coach can answer (an AI key is set, or the local dev mock is on). */
export async function GET() {
  const { user } = await requireUser();
  if (!user) return fail(401, "unauthorized", "Sign in again.");
  return Response.json({ configured: aiConfigured(), mock: isMock() });
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail(400, "bad_request", "Couldn't read that request.");
    }
    const parsed = CoachRequest.safeParse(body);
    if (!parsed.success) return fail(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid request.");
    const { conversationId, message, localDate, localTime, timeZone } = parsed.data;

    const { supabase, user } = await requireUser();
    if (!user) return fail(401, "unauthorized", "Your session expired. Sign in again.");

    if (!aiConfigured()) throw new AIError("not_configured", "Coach isn't connected yet. It needs an AI key on the server.", 503);
    const mock = isMock();

    // existing conversation → recent turns for continuity
    let history: { role: string; content: string }[] = [];
    if (conversationId) {
      const conv = await supabase.from("ai_conversations").select("id,kind").eq("id", conversationId).maybeSingle();
      if (conv.error) throw new Error(conv.error.message);
      if (!conv.data || conv.data.kind !== "coach") return fail(404, "not_found", "That conversation was deleted. Retry asks it in a new one.");
      const msgs = await supabase.from("ai_messages").select("role,content,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(HISTORY_MESSAGES);
      if (msgs.error) throw new Error(msgs.error.message);
      history = (msgs.data ?? []).reverse();
    }

    const { snapshot, raw } = await buildCoachContext(supabase, user.id, localDate, localTime ?? null, timeZone ?? null);

    let reply: unknown;
    let model: string;
    if (mock) {
      await new Promise((r) => setTimeout(r, 700)); // lets the typing state be exercised locally
      reply = buildMockReply(message, snapshot, raw.profile);
      model = "dev-mock";
    } else {
      await chargeUsage(supabase, "coach", localDate);
      const r = await generateJSON<unknown>({
        system: buildSystemPrompt(snapshot.text),
        contents: toContents(history, message),
        schema: COACH_RESPONSE_SCHEMA,
        temperature: 0.35,
        maxOutputTokens: 4096, // thinking tokens count against this on newer models
        timeoutMs: 50_000,
      });
      reply = r.data;
      model = r.model;
    }

    const out = CoachModelReply.safeParse(reply);
    if (!out.success) throw new AIError("bad_output", "The coach's answer couldn't be read. Try again.", 502);
    const answer = sanitizeAnswer(out.data.answer_markdown);
    if (!answer) throw new AIError("bad_output", "The coach returned an empty answer. Try again.", 502);
    const p = raw.profile;
    const { suggestions, dropped } = validateSuggestions(out.data.suggestions, {
      profile: { calorie_goal: p.calorie_goal, protein_goal: p.protein_goal, water_goal_ml: p.water_goal_ml, training_mode: p.training_mode, start_weight_lb: p.start_weight_lb },
      access: raw.access,
      trendLb: snapshot.derived.trendLb,
      calorieCheck: snapshot.derived.calorieCheck,
    });
    if (dropped.length) console.info("[coach] dropped suggestions:", dropped);
    const payload: CoachPayload = {
      v: 1,
      facts: chipsFor(out.data.cited_fact_ids, snapshot.facts),
      suggestions,
      follow_ups: sanitizeFollowUps(out.data.follow_ups),
      shared: snapshot.shared,
      as_of: localDate,
      model,
      ...(mock ? { mock: true } : {}),
      ...(dropped.length ? { dropped: dropped.length } : {}),
    };

    // persist only after a good answer, so a failure never leaves a dangling question
    let convId = conversationId ?? null;
    let title: string;
    if (!convId) {
      const ins = await supabase.from("ai_conversations").insert({ kind: "coach", title: titleFrom(message) }).select("id,title").single();
      if (ins.error) throw new Error(ins.error.message);
      convId = ins.data.id;
      title = ins.data.title ?? titleFrom(message);
    } else {
      const up = await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId).select("title").single();
      if (up.error) throw new Error(up.error.message);
      title = up.data.title ?? "Conversation";
    }
    const now = Math.max(Date.now(), started + 1);
    const rows = await supabase
      .from("ai_messages")
      .insert([
        { conversation_id: convId, role: "user", content: message, created_at: new Date(started).toISOString() },
        { conversation_id: convId, role: "assistant", content: answer, payload: payload as unknown as Json, created_at: new Date(now).toISOString() },
      ])
      .select("id,conversation_id,role,content,payload,created_at");
    if (rows.error) throw new Error(rows.error.message);
    const msgs = rows.data as unknown as CoachMessageRow[];
    const res: CoachReplyResponse = {
      conversationId: convId,
      title,
      userMessage: msgs.find((m) => m.role === "user")!,
      assistantMessage: msgs.find((m) => m.role === "assistant")!,
    };
    return Response.json(res);
  } catch (e) {
    return aiErrorResponse(e);
  }
}

/** History + the new question as alternating user/model turns, starting with the user. */
function toContents(history: { role: string; content: string }[], message: string): Content[] {
  const out: Content[] = [];
  for (const h of history) {
    const role = h.role === "assistant" ? "model" : "user";
    const text = h.content.slice(0, 3000);
    if (!text) continue;
    if (!out.length && role === "model") continue;
    const last = out.at(-1);
    if (last && last.role === role) last.parts.push({ text });
    else out.push({ role, parts: [{ text }] });
  }
  const last = out.at(-1);
  if (last && last.role === "user") last.parts.push({ text: message });
  else out.push({ role: "user", parts: [{ text: message }] });
  return out;
}

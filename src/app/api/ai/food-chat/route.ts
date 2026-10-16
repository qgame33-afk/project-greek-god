import { requireUser } from "@/lib/supabase/server";
import { aiErrorResponse, generateJSON, imagePart, type Part } from "@/lib/ai/gemini";
import { chargeUsage } from "@/lib/ai/usage";
import { CHAT_RESPONSE_SCHEMA, type AIFoodItem, type FoodChatPayload } from "@/lib/ai/food-schemas";
import { alignReplyKcal, resolveItems, sanitizeChatOutput, totalsOf, type SavedFoodLite } from "@/lib/ai/food-pipeline";
import { CHAT_SYSTEM, chatUserText, type ChatTurn } from "@/lib/ai/food-prompts";
import { MOCK_MODEL, foodMockEnabled, mockChat } from "@/lib/ai/food-mock";
import { ChatBody, badRequest, base64ToBytes, notConfigured, readJson, serverLookup, sleep, unauthorized } from "@/lib/ai/food-server";
import type { Json } from "@/lib/supabase/database.types";

export const maxDuration = 60;

export async function GET(request: Request) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const mock = foodMockEnabled(request.headers);
  return Response.json({ configured: mock || !!process.env.GEMINI_API_KEY, mock, webSearch: false });
}

/**
 * POST { conversationId?, clientMessageId?, message, image?, localDate }
 * Persists the user's message (RLS as the user), asks Gemini to update the meal draft,
 * resolves every item against real databases, labels provenance, stores the assistant
 * turn and returns both. Nothing is written to the food log here.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const parsed = ChatBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  const { conversationId, clientMessageId, message, image, localDate } = parsed.data;
  const mock = foodMockEnabled(request.headers);
  if (!mock && !process.env.GEMINI_API_KEY) return notConfigured("chat");

  let imgPart: Part | null = null;
  try {
    if (image) imgPart = imagePart(image);
  } catch (e) {
    return aiErrorResponse(e);
  }

  // 1) conversation (verified through RLS, or created)
  let convId = conversationId ?? null;
  let createdConversation = false;
  if (convId) {
    const { data: conv } = await supabase.from("ai_conversations").select("id, kind").eq("id", convId).maybeSingle();
    if (!conv || conv.kind !== "food") return Response.json({ error: "That conversation no longer exists.", code: "not_found" }, { status: 404 });
  } else {
    const title = message.replace(/\s+/g, " ").slice(0, 60);
    const { data: conv, error } = await supabase.from("ai_conversations").insert({ kind: "food", title }).select("id").single();
    if (error || !conv) return Response.json({ error: "Couldn't start a conversation. Try again.", code: "upstream" }, { status: 500 });
    convId = conv.id;
    createdConversation = true;
  }

  // 2) optional photo → private storage
  let imagePath: string | null = null;
  if (image) {
    const { bytes, mime } = base64ToBytes(image);
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/${localDate}/chat-${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("meal-photos").upload(path, bytes, { contentType: mime, upsert: false });
    if (!up.error) imagePath = path;
  }

  // 3) the user's turn (client id makes a double-submit a no-op)
  const userMsgId = clientMessageId ?? crypto.randomUUID();
  const ins = await supabase
    .from("ai_messages")
    .insert({ id: userMsgId, conversation_id: convId, role: "user", content: message, image_path: imagePath })
    .select("*")
    .single();
  if (ins.error) {
    if (imagePath) await supabase.storage.from("meal-photos").remove([imagePath]);
    if (/duplicate key/i.test(ins.error.message)) return Response.json({ error: "That message was already sent.", code: "duplicate" }, { status: 409 });
    if (createdConversation) await supabase.from("ai_conversations").delete().eq("id", convId);
    return Response.json({ error: "Couldn't save your message. Try again.", code: "upstream" }, { status: 500 });
  }
  const userMessage = ins.data;

  const rollback = async () => {
    await supabase.from("ai_messages").delete().eq("id", userMsgId);
    if (imagePath) await supabase.storage.from("meal-photos").remove([imagePath]);
    if (createdConversation) await supabase.from("ai_conversations").delete().eq("id", convId);
  };

  try {
    // 4) context: recent turns, latest draft, saved foods
    const { data: recent } = await supabase
      .from("ai_messages")
      .select("id, role, content, payload, logged_group_id, created_at")
      .eq("conversation_id", convId)
      .neq("id", userMsgId)
      .order("created_at", { ascending: false })
      .limit(24);
    const history: ChatTurn[] = (recent ?? [])
      .slice(0, 12)
      .reverse()
      .map((m) => {
        if (m.role !== "assistant") return { role: "user" as const, content: m.content };
        // keep the questions the coach asked, so a bare answer like "Domino's" makes sense
        const qs = ((m.payload as { questions?: { question: string; options: string[] }[] } | null)?.questions ?? []).slice(0, 3);
        const asked = qs.length ? ` (Asked: ${qs.map((q) => `${q.question} [${q.options.join(" / ")}]`).join(" ")})` : "";
        return { role: "assistant" as const, content: m.content + asked };
      });
    const draftMsg = (recent ?? []).find(
      (m) =>
        m.role === "assistant" &&
        Array.isArray((m.payload as { items?: unknown } | null)?.items) &&
        ((m.payload as { items: unknown[] }).items.length ?? 0) > 0,
    );
    const draft = draftMsg ? ((draftMsg.payload as unknown as FoodChatPayload).items as AIFoodItem[]) : null;

    const { data: savedRows } = await supabase
      .from("saved_foods")
      .select("id, name, serving_amount, serving_unit, grams, calories, protein_g, carbs_g, fat_g")
      .order("is_favorite", { ascending: false })
      .order("use_count", { ascending: false })
      .limit(25);
    const saved: SavedFoodLite[] = (savedRows ?? []).map((s) => ({
      ...s,
      serving_amount: Number(s.serving_amount),
      grams: s.grams == null ? null : Number(s.grams),
      calories: Number(s.calories),
      protein_g: Number(s.protein_g),
      carbs_g: Number(s.carbs_g),
      fat_g: Number(s.fat_g),
    }));

    // 5) the model (or the dev mock)
    let raw: unknown;
    let model: string;
    if (mock) {
      await sleep(900);
      raw = mockChat(message, draft);
      model = MOCK_MODEL;
    } else {
      await chargeUsage(supabase, "food_chat", localDate);
      const text = chatUserText({ localDate, message, history, draft, draftLogged: !!draftMsg?.logged_group_id, saved, hasImage: !!imgPart });
      const res = await generateJSON<unknown>({
        system: CHAT_SYSTEM,
        contents: [{ role: "user", parts: imgPart ? [imgPart, { text }] : [{ text }] }],
        schema: CHAT_RESPONSE_SCHEMA,
        temperature: 0.3,
        timeoutMs: 40_000,
      });
      raw = res.data;
      model = res.model;
    }

    // 6) validate, look up, label, total
    const clean = sanitizeChatOutput(raw, new Set(saved.map((s) => s.id)));
    const pointsAtDraft = clean.intent === "add_to_log" && !!draftMsg;
    const { items, lookup } = pointsAtDraft
      ? { items: [] as AIFoodItem[], lookup: { usda: "skipped" as const, off: "skipped" as const } }
      : await resolveItems(clean.items, { lookup: serverLookup, saved, budgetMs: 9000 });
    const totals = totalsOf(items);
    const notes = [...clean.notes];

    const modelTotal = clean.items.reduce((a, i) => a + i.estimate.calories, 0);
    const reply =
      (clean.reply && items.length ? alignReplyKcal(clean.reply, modelTotal, totals.calories) : clean.reply) ||
      (items.length
        ? `About ${totals.calories.toLocaleString("en-US")} kcal. Review the rows below.`
        : pointsAtDraft
          ? "Review the meal above and tap Confirm & add."
          : "Tell me a little more about what you ate.");

    const payload: FoodChatPayload = {
      v: 1,
      items,
      totals,
      questions: clean.questions,
      notes: notes.slice(0, 4),
      corrections: items.length ? clean.corrections : [],
      needs_clarification: clean.needs_clarification,
      intent: clean.intent,
      meal_hint: clean.meal_hint,
      revises: clean.is_revision && draftMsg && items.length ? draftMsg.id : null,
      refers_to: pointsAtDraft ? draftMsg!.id : null,
      model,
      lookup,
      ...(mock ? { mock: true } : {}),
    };

    const saveRes = await supabase
      .from("ai_messages")
      .insert({ conversation_id: convId, role: "assistant", content: reply, payload: payload as unknown as Json })
      .select("*")
      .single();
    if (saveRes.error) throw new Error(saveRes.error.message);
    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);

    return Response.json({ conversationId: convId, userMessage, assistantMessage: saveRes.data }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    await rollback();
    return aiErrorResponse(e);
  }
}

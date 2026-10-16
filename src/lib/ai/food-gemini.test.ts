// End-to-end of the AI food pipeline with Gemini and the databases stubbed at the network
// layer: proves the request we send (system prompt, JSON schema, inline photo) and that a
// realistic model answer comes out validated, database-backed and honestly labelled.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import usdaGeneric from "@/lib/food/__fixtures__/usda-generic-chicken.json";
import { clearSearchCache } from "@/lib/food/search";

vi.mock("server-only", () => ({}));

const { generateJSON, imagePart, AIError } = await import("./gemini");
const { PHOTO_RESPONSE_SCHEMA, CHAT_RESPONSE_SCHEMA } = await import("./food-schemas");
const { PHOTO_SYSTEM, photoUserText, CHAT_SYSTEM, chatUserText } = await import("./food-prompts");
const { resolveItems, sanitizeChatOutput, sanitizePhotoOutput, totalsOf } = await import("./food-pipeline");
const { serverLookup } = await import("./food-server");

const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

const geminiReply = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

let calls: { url: string; body: unknown }[] = [];

beforeEach(() => {
  calls = [];
  clearSearchCache();
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.USDA_API_KEY;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

function stubNetwork(modelAnswer: unknown, opts: { usdaStatus?: number } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.includes("generativelanguage.googleapis.com")) return geminiReply(modelAnswer);
      if (url.includes("api.nal.usda.gov")) {
        if (opts.usdaStatus === 429) return new Response("{}", { status: 429, headers: { "content-type": "application/json" } });
        return new Response(JSON.stringify(usdaGeneric), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ hits: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

describe("photo analysis with a (stubbed) Gemini answer", () => {
  it("sends the photo + strict schema, then labels a database-backed result", async () => {
    stubNetwork({
      not_food: false,
      items: [
        {
          name: "Grilled chicken breast",
          portion_description: "1 breast",
          estimated_grams: 180,
          preparation: "grilled",
          kind: "generic",
          brand: "",
          est_calories: 300,
          est_protein: 55,
          est_carbs: 0,
          est_fat: 7,
          confidence: 0.8,
          search_query: "chicken breast roasted",
          source_url: "https://made-up.example/chicken",
        },
        {
          name: "Garlic butter",
          portion_description: "1 tbsp",
          estimated_grams: 14,
          preparation: "unknown",
          kind: "generic",
          brand: "",
          est_calories: 100,
          est_protein: 0,
          est_carbs: 0,
          est_fat: 11,
          confidence: 0.3,
          search_query: "butter garlic",
        },
      ],
      overall_confidence: 0.62,
      caveats: ["Butter amount is a guess. See https://fake.example"],
      questions: [{ id: "butter", question: "Was there butter on the chicken?", options: ["Yes", "No"] }],
    });

    const { data, model } = await generateJSON<unknown>({
      system: PHOTO_SYSTEM,
      contents: [{ role: "user", parts: [imagePart(TINY_JPEG), { text: photoUserText({ answers: [] }) }] }],
      schema: PHOTO_RESPONSE_SCHEMA,
    });
    expect(model).toBe("gemini-3.6-flash");
    const req = calls[0].body as {
      systemInstruction: { parts: { text: string }[] };
      contents: { parts: Record<string, unknown>[] }[];
      generationConfig: Record<string, unknown>;
    };
    expect(req.generationConfig.responseMimeType).toBe("application/json");
    expect(req.generationConfig.responseJsonSchema).toEqual(PHOTO_RESPONSE_SCHEMA);
    expect(req.contents[0].parts[0]).toHaveProperty("inlineData.mimeType", "image/jpeg");
    expect(req.systemInstruction.parts[0].text).toContain("Never include URLs");

    const clean = sanitizePhotoOutput(data);
    const { items, lookup } = await resolveItems(clean.items, { lookup: serverLookup });
    expect(items[0]).toMatchObject({ provenance: "database", source: { url: "https://fdc.nal.usda.gov/food-details/171477/nutrients" } });
    expect(items[0].macros.calories).toBe(297); // 165 kcal/100 g × 180 g, not the model's 300
    expect(items[1].provenance).toBe("estimate");
    expect(JSON.stringify({ items, caveats: clean.caveats })).not.toContain("example");
    expect(lookup.usda).toBe("demo_key");
    expect(totalsOf(items).calories).toBe(397);
    expect(calls.some((c) => c.url.includes("api_key=DEMO_KEY"))).toBe(true);
  });

  it("keeps honest estimates when USDA rate-limits", async () => {
    stubNetwork(
      {
        not_food: false,
        items: [
          {
            name: "Chicken breast",
            portion_description: "",
            estimated_grams: 150,
            preparation: "roasted",
            kind: "generic",
            brand: "",
            est_calories: 250,
            est_protein: 46,
            est_carbs: 0,
            est_fat: 6,
            confidence: 0.7,
            search_query: "chicken breast roasted",
          },
        ],
        overall_confidence: 0.7,
        caveats: [],
        questions: [],
      },
      { usdaStatus: 429 },
    );
    const { data } = await generateJSON<unknown>({ system: PHOTO_SYSTEM, contents: [{ role: "user", parts: [{ text: "x" }] }], schema: PHOTO_RESPONSE_SCHEMA });
    const { items, lookup } = await resolveItems(sanitizePhotoOutput(data).items, { lookup: serverLookup });
    expect(items[0]).toMatchObject({ provenance: "estimate", source: null, macros: { calories: 250 } });
    expect(lookup.usda).toBe("rate_limited");
  });

  it("reports a missing key as not_configured and rejects oversize images", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(generateJSON({ system: "s", contents: [], schema: {} })).rejects.toMatchObject({ code: "not_configured" });
    expect(() => imagePart("data:image/jpeg;base64," + "A".repeat(7_000_004))).toThrow(AIError);
    expect(() => imagePart("data:image/gif;base64,AAAA")).toThrow(/format/);
  });
});

describe("chat turn with a (stubbed) Gemini answer", () => {
  it("never lets a restaurant claim or link through", async () => {
    stubNetwork({
      reply: "I looked it up on Domino's website: [official](https://www.dominos.com/nutrition). About **2,560 kcal**.",
      intent: "log_meal",
      needs_clarification: false,
      is_revision: false,
      meal_hint: "dinner",
      items: [
        {
          name: "Pepperoni pizza",
          quantity: 8,
          unit: "slice",
          portion_description: "medium",
          estimated_grams: 640,
          preparation: "baked",
          kind: "restaurant",
          brand: "Domino's",
          est_calories: 1840,
          est_protein: 76,
          est_carbs: 200,
          est_fat: 80,
          confidence: 0.5,
          search_query: "pizza pepperoni",
          saved_food_id: "",
        },
      ],
      questions: [],
      corrections: ["6 slices"],
    });
    const text = chatUserText({
      localDate: "2026-10-16",
      message: "medium dominos pepperoni",
      history: [],
      draft: null,
      draftLogged: false,
      saved: [],
      hasImage: false,
    });
    const { data } = await generateJSON<unknown>({ system: CHAT_SYSTEM, contents: [{ role: "user", parts: [{ text }] }], schema: CHAT_RESPONSE_SCHEMA });
    const clean = sanitizeChatOutput(data);
    expect(clean.reply).toBe("About **2,560 kcal**.");
    const { items } = await resolveItems(clean.items, { lookup: serverLookup });
    expect(items[0]).toMatchObject({ provenance: "estimate", handoff: true, source: null });
    // restaurant items are never looked up, so only the Gemini call happened
    expect(calls.filter((c) => !c.url.includes("generativelanguage"))).toHaveLength(0);
  });
});

describe("response schemas", () => {
  it("only require properties they define", () => {
    for (const schema of [PHOTO_RESPONSE_SCHEMA, CHAT_RESPONSE_SCHEMA]) {
      const s = schema as { properties: Record<string, { items?: { properties?: object; required?: string[] } }>; required: string[] };
      for (const r of s.required) expect(s.properties).toHaveProperty(r);
      const item = s.properties.items.items!;
      for (const r of item.required!) expect(item.properties).toHaveProperty(r);
    }
  });
});

describe("model fallback", () => {
  const ok = { not_food: true, items: [], notes: null };
  function stubModels(statuses: Record<string, number>, bodies: Record<string, string> = {}) {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const model = decodeURIComponent(url.split("/models/")[1].split(":")[0]);
        seen.push(model);
        const st = statuses[model] ?? 200;
        if (st === 200) return geminiReply(ok);
        return new Response(bodies[model] ?? "{}", { status: st, headers: { "content-type": "application/json" } });
      }),
    );
    return seen;
  }
  const call = () => generateJSON({ system: "s", contents: [{ role: "user", parts: [{ text: "x" }] }], schema: { type: "object" } });

  it("moves to the next model when one is out of free quota or overloaded", async () => {
    const seen = stubModels({ "gemini-3.6-flash": 429, "gemini-flash-latest": 503 });
    const r = await call();
    expect(r.model).toBe("gemini-2.5-flash");
    expect(new Set(seen)).toEqual(new Set(["gemini-3.6-flash", "gemini-flash-latest", "gemini-2.5-flash"]));
  });

  it("reports the daily quota when every model is used up", async () => {
    const quota = '{"error":{"message":"Quota exceeded for metric generate_content_free_tier_requests, limit: 20 PerDay"}}';
    stubModels({ "gemini-3.6-flash": 404, "gemini-flash-latest": 429, "gemini-2.5-flash": 503 }, { "gemini-flash-latest": quota });
    await expect(call()).rejects.toMatchObject({ code: "quota", status: 429 });
  });

  it("stops at once on a rejected key", async () => {
    const seen = stubModels({ "gemini-3.6-flash": 403 });
    await expect(call()).rejects.toMatchObject({ code: "not_configured" });
    expect(seen).toEqual(["gemini-3.6-flash"]);
  });
});

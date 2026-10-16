// The meal AI routes with auth, Gemini and the usage cap stubbed: proves the honest 503
// without a key, that hard constraints come from the stored preferences (the model's catalog
// excludes allergens), that only validated recipes are stored, and that usage is charged.
// Live Gemini can't be exercised here (no key in this environment).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const requireUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ requireUser: () => requireUser() }));
const generateJSON = vi.fn();
vi.mock("@/lib/ai/gemini", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/gemini")>()), generateJSON: (...a: unknown[]) => generateJSON(...a), isMock: () => false }));
const chargeUsage = vi.fn();
vi.mock("@/lib/ai/usage", () => ({ chargeUsage: (...a: unknown[]) => chargeUsage(...a) }));

const recipesRoute = await import("./recipes/route");
const simplifyRoute = await import("./simplify/route");
const { getLibraryRecipe } = await import("@/lib/meals/library");

type Row = Record<string, unknown>;
interface State {
  tables: Record<string, Row | Row[] | null>;
  inserts: { table: string; rows: Row[] }[];
}

/** A tiny stand-in for the Supabase query builder: reads return `tables`, inserts are recorded. */
function fakeSupabase(state: State) {
  return {
    from(table: string) {
      let rows: Row[] | null = null;
      const result = (single: boolean) => {
        if (rows) {
          const data = rows.map((r) => ({ ...r, user_id: "u1", created_at: "2026-10-16T12:00:00Z" }));
          return { data: single ? data[0] : data, error: null };
        }
        const t = state.tables[table];
        return { data: single ? (Array.isArray(t) ? (t[0] ?? null) : (t ?? null)) : Array.isArray(t) ? t : [], error: null };
      };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit", "gte", "eq"]) chain[m] = () => chain;
      chain.insert = (r: Row | Row[]) => {
        rows = Array.isArray(r) ? r : [r];
        state.inserts.push({ table, rows });
        return chain;
      };
      chain.maybeSingle = () => Promise.resolve(result(true));
      chain.single = () => Promise.resolve(result(true));
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result(false)).then(res, rej);
      return chain;
    },
  };
}

const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const goodDinner = {
  name: "Beef and Bean Burrito Skillet",
  blurb: "Lean beef, beans and salsa.",
  slots: ["dinner"],
  minutes: 15,
  difficulty: "super_easy",
  ingredients: [
    { key: "ground-beef-lean", qty: 170, unit: "g" },
    { key: "black-beans", qty: 0.5, unit: "can" },
    { key: "salsa", qty: 0.5, unit: "cup" },
    { key: "rice-cooked-microwave", qty: 1, unit: "pouch" },
    { key: "cheddar", qty: 0.33, unit: "cup" },
  ],
  steps: [
    { text: "Brown the beef in a large pan over medium-high 6–8 minutes, breaking it up.", timer_seconds: 420 },
    { text: "Stir in the beans and salsa, microwave the rice 90 seconds and serve topped with cheddar.", timer_seconds: 90 },
  ],
  equipment: ["stovetop", "microwave"],
  tags: ["cuisine:mexican", "protein:beef", "base:rice", "style:skillet", "dish:burrito-skillet"],
};

let state: State;
beforeEach(() => {
  state = { tables: { meal_prefs: { allergies: ["peanut"], disliked_ingredients: ["tuna-canned"], difficulty: "super_easy" }, recipes: [], meal_feedback: [] }, inserts: [] };
  requireUser.mockResolvedValue({ supabase: fakeSupabase(state), user: { id: "u1" } });
  generateJSON.mockReset();
  chargeUsage.mockReset();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/meals/ai/recipes", () => {
  it("is honest without GEMINI_API_KEY: 503 not_configured, no AI call, no charge", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await recipesRoute.POST(post({ slot: "dinner", localDate: "2026-10-16" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "not_configured" });
    expect(generateJSON).not.toHaveBeenCalled();
    expect(chargeUsage).not.toHaveBeenCalled();
    const cap = await (await recipesRoute.GET()).json();
    expect(cap).toEqual({ configured: false, mock: false });
  });

  it("requires sign-in and a valid body", async () => {
    requireUser.mockResolvedValueOnce({ supabase: fakeSupabase(state), user: null });
    expect((await recipesRoute.POST(post({ slot: "dinner", localDate: "2026-10-16" }))).status).toBe(401);
    expect((await recipesRoute.POST(post({ slot: "brunch", localDate: "2026-10-16" }))).status).toBe(400);
  });

  it("charges usage, limits the model to the user's catalog, stores only validated recipes", async () => {
    const withPeanut = { ...goodDinner, name: "Peanut Beef Bowl", ingredients: [...goodDinner.ingredients, { key: "peanut-butter", qty: 1, unit: "tbsp" }] };
    const unknownKey = { ...goodDinner, name: "Mystery Bowl", ingredients: [{ key: "dragon-fruit-jerky", qty: 100, unit: "g" }] };
    generateJSON.mockResolvedValue({ data: { recipes: [goodDinner, withPeanut, unknownKey] }, model: "gemini-test" });
    const res = await recipesRoute.POST(post({ slot: "dinner", count: 3, localDate: "2026-10-16", targets: { kcal: 990, protein: 55 } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(chargeUsage).toHaveBeenCalledWith(expect.anything(), "meals_ai", "2026-10-16");
    const call = generateJSON.mock.calls[0][0] as { schema: unknown; contents: { parts: { text: string }[] }[] };
    const schemaText = JSON.stringify(call.schema);
    expect(schemaText).not.toContain('"peanut-butter"');
    expect(schemaText).not.toContain('"tuna-canned"');
    expect(schemaText).toContain('"ground-beef-lean"');
    expect(call.contents[0].parts[0].text).toContain("ALLERGIES (never include): peanut");
    expect(body.rejected).toBe(2);
    expect(body.recipes).toHaveLength(1);
    expect(body.keys[0]).toMatch(/^usr:[0-9a-f-]{36}$/);
    expect(body.recipes[0]).toMatchObject({ name: "Beef and Bean Burrito Skillet", origin: "ai" });
    expect(body.recipes[0].steps[0].safety).toMatch(/71°C/);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe("recipes");
    expect(state.inserts[0].rows[0]).toMatchObject({ origin: "ai", name: "Beef and Bean Burrito Skillet" });
    expect((state.inserts[0].rows[0].data as { nutrition: { kcal: number } }).nutrition.kcal).toBe(body.recipes[0].nutrition.kcal);
  });

  it("saves nothing when no recipe passes (422 with the reasons)", async () => {
    generateJSON.mockResolvedValue({ data: { recipes: [{ ...goodDinner, minutes: 40 }] }, model: "gemini-test" });
    const res = await recipesRoute.POST(post({ slot: "dinner", localDate: "2026-10-16" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("bad_output");
    expect(body.rejected[0].errors[0]).toMatch(/40 min is longer than your 15-minute limit/);
    expect(state.inserts).toEqual([]);
  });

  it("passes AI errors through honestly (quota)", async () => {
    const { AIError } = await import("@/lib/ai/gemini");
    chargeUsage.mockRejectedValue(new AIError("quota", "You've used today's 40 meal planner AI requests. They reset tomorrow.", 429));
    const res = await recipesRoute.POST(post({ slot: "dinner", localDate: "2026-10-16" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "quota" });
    expect(generateJSON).not.toHaveBeenCalled();
  });
});

describe("/api/meals/ai/simplify", () => {
  it("is honest without GEMINI_API_KEY", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await simplifyRoute.POST(post({ recipe: { key: "lib:chicken-alfredo" }, localDate: "2026-10-16" }));
    expect(res.status).toBe(503);
  });

  it("returns the model's honest 'unchanged'", async () => {
    generateJSON.mockResolvedValue({ data: { unchanged: true, reason: "Every step is needed." }, model: "gemini-test" });
    const res = await simplifyRoute.POST(post({ recipe: { key: "lib:spaghetti-bolognese" }, localDate: "2026-10-16" }));
    expect(await res.json()).toMatchObject({ ok: false, unchanged: true, reason: "Every step is needed." });
    expect(state.inserts).toEqual([]);
  });

  it("stores a validated easier version linked to the original", async () => {
    const original = getLibraryRecipe("lib:chicken-alfredo")!;
    generateJSON.mockResolvedValue({
      data: {
        unchanged: false,
        changes: ["Ready-cooked chicken instead of raw"],
        recipe: {
          name: original.name,
          blurb: "Jarred alfredo with ready-cooked chicken.",
          slots: ["dinner"],
          minutes: 14,
          difficulty: "super_easy",
          ingredients: [
            { key: "pasta-dry", qty: 120, unit: "g" },
            { key: "chicken-breast-cooked", qty: 130, unit: "g" },
            { key: "alfredo-sauce-jarred", qty: 0.5, unit: "cup" },
            { key: "frozen-broccoli", qty: 1, unit: "cup" },
          ],
          steps: [
            { text: "Cook the pasta in boiling water 9–11 minutes, adding the broccoli for the last 3 minutes, then drain.", timer_seconds: 600 },
            { text: "Stir in the alfredo sauce and chicken and warm 2 minutes until steaming hot.", timer_seconds: 120 },
          ],
          equipment: ["stovetop"],
          tags: original.tags,
        },
      },
      model: "gemini-test",
    });
    const res = await simplifyRoute.POST(post({ recipe: original, localDate: "2026-10-16" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, recipe: { name: "Easier Chicken Alfredo with Jarred Sauce", origin: "simplified", baseKey: "lib:chicken-alfredo" } });
    expect(body.changes[0]).toBe("Ready-cooked chicken instead of raw");
    expect(state.inserts[0].rows[0]).toMatchObject({ origin: "simplified", base_key: "lib:chicken-alfredo" });
    expect(chargeUsage).toHaveBeenCalledWith(expect.anything(), "meals_ai", "2026-10-16");
  });

  it("rejects an unreadable recipe before calling the AI", async () => {
    const res = await simplifyRoute.POST(post({ recipe: { key: "usr:bad", name: "x" }, localDate: "2026-10-16" }));
    expect(res.status).toBe(400);
    expect(generateJSON).not.toHaveBeenCalled();
  });
});

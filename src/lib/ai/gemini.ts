import "server-only";

// Minimal Gemini REST client (free tier friendly). Server-side only: the API key never
// reaches the browser. Structured JSON output, image input, model fallback chain and
// honest, typed errors the UI can explain.

export type AIErrorCode = "not_configured" | "quota" | "rate_limited" | "blocked" | "bad_output" | "upstream" | "timeout";

export class AIError extends Error {
  constructor(
    public code: AIErrorCode,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
export interface Content {
  role: "user" | "model";
  parts: Part[];
}

const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-2.5-flash"];

export function aiConfigured() {
  return !!process.env.GEMINI_API_KEY || isMock();
}

/** Local UI testing only: deterministic fixtures, never active in production builds. */
export function isMock() {
  return process.env.NODE_ENV === "development" && process.env.AI_MOCK === "1";
}

function models(): string[] {
  const env = process.env.GEMINI_MODEL?.split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...(env ?? []), ...DEFAULT_MODELS])];
}

export interface GenerateJSONOptions {
  system: string;
  contents: Content[];
  /** JSON Schema for the response (Gemini `responseJsonSchema`). */
  schema: Record<string, unknown>;
  temperature?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
}

/** Call Gemini and parse its JSON response. Throws AIError with a user-explainable code. */
export async function generateJSON<T>(opts: GenerateJSONOptions): Promise<{ data: T; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIError("not_configured", "AI isn't connected yet. Add a GEMINI_API_KEY to the server settings.", 503);

  let lastErr: AIError | null = null;
  for (const model of models()) {
    for (const withThinking of model.startsWith("gemini-3") ? [true, false] : [false]) {
      const body = {
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: opts.contents,
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: opts.schema,
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: opts.maxOutputTokens ?? 4096,
          ...(withThinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      };
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 45_000);
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: ctl.signal,
          cache: "no-store",
        });
      } catch (e) {
        clearTimeout(timer);
        if ((e as Error).name === "AbortError") throw new AIError("timeout", "The AI took too long to answer. Try again.", 504);
        throw new AIError("upstream", "Couldn't reach the AI service. Check your connection and try again.", 502);
      }
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (res.status === 404 || (res.status === 400 && /model/i.test(text) && /not found|unsupported|invalid/i.test(text))) {
          lastErr = new AIError("upstream", `Model ${model} unavailable`, 502);
          break; // try next model
        }
        if (res.status === 400 && withThinking && /thinking/i.test(text)) continue; // retry without thinking config
        if (res.status === 429) {
          const daily = /per.?day|daily|PerDay/i.test(text);
          throw new AIError(daily ? "quota" : "rate_limited", daily ? "Today's free AI allowance is used up. It resets tomorrow — manual logging still works." : "The free AI tier is busy. Wait a moment and try again.", 429);
        }
        if (res.status === 401 || res.status === 403) throw new AIError("not_configured", "The AI key was rejected. Check GEMINI_API_KEY in the server settings.", 503);
        throw new AIError("upstream", `The AI service returned an error (${res.status}). Try again.`, 502);
      }

      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
      };
      if (json.promptFeedback?.blockReason) throw new AIError("blocked", "The AI declined to answer that.", 422);
      const cand = json.candidates?.[0];
      if (cand?.finishReason === "SAFETY") throw new AIError("blocked", "The AI declined to answer that.", 422);
      const text = (cand?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("");
      if (!text) throw new AIError("bad_output", "The AI returned an empty answer. Try again.", 502);
      try {
        return { data: JSON.parse(stripFences(text)) as T, model };
      } catch {
        throw new AIError("bad_output", "The AI's answer couldn't be read. Try again.", 502);
      }
    }
  }
  throw lastErr ?? new AIError("upstream", "No AI model is available right now.", 502);
}

function stripFences(s: string) {
  const t = s.trim();
  if (t.startsWith("```")) return t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return t;
}

/** Convert a data URL ("data:image/jpeg;base64,...") into an inline image part. */
export function imagePart(dataUrl: string): Part {
  const m = /^data:(image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new AIError("bad_output", "That image format isn't supported. Use a JPEG or PNG photo.", 400);
  if (m[2].length > 7_000_000) throw new AIError("bad_output", "That photo is too large. Try again — the app shrinks photos before upload.", 413);
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

/** JSON response for an AIError (route handlers). */
export function aiErrorResponse(e: unknown) {
  if (e instanceof AIError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong on the server. Try again.", code: "upstream" }, { status: 500 });
}

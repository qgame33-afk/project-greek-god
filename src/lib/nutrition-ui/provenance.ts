// Which provenance badge a food row earns. A SOURCE badge needs a real URL from an
// actual lookup; database rows (USDA / Open Food Facts) get the database badge; AI
// values without a citation are estimates; planned meals logged as eaten carry recipe macros
// worked out from the ingredient database (CALC). Plain hand-logged rows show no badge.

export type Provenance =
  | { kind: "database"; name: string; short: string; url: string | null }
  | { kind: "source"; name: string; url: string }
  | { kind: "estimate" }
  | { kind: "calc" }
  | null;

export interface ProvenanceInput {
  source: string;
  confidence: string;
  source_name: string | null;
  source_url: string | null;
}

export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : null;
  } catch {
    return null;
  }
}

export function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

const DB_NAMES: Record<string, { name: string; short: string }> = {
  usda: { name: "USDA FoodData Central", short: "USDA" },
  off: { name: "Open Food Facts", short: "Open Food Facts" },
};

export function provenanceOf(e: ProvenanceInput): Provenance {
  const url = safeUrl(e.source_url);
  if (e.source === "usda" || e.source === "off" || e.confidence === "database") {
    const known = DB_NAMES[e.source];
    const name = e.source_name?.trim() || known?.name || "Database";
    const short = known?.short ?? (/usda/i.test(name) ? "USDA" : /open food facts/i.test(name) ? "Open Food Facts" : name);
    return { kind: "database", name, short, url };
  }
  if (url && (e.source === "assistant_handoff" || e.confidence === "verified")) {
    return { kind: "source", name: e.source_name?.trim() || hostOf(url), url };
  }
  // a planned meal logged as eaten: recipe macros worked out from the ingredient database (CALC, not AI)
  if (e.source === "meal_plan") return { kind: "calc" };
  if (e.confidence === "estimate" || e.source === "photo_ai" || e.source === "chat_ai") return { kind: "estimate" };
  return null;
}

/** Confidence an entry inherits when logged from a saved food with this source. */
export function confidenceForSource(source: string | null | undefined): "logged" | "database" | "estimate" {
  if (source === "usda" || source === "off") return "database";
  if (source === "photo_ai" || source === "chat_ai") return "estimate";
  return "logged";
}

/** Human label for a meal group's origin. */
export function groupLabel(source: string): string {
  if (source === "photo_ai") return "Photo scan";
  if (source === "chat_ai" || source === "assistant_handoff") return "Coach";
  if (source === "saved_meal") return "Saved meal";
  return "Meal";
}

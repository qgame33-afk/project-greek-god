// Deterministic matching of a described food ("chicken breast roasted") to database
// records. Conservative on purpose: a wrong match is worse than an honest estimate.

import type { FoodSearchResult, LookupKind } from "./types";

const STOP = new Set(
  "a an and the of with without in on or for to from style type ns nfs as made prepared plain regular fresh homemade home my some piece pieces".split(" "),
);

// Words that change what a food *is*. Present in a candidate but not in the query → penalty.
const DIVERGENT = new Set(
  (
    "roll luncheon loaf sausage babyfood baby infant toddler dehydrated dried dry powder powdered concentrate frozen canned imitation " +
    "substitute flavored sweetened unsweetened breaded batter battered stuffed free lowfat nonfat reduced light lite diet skin mix " +
    "syrup juice sauce soup salad sandwich spread bar chips cracker flour oil seasoned glutinous instant sticky fortified"
  ).split(" "),
);

const FLAVORS = new Set("vanilla chocolate strawberry blueberry peach cherry raspberry honey caramel cinnamon maple fruit mocha".split(" "));

const COOKED = new Set("cooked grilled roasted baked boiled fried steamed broiled poached scrambled sauteed braised stewed toasted microwaved".split(" "));

// Database categories that are almost never what someone means unless they say so.
const NICHE_CATEGORY = /(luncheon|baby ?food|infant|sausages)/i;

function singular(w: string) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("es") && /(ches|shes|sses|xes|oes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1);
  return w;
}

/** Lowercase, strip accents/apostrophes/punctuation, drop stop words, singularise. */
export function tokens(s: string): string[] {
  const base = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bfrom raw\b/g, " ") // FNDDS "cooked, from raw" describes the method, not the state
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ");
  const out: string[] = [];
  for (const w of base.split(/\s+/)) {
    if (!w || STOP.has(w) || /^\d+$/.test(w)) continue;
    const t = singular(w);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export interface MatchCandidate {
  result: FoodSearchResult;
  score: number;
  coverage: number;
}

export interface MatchOptions {
  kind?: LookupKind;
  /** Brand or restaurant that must appear in the candidate (packaged/restaurant items). */
  brand?: string | null;
  minScore?: number;
  minCoverage?: number;
}

/** Score one candidate against a query. 0 = reject. */
export function scoreCandidate(query: string, r: FoodSearchResult, rank = 0, opts: MatchOptions = {}): MatchCandidate {
  const q = tokens(query);
  const brandTokens = opts.brand ? tokens(opts.brand) : [];
  const cName = tokens(r.name);
  const cBrand = r.brand ? tokens(r.brand) : [];
  const c = [...cName, ...cBrand.filter((t) => !cName.includes(t))];
  const reject = { result: r, score: 0, coverage: 0 };
  if (!q.length || !cName.length || !r.per100g) return reject;

  // A brand/restaurant the user named must be present in the record.
  if (brandTokens.length && !brandTokens.every((t) => c.includes(t))) return reject;

  // Brand words are checked above; score the product words.
  const qNoBrand = q.filter((t) => !brandTokens.includes(t));
  const effectiveQ = qNoBrand.length ? qNoBrand : q;
  const hit = effectiveQ.filter((t) => c.includes(t));
  const coverage = hit.length / effectiveQ.length;
  const precision = effectiveQ.filter((t) => cName.includes(t)).length / cName.length;

  // Raw vs cooked is the classic 3× error (dry rice vs cooked rice).
  const qCooked = q.some((t) => COOKED.has(t));
  const cRaw = c.includes("raw") || c.includes("uncooked");
  if (qCooked && cRaw) return reject;
  if (q.includes("raw") && c.some((t) => COOKED.has(t))) return reject;

  let score = coverage * 0.72 + precision * 0.28;
  const divergent = c.filter((t) => DIVERGENT.has(t) && !q.includes(t)).length;
  score -= Math.min(0.3, divergent * 0.1);
  // flavours the user didn't ask for ("Yogurt, Greek, blueberry")
  if (c.some((t) => FLAVORS.has(t) && !q.includes(t))) score -= 0.08;
  // an ALL-CAPS word inside a mixed-case generic name is a brand ("Yogurt, Greek, CHOBANI")
  const caps = r.name !== r.name.toUpperCase() ? (r.name.match(/\b[A-Z][A-Z'’&]{2,}\b/g) ?? []) : [];
  if (caps.some((w) => !q.includes(tokens(w)[0] ?? ""))) score -= 0.08;
  // "…, with oats" / "made with butter": additions the user didn't mention
  const withPart = /\bwith(?:out)?\b(.+)$/i.exec(r.name)?.[1];
  if (withPart && !tokens(withPart).every((t) => q.includes(t))) score -= 0.12;
  if (r.category && NICHE_CATEGORY.test(r.category) && !q.some((t) => /(lunch|deli|sausage|baby)/.test(t))) score -= 0.35;
  if (opts.kind === "generic" && (r.dataType === "Foundation" || r.dataType === "SR Legacy")) score += 0.04;
  if (opts.kind === "generic" && r.dataType === "Survey (FNDDS)") score += 0.02;
  if (opts.kind === "generic" && r.source === "off") score -= 0.12; // products are a poor stand-in for a generic food
  score -= Math.min(0.06, rank * 0.006); // keep the upstream relevance order as a tie-breaker
  return { result: r, score: Math.max(0, score), coverage };
}

/** Rank all candidates (best first) — used for the search API ordering. */
export function rankResults(query: string, results: FoodSearchResult[], opts: MatchOptions = {}): MatchCandidate[] {
  return results.map((r, i) => scoreCandidate(query, r, i, opts)).sort((a, b) => b.score - a.score);
}

/**
 * The single confident match for an AI-described item, or null. Requires most query words
 * to be present and a clear score; brand-qualified items must match the brand.
 */
export function bestMatch(query: string, results: FoodSearchResult[], opts: MatchOptions = {}): MatchCandidate | null {
  return confidentMatches(query, results, opts)[0] ?? null;
}

/** Every candidate that clears the confidence bar, best first. */
export function confidentMatches(query: string, results: FoodSearchResult[], opts: MatchOptions = {}): MatchCandidate[] {
  const minScore = opts.minScore ?? 0.58;
  const minCoverage = opts.minCoverage ?? 0.75;
  return rankResults(query, results, opts).filter((m) => m.score >= minScore && m.coverage >= minCoverage);
}

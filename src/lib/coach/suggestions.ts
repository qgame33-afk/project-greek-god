// Server-side gate for coach suggestions. The model may propose target changes; only the ones
// that are safe, supported by the user's own data and inside conservative bounds survive. The
// "current" value always comes from the database, never from the model. Nothing here writes
// anything: the user still has to Apply and confirm.

import type { CalorieSuggestion } from "@/lib/bodyweight";
import { formatInt, formatLiters, LB_PER_KG } from "@/lib/units";
import type { CoachAccess, CoachSuggestion, SuggestionKind, TrainingMode } from "./types";
import { SUGGESTION_KINDS } from "./types";

export const BOUNDS = {
  /** Largest calorie-target change in one suggestion (kcal/day). */
  calorieMaxStep: 300,
  calorieMinStep: 50,
  calorieMin: 1500,
  calorieMax: 6000,
  /** Protein target bounds, g per kg of trend bodyweight. */
  proteinMinPerKg: 1.4,
  proteinMaxPerKg: 2.4,
  proteinMinStep: 5,
  waterMin: 2000,
  waterMax: 6000,
  waterMaxStep: 1500,
  waterMinStep: 100,
  /** Setting changes per answer (notes are counted separately, max 1). */
  maxChanges: 2,
} as const;

const MODES: TrainingMode[] = ["standard", "intro", "deload"];
const MODE_LABEL: Record<TrainingMode, string> = { standard: "Standard", intro: "Introductory", deload: "Deload" };

export interface SuggestionContext {
  profile: { calorie_goal: number; protein_goal: number; water_goal_ml: number; training_mode: string; start_weight_lb: number };
  access: CoachAccess;
  /** 7-day average (or latest) bodyweight in lb, from logged weigh-ins. */
  trendLb: number | null;
  /** The app's own calorie check (§12), on the one 4-week rate. */
  calorieCheck: CalorieSuggestion | null;
}

export interface Dropped {
  kind: string;
  reason: string;
}

const clean = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .replace(/[*_`#>[\]]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/** First number in a model string ("3,450 kcal" → 3450). Null when there is none. */
export function parseProposedNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(v.replace(/(\d),(\d{3})/g, "$1$2"));
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseMode(v: unknown): TrainingMode | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase();
  if (/deload/.test(s)) return "deload";
  if (/intro/.test(s)) return "intro";
  if (/standard|normal|full/.test(s)) return "standard";
  return null;
}

/**
 * Validate and normalise model suggestions. Returns the survivors (with server-side current
 * values, display labels and fresh ids) and the reasons the others were dropped.
 */
export function validateSuggestions(raw: unknown, ctx: SuggestionContext, makeId: () => string = () => crypto.randomUUID()): { suggestions: CoachSuggestion[]; dropped: Dropped[] } {
  const list = Array.isArray(raw) ? raw : [];
  const out: CoachSuggestion[] = [];
  const dropped: Dropped[] = [];
  const kinds = new Set<string>();
  let changes = 0;
  const p = ctx.profile;

  for (const item of list.slice(0, 6)) {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const kind = o.kind as SuggestionKind;
    const drop = (reason: string) => dropped.push({ kind: String(o.kind ?? "unknown"), reason });
    if (!SUGGESTION_KINDS.includes(kind)) {
      drop("unknown kind");
      continue;
    }
    const title = clean(o.title, 80);
    const rationale = clean(o.rationale, 420);
    if (!title || !rationale) {
      drop("missing title or rationale");
      continue;
    }
    const conflict = (kind === "deload_week" && kinds.has("training_mode")) || (kind === "training_mode" && kinds.has("deload_week"));
    if (kinds.has(kind) || conflict) {
      drop("duplicate");
      continue;
    }
    if (kind === "note") {
      // one note per answer (a second one is caught as a duplicate above)
      kinds.add(kind);
      out.push({ id: makeId(), kind, title, rationale, field: null, current: null, proposed: null, currentLabel: null, proposedLabel: null, status: "open" });
      continue;
    }
    if (changes >= BOUNDS.maxChanges) {
      drop("too many changes in one answer");
      continue;
    }

    let s: CoachSuggestion | null = null;
    if (kind === "calorie_goal") {
      const cc = ctx.calorieCheck;
      const proposedRaw = parseProposedNumber(o.proposed);
      if (!ctx.access.bodyweight || !cc) drop("calorie changes need shared bodyweight data");
      else if (cc.kind === "insufficient") drop("less than two weeks of consistent weigh-ins");
      else if (cc.kind === "cooldown") drop("calorie target changed less than 14 days ago");
      else if (cc.kind === "on_track") drop("bodyweight trend is on track");
      else if (proposedRaw == null) drop("no proposed number");
      else {
        const proposed = Math.round(proposedRaw / 10) * 10;
        const delta = proposed - p.calorie_goal;
        if (Math.abs(delta) > BOUNDS.calorieMaxStep) drop(`change of ${delta} kcal exceeds ±${BOUNDS.calorieMaxStep}`);
        else if (Math.abs(delta) < BOUNDS.calorieMinStep) drop("no meaningful change");
        else if (proposed < BOUNDS.calorieMin || proposed > BOUNDS.calorieMax) drop("outside safe calorie range");
        else if (cc.kind === "increase" && delta < 0) drop("trend says intake is short; a decrease contradicts it");
        else if (cc.kind === "reassess" && delta > 0) drop("trend says gain is too fast; an increase contradicts it");
        else
          s = {
            id: makeId(),
            kind,
            title,
            rationale,
            field: "calorie_goal",
            current: p.calorie_goal,
            proposed,
            currentLabel: `${formatInt(p.calorie_goal)} kcal`,
            proposedLabel: `${formatInt(proposed)} kcal`,
            status: "open",
          };
      }
    } else if (kind === "protein_goal") {
      const lb = ctx.trendLb ?? p.start_weight_lb;
      const kg = lb / LB_PER_KG;
      const lo = Math.ceil(kg * BOUNDS.proteinMinPerKg);
      const hi = Math.floor(kg * BOUNDS.proteinMaxPerKg);
      const proposedRaw = parseProposedNumber(o.proposed);
      if (proposedRaw == null) drop("no proposed number");
      else {
        const proposed = Math.round(proposedRaw);
        if (proposed < lo || proposed > hi) drop(`outside ${BOUNDS.proteinMinPerKg}–${BOUNDS.proteinMaxPerKg} g/kg (${lo}–${hi} g)`);
        else if (Math.abs(proposed - p.protein_goal) < BOUNDS.proteinMinStep) drop("no meaningful change");
        else
          s = {
            id: makeId(),
            kind,
            title,
            rationale,
            field: "protein_goal",
            current: p.protein_goal,
            proposed,
            currentLabel: `${p.protein_goal} g`,
            proposedLabel: `${proposed} g`,
            status: "open",
          };
      }
    } else if (kind === "water_goal_ml") {
      let proposedRaw = parseProposedNumber(o.proposed);
      // tolerate litres ("3.5 L") as well as millilitres
      if (proposedRaw != null && proposedRaw > 0 && proposedRaw < 20) proposedRaw *= 1000;
      if (proposedRaw == null) drop("no proposed number");
      else {
        const proposed = Math.round(proposedRaw / 50) * 50;
        const delta = proposed - p.water_goal_ml;
        if (proposed < BOUNDS.waterMin || proposed > BOUNDS.waterMax) drop("outside safe water range");
        else if (Math.abs(delta) > BOUNDS.waterMaxStep) drop("change too large");
        else if (Math.abs(delta) < BOUNDS.waterMinStep) drop("no meaningful change");
        else
          s = {
            id: makeId(),
            kind,
            title,
            rationale,
            field: "water_goal_ml",
            current: p.water_goal_ml,
            proposed,
            currentLabel: formatLiters(p.water_goal_ml),
            proposedLabel: formatLiters(proposed),
            status: "open",
          };
      }
    } else if (kind === "training_mode") {
      const mode = parseMode(o.proposed);
      const cur = (MODES.includes(p.training_mode as TrainingMode) ? p.training_mode : "standard") as TrainingMode;
      if (!mode) drop("unknown training mode");
      else if (mode === cur) drop("already in that mode");
      else
        s = {
          id: makeId(),
          kind,
          title,
          rationale,
          field: "training_mode",
          current: cur,
          proposed: mode,
          currentLabel: MODE_LABEL[cur],
          proposedLabel: MODE_LABEL[mode],
          status: "open",
        };
    } else if (kind === "deload_week") {
      const cur = (MODES.includes(p.training_mode as TrainingMode) ? p.training_mode : "standard") as TrainingMode;
      if (cur === "deload") drop("already deloading");
      else
        s = {
          id: makeId(),
          kind,
          title,
          rationale,
          field: "training_mode",
          current: cur,
          proposed: "deload",
          currentLabel: MODE_LABEL[cur],
          proposedLabel: "Deload, 1 week",
          status: "open",
        };
    }
    if (s) {
      out.push(s);
      kinds.add(kind);
      changes++;
    }
  }
  return { suggestions: out, dropped };
}

/** True when a stored suggestion still matches the live profile (else Apply is disabled). */
export function suggestionIsCurrent(s: CoachSuggestion, profile: Record<string, unknown> | undefined | null): boolean {
  if (!s.field || !profile) return false;
  const live = profile[s.field];
  if (s.field === "training_mode") return String(live ?? "standard") === String(s.current);
  return Number(live) === Number(s.current);
}

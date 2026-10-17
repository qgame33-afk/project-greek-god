// "Make this easier" (docs/MEALS.md §5). Deterministic, no AI:
//   1. the recipe's own hand-written easier version (`easierKey`) when it fits the user, else
//   2. shortcut swaps from the ingredient database (raw chicken → cooked strips, dry rice →
//      microwave pouch, chopped onion → onion powder, fresh peppers → frozen…), dropping
//      optional garnishes and merging steps, then recomputing minutes and nutrition.
// Steps are rewritten clause by clause. A swap whose steps can't be rewritten with confidence
// is abandoned rather than guessed, and the result must validate, respect the user's hard
// constraints and be genuinely easier. Otherwise the answer is an honest "unchanged" + reason.

import { getLibraryRecipe } from "../library";
import { SAFE } from "../library/define";
import { getIngredient, gramsFor, ingredientName } from "../ingredients";
import { applyShortcut, friendlyQty, ingredientCount, lineGrams, meetsSuperEasy, recipeConflicts, recipeMacros, SUPER_EASY, validateRecipe, type ConstraintPrefs } from "../recipe";
import type { Equipment, Recipe, RecipeIngredient, RecipeStep } from "../types";
import { DIFFICULTY_LABEL } from "./explain";

/* ------------------------------------------------------------------ swap rules */

/** Where the replacement cooking happens, read from the step being rewritten. */
interface CookContext {
  /** A pan was heated earlier in the same step (in a clause that stays). */
  panHeated: boolean;
  /** The fat the removed clause cooked in: "the oil", "the canola oil", "the butter". */
  fat: string | null;
  stovetop: boolean;
}

interface CookStep {
  timerSec: number;
  safety?: string;
  /** Equipment the new step needs. */
  equipment?: Equipment;
  text: (c: CookContext) => string;
}

interface SwapRule {
  /** How steps name the ingredient. */
  mention: RegExp;
  /**
   * replace: cooking the original is replaced by the shortcut's own step (chicken, rice, fries);
   * rename: the shortcut is cooked the same way under a new name (frozen veg, jarred sauce);
   * drop: the shortcut is a seasoning (onion → onion powder): prep and cooking go, it joins the spices.
   */
  mode: "replace" | "rename" | "drop";
  /** The shortcut's name inside a step. */
  rename?: string;
  /** How a step names it as an object when a dropped clause took the name with it. */
  object: string;
  cook?: (equipment: ReadonlySet<Equipment>) => CookStep | null;
  /** What the user is told. */
  change: string;
  /** Step wording that means this swap would change the dish (mashed or stuffed potatoes, breaded chicken). */
  block?: RegExp;
}

const warmChicken = (noun: string, timer: string, timerSec: number): CookStep => ({
  timerSec,
  safety: SAFE.reheat,
  text: (c) =>
    c.panHeated
      ? `Add the ${noun} and warm it ${timer} until steaming hot`
      : c.stovetop && c.fat
        ? `Heat ${c.fat} in a pan over medium and warm the ${noun} ${timer} until steaming hot`
        : c.stovetop
          ? `Warm the ${noun} in a pan over medium ${timer} until steaming hot`
          : `Warm the ${noun} in the microwave ${timer} until steaming hot`,
});

const POTATO_BLOCK = /\b(mash|mashed|split|fluff|stuff|poke|scrub|baked potato|wedges)\b/i;

const SWAPS: Record<string, SwapRule> = {
  "chicken-breast-raw": {
    mention: /\bchicken(?: breasts?)?\b(?! broth)/i,
    mode: "replace",
    object: "the chicken",
    cook: () => warmChicken("cooked chicken", "2–3 minutes", 150),
    change: "Ready-cooked chicken strips instead of raw chicken, so there's nothing raw to handle",
    block: /\b(pound|breadcrumbs|crumbs|bag|dip the chicken|coat)\b/i,
  },
  "chicken-thigh-raw": {
    mention: /\bchicken(?: thighs?)?\b(?! broth)/i,
    mode: "replace",
    object: "the chicken",
    cook: () => warmChicken("rotisserie chicken", "2 minutes", 120),
    change: "Rotisserie chicken instead of raw thighs, so there's nothing raw to handle",
    block: /\b(pound|breadcrumbs|crumbs|bag|coat)\b/i,
  },
  "rice-dry": {
    mention: /\brice\b/i,
    mode: "replace",
    object: "the rice",
    cook: () => ({ timerSec: 90, equipment: "microwave", text: () => "Microwave the rice pouch 90 seconds" }),
    change: "A microwave rice pouch instead of cooking rice",
  },
  potatoes: {
    mention: /(?<!sweet )\b(?:russet )?potato(?:es)?\b/i,
    mode: "replace",
    object: "the fries",
    cook: friesStep,
    change: "Frozen fries instead of cutting and cooking potatoes",
    block: POTATO_BLOCK,
  },
  "baby-potatoes": {
    mention: /(?<!sweet )\b(?:baby )?potato(?:es)?\b/i,
    mode: "replace",
    object: "the fries",
    cook: friesStep,
    change: "Frozen fries instead of cutting and cooking potatoes",
    block: POTATO_BLOCK,
  },
  onion: {
    mention: /(?<!green )\b(?:chopped |sliced |diced )?onions?\b(?! powder)/i,
    mode: "drop",
    rename: "onion powder",
    object: "the onion powder",
    change: "Onion powder instead of chopping an onion",
  },
  garlic: {
    mention: /\b(?:minced |chopped )?garlic(?: cloves?)?\b(?! powder)/i,
    mode: "drop",
    rename: "garlic powder",
    object: "the garlic powder",
    change: "Garlic powder instead of mincing garlic",
  },
  "bell-pepper": {
    mention: /(?<!black |cayenne |chili |salt and )\b(?:bell |red |green )?peppers?\b(?! flakes)/i,
    mode: "rename",
    rename: "frozen peppers and onions",
    object: "the frozen peppers and onions",
    change: "Frozen sliced peppers and onions instead of slicing fresh ones",
  },
  broccoli: {
    mention: /(?<!frozen )\bbroccoli(?: florets)?\b/i,
    mode: "rename",
    rename: "frozen broccoli",
    object: "the frozen broccoli",
    change: "Frozen broccoli instead of cutting fresh",
  },
  zucchini: {
    mention: /\bzucchinis?\b/i,
    mode: "rename",
    rename: "frozen mixed vegetables",
    object: "the frozen vegetables",
    change: "Frozen mixed vegetables instead of chopping zucchini",
  },
  cream: {
    mention: /(?<!sour |ice |whipped )\b(?:whipping )?cream\b(?! cheese)/i,
    mode: "rename",
    rename: "alfredo sauce",
    object: "the alfredo sauce",
    change: "Jarred alfredo sauce instead of making a cream sauce",
  },
};

function friesStep(eq: ReadonlySet<Equipment>): CookStep | null {
  if (eq.has("air_fryer")) return { timerSec: 900, equipment: "air_fryer", text: () => "Air fry the fries at 200°C (400°F) for 15 minutes, shaking halfway" };
  if (eq.has("oven")) return { timerSec: 1200, equipment: "oven", text: () => "Bake the fries on a tray at 220°C (425°F) for 20 minutes, turning once" };
  return null;
}

/** When peppers AND onion are both swapped, both become one bag of frozen peppers and onions. */
const PEPPER_ONION = "frozen-peppers-onions";

/* ------------------------------------------------------------------ clause grammar */

const PREP_VERBS = ["finely chop", "roughly chop", "peel and chop", "chop", "dice", "slice", "cut", "mince", "peel", "halve", "quarter", "trim", "shred", "grate", "crush", "rinse", "wash", "pat"];
const COOK_VERBS = ["stir-fry", "air fry", "air-fry", "cook", "brown", "fry", "sauté", "saute", "sear", "grill", "roast", "bake", "boil", "simmer", "microwave", "broil", "steam"];
const NEUTRAL_VERBS = [
  "add", "stir in", "stir", "pour in", "crack in", "mix in", "fold in", "toss in", "toss", "mix", "combine", "serve", "top", "fill", "spread", "return", "sprinkle", "scatter", "pour", "season", "brush", "layer", "divide", "move", "put", "place", "lay", "rub", "dip", "press", "tip", "transfer", "scoop", "split", "fold", "drizzle", "squeeze", "eat", "pack", "spoon", "push", "rest", "set", "flip", "turn", "shake", "cover", "warm", "heat", "melt", "lower", "bring", "make", "beat", "whisk", "crack", "drain", "thaw", "keep", "let", "remove", "use", "scrape", "wrap", "roll", "slide", "break", "fluff", "save", "dot", "loosen", "smash", "mash", "poke", "scrub", "toast", "assemble", "build", "sit", "cool", "refrigerate", "store", "reheat",
];
const ALL_VERBS = [...new Set([...PREP_VERBS, ...COOK_VERBS, ...NEUTRAL_VERBS])].sort((a, b) => b.length - a.length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const VERB_ALT = ALL_VERBS.map(esc).join("|");
const ADVERB = "(?:gently |quickly |carefully |then |also |finely |roughly )?";
/** Clause boundaries: ", ", ", and ", ", then ", " and ", " then " right before a verb. */
const SPLIT = new RegExp(`(,\\s*(?:and\\s+|then\\s+)?|\\s+(?:and|then)\\s+)(?=${ADVERB}(?:${VERB_ALT})\\b)`, "gi");
const LEAD = /^((?:meanwhile|first|then|next|now|finally|near the end|in the same pan|at lunch|when it's hot|once hot)[,]?\s+)/i;
const VERB_AT_START = new RegExp(`^${ADVERB}(${VERB_ALT})\\b`, "i");
const LIST_END = /\s(?:with|in|on|over|into|for|until|to|at|from|as|per|about|under|between|through|across|onto|inside|while|so|before|after|like)\b|\s\d|\s\(|\s½|\s¼|\s¾|\s⅓/i;
const PRONOUN = /^(it|them|everything|it all)\b/i;
const NOT_AN_OBJECT = /^(again|well|through|together|everything|it all|once|twice|halfway|occasionally|now and then|gently|well to coat|over)$/i;
const TIME = /(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*(minutes?|mins?|seconds?|secs?)\b/i;
const HEAT_ONLY = /^(?:(?:lower|reduce|raise|turn)\b[^.]*\b(?:heat|low|medium|high)\b[^.]*\.\s*)+$/i;
const FAT = /\bin (the (?:canola |olive |vegetable |sesame )?(?:oil|butter))\b/i;

type VerbKind = "prep" | "cook" | "neutral";

/** Verbs whose missing object can be restored after a prep clause is removed ("Rub with the oil"). */
const OBJECT_VERBS = new Set(["rub", "toss", "season", "coat", "brush", "sprinkle", "serve"]);

function verbKind(v: string): VerbKind {
  const l = v.toLowerCase();
  if (PREP_VERBS.includes(l)) return "prep";
  if (COOK_VERBS.includes(l)) return "cook";
  return "neutral";
}

interface Clause {
  sep: string; // separator before it ("" for the first)
  lead: string; // "Meanwhile " etc.
  verb: string; // as written, e.g. "Cook" / "Finely chop"
  kind: VerbKind | "none";
  head: string; // "the " before the first item, or ""
  items: string[];
  pronoun: string | null;
  tail: string;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseClause(raw: string, sep: string): Clause {
  let rest = raw.trim();
  let lead = "";
  const lm = LEAD.exec(rest);
  if (lm) {
    lead = lm[1];
    rest = rest.slice(lead.length);
  }
  const vm = VERB_AT_START.exec(rest);
  if (!vm) return { sep, lead, verb: "", kind: "none", head: "", items: [], pronoun: null, tail: rest };
  const verb = rest.slice(0, vm[0].length);
  const kind = verbKind(vm[1]);
  const after = rest.slice(vm[0].length).trim();
  const pm = PRONOUN.exec(after);
  if (pm) return { sep, lead, verb, kind, head: "", items: [], pronoun: pm[1], tail: after.slice(pm[1].length) };
  // an object list runs until a preposition, a number or the end
  const endM = LIST_END.exec(" " + after);
  const listText = endM ? after.slice(0, Math.max(0, endM.index - 1)) : after;
  const tail = after.slice(listText.length);
  if (!listText.trim() || NOT_AN_OBJECT.test(listText.trim())) return { sep, lead, verb, kind, head: "", items: [], pronoun: null, tail: after };
  const head = /^the\s/i.test(listText) ? listText.slice(0, 4) : "";
  const items = listText
    .slice(head.length)
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { sep, lead, verb, kind, head, items, pronoun: null, tail };
}

function parseSentence(sentence: string): Clause[] {
  const body = sentence.replace(/[.!?]\s*$/, "");
  const parts = body.split(SPLIT);
  const out: Clause[] = [];
  // split() with a capture group interleaves the separators: [clause, sep, clause, sep, clause]
  for (let i = 0; i < parts.length; i += 2) out.push(parseClause(parts[i], i === 0 ? "" : parts[i - 1]));
  return out;
}

function joinItems(head: string, items: string[]): string {
  if (!items.length) return "";
  const list = items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  if (head) return /^(the|a|an)\s/i.test(list) ? list : head + list;
  return list;
}

function clauseText(c: Clause, items: string[] = c.items, tail: string = c.tail, object?: string | null): string {
  let s = `${c.lead}${c.verb}`.trim();
  const obj = object ?? c.pronoun ?? joinItems(c.head, items);
  if (obj) s += ` ${obj}`;
  const t = tail.trim();
  if (t) s += /^[,;:)]/.test(t) ? t : ` ${t}`;
  return s.replace(/\s{2,}/g, " ").trim();
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^(BBQ|I )/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sentenceText(clauses: { sep: string; text: string }[]): string {
  const kept = clauses.filter((c) => c.text);
  if (!kept.length) return "";
  const s = upperFirst(kept.map((c, i) => (i === 0 ? c.text : `${c.sep}${lowerFirst(c.text)}`)).join(""));
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function timeSec(text: string): number | null {
  const m = TIME.exec(text);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  const mid = (a + b) / 2;
  return Math.round(/^s/i.test(m[3]) ? mid : mid * 60);
}

/* ------------------------------------------------------------------ mention detection (safety net) */

const GENERIC_LAST = new Set(["sauce", "cheese", "mix", "powder", "oil", "seasoning", "milk", "beans", "chips", "pack", "slices", "strips", "pouch", "fillets", "flakes", "pepper"]);

const mentionCache = new Map<string, RegExp | null>();
/**
 * A loose "is this ingredient named in the text" test, used only to compare a recipe's steps
 * before and after a rewrite (so its imperfections cancel out). `soleOil`: the recipe's only
 * oil may be called just "the oil".
 */
function ingredientMention(key: string, soleOil = false, strict = false): RegExp | null {
  const ck = `${key}|${soleOil}|${strict}`;
  if (mentionCache.has(ck)) return mentionCache.get(ck)!;
  const e = getIngredient(key);
  let re: RegExp | null = null;
  if (e && key !== "water") {
    const forms = new Set<string>();
    const clean = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/,.*$/, "").trim();
    forms.add(clean(e.name));
    if (e.inline) forms.add(clean(e.inline));
    for (const n of Object.values(e.nouns ?? {})) n?.forEach((x) => forms.add(clean(x)));
    forms.add(key.replace(/-(raw|cooked|dry|jarred|frozen|canned|deli|lean|whole|firm|plain|\d+)$/g, "").replace(/-/g, " "));
    // loose mode also accepts the last word ("shells" for taco shells); strict mode (removing a
    // garnish from a sentence) never does: "green onions" must not match the onion
    const last = clean(e.inline ?? e.name).split(/\s+/).pop() ?? "";
    if (!strict && last.length >= 4 && !GENERIC_LAST.has(last)) forms.add(last);
    if (key === "black-pepper") forms.add("pepper");
    if (soleOil && key.endsWith("-oil")) forms.add("oil");
    const alts = [...forms].filter((f) => f.length >= 3).map((f) => esc(f).replace(/s$/, "") + "(?:e?s)?");
    re = alts.length ? new RegExp(`\\b(?:${alts.join("|")})\\b`, "i") : null;
  }
  mentionCache.set(ck, re);
  return re;
}

/* ------------------------------------------------------------------ the rewrite */

type ActiveSwap = SwapRule & { to: string; renameAs?: string; cookStep: CookStep | null };

interface Plan {
  /** Ingredient key → the rule used (only swaps still active). */
  swaps: Map<string, ActiveSwap>;
  /** Optional lines to drop. */
  dropOptional: Set<string>;
}

interface Rewrite {
  steps: RecipeStep[];
  savedSec: number;
  /** Swaps / optional keys that could not be rewritten with confidence. */
  abort: Set<string>;
  equipment: Set<Equipment>;
}

function rewriteSteps(recipe: Recipe, plan: Plan): Rewrite {
  const abort = new Set<string>();
  const equipment = new Set<Equipment>(recipe.equipment);
  const stovetop = equipment.has("stovetop");
  let savedSec = 0;
  const cooked = new Set<string>(); // replace-mode swaps whose new cooking step is placed
  const placedAsName = new Set<string>(); // drop-mode swaps already named in a step
  const dropped = new Set<string>(); // drop-mode swaps whose original was removed somewhere
  const soleOil = recipe.ingredients.filter((l) => l.key.endsWith("-oil")).length === 1;

  const swapKeys = [...plan.swaps.keys()];
  const optKeys = [...plan.dropOptional];
  // "salt and pepper" is black pepper when the recipe has it: a bare "pepper" item is never the bell pepper then
  const hasBlackPepper = recipe.ingredients.some((l) => l.key === "black-pepper");
  const swapIn = (text: string) => swapKeys.filter((k) => plan.swaps.get(k)!.mention.test(text) && !(k === "bell-pepper" && hasBlackPepper && /^(?:the\s)?pepper$/i.test(text.trim())));
  // other ingredients named in an object-less clause ("crack in the eggs") make it about them
  const others = recipe.ingredients.filter((l) => !plan.swaps.has(l.key)).map((l) => ingredientMention(l.key, soleOil, true)).filter((re): re is RegExp => !!re);
  const namesOther = (text: string) => others.some((re) => re.test(text));
  const optIn = (text: string) => optKeys.filter((k) => ingredientMention(k, soleOil, true)?.test(text));

  // wording that means a swap would change the dish
  for (const k of swapKeys) {
    const rule = plan.swaps.get(k)!;
    if (rule.block && recipe.steps.some((st) => rule.mention.test(st.text) && rule.block!.test(st.text))) abort.add(k);
  }
  // with black pepper in the recipe too, a bare "the pepper" could be either: leave the bell pepper alone
  if (plan.swaps.has("bell-pepper") && hasBlackPepper && recipe.steps.some((st) => /(?<!salt and |black |bell |red |green |cayenne |chili )\bpepper\b(?! flakes)/i.test(st.text))) abort.add("bell-pepper");
  // peppers and onion share one frozen bag only when the steps always handle them together
  const bag = plan.swaps.get("onion")?.to === PEPPER_ONION && plan.swaps.has("bell-pepper");

  // what the previous clause was about (for "it", "them" and object-less verbs)
  let last: { swaps: Set<string>; other: boolean; kept: boolean; sentence: string } = { swaps: new Set(), other: false, kept: true, sentence: "" };
  let pendingObject: string | null = null; // a swap whose prep clause was just removed

  const steps: RecipeStep[] = [];
  for (const step of recipe.steps) {
    const parallel = /\bmeanwhile\b/i.test(step.text);
    const sentencesOut: string[] = [];
    let changed = false;
    let replaced: CookStep | null = null;
    let pendingLead = "";
    let panHeated = false;

    for (const [si, sentence] of splitSentences(step.text).entries()) {
      const sentenceId = `${step.text}#${si}`;
      const out: { sep: string; text: string }[] = [];
      const pre: string[] = []; // whole sentences placed before this one (a shortcut cooked separately)
      for (const c of parseSentence(sentence)) {
        const original = clauseText(c);
        const itemSw = c.items.map((it) => swapIn(it));
        const tailSw = swapIn(c.tail);
        const explicit = new Set([...itemSw.flat(), ...tailSw]);
        const hasObject = c.items.length > 0;
        const implicitRef = !hasObject && c.kind !== "none";
        const prevOnlySwaps = last.swaps.size > 0 && !last.other;
        const about = new Set(explicit);
        if (!about.size && implicitRef && prevOnlySwaps && (c.kind === "cook" || c.kind === "prep" || !!c.pronoun || (pendingObject && last.swaps.has(pendingObject)))) {
          last.swaps.forEach((s) => about.add(s));
        }
        const opts = new Set([...c.items.flatMap((it) => optIn(it)), ...optIn(c.tail)]);

        let items = [...c.items];
        let tail = c.tail;
        let drop = false;
        let before: string | null = null;
        let beforeAlone = false; // the new cooking is a sentence of its own (the clause still cooks other things)
        let object: string | null = null;

        // optional garnish: out of the object list or a trailing "with …" list
        for (const k of opts) {
          const re = ingredientMention(k, soleOil, true)!;
          const n = items.length;
          items = items.filter((it) => !re.test(it));
          if (n && !items.length) drop = true;
          const wm = /^(.*?\bwith\s)(.+)$/i.exec(tail);
          if (wm && re.test(wm[2])) {
            const endM = LIST_END.exec(" " + wm[2]);
            const withList = endM && endM.index > 0 ? wm[2].slice(0, endM.index - 1) : wm[2];
            const after = wm[2].slice(withList.length);
            const head = /^the\s/i.test(withList) ? "the " : "";
            const kept = withList
              .slice(head.length)
              .split(/,\s*(?:and\s+)?|\s+and\s+/)
              .map((s) => s.trim())
              .filter((s) => s && !re.test(s));
            tail = kept.length ? `${wm[1]}${joinItems(head, kept)}${after}` : `${wm[1].replace(/\s*\bwith\s$/i, "")}${after}`;
          } else if (re.test(tail)) abort.add(k);
        }

        for (const k of about) {
          const rule = plan.swaps.get(k)!;
          const inItems = itemSw.flat().includes(k);
          const inTailOnly = !inItems && tailSw.includes(k);
          const isExplicit = explicit.has(k);
          const pure = isExplicit ? hasObject && itemSw.every((s) => s.length > 0) && tailSw.every((t) => itemSw.flat().includes(t)) : true;
          const t = (timeSec(original) ?? 0) * (/per side/i.test(original) ? 2 : 1);
          const par = parallel ? 0.4 : 1;
          if (c.kind === "none" || inTailOnly) {
            if (c.kind === "neutral" && rule.mode === "replace") continue; // "serve with the chicken" stays true
            if (inTailOnly && rule.mode === "rename") {
              tail = tail.replace(rule.mention, rule.renameAs ?? rule.rename ?? "");
              continue;
            }
            abort.add(k);
            continue;
          }
          if (c.kind === "prep") {
            const n = items.length;
            items = items.filter((it) => !rule.mention.test(it));
            if (!items.length) {
              drop = true;
              savedSec += 120;
              pendingObject = k;
            } else savedSec += 60 * (n - items.length);
            if (rule.mode === "drop") dropped.add(k);
            continue;
          }
          if (c.kind === "cook") {
            if (rule.mode === "rename") {
              items = renameItems(items, rule, plan);
              continue;
            }
            if (rule.mode === "drop") {
              items = items.filter((it) => !rule.mention.test(it));
              if (!items.length) {
                drop = true;
                savedSec += t * par;
              }
              dropped.add(k);
              continue;
            }
            // replace-mode: the shortcut has its own, quicker cooking
            const cook = rule.cookStep;
            if (!cook) {
              abort.add(k);
              continue;
            }
            if (!isExplicit && last.kept && last.sentence === sentenceId && !pendingObject) {
              // "add the chicken … and cook 10 minutes more": other food in the same pan or basket
              // still needs that time, so the clause stays as written
              cooked.add(k);
              continue;
            }
            if (pure) drop = true;
            else {
              items = items.filter((it) => !rule.mention.test(it));
              beforeAlone = true;
            }
            if (!cooked.has(k)) {
              const fat = FAT.exec(original)?.[1] ?? null;
              before = cook.text({ panHeated, fat, stovetop });
              replaced = cook;
              cooked.add(k);
              if (pure) savedSec += Math.max(0, t - cook.timerSec) * par;
            } else if (pure) savedSec += t * par;
            if (cook.equipment) equipment.add(cook.equipment);
            continue;
          }
          // neutral verbs: the shortcut is used the same way
          // "Slice the chicken. Rub with the oil and spices." → "Rub the chicken with …" (seasoning verbs only)
          if (!isExplicit && pendingObject === k && !c.pronoun && rule.mode === "replace" && OBJECT_VERBS.has(c.verb.trim().toLowerCase()) && (!c.tail.trim() || /^with\b/i.test(c.tail.trim()))) object = rule.object;
          if (rule.mode === "replace") continue;
          items = renameItems(items, rule, plan);
          if (rule.mode === "drop" && isExplicit) placedAsName.add(k);
        }

        if (bag) {
          const names = new Set([...itemSw.flat(), ...tailSw]);
          if (names.has("onion") !== names.has("bell-pepper")) abort.add("onion");
        }
        // a garnish-only clause with nothing left to add goes ("Top with green onion" → nothing)
        if (!drop && !items.length && !c.pronoun && !object && !tail.trim() && opts.size && /^(top|garnish|sprinkle|drizzle|scatter|squeeze)$/i.test(c.verb.trim())) drop = true;
        const text = drop ? "" : clauseText(c, items, tail, object);
        if (before || text !== original) changed = true;
        if (drop && c.lead && !pendingLead) pendingLead = c.lead;
        const withLead = (s: string) => {
          if (!pendingLead || !s) return s;
          const r = `${pendingLead}${lowerFirst(s)}`;
          pendingLead = "";
          return r;
        };
        if (before && beforeAlone) pre.push(`${upperFirst(before)}.`);
        else if (before) out.push({ sep: c.sep, text: withLead(before) });
        if (text) out.push({ sep: before && !beforeAlone ? " and " : c.sep, text: withLead(text) });
        if (text && /\bheat\b/i.test(text) && /\b(pan|pot|skillet|wok)\b/i.test(text)) panHeated = true;

        // remember what this clause was about
        if (hasObject) last = { swaps: new Set(itemSw.flat()), other: itemSw.some((s) => !s.length), kept: !drop, sentence: sentenceId };
        else if (!about.size && namesOther(c.tail)) last = { swaps: new Set(), other: true, kept: true, sentence: sentenceId };
        else if (about.size) last = { swaps: about, other: false, kept: !drop, sentence: sentenceId };
        if (!(c.kind === "prep" && drop && about.size)) pendingObject = null;
      }
      sentencesOut.push(...pre);
      const s = sentenceText(out);
      if (s) sentencesOut.push(s);
    }
    // a raw-meat safety note follows the raw meat: a warmed shortcut gets the reheat note instead
    const rawSafety = !!step.safety && [...plan.swaps.entries()].some(([k, r]) => r.mode === "replace" && !abort.has(k) && r.mention.test(step.safety!));
    if (!changed) {
      if (rawSafety) steps.push({ ...step, safety: SAFE.reheat });
      else steps.push(step);
      continue;
    }
    const text = sentencesOut.join(" ").trim();
    if (!text || HEAT_ONLY.test(text)) continue;
    const next: RecipeStep = { text };
    const origPhrase = TIME.exec(step.text)?.[0];
    const timer = step.timerSec && origPhrase && text.includes(origPhrase) ? step.timerSec : replaced ? replaced.timerSec : step.timerSec ? timeSec(text) : null;
    if (timer) next.timerSec = Math.min(4 * 3600, Math.max(5, timer));
    const stillCooksIt = [...plan.swaps.values()].some((r) => r.mode === "replace" && r.mention.test(text));
    const safety = rawSafety ? (replaced?.safety ?? (stillCooksIt ? SAFE.reheat : undefined)) : (step.safety ?? replaced?.safety);
    if (safety) next.safety = safety;
    steps.push(next);
  }

  // a seasoning swap must end up in the steps: add it to the first seasoning list, or give up
  for (const k of swapKeys) {
    const rule = plan.swaps.get(k)!;
    if (rule.mode !== "drop" || abort.has(k) || placedAsName.has(k)) continue;
    if (!dropped.has(k)) {
      abort.add(k);
      continue;
    }
    let placed = false;
    for (let i = 0; i < steps.length && !placed; i++) {
      const t = steps[i].text;
      const m = /\b((?:the )?(?:spices|seasonings?|italian seasoning|taco seasoning|chili powder|cumin|paprika|garlic powder|salt|pepper|oregano))(,| and)/i.exec(t);
      if (m) {
        steps[i] = { ...steps[i], text: `${t.slice(0, m.index)}${m[1]}, ${rule.rename}${m[2] === "," ? "," : " and"}${t.slice(m.index + m[0].length)}` };
        placed = true;
      }
    }
    if (!placed) abort.add(k);
  }

  // equipment no step needs any more (never stovetop/microwave: "a pan" is often implied)
  const all = steps.map((s) => s.text).join(" ");
  if (!/\bair[- ]?fr/i.test(all)) equipment.delete("air_fryer");
  if (!/\b(oven|bake|broil|roast)/i.test(all)) equipment.delete("oven");
  if (!/\btoast/i.test(all)) equipment.delete("toaster");
  if (!/\bblend/i.test(all)) equipment.delete("blender");
  if (!/\bgrill/i.test(all)) equipment.delete("grill");
  if (!/\bkettle|boiling water from/i.test(all)) equipment.delete("kettle");
  if (!equipment.size) recipe.equipment.forEach((e) => equipment.add(e));

  return { steps, savedSec, abort, equipment };
}

/** Replace the swapped items by the shortcut's name; two swaps into the same bag become one item. */
function renameItems(items: string[], rule: ActiveSwap, plan: Plan): string[] {
  const name = rule.renameAs ?? rule.rename ?? "";
  const out: string[] = [];
  const add = (v: string) => {
    if (!out.some((o) => o.replace(/^the\s/i, "") === v.replace(/^the\s/i, ""))) out.push(v);
  };
  for (const it of items) {
    const partner = [...plan.swaps.values()].find((r) => r !== rule && r.mention.test(it) && (r.renameAs ?? r.rename) === name);
    if (rule.mention.test(it) || partner) add(/^the\s/i.test(it) ? `the ${name}` : name);
    else out.push(it);
  }
  return out;
}

/* ------------------------------------------------------------------ ingredients */

function mergeLine(lines: RecipeIngredient[], add: RecipeIngredient): RecipeIngredient[] {
  const i = lines.findIndex((l) => l.key === add.key && !l.optional);
  if (i < 0) return [...lines, add];
  const cur = lines[i];
  const g = (lineGrams(cur) ?? 0) + (lineGrams(add) ?? 0);
  const each = gramsFor(cur.key, 1, cur.unit);
  if (!each) return lines;
  const q = friendlyQty(g / each, cur.unit, cur.key);
  const merged: RecipeIngredient = { ...cur, qty: q.qty, unit: q.unit };
  if (!cur.note && add.note) merged.note = add.note;
  return lines.map((l, j) => (j === i ? merged : l));
}

/* ------------------------------------------------------------------ steps */

/** Merge neighbouring steps until there are at most `max` (never two timers or two different safety notes in one step). */
export function mergeSteps(steps: RecipeStep[], max: number): RecipeStep[] {
  const out = [...steps];
  while (out.length > max) {
    let best = -1;
    let bestLen = Infinity;
    for (let i = 0; i + 1 < out.length; i++) {
      const a = out[i];
      const b = out[i + 1];
      if (a.timerSec && b.timerSec) continue;
      if (a.safety && b.safety && a.safety !== b.safety) continue;
      const len = a.text.length + b.text.length;
      if (len > 230) continue;
      if (len < bestLen) {
        bestLen = len;
        best = i;
      }
    }
    if (best < 0) break;
    const a = out[best];
    const b = out[best + 1];
    const m: RecipeStep = { text: `${a.text} ${b.text}` };
    const timer = a.timerSec ?? b.timerSec;
    if (timer) m.timerSec = timer;
    const safety = a.safety ?? b.safety;
    if (safety) m.safety = safety;
    out.splice(best, 2, m);
  }
  return out;
}

/* ------------------------------------------------------------------ public API */

export type SimplifyResult =
  | {
      ok: true;
      /** "easier_version": the library's own simpler recipe (plan it by key, nothing to store). "simplified": a new recipe to store (origin "simplified"). */
      kind: "easier_version" | "simplified";
      recipe: Recipe;
      /** What changed, in plain words, for the user. */
      changes: string[];
      unchanged?: undefined;
    }
  | { ok: false; unchanged: true; reason: string };

export interface SimplifyOptions {
  /** The user's hard constraints: an easier version or a swap that breaks them is never used. */
  prefs?: ConstraintPrefs;
  /** Look up an `easierKey` (default: the library). */
  lookup?: (key: string) => Recipe | undefined;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listWords = (xs: string[], conj = "and") => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} ${conj} ${xs[xs.length - 1]}`);

function slugOf(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "recipe"
  );
}

/** "Chicken Alfredo" → "Easier Chicken Alfredo" (at most 60 characters). */
export function easierName(name: string): string {
  const base = name.replace(/^(easy|easier|quick|simple)\s+/i, "");
  const n = `Easier ${base}`;
  return n.length <= 60 ? n : n.slice(0, 60).replace(/\s+\S*$/, "");
}

/**
 * "Make this easier". Returns the easier recipe and the plain-words changes, or
 * `{ unchanged: true, reason }` when nothing can honestly be simplified.
 */
export function simplifyRecipe(recipe: Recipe, opts: SimplifyOptions = {}): SimplifyResult {
  const prefs = opts.prefs;
  const allowed = (r: Pick<Recipe, "ingredients" | "equipment">) => !prefs || recipeConflicts(r, prefs).length === 0;
  const lookup = opts.lookup ?? getLibraryRecipe;
  const before = { minutes: recipe.minutes, ingredients: ingredientCount(recipe), steps: recipe.steps.length };

  // 1. the hand-written easier version
  if (recipe.easierKey) {
    const easy = lookup(recipe.easierKey);
    if (easy && easy.key !== recipe.key && allowed(easy) && easy.slots.some((s) => recipe.slots.includes(s))) {
      const after = { minutes: easy.minutes, ingredients: ingredientCount(easy), steps: easy.steps.length };
      const changes = [`Swapped for ${easy.name}, the ${DIFFICULTY_LABEL[easy.difficulty]} version`];
      if (after.minutes < before.minutes) changes.push(`About ${after.minutes} min instead of ${before.minutes}`);
      if (after.ingredients < before.ingredients) changes.push(`${plural(after.ingredients, "ingredient")} instead of ${before.ingredients}`);
      if (after.steps < before.steps) changes.push(`${plural(after.steps, "step")} instead of ${before.steps}`);
      changes.push(nutritionChange(recipe, easy));
      return { ok: true, kind: "easier_version", recipe: easy, changes };
    }
  }

  // 2. shortcut swaps + dropping optional garnish + merging steps
  const eq = new Set<Equipment>(prefs?.equipment ?? recipe.equipment);
  const plan: Plan = { swaps: new Map(), dropOptional: new Set(recipe.ingredients.filter((l) => l.optional).map((l) => l.key)) };
  const has = (k: string) => recipe.ingredients.some((l) => l.key === k && !l.optional);
  for (const l of recipe.ingredients) {
    const base = SWAPS[l.key];
    if (l.optional || !base || !applyShortcut(l)) continue;
    let rule: ActiveSwap = { ...base, to: applyShortcut(l)!.key, cookStep: base.cook?.(eq) ?? null };
    if (l.key === "onion" && has("bell-pepper")) {
      // one bag of frozen peppers and onions covers both
      const pepper = SWAPS["bell-pepper"];
      rule = { ...rule, mode: "rename", to: PEPPER_ONION, renameAs: pepper.rename, object: pepper.object, change: pepper.change };
    }
    // the shortcut itself must be fine for this user (an onion dislike rules out the pepper-onion bag)
    if (!allowed({ ingredients: [{ key: rule.to, qty: 1, unit: "g" }], equipment: rule.cookStep?.equipment ? [rule.cookStep.equipment] : [] })) continue;
    if (rule.mode === "replace" && !rule.cookStep) continue;
    plan.swaps.set(l.key, rule);
  }
  if (!plan.swaps.size && !plan.dropOptional.size) return unchanged(recipe, before);

  const settled = settleRewrite(recipe, plan);
  if (!settled) return unchanged(recipe, before);
  const { rw, unusedStaples } = settled;

  // ingredients: swapped lines replaced (merged when two land on the same bag), dropped lines removed
  let ingredients: RecipeIngredient[] = recipe.ingredients.filter(
    (l) => !(l.optional && plan.dropOptional.has(l.key)) && !(plan.swaps.has(l.key) && !l.optional) && !(!l.optional && unusedStaples.includes(l.key)),
  );
  for (const l of recipe.ingredients) {
    const rule = plan.swaps.get(l.key);
    if (!rule || l.optional) continue;
    const sc = applyShortcut(l);
    if (!sc) continue;
    let add: RecipeIngredient = sc;
    if (rule.to !== sc.key) {
      // into the pepper-and-onion bag: the same weight of frozen mix, in cups
      const g = lineGrams(l) ?? 0;
      const each = gramsFor(rule.to, 1, "cup");
      const q = each ? friendlyQty(g / each, "cup", rule.to) : { qty: Math.max(1, Math.round(g)), unit: "g" as const };
      add = { key: rule.to, qty: q.qty, unit: q.unit, note: "instead of fresh peppers and onion" };
    }
    ingredients = mergeLine(ingredients, add);
  }
  if (plan.swaps.get("onion")?.to === PEPPER_ONION && plan.swaps.has("bell-pepper")) {
    ingredients = ingredients.map((l) => (l.key === PEPPER_ONION && !l.optional ? { ...l, note: "instead of fresh peppers and onion" } : l));
  }

  const steps = mergeSteps(rw.steps, SUPER_EASY.maxSteps);
  const longest = Math.max(0, ...steps.map((s) => s.timerSec ?? 0)) / 60;
  const minutes = Math.min(recipe.minutes, Math.max(3, Math.ceil(longest + 2), Math.round(recipe.minutes - rw.savedSec / 60)));

  const draft = {
    key: `usr:${slugOf(recipe.name)}-easier`,
    name: easierName(recipe.name),
    slots: recipe.slots,
    minutes,
    difficulty: recipe.difficulty,
    ingredients: ingredients.map(({ grams: _g, ...l }) => l),
    steps,
    equipment: [...rw.equipment],
    tags: recipe.tags,
    blurb: "",
    origin: "simplified" as const,
    baseKey: recipe.key,
    ...(recipe.makeAhead ? { makeAhead: recipe.makeAhead } : {}),
  };
  draft.difficulty = meetsSuperEasy(draft) ? "super_easy" : minutes <= 30 && recipe.difficulty === "i_like_cooking" ? "everyday" : recipe.difficulty;
  const after = { minutes, ingredients: ingredientCount(draft), steps: steps.length };
  const droppedOpt = [...plan.dropOptional].filter((k) => recipe.ingredients.some((l) => l.key === k && l.optional));
  const substantive = plan.swaps.size > 0 || droppedOpt.length > 0;
  const better = after.minutes < before.minutes || after.ingredients < before.ingredients || after.steps < before.steps || plan.swaps.size > 0;
  const notWorse = after.minutes <= before.minutes && after.ingredients <= before.ingredients && after.steps <= before.steps;
  if (!substantive || !better || !notWorse) return unchanged(recipe, before);

  const swapsUsed = [...plan.swaps.values()];
  const bits = [...new Set(swapsUsed.map((r) => shortName(r.to)))];
  draft.blurb = (bits.length ? `Shortcut version: ${bits.slice(0, 3).join(", ")}. ${minutes} minutes.` : `Fewer things to buy, ${minutes} minutes.`).slice(0, 140);

  const v = validateRecipe(draft);
  if (!v.ok) return { ok: false, unchanged: true, reason: "The shortcut version didn't pass the recipe checks, so the original stays." };
  if (!allowed(v.recipe)) return { ok: false, unchanged: true, reason: "The shortcuts for this recipe don't fit your allergies, diet or equipment." };

  const changes: string[] = [];
  for (const r of swapsUsed) if (!changes.includes(r.change)) changes.push(r.change);
  if (droppedOpt.length) changes.push(`Left out the optional ${listWords(droppedOpt.map((k) => ingredientName(k).toLowerCase()))}`);
  if (unusedStaples.length) changes.push(`No ${listWords(unusedStaples.map((k) => ingredientName(k).toLowerCase()), "or")} needed now`);
  if (after.minutes < before.minutes) changes.push(`About ${after.minutes} min instead of ${before.minutes}`);
  if (after.ingredients < before.ingredients) changes.push(`${plural(after.ingredients, "ingredient")} instead of ${before.ingredients}`);
  if (after.steps < before.steps) changes.push(`${plural(after.steps, "step")} instead of ${before.steps}`);
  if (v.recipe.difficulty !== recipe.difficulty) changes.push(`Now ${DIFFICULTY_LABEL[v.recipe.difficulty]}`);
  changes.push(nutritionChange(recipe, v.recipe));
  return { ok: true, kind: "simplified", recipe: v.recipe, changes };
}

function shortName(key: string): string {
  const map: Record<string, string> = {
    "chicken-breast-cooked": "cooked chicken",
    "rotisserie-chicken": "rotisserie chicken",
    "rice-cooked-microwave": "microwave rice",
    "fries-frozen": "frozen fries",
    "onion-powder": "onion powder",
    "garlic-powder": "garlic powder",
    "frozen-peppers-onions": "frozen peppers and onions",
    "frozen-broccoli": "frozen broccoli",
    "frozen-mixed-veg": "frozen veg",
    "alfredo-sauce-jarred": "jarred alfredo",
  };
  return map[key] ?? ingredientName(key).toLowerCase();
}

/** "Nutrition recalculated: 950 → 905 kcal, 63 → 61 g protein a serving (estimate)", or "about the same". */
export function nutritionChange(a: Recipe, b: Recipe): string {
  const x = recipeMacros(a, 1);
  const y = recipeMacros(b, 1);
  if (Math.abs(x.kcal - y.kcal) < 10 && Math.abs(x.protein - y.protein) < 2) return `Nutrition about the same: ${y.kcal.toLocaleString("en-US")} kcal, ${Math.round(y.protein)} g protein a serving (estimate)`;
  return `Nutrition recalculated: ${x.kcal.toLocaleString("en-US")} → ${y.kcal.toLocaleString("en-US")} kcal, ${Math.round(x.protein)} → ${Math.round(y.protein)} g protein a serving (estimate)`;
}

function unchanged(recipe: Recipe, before: { minutes: number; ingredients: number; steps: number }): SimplifyResult {
  if (meetsSuperEasy(recipe)) {
    return { ok: false, unchanged: true, reason: `This is already as simple as it gets: ${before.minutes} min, ${plural(before.ingredients, "ingredient")}, ${plural(before.steps, "step")}.` };
  }
  return { ok: false, unchanged: true, reason: "There's no shortcut for this one that keeps it the same meal. Every step is doing real work." };
}

/**
 * Ingredients the original steps name that the rewritten steps no longer do. Non-staples mean
 * the rewrite lost something (that change is undone); staples (oil, butter, spices) only
 * cooked the swapped ingredient, so they simply leave the recipe.
 */
function lostIngredients(recipe: Recipe, plan: Plan, rw: Rewrite): { lost: string[]; staples: string[] } {
  const soleOil = recipe.ingredients.filter((l) => l.key.endsWith("-oil")).length === 1;
  const before = recipe.steps.map((s) => s.text).join(" ");
  const after = rw.steps.map((s) => s.text).join(" ");
  const lost: string[] = [];
  const staples: string[] = [];
  for (const l of recipe.ingredients) {
    if (l.optional || plan.swaps.has(l.key) || plan.dropOptional.has(l.key)) continue;
    const re = ingredientMention(l.key, soleOil);
    if (!re || !re.test(before) || re.test(after)) continue;
    // the same ingredient named by a swap's new name ("garlic powder" kept) is not lost
    if (getIngredient(l.key)?.staple) staples.push(l.key);
    else lost.push(l.key);
  }
  return { lost, staples };
}

const without = (plan: Plan, k: string): Plan => {
  const swaps = new Map(plan.swaps);
  swaps.delete(k);
  const dropOptional = new Set(plan.dropOptional);
  dropOptional.delete(k);
  return { swaps, dropOptional };
};

/**
 * Rewrite with as many swaps as apply cleanly. Swaps the rewriter flags are dropped; if the
 * result loses a (non-staple) ingredient the original steps used, the change responsible is
 * found by retrying without each one (all go if no single one is to blame). Mutates `plan` to
 * what was actually applied. Null when nothing is left to change.
 */
function settleRewrite(recipe: Recipe, plan: Plan): { rw: Rewrite; unusedStaples: string[] } | null {
  for (let guard = 0; guard < 12; guard++) {
    if (!plan.swaps.size && !plan.dropOptional.size) return null;
    const rw = rewriteSteps(recipe, plan);
    if (rw.abort.size) {
      for (const k of rw.abort) {
        plan.swaps.delete(k);
        plan.dropOptional.delete(k);
      }
      continue;
    }
    const { lost, staples } = lostIngredients(recipe, plan, rw);
    if (!lost.length) return { rw, unusedStaples: staples };
    const keys = [...plan.swaps.keys(), ...plan.dropOptional];
    const culprit = keys.find((k) => {
      const p = without(plan, k);
      const r = rewriteSteps(recipe, p);
      return !r.abort.size && !lostIngredients(recipe, p, r).lost.length;
    });
    for (const k of culprit ? [culprit] : keys) {
      plan.swaps.delete(k);
      plan.dropOptional.delete(k);
    }
  }
  return null;
}

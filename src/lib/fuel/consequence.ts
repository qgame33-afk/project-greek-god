// What a meal does to today, in one line (docs/DESIGN-V3-SIMPLE.md §4.4.1, §4.7.2). Pure
// arithmetic on the day's log, so every line carries its working (`explain`), which screens show
// in the line's "How we got this" sheet (there are no provenance tags any more).
//
//   ifYouAdd({kcal: 2140, protein: 121}, {kcal: 380, protein: 30})
//     → "If you eat it: 2,520 kcal · 151 g"     explain "2,140 eaten + 380 = 2,520 kcal · 121 + 30 = 151 g protein"
//   dayLine({kcal: 2140, protein: 121}, [{kcal: 380, protein: 30}, {kcal: 770, protein: 35}], goals)
//     → "Log the rest as planned and today lands at 3,290 kcal · 186 g"

export interface KcalProtein {
  kcal: number;
  protein: number;
}

export interface Consequence extends KcalProtein {
  text: string;
  explain: string;
  /** For VoiceOver: "If you eat it, today comes to 2,520 calories and 151 grams of protein". */
  spoken: string;
}

const fin = (n: number) => (Number.isFinite(n) ? n : 0);
const kcalText = (n: number) => Math.round(fin(n)).toLocaleString("en-US");
const gText = (n: number) => String(Math.round(fin(n)));

export type ConsequenceVerb = "eat" | "add";

/** Today's totals after one more meal. `verb` "add" for the scanner and the Add sheet ("If you add it"). */
export function ifYouAdd(totals: KcalProtein, addition: KcalProtein, verb: ConsequenceVerb = "eat"): Consequence {
  const kcal = fin(totals.kcal) + fin(addition.kcal);
  const protein = fin(totals.protein) + fin(addition.protein);
  const lead = verb === "add" ? "If you add it" : "If you eat it";
  return {
    kcal,
    protein,
    text: `${lead}: ${kcalText(kcal)} kcal · ${gText(protein)} g`,
    explain: `${kcalText(totals.kcal)} eaten + ${kcalText(addition.kcal)} = ${kcalText(kcal)} kcal · ${gText(totals.protein)} + ${gText(addition.protein)} = ${gText(protein)} g protein`,
    spoken: `${lead}, today comes to ${kcalText(kcal)} calories and ${gText(protein)} grams of protein`,
  };
}

export type DayLineKind = "lands" | "to_go" | "met" | "empty";

export interface DayLine extends KcalProtein {
  kind: DayLineKind;
  text: string;
  explain: string;
}

/**
 * The day line under the meters. With planned meals still ahead: where today lands if they are
 * logged as planned (eaten + every remaining planned meal). With none: how much protein is left
 * to the goal, or that the goal is met.
 */
export function dayLine(eaten: KcalProtein, remaining: readonly KcalProtein[], goals: { protein: number } | null): DayLine {
  const kcal = remaining.reduce((a, r) => a + fin(r.kcal), fin(eaten.kcal));
  const protein = remaining.reduce((a, r) => a + fin(r.protein), fin(eaten.protein));
  if (remaining.length) {
    const kParts = [`${kcalText(eaten.kcal)} eaten`, ...remaining.map((r) => kcalText(r.kcal))];
    const pParts = [gText(eaten.protein), ...remaining.map((r) => gText(r.protein))];
    return {
      kind: "lands",
      kcal,
      protein,
      text: `Log the rest as planned and today lands at ${kcalText(kcal)} kcal · ${gText(protein)} g`,
      explain: `${kParts.join(" + ")} planned = ${kcalText(kcal)} kcal · ${pParts.join(" + ")} = ${gText(protein)} g protein`,
    };
  }
  const goal = goals && goals.protein > 0 ? goals.protein : null;
  if (goal == null) return { kind: "empty", kcal, protein, text: "Nothing else planned today", explain: `${kcalText(kcal)} kcal · ${gText(protein)} g protein logged` };
  const left = Math.round(goal - fin(eaten.protein));
  if (left <= 0)
    return { kind: "met", kcal, protein, text: `${gText(goal)} g reached · nothing else planned today`, explain: `${gText(eaten.protein)} g logged of a ${gText(goal)} g goal` };
  return { kind: "to_go", kcal, protein, text: `${left} g to go · nothing else planned today`, explain: `${gText(goal)} g goal − ${gText(eaten.protein)} g logged = ${left} g` };
}

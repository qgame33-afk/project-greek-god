// LOCAL UI TESTING ONLY. Deterministic stand-ins for the Gemini step of the two food
// routes, used when NODE_ENV=development and AI_MOCK=1 (see isMock in gemini.ts). The
// rest of the pipeline — sanitising, database lookups, totals — still runs for real, and
// every response is marked mock: true so the UI shows a DEV MOCK badge.

import type { AIFoodItem } from "./food-schemas";

export const MOCK_MODEL = "dev-mock";

/** Development-only switch. Production builds always return false. */
export function foodMockEnabled(headers?: Headers): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (process.env.AI_MOCK === "1") return true;
  // lets a local browser test opt in without restarting the dev server
  return headers?.get("x-pgg-ai-mock") === "1";
}

type Raw = Record<string, unknown>;

const item = (name: string, grams: number, kcal: number, p: number, c: number, f: number, extra: Partial<Record<string, unknown>> = {}): Raw => ({
  name,
  portion_description: extra.portion_description ?? `about ${grams} g`,
  estimated_grams: grams,
  quantity: extra.quantity ?? 1,
  unit: extra.unit ?? "serving",
  preparation: extra.preparation ?? "unknown",
  kind: extra.kind ?? "generic",
  brand: extra.brand ?? "",
  est_calories: kcal,
  est_protein: p,
  est_carbs: c,
  est_fat: f,
  confidence: extra.confidence ?? 0.7,
  search_query: extra.search_query ?? name.toLowerCase(),
  saved_food_id: "",
});

export function mockPhoto(answers: { questionId: string; answer: string }[] = []): Raw {
  const a = new Map(answers.map((x) => [x.questionId, x.answer.toLowerCase()]));
  const method = a.get("chicken_method");
  const sauce = a.get("sauce_type");
  const items: Raw[] = [];
  if (method?.startsWith("fried")) {
    items.push(
      item("Fried chicken breast", 170, 371, 49, 7, 16, {
        preparation: "fried",
        portion_description: "1 medium breast",
        search_query: "chicken breast fried",
        confidence: 0.72,
      }),
    );
  } else if (method?.startsWith("baked")) {
    items.push(
      item("Baked chicken breast", 170, 281, 53, 0, 6, {
        preparation: "baked",
        portion_description: "1 medium breast",
        search_query: "chicken breast roasted",
        confidence: 0.78,
      }),
    );
  } else {
    items.push(
      item("Grilled chicken breast", 170, 281, 53, 0, 6, {
        preparation: "grilled",
        portion_description: "1 medium breast",
        search_query: "chicken breast roasted",
        confidence: method ? 0.8 : 0.66,
      }),
    );
  }
  items.push(
    item("White rice", 200, 260, 5.4, 56, 0.6, {
      preparation: "boiled",
      portion_description: "about 1¼ cups",
      search_query: "rice white cooked",
      confidence: 0.62,
    }),
  );
  items.push(
    item("Broccoli", 90, 32, 2.2, 6.3, 0.4, {
      preparation: "steamed",
      portion_description: "about 1 cup florets",
      search_query: "broccoli cooked boiled",
      confidence: 0.82,
    }),
  );
  if (sauce?.startsWith("tomato"))
    items.push(item("Tomato sauce", 45, 23, 0.7, 4, 0.5, { portion_description: "about 3 tbsp", search_query: "tomato sauce", confidence: 0.6 }));
  else if (sauce?.startsWith("no")) {
    /* no sauce */
  } else
    items.push(
      item("Creamy garlic sauce", 40, 140, 0.6, 2.4, 14.4, {
        portion_description: "about 3 tbsp",
        search_query: "garlic sauce creamy",
        confidence: sauce ? 0.58 : 0.34,
      }),
    );

  const questions = [];
  if (!a.has("chicken_method")) questions.push({ id: "chicken_method", question: "Was the chicken grilled or fried?", options: ["Grilled", "Fried", "Baked"] });
  if (!a.has("sauce_type"))
    questions.push({ id: "sauce_type", question: "Was the sauce creamy or tomato-based?", options: ["Creamy", "Tomato-based", "No sauce"] });
  return {
    not_food: false,
    items,
    overall_confidence: answers.length ? 0.74 : 0.6,
    caveats: ["Cooking oil and butter aren't visible, so fat may be higher.", "The sauce amount is hard to judge from above."],
    questions,
  };
}

function fromDraft(draft: AIFoodItem[]): Raw[] {
  return draft.map((d) =>
    item(d.name, d.grams ?? 0, d.estimate.calories, d.estimate.protein, d.estimate.carbs, d.estimate.fat, {
      quantity: d.quantity,
      unit: d.unit,
      kind: d.kind,
      brand: d.brand ?? "",
      preparation: d.preparation,
      portion_description: d.portion,
      search_query: d.searchQuery,
      confidence: d.confidence,
    }),
  );
}

export function mockChat(message: string, draft: AIFoodItem[] | null): Raw {
  const m = message.toLowerCase();
  const base = { notes: [], questions: [], corrections: [], needs_clarification: false, is_revision: false, meal_hint: "unknown" };

  if (/\b(add|log|save)\b.*\b(it|this|that|log|diary)\b/.test(m) && draft?.length) {
    return { ...base, intent: "add_to_log", reply: "Ready when you are. Review the draft and tap **Confirm & add**.", items: fromDraft(draft) };
  }

  const slices = /\b(six|6|five|5|four|4|seven|7)\s+slices?\b/.exec(m);
  if (slices && draft?.some((d) => /pizza/i.test(d.name))) {
    const n = { six: 6, five: 5, four: 4, seven: 7 }[slices[1] as "six"] ?? Number(slices[1]);
    const items = fromDraft(draft).map((r) => {
      if (!/pizza/i.test(String(r.name))) return r;
      const f = n / Number(r.quantity || 8);
      return {
        ...r,
        quantity: n,
        unit: "slice",
        portion_description: `${n} slices`,
        estimated_grams: Math.round(Number(r.estimated_grams) * f),
        est_calories: Math.round(Number(r.est_calories) * f),
        est_protein: Math.round(Number(r.est_protein) * f),
        est_carbs: Math.round(Number(r.est_carbs) * f),
        est_fat: Math.round(Number(r.est_fat) * f),
      };
    });
    return {
      ...base,
      intent: "correction",
      is_revision: true,
      reply: `Updated to ${n} slices. The pizza is still an estimate.`,
      items,
      corrections: ["No dip", "Thin crust"],
    };
  }

  if (/egg/.test(m) && /bagel/.test(m)) {
    return {
      ...base,
      intent: "log_meal",
      meal_hint: "breakfast",
      reply: "About **1,000 kcal** and 60 g protein. Bagel size varies a lot, so check the portion.",
      items: [
        item("Hard-boiled eggs", 150, 233, 18.9, 1.7, 15.9, {
          quantity: 3,
          unit: "egg",
          portion_description: "3 large eggs",
          preparation: "boiled",
          search_query: "egg whole cooked hard-boiled",
          confidence: 0.85,
        }),
        item("Plain bagels", 210, 578, 21, 112, 3.6, {
          quantity: 2,
          unit: "bagel",
          portion_description: "2 medium bagels",
          search_query: "bagel plain",
          confidence: 0.6,
        }),
        item("Protein shake", 330, 160, 30, 6, 2.5, {
          quantity: 1,
          unit: "bottle",
          portion_description: "1 ready-to-drink bottle",
          search_query: "protein shake",
          confidence: 0.45,
        }),
      ],
      corrections: ["Fried eggs", "Large bagels", "Shake made with milk"],
      questions: [{ id: "shake_type", question: "Which protein shake was it?", options: ["Ready-to-drink bottle", "Powder with water", "Powder with milk"] }],
    };
  }

  if (/chicken/.test(m) && /rice/.test(m)) {
    return {
      ...base,
      intent: "log_meal",
      reply: "About **820 kcal** with 82 g protein. Weights are taken as cooked.",
      items: [
        item("Cooked chicken breast", 250, 413, 77.5, 0, 9, {
          quantity: 250,
          unit: "g",
          portion_description: "250 g cooked",
          preparation: "roasted",
          search_query: "chicken breast roasted",
          confidence: 0.9,
        }),
        item("White rice, cooked", 316, 411, 8.5, 89, 0.9, {
          quantity: 2,
          unit: "cup",
          portion_description: "2 cups cooked",
          preparation: "boiled",
          search_query: "rice white cooked",
          confidence: 0.8,
        }),
      ],
      corrections: ["Brown rice", "Thighs, not breast", "1 cup rice"],
    };
  }

  if (/pizza/.test(m) && /wing/.test(m) && !/domino|pizza hut|papa|little caesar/.test(m)) {
    return {
      ...base,
      intent: "log_meal",
      needs_clarification: true,
      reply: "A few details change this a lot.",
      items: [],
      questions: [
        { id: "restaurant", question: "Where was it from?", options: ["Domino's", "Pizza Hut", "Papa John's", "Homemade"] },
        { id: "size", question: "What size was the pizza?", options: ["Small", "Medium", "Large"] },
        { id: "wings", question: "How many wings?", options: ["6", "8", "10", "12"] },
      ],
    };
  }

  if (/domino/.test(m) || (/pizza/.test(m) && /wing/.test(m))) {
    return {
      ...base,
      intent: "log_meal",
      meal_hint: "dinner",
      reply: "About **2,560 kcal**. Domino's values here are estimates, not their published numbers. Use **Research** to fetch the official figures.",
      items: [
        item("Medium hand-tossed pepperoni pizza", 640, 1840, 76, 200, 80, {
          quantity: 8,
          unit: "slice",
          kind: "restaurant",
          brand: "Domino's",
          portion_description: "8 slices (whole medium)",
          search_query: "pizza pepperoni medium crust",
          confidence: 0.5,
        }),
        item("Boneless chicken wings", 280, 720, 40, 52, 38, {
          quantity: 8,
          unit: "piece",
          kind: "restaurant",
          brand: "Domino's",
          portion_description: "8 pieces, plain",
          preparation: "fried",
          search_query: "chicken wings boneless",
          confidence: 0.45,
        }),
      ],
      corrections: ["6 slices", "Thin crust", "With ranch dip", "Large size"],
    };
  }

  if (/bolognese|spaghetti|pasta/.test(m)) {
    return {
      ...base,
      intent: "log_meal",
      reply: "About **780 kcal**. Homemade sauces vary, so the meat and oil are the big unknowns.",
      items: [
        item("Spaghetti bolognese", 450, 778, 38, 92, 27, {
          quantity: 1,
          unit: "bowl",
          portion_description: "1 large bowl",
          search_query: "spaghetti with meat sauce",
          confidence: 0.5,
        }),
      ],
      corrections: ["Lean beef", "Extra parmesan", "Small bowl"],
      questions: [{ id: "bowl_size", question: "How big was the bowl?", options: ["About 1 cup", "About 2 cups", "About 3 cups"] }],
    };
  }

  return {
    ...base,
    intent: "other",
    needs_clarification: true,
    reply: 'Tell me what you ate and roughly how much, for example "two eggs and toast" or "250 g chicken and a cup of rice".',
    items: [],
  };
}

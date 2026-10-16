import { describe, expect, it } from "vitest";
import { clampDay, composeEatenAt, dayLabel, formatAmount, formatClock, isTime, leftLabel, macroLine, monthGrid, timeValue } from "./format";
import { asMeal, groupMates, mealItems, mealSections, type EntryLike } from "./group";
import { groupLabel, provenanceOf } from "./provenance";
import { parseSearchResponse, searchErrorFor, statusNotes } from "./search";
import { consistencyNote, previewMacros, validateFoodForm, weightNote, emptyForm } from "./validate";
import { buildWeek } from "./week";
import { entriesFromSavedMeal, parseSavedMealItems, savedMealItemFromEntry, savedMealTotals } from "./savedMeal";
import { clampWater, liters, undoTarget, waterCells } from "./water";
import type { FoodRow } from "./portion";

describe("format", () => {
  it("formats amounts with natural plurals", () => {
    expect(formatAmount(250, "g")).toBe("250 g");
    expect(formatAmount(1, "serving")).toBe("1 serving");
    expect(formatAmount(1.5, "serving")).toBe("1.5 servings");
    expect(formatAmount(330, "ml")).toBe("330 mL");
    expect(formatAmount(0.333333, "cup")).toBe("0.33 cups");
  });

  it("labels what's left without judgement", () => {
    expect(leftLabel(185, 142, "g")).toEqual({ text: "43 g left", state: "left" });
    expect(leftLabel(3300, 3420)).toEqual({ text: "+120 over", state: "over" });
    expect(leftLabel(185, 185.2)).toEqual({ text: "Goal met", state: "met" });
    expect(leftLabel(0, 10)).toBeNull();
    expect(macroLine({ protein: 42.4, carbs: 91.6, fat: 11 })).toBe("P 42 · C 92 · F 11");
  });

  it("round-trips local times", () => {
    const iso = composeEatenAt("2026-10-16", "08:14");
    expect(timeValue(iso)).toBe("08:14");
    expect(formatClock(iso)).toBe("8:14 AM");
    expect(formatClock(composeEatenAt("2026-10-16", "00:05"))).toBe("12:05 AM");
    expect(timeValue(composeEatenAt("2026-10-16", "nonsense"))).toBe("12:00");
    expect(isTime("23:59")).toBe(true);
    expect(isTime("24:00")).toBe(false);
  });

  it("names days and never lets them run into the future", () => {
    expect(dayLabel("2026-10-16", "2026-10-16")).toBe("Today");
    expect(dayLabel("2026-10-15", "2026-10-16")).toBe("Yesterday");
    expect(dayLabel("2026-10-12", "2026-10-16")).toBe("Mon, Oct 12");
    expect(clampDay("2026-10-20", "2026-10-16")).toBe("2026-10-16");
    expect(clampDay("garbage", "2026-10-16")).toBe("2026-10-16");
    expect(clampDay("2026-09-01", "2026-10-16")).toBe("2026-09-01");
  });

  it("lays out a Monday-first month", () => {
    const g = monthGrid("2026-10-01"); // Oct 1 2026 is a Thursday
    expect(g[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(g.flat().filter(Boolean)).toHaveLength(31);
    expect(g.every((r) => r.length === 7)).toBe(true);
  });
});

const e = (id: string, meal: string, t: string, group: string | null = null, kcal = 100): EntryLike => ({
  id,
  meal,
  eaten_at: `2026-10-16T${t}:00.000Z`,
  meal_group_id: group,
  calories: kcal,
  protein_g: 10,
  carbs_g: 10,
  fat_g: 1,
});

describe("grouping", () => {
  it("splits by meal in time order and folds groups", () => {
    const list = [e("c", "lunch", "12:40", "g1", 300), e("a", "breakfast", "08:00"), e("b", "lunch", "12:30", "g1", 200), e("d", "lunch", "13:00", "solo"), e("x", "brunch", "10:00")];
    const s = mealSections(list);
    expect(s.map((m) => m.entries.length)).toEqual([1, 3, 0, 1]);
    expect(s[1].totals.calories).toBe(600);
    expect(s[1].items).toHaveLength(2);
    const grp = s[1].items[0];
    expect(grp.kind).toBe("group");
    if (grp.kind === "group") {
      expect(grp.entries.map((x) => x.id)).toEqual(["b", "c"]);
      expect(grp.totals.calories).toBe(500);
    }
    expect(s[1].items[1]).toMatchObject({ kind: "entry" }); // single-member group shows as a row
    expect(asMeal("brunch")).toBe("snacks");
    expect(groupMates(list, list[0]).map((x) => x.id)).toEqual(["c", "b"]);
    expect(groupMates(list, list[1])).toHaveLength(1);
    expect(mealItems([])).toEqual([]);
  });
});

describe("provenance", () => {
  const base = { source: "manual", confidence: "logged", source_name: null, source_url: null };
  it("shows nothing for plain logs", () => expect(provenanceOf(base)).toBeNull());
  it("marks database rows", () => {
    expect(provenanceOf({ ...base, source: "usda", confidence: "database", source_url: "https://fdc.nal.usda.gov/1" })).toEqual({
      kind: "database",
      name: "USDA FoodData Central",
      short: "USDA",
      url: "https://fdc.nal.usda.gov/1",
    });
    expect(provenanceOf({ ...base, source: "chat_ai", confidence: "database", source_name: "Open Food Facts" })).toMatchObject({ kind: "database", short: "Open Food Facts", url: null });
  });
  it("only shows SOURCE with a real URL", () => {
    expect(provenanceOf({ ...base, source: "assistant_handoff", confidence: "verified", source_name: "Domino's US", source_url: "https://www.dominos.com/nutrition" })).toEqual({
      kind: "source",
      name: "Domino's US",
      url: "https://www.dominos.com/nutrition",
    });
    expect(provenanceOf({ ...base, source: "assistant_handoff", confidence: "verified", source_url: "javascript:alert(1)" })).toBeNull();
    expect(provenanceOf({ ...base, confidence: "verified", source_url: "https://example.com/x" })).toMatchObject({ kind: "source", name: "example.com" });
  });
  it("treats uncited AI values as estimates", () => {
    expect(provenanceOf({ ...base, source: "photo_ai", confidence: "estimate" })).toEqual({ kind: "estimate" });
    expect(provenanceOf({ ...base, source: "chat_ai" })).toEqual({ kind: "estimate" });
    expect(groupLabel("photo_ai")).toBe("Photo scan");
  });
});

describe("search contract", () => {
  it("parses results leniently and drops malformed ones", () => {
    const r = parseSearchResponse({
      results: [
        { id: 1, name: "Egg", brand: "", source: "usda", sourceName: "USDA", sourceUrl: null, servingAmount: 1, servingUnit: "piece", servingGrams: 50, per100g: null, perServing: { calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8 } },
        { id: "2", name: "Broken", source: "usda", perServing: null },
        { id: "3", name: "Weird", source: "other", perServing: { calories: 1, protein: 1, carbs: 1, fat: 1 } },
      ],
      status: { usda: "demo_key", off: "error" },
    });
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ id: "1", brand: null, servingGrams: 50 });
    expect(statusNotes(r.status)).toEqual(["USDA is on the shared demo key, so it may be rate-limited.", "Open Food Facts didn't respond."]);
    expect(parseSearchResponse(null)).toEqual({ results: [], status: { usda: null, off: null } });
    expect(searchErrorFor(404).message).toBe("Food search is unavailable.");
    expect(searchErrorFor("network").kind).toBe("offline");
  });
});

describe("manual validation", () => {
  it("accepts a complete entry", () => {
    const r = validateFoodForm({ name: "  Greek  yogurt ", brand: "", amount: "250", unit: "grams", calories: "148", protein: "25", carbs: "9", fat: "1" });
    expect(r).toEqual({ ok: true, value: { name: "Greek yogurt", brand: null, amount: 250, unit: "g", macros: { calories: 148, protein: 25, carbs: 9, fat: 1 }, caloriesFromMacros: false } });
  });

  it("rejects negatives, junk and absurd values", () => {
    const r = validateFoodForm({ name: "", brand: "", amount: "0", unit: "g", calories: "-5", protein: "abc", carbs: "9999", fat: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toMatchObject({ name: "Enter a food name.", amount: "Enter an amount above 0.", calories: "Can't be negative.", protein: "Enter a number.", carbs: "That's above 3,000. Check the number." });
      expect(r.errors.fat).toBeUndefined();
    }
  });

  it("takes calories from macros when left blank, and requires one or the other", () => {
    const r = validateFoodForm({ ...emptyForm({ name: "Shake", calories: "", protein: "50", carbs: "10", fat: "2" }) });
    expect(r.ok && r.value.macros.calories).toBe(258);
    expect(r.ok && r.value.caloriesFromMacros).toBe(true);
    const blank = validateFoodForm(emptyForm({ name: "Mystery" }));
    expect(blank.ok).toBe(false);
    expect(!blank.ok && blank.errors.calories).toMatch(/Enter calories/);
  });

  it("gives a soft consistency note, never a block", () => {
    expect(consistencyNote({ calories: 540, protein: 42, carbs: 60, fat: 24 })).toBe("Macros add to 624 kcal; you entered 540.");
    expect(consistencyNote({ calories: 600, protein: 42, carbs: 60, fat: 24 })).toBeNull();
    expect(consistencyNote({ calories: 100, protein: 0, carbs: 0, fat: 0 })).toBeNull();
    expect(weightNote(100, "g", { calories: 0, protein: 90, carbs: 30, fat: 5 })).toBe("Macros weigh 125 g, more than the 100 g portion.");
    expect(weightNote(1, "serving", { calories: 0, protein: 90, carbs: 30, fat: 5 })).toBeNull();
    expect(previewMacros({ calories: "", protein: "10", carbs: "10", fat: "10" })).toEqual({ macros: { calories: 170, protein: 10, carbs: 10, fat: 10 }, derived: 170, caloriesBlank: true });
  });
});

describe("week strip", () => {
  it("builds 7 real days and averages logged days only", () => {
    const w = buildWeek(
      [
        { local_date: "2026-10-10", calories: 3300, protein_g: 190, entries: 6 },
        { local_date: "2026-10-12", calories: 2500, protein_g: 150, entries: 4 },
        { local_date: "2026-10-16", calories: 1200, protein_g: 90, entries: 2 },
      ],
      "2026-10-16",
      "2026-10-16",
      { calories: 3300, protein: 185 },
    );
    expect(w.days.map((d) => d.date)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(w.days.map((d) => d.letter).join("")).toBe("SSMTWTF");
    expect(w.loggedDays).toBe(3);
    expect(w.avgKcal).toBe(2333);
    expect(w.proteinHits).toBe(1);
    expect(w.calorieHits).toBe(1);
    expect(w.days[1]).toMatchObject({ logged: false, kcal: null, pct: 0 });
    expect(w.days[6].isToday).toBe(true);
    expect(buildWeek([], "2026-10-16", "2026-10-16", { calories: 3300, protein: 185 }).avgKcal).toBeNull();
  });
});

describe("saved meals", () => {
  const entry = {
    id: "e1",
    user_id: "u",
    local_date: "2026-10-16",
    eaten_at: "2026-10-16T08:00:00.000Z",
    meal: "breakfast",
    name: "Oats",
    brand: null,
    amount: 80,
    unit: "g",
    grams: 80,
    calories: 304,
    protein_g: 10.4,
    carbs_g: 54,
    fat_g: 5.6,
    base_amount: 100,
    base_calories: 380,
    base_protein_g: 13,
    base_carbs_g: 67.5,
    base_fat_g: 7,
    source: "usda",
    confidence: "database",
    source_name: "USDA FoodData Central",
    source_url: "https://fdc.nal.usda.gov/2",
    meal_group_id: null,
    saved_food_id: null,
    photo_path: null,
    created_at: "",
    updated_at: "",
  } satisfies FoodRow;

  it("round-trips items and logs them as one group", () => {
    const items = parseSavedMealItems([savedMealItemFromEntry(entry), { name: "Banana", calories: "105", protein: 1.3, carbs: 27, fat: 0.4, amount: 1, unit: "piece" }, { name: "" }, 42]);
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ protein_g: 1.3, carbs_g: 27 });
    expect(savedMealTotals(items).calories).toBe(409);
    const rows = entriesFromSavedMeal(items, { meal: "breakfast", date: "2026-10-17", eatenAt: "t", groupId: "g", ids: ["i1", "i2"] });
    expect(rows[0]).toMatchObject({ id: "i1", local_date: "2026-10-17", meal_group_id: "g", source: "saved_meal", confidence: "database", base_amount: 100, base_calories: 380, amount: 80 });
    expect(rows[1]).toMatchObject({ id: "i2", base_amount: 1, base_calories: 105, confidence: "logged" });
    expect(parseSavedMealItems("nope")).toEqual([]);
  });
});

describe("water", () => {
  it("fills 12 cells proportionally", () => {
    const c = waterCells(1750, 3000);
    expect(c.filter((x) => x === 1)).toHaveLength(7);
    expect(c[7]).toBeCloseTo(0);
    expect(waterCells(4000, 3000).every((x) => x === 1)).toBe(true);
    expect(waterCells(500, 0).every((x) => x === 0)).toBe(true);
    expect(liters(1850)).toBe("1.9");
    expect(clampWater(3)).toBe(50);
    expect(clampWater(433)).toBe(430);
  });

  it("undoes the tap that was just made", () => {
    const logs = [
      { id: "a", amount_ml: 500, logged_at: "2026-10-16T08:00:00Z" },
      { id: "b", amount_ml: 500, logged_at: "2026-10-16T09:00:00Z" },
      { id: "c", amount_ml: 250, logged_at: "2026-10-16T09:01:00Z" },
    ];
    expect(undoTarget(logs, new Set(["a"]), 500)?.id).toBe("b");
    expect(undoTarget(logs, new Set(["a", "b", "c"]), 500)).toBeNull();
    expect(undoTarget(logs, new Set(), 500, "a")?.id).toBe("a");
  });
});

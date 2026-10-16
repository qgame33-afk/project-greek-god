import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync, zipSync } from "fflate";
import { assembleExport, exportFilename, mealPhotoArchiveName, photoArchiveName, readme } from "./assemble";
import { csvCell, csvColumns, formatBytes, toCSV } from "./csv";
import { isThumbnail, listAllFiles, removeFiles, splitThumbnails, type Lister, type StorageEntry } from "./storage";
import { EXPORT_ORDER, EXPORT_TABLES, KEPT_ON_WIPE, WIPE_TABLES, countLabel, fileLines, wipeSummary, wipeTotal } from "./tables";

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("Push A")).toBe("Push A");
    expect(csvCell(185)).toBe("185");
    expect(csvCell(-0.4)).toBe("-0.4");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(NaN)).toBe("");
  });
  it("quotes commas, quotes, newlines and edge spaces", () => {
    expect(csvCell("Chicken, rice")).toBe('"Chicken, rice"');
    expect(csvCell('6" sub')).toBe('"6"" sub"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell(" padded")).toBe('" padded"');
  });
  it("serialises objects as JSON", () => {
    expect(csvCell({ "1": "push_a" })).toBe('"{""1"":""push_a""}"');
    expect(csvCell([1, 2])).toBe('"[1,2]"');
  });
  it("neutralises spreadsheet formulas but not negative numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1 rep")).toBe("'+1 rep");
    expect(csvCell("@me")).toBe("'@me");
    expect(csvCell("-felt heavy")).toBe("'-felt heavy");
    expect(csvCell("-12.5")).toBe("-12.5");
  });
});

describe("toCSV", () => {
  it("unions columns in first-seen order and uses CRLF", () => {
    const rows = [
      { id: "a", weight_lb: 163, notes: null },
      { id: "b", weight_lb: 163.4, notes: "salty, late dinner", extra: 1 },
    ];
    expect(csvColumns(rows)).toEqual(["id", "weight_lb", "notes", "extra"]);
    expect(toCSV(rows)).toBe('id,weight_lb,notes,extra\r\na,163,,\r\nb,163.4,"salty, late dinner",1\r\n');
  });
  it("returns an empty string for an empty table", () => {
    expect(toCSV([])).toBe("");
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });
});

describe("assembleExport", () => {
  const meta = { userId: "u1", email: "me@example.com", exportedAt: "2026-10-16T12:00:00.000Z" };
  it("writes data.json, a CSV per table, a README and photos", () => {
    const photo = new Uint8Array([1, 2, 3]);
    const { files, counts } = assembleExport(
      meta,
      { weight_entries: [{ id: "w1", local_date: "2026-10-16", weight_lb: 163 }], profiles: [{ id: "u1", calorie_goal: 3300 }] },
      [{ name: "photos/progress/2026-10-16_front_abcdef12.jpg", bytes: photo }],
    );
    expect(counts.weight_entries).toBe(1);
    expect(counts.food_entries).toBe(0);
    for (const t of EXPORT_TABLES) expect(files[`csv/${t}.csv`]).toBeDefined();
    const zipped = zipSync(files as Parameters<typeof zipSync>[0]);
    const out = unzipSync(zipped);
    const data = JSON.parse(strFromU8(out["data.json"]));
    expect(data.format).toBe("project-greek-god-export");
    expect(data.user.email).toBe("me@example.com");
    expect(data.tables.weight_entries[0].weight_lb).toBe(163);
    expect(Object.keys(data.tables)).toEqual(EXPORT_TABLES);
    expect(strFromU8(out["csv/weight_entries.csv"])).toBe("id,local_date,weight_lb\r\nw1,2026-10-16,163\r\n");
    expect(strFromU8(out["csv/food_entries.csv"])).toBe("");
    expect(Array.from(out["photos/progress/2026-10-16_front_abcdef12.jpg"])).toEqual([1, 2, 3]);
    expect(strFromU8(out["README.txt"])).toContain("weight_entries");
  });
  it("names files predictably", () => {
    expect(exportFilename("2026-10-16")).toBe("greek-god-export-2026-10-16.zip");
    expect(photoArchiveName({ id: "abcdef1234", local_date: "2026-10-16", pose: "front", storage_path: "u/1.webp" })).toBe(
      "photos/progress/2026-10-16_front_abcdef12.webp",
    );
    expect(photoArchiveName({ id: "abcdef1234", local_date: "2026-10-16", pose: "side", storage_path: "u/1" }, "image/png")).toBe(
      "photos/progress/2026-10-16_side_abcdef12.png",
    );
  });
  it("notes skipped photos in the README", () => {
    expect(readme(meta, {}, 2, 1)).toContain("could not be downloaded: 1");
  });
  it("keeps meal photos in their date folders and says so in the README", () => {
    expect(mealPhotoArchiveName("u1/2026-10-16/abc.jpg", "u1")).toBe("photos/meals/2026-10-16/abc.jpg");
    expect(mealPhotoArchiveName("other/x.jpg", "u1")).toBe("photos/meals/other/x.jpg");
    const r = readme(meta, {}, 1, 0, 3);
    expect(r).toContain("photos/meals");
    expect(r).toContain("Photo files included: 4");
    expect(readme(meta, {}, 0, 0)).toContain("not included");
  });
  it("counts meal photos apart in the archive README", () => {
    const { files } = assembleExport(meta, {}, [
      { name: "photos/progress/a.jpg", bytes: new Uint8Array([1]) },
      { name: "photos/meals/2026-10-16/b.jpg", bytes: new Uint8Array([2]) },
    ]);
    const text = new TextDecoder().decode(files["README.txt"] as Uint8Array);
    expect(text).toContain("photos/progress");
    expect(text).toContain("photos/meals");
    expect(text).toContain("Photo files included: 2");
  });
});

describe("listAllFiles", () => {
  it("walks folders and pages", async () => {
    const tree: Record<string, StorageEntry[]> = {
      u1: [
        { name: "2026-10", id: null, metadata: null },
        { name: "a.jpg", id: "1", metadata: { size: 100, mimetype: "image/jpeg" } },
        { name: ".emptyFolderPlaceholder", id: "x", metadata: { size: 0 } },
      ],
      "u1/2026-10": Array.from({ length: 3 }, (_, i) => ({ name: `p${i}.webp`, id: `p${i}`, metadata: { size: 10 } })),
    };
    const calls: string[] = [];
    const lister: Lister = {
      list: async (path, { limit, offset }) => {
        calls.push(`${path}@${offset}`);
        return { data: (tree[path] ?? []).slice(offset, offset + limit), error: null };
      },
    };
    const files = await listAllFiles(lister, "u1/");
    expect(files.map((f) => f.path)).toEqual(["u1/a.jpg", "u1/2026-10/p0.webp", "u1/2026-10/p1.webp", "u1/2026-10/p2.webp"]);
    expect(files.reduce((a, f) => a + f.size, 0)).toBe(130);
    expect(calls).toEqual(["u1@0", "u1/2026-10@0"]);
  });
  it("surfaces storage errors", async () => {
    const lister: Lister = { list: async () => ({ data: null, error: { message: "denied" } }) };
    await expect(listAllFiles(lister, "u1")).rejects.toThrow("denied");
  });
  it("removes in batches", async () => {
    const batches: number[] = [];
    const n = await removeFiles({ remove: async (p) => (batches.push(p.length), { data: p, error: null }) }, Array.from({ length: 250 }, (_, i) => `f${i}`));
    expect(n).toBe(250);
    expect(batches).toEqual([100, 100, 50]);
  });
});

describe("wipe plan", () => {
  it("never erases the profile, templates or habit list, and deletes children first", () => {
    expect(WIPE_TABLES).not.toContain("profiles");
    expect(WIPE_TABLES).not.toContain("program_templates");
    expect(WIPE_TABLES).not.toContain("habit_definitions");
    expect(WIPE_TABLES.indexOf("exercise_sets")).toBeLessThan(WIPE_TABLES.indexOf("workout_sessions"));
    expect(WIPE_TABLES.indexOf("ai_messages")).toBeLessThan(WIPE_TABLES.indexOf("ai_conversations"));
    for (const t of WIPE_TABLES) expect(EXPORT_TABLES).toContain(t);
  });
  it("exports every meal planner table and wipes all but the preferences, plan children first", () => {
    const meal = ["meal_prefs", "meal_plans", "planned_meals", "grocery_items", "recipes", "favourite_recipes", "meal_feedback"] as const;
    for (const t of meal) expect(EXPORT_TABLES).toContain(t);
    expect(new Set(EXPORT_TABLES).size).toBe(EXPORT_TABLES.length);
    expect(new Set(WIPE_TABLES).size).toBe(WIPE_TABLES.length);
    expect(WIPE_TABLES).not.toContain("meal_prefs");
    for (const t of meal.filter((x) => x !== "meal_prefs")) expect(WIPE_TABLES).toContain(t);
    expect(WIPE_TABLES.indexOf("planned_meals")).toBeLessThan(WIPE_TABLES.indexOf("meal_plans"));
    expect(WIPE_TABLES.indexOf("grocery_items")).toBeLessThan(WIPE_TABLES.indexOf("meal_plans"));
    expect(KEPT_ON_WIPE.some((k) => /meal preferences/i.test(k))).toBe(true);
    // tables keyed without an id column page by another column
    expect(EXPORT_ORDER.meal_prefs).toBe("user_id");
    expect(EXPORT_ORDER.favourite_recipes).toBe("recipe_key");
    expect(countLabel("planned_meals", 2)).toBe("2 planned meals");
    expect(countLabel("favourite_recipes", 1)).toBe("1 favourite recipe");
  });
  it("summarises exactly what was removed", () => {
    const r = { rows: { exercise_sets: 120, workout_sessions: 9, weight_entries: 1, food_entries: 0 }, files: { "progress-photos": 2, "meal-photos": 0 }, failed: [] };
    expect(wipeSummary(r)).toEqual(["120 sets", "9 workouts", "1 weigh-in", "2 progress photo files"]);
    expect(wipeTotal(r)).toBe(132);
    expect(countLabel("food_entries", 1)).toBe("1 food entry");
  });
  it("counts thumbnails apart from photos", () => {
    const r = { rows: { progress_photos: 1 }, files: { "progress-photos": 1, "meal-photos": 1 }, thumbs: { "progress-photos": 1 }, failed: [] };
    expect(wipeSummary(r)).toEqual(["1 progress photo entry", "1 progress photo file + 1 thumbnail", "1 meal photo file"]);
    expect(wipeTotal(r)).toBe(4);
    expect(fileLines({ "progress-photos": 3 }, { "progress-photos": 3 })).toEqual(["3 progress photo files + 3 thumbnails"]);
    expect(fileLines({}, {})).toEqual([]);
  });
});

describe("thumbnails", () => {
  it("recognises the .thumb.jpg previews stored next to photos", () => {
    expect(isThumbnail("u1/2026-10-16-front-x.thumb.jpg")).toBe(true);
    expect(isThumbnail("u1/a.png.thumb.jpg")).toBe(true);
    expect(isThumbnail("u1/2026-10-16-front-x.jpg")).toBe(false);
    expect(isThumbnail("u1/thumbnail-front.jpg")).toBe(false);
    const { main, thumbs } = splitThumbnails([{ path: "u1/a.jpg" }, { path: "u1/a.thumb.jpg" }, { path: "u1/b.webp" }]);
    expect(main.map((f) => f.path)).toEqual(["u1/a.jpg", "u1/b.webp"]);
    expect(thumbs.map((f) => f.path)).toEqual(["u1/a.thumb.jpg"]);
  });
});

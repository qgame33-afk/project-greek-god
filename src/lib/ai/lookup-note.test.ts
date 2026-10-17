import { describe, expect, it } from "vitest";
import { usdaDownNote } from "./lookup-note";

const usdaRow = { kind: "generic" as const, provenance: "database" as const, source: { name: "USDA", url: "https://fdc.nal.usda.gov/food-details/171477/nutrients", id: "171477", label: "Chicken" } };
const estimate = { kind: "generic" as const, provenance: "estimate" as const, source: null };
const branded = { kind: "packaged" as const, provenance: "estimate" as const, source: null };

describe("usdaDownNote", () => {
  it("says 'some foods' when another row is a real USDA match", () => {
    expect(usdaDownNote("rate_limited", [usdaRow, estimate], "photo")).toBe("USDA didn't answer for some foods, so those use the photo estimate.");
    expect(usdaDownNote("timeout", [usdaRow, estimate], "chat")).toBe("USDA didn't answer for some foods, so those are estimates.");
  });

  it("keeps the plain note when no row matched USDA", () => {
    expect(usdaDownNote("error", [estimate], "photo")).toBe("USDA didn't answer this time, so generic foods use the photo estimate.");
    expect(usdaDownNote("rate_limited", [estimate, branded], "chat")).toBe("USDA didn't answer this time, so generic foods are estimates.");
  });

  it("says nothing when USDA answered or no generic food fell back", () => {
    expect(usdaDownNote("ok", [estimate], "photo")).toBeNull();
    expect(usdaDownNote("demo_key", [estimate], "photo")).toBeNull();
    expect(usdaDownNote("rate_limited", [usdaRow, branded], "photo")).toBeNull();
    expect(usdaDownNote(undefined, [estimate], "chat")).toBeNull();
  });
});

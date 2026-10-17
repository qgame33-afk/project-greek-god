import { describe, expect, it } from "vitest";
import { pathOf, previousPathname, stepTrail, type Trail } from "./trail";

const walk = (steps: [url: string, how: "push" | "replace" | "pop"][], start = 1) => {
  let t: Trail | null = null;
  let len = start;
  let forward = 0;
  for (const [url, how] of steps) {
    if (t === null) {
      t = stepTrail(null, { url, popped: false, historyLength: len });
      continue;
    }
    if (how === "push") {
      len = len - forward + 1;
      forward = 0;
    } else if (how === "pop") forward = t.back.at(-2) === url ? forward + 1 : Math.max(0, forward - 1);
    t = stepTrail(t, { url, popped: how === "pop", historyLength: len });
  }
  return t!;
};

describe("stepTrail", () => {
  it("records pushes and knows the entry before this one", () => {
    const t = walk([
      ["/nutrition", "push"],
      ["/nutrition/meals", "push"],
      ["/nutrition/meals/recipe/lib:a?meal=1", "push"],
      ["/nutrition/meals/cook/lib:a?meal=1", "push"],
    ]);
    expect(previousPathname(t)).toBe("/nutrition/meals/recipe/lib:a");
    expect(t.back).toHaveLength(4);
  });

  it("goes back and forward along the trail", () => {
    const t = walk([
      ["/nutrition/meals", "push"],
      ["/nutrition/meals/recipe/lib:a?meal=1", "push"],
      ["/nutrition/meals/cook/lib:a?meal=1", "push"],
      ["/nutrition/meals/recipe/lib:a?meal=1", "pop"],
    ]);
    expect(previousPathname(t)).toBe("/nutrition/meals");
    expect(t.forward).toEqual(["/nutrition/meals/cook/lib:a?meal=1"]);
    const f = stepTrail(t, { url: "/nutrition/meals/cook/lib:a?meal=1", popped: true, historyLength: t.length });
    expect(previousPathname(f)).toBe("/nutrition/meals/recipe/lib:a");
    expect(f.forward).toEqual([]);
  });

  it("a link tapped after one Back is a push (drops the forward entry)", () => {
    const t = walk([
      ["/nutrition/meals", "push"],
      ["/nutrition/meals/recipe/lib:a", "push"],
      ["/nutrition/meals/cook/lib:a", "push"],
      ["/nutrition/meals/recipe/lib:a", "pop"],
      ["/nutrition/meals/grocery", "push"],
    ]);
    expect(t.back).toEqual(["/nutrition/meals", "/nutrition/meals/recipe/lib:a", "/nutrition/meals/grocery"]);
    expect(t.forward).toEqual([]);
  });

  it("a replace swaps the current entry", () => {
    const t = walk([
      ["/nutrition/meals", "push"],
      ["/nutrition/meals/recipe/lib:a?meal=1", "push"],
      ["/nutrition/meals/recipe/lib:b?meal=1", "replace"],
    ]);
    expect(t.back).toEqual(["/nutrition/meals", "/nutrition/meals/recipe/lib:b?meal=1"]);
    expect(previousPathname(t)).toBe("/nutrition/meals");
  });

  it("starts over after a jump it can't follow", () => {
    const t = walk([
      ["/", "push"],
      ["/training", "push"],
      ["/progress", "push"],
      ["/coach", "push"],
      ["/", "pop"],
    ]);
    expect(t.back).toEqual(["/"]);
    expect(previousPathname(t)).toBeNull();
  });

  it("ignores a re-run for the entry already showing", () => {
    const t = walk([["/nutrition/meals", "push"]]);
    expect(stepTrail(t, { url: "/nutrition/meals", popped: false, historyLength: t.length })).toEqual(t);
  });

  it("a fresh load has no previous entry", () => {
    expect(previousPathname(walk([["/nutrition/meals/recipe/lib:a", "push"]], 4))).toBeNull();
  });
});

describe("pathOf", () => {
  it("drops the query and hash", () => {
    expect(pathOf("/nutrition/meals/recipe/lib:a?meal=1#x")).toBe("/nutrition/meals/recipe/lib:a");
    expect(pathOf("?x=1")).toBe("/");
  });
});

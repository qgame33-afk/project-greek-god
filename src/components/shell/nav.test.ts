import { describe, expect, it } from "vitest";
import { headingUnderBar, isActive, isFocusRoute } from "./nav";

describe("headingUnderBar", () => {
  it("shows the title once the heading has scrolled up under the bar", () => {
    expect(headingUnderBar({ isIntersecting: false, top: -40, height: 38 }, 420)).toBe(true);
  });
  it("hides it while the heading is still visible", () => {
    expect(headingUnderBar({ isIntersecting: true, top: 96, height: 38 }, 0)).toBe(false);
    expect(headingUnderBar({ isIntersecting: true, top: 64, height: 38 }, 30)).toBe(false);
  });
  it("ignores a heading below the viewport (not intersecting, but not scrolled away)", () => {
    expect(headingUnderBar({ isIntersecting: false, top: 900, height: 38 }, 0)).toBe(false);
  });
  it("ignores a detached or hidden heading (no box: top 0, height 0)", () => {
    expect(headingUnderBar({ isIntersecting: false, top: 0, height: 0 }, 0)).toBe(false);
    expect(headingUnderBar({ isIntersecting: false, top: 0, height: 0 }, 500)).toBe(false);
  });
  it("never shows at scroll 0 (a heading up there is in a full-screen layer)", () => {
    expect(headingUnderBar({ isIntersecting: false, top: 14, height: 22 }, 0)).toBe(false);
  });
});

describe("routes", () => {
  it("matches sections and focus routes", () => {
    expect(isActive("/nutrition/meals/recipe/lib:x", "/nutrition")).toBe(true);
    expect(isActive("/nutrition", "/")).toBe(false);
    expect(isFocusRoute("/nutrition/meals/cook/lib:x")).toBe(true);
    expect(isFocusRoute("/nutrition/meals/recipe/lib:x")).toBe(false);
  });
});

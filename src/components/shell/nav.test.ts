import { describe, expect, it } from "vitest";
import { PRIMARY_NAV, SECONDARY_NAV, avatarInitial, headingUnderBar, hidesCapsule, hidesLiveSlot, isActive, isFocusRoute } from "./nav";

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

describe("the v2 shell", () => {
  it("has four tabs in capsule order and the secondary sections in rail order", () => {
    expect(PRIMARY_NAV.map((n) => [n.label, n.href])).toEqual([
      ["Now", "/"],
      ["Train", "/training"],
      ["Fuel", "/nutrition"],
      ["Ascent", "/progress"],
    ]);
    expect(SECONDARY_NAV.map((n) => n.href)).toEqual(["/coach", "/reviews", "/recovery", "/settings"]);
  });
  it("hides the capsule on focus routes, the scanner and the Food coach, and the live slot on the workout", () => {
    expect(hidesCapsule("/workout/abc")).toBe(true);
    expect(hidesCapsule("/nutrition/scan")).toBe(true);
    expect(hidesCapsule("/nutrition/coach")).toBe(true); // its full-screen composer sits on the bottom edge
    expect(hidesCapsule("/onboarding")).toBe(true);
    expect(hidesCapsule("/nutrition")).toBe(false);
    expect(hidesCapsule("/coach")).toBe(false); // its composer sits above the capsule
    expect(hidesLiveSlot("/workout/abc")).toBe(true);
    expect(hidesLiveSlot("/nutrition/coach")).toBe(true);
    expect(hidesLiveSlot("/training")).toBe(false);
  });
  it("takes the avatar initial from the display name, never the email", () => {
    expect(avatarInitial("quinton")).toBe("Q");
    expect(avatarInitial("  Ana Lee ")).toBe("A");
    expect(avatarInitial("q@example.com")).toBe("·");
    expect(avatarInitial(null)).toBe("·");
    expect(avatarInitial("")).toBe("·");
  });
});

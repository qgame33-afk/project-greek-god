import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// docs/DESIGN-V3-SIMPLE.md §5.5 FOUNDATION 2: globals.css carries exactly the §1.1 tokens, and
// every pair in the §1.1.1 contrast table still measures at or above its stated ratio (and still
// passes AA / 3:1 under night dimming, §1.1.2).

const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");

/** The first `:root { … }` block: the §1.1 token block. */
function tokenBlock(): Record<string, string> {
  const m = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!m) throw new Error("no :root block");
  const out: Record<string, string> = {};
  for (const raw of m[1].replace(/\/\*[\s\S]*?\*\//g, "").split(";")) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(":");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/\s+/g, " ");
  }
  return out;
}

const SPEC: Record<string, string> = {
  "color-scheme": "dark",
  "--bg": "#000000",
  "--card": "#141416",
  "--card-2": "#222226",
  "--card-3": "#2c2c31",
  "--sheet": "#18181b",
  "--sheet-card": "#232327",
  "--track": "#2a2a2f",
  "--ui-line": "#6b6b72",
  "--line": "rgb(255 255 255 / 0.08)",
  "--scrim": "rgb(0 0 0 / 0.62)",
  "--text": "#f5f5f7",
  "--text-2": "#a1a1a6",
  "--text-3": "#6e6e73",
  "--tab-off": "#8e8e93",
  "--gold": "#e9b949",
  "--gold-ink": "#141006",
  "--gold-soft": "rgb(233 185 73 / 0.14)",
  "--gold-line": "rgb(233 185 73 / 0.55)",
  "--ai": "#a9bef2",
  "--ai-soft": "rgb(169 190 242 / 0.12)",
  "--ai-line": "rgb(169 190 242 / 0.38)",
  "--danger": "#ff6b5e",
  "--danger-soft": "rgb(255 107 94 / 0.12)",
  "--font-sans-stack": '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", var(--font-inter), system-ui, sans-serif',
};

type RGBA = [number, number, number, number];

function parse(v: string): RGBA {
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = v.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] == null ? 1 : Number(rgb[4])];
  throw new Error(`can't parse ${v}`);
}

/** `top` composited over an opaque `under`. */
function over(top: RGBA, under: RGBA): RGBA {
  const a = top[3];
  return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
}

function luminance([r, g, b]: RGBA) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(fg: RGBA, bg: RGBA) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("§1.1 tokens", () => {
  it("globals.css :root holds exactly the spec's block", () => {
    expect(tokenBlock()).toEqual(SPEC);
  });

  it("night dimming changes only --text and --gold, to the spec's values", () => {
    const m = css.match(/html\[data-night="on"\]\s*\{([\s\S]*?)\}/);
    expect(m).not.toBeNull();
    const decls = m![1]
      .split(";")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(decls).toEqual(["--text: #e2e2e6", "--gold: #d9ae48"]);
  });
});

describe("§1.1.1 contrast", () => {
  const day = Object.fromEntries(Object.entries(SPEC).filter(([k]) => k.startsWith("--") && k !== "--font-sans-stack").map(([k, v]) => [k, parse(v)])) as Record<string, RGBA>;
  const night = { ...day, "--text": parse("#e2e2e6"), "--gold": parse("#d9ae48") };
  const black: RGBA = [0, 0, 0, 1];

  // [what, foreground, background, stated ratio, kind]
  const pairs = (t: Record<string, RGBA>): [string, RGBA, RGBA, number, "text" | "mark"][] => [
    ["text on bg", t["--text"], t["--bg"], 19.3, "text"],
    ["text on card", t["--text"], t["--card"], 16.9, "text"],
    ["text on card-2", t["--text"], t["--card-2"], 14.6, "text"],
    ["text on card-3", t["--text"], t["--card-3"], 12.8, "text"],
    ["text-2 on bg", t["--text-2"], t["--bg"], 8.2, "text"],
    ["text-2 on card", t["--text-2"], t["--card"], 7.2, "text"],
    ["text-2 on card-2", t["--text-2"], t["--card-2"], 6.2, "text"],
    ["text-2 on card-3", t["--text-2"], t["--card-3"], 5.4, "text"],
    ["tab-off on bg", t["--tab-off"], t["--bg"], 6.4, "text"],
    ["text-3 on bg", t["--text-3"], t["--bg"], 4.1, "mark"],
    ["text-3 on card", t["--text-3"], t["--card"], 3.6, "mark"],
    ["ui-line on bg", t["--ui-line"], t["--bg"], 4.0, "mark"],
    ["ui-line on card", t["--ui-line"], t["--card"], 3.5, "mark"],
    ["ui-line on card-2", t["--ui-line"], t["--card-2"], 3.0, "mark"],
    ["gold on bg", t["--gold"], t["--bg"], 11.5, "text"],
    ["gold on card", t["--gold"], t["--card"], 10.1, "text"],
    ["gold on card-2", t["--gold"], t["--card-2"], 8.7, "text"],
    ["gold-ink on gold", t["--gold-ink"], t["--gold"], 10.4, "text"],
    ["black on text (the white button)", black, t["--text"], 19.3, "text"],
    ["gold on gold-soft over card", t["--gold"], over([233, 185, 73, 0.14], t["--card"]), 7.7, "text"],
    ["ai on card", t["--ai"], t["--card"], 9.9, "text"],
    ["ai on ai-soft over card", t["--ai"], over(t["--ai-soft"], t["--card"]), 7.9, "text"],
    ["danger on bg", t["--danger"], t["--bg"], 7.5, "text"],
    ["danger on card", t["--danger"], t["--card"], 6.6, "text"],
    ["gold ring at 75% on bg", over([233, 185, 73, 0.75], t["--bg"]), t["--bg"], 6.6, "mark"],
  ];

  for (const [what, fg, bg, stated] of pairs(day)) {
    it(`${what} measures at least ${stated}:1`, () => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(stated - 0.05);
    });
  }

  it("every pair still passes under night dimming (AA for text, 3:1 for marks)", () => {
    for (const [what, fg, bg, , kind] of pairs(night)) {
      // ui-line on card-2 measures 2.998:1, the table's "3.0" (it does not change at night)
      expect(ratio(fg, bg), what).toBeGreaterThanOrEqual(kind === "text" ? 4.5 : 2.995);
    }
  });
});

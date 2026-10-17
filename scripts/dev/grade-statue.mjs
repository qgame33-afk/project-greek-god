// LOCAL DEVELOPMENT ONLY. Pre-renders the statue grades and the grain tile (docs/DESIGN-V2.md §1.5).
//
//   node scripts/dev/grade-statue.mjs            writes public/art/statue-marble.webp,
//                                                statue-gold.webp and grain.png
//   node scripts/dev/grade-statue.mjs --check    prints sizes/channels of the outputs only
//
// Deterministic: the same source gives byte-identical files (no randomness except a seeded PRNG).
// Source: public/art/statue-hero.webp (900×1200, the CC0 Met Hermes, see public/art/CREDITS.md).
//
// Both grades share ONE alpha channel cut from the photo itself (the studio backdrop is near-black),
// so they stack pixel-for-pixel with identical blacks: the Statue component shows the marble and
// reveals the gold from the plinth up inside an overflow-clipped, counter-translated wrapper — no
// blend modes, no CSS mask on the photo, no SVG filters.
//
// - Alpha: a closed silhouette (luminance > 6%, holes closed with blur + threshold) softened, maxed
//   with a luminance ramp so the photo's own fades (bottom, left) stay soft.
// - Marble: gradient map #09090B → #9C968C → #F3EDE1 with a gentle S-curve.
// - Gold: gradient map #120B04 → #6B4718 → #CF9A3A → #F0CF86 → #FFF4D6 on a stronger S-curve, with
//   local contrast (unsharp) and fine leaf grain baked in.

import sharp from "sharp";
import { statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const ART = path.join(ROOT, "public/art");
const SRC = path.join(ART, "statue-hero.webp");
const W = 900;
const H = 1200;

const check = process.argv.includes("--check");

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Piecewise-linear gradient map over [t, rgb] stops. */
function gradient(stops) {
  const s = stops.map(([t, h]) => [t, hex(h)]);
  return (t) => {
    if (t <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i][0]) {
        const [t0, c0] = s[i - 1];
        const [t1, c1] = s[i];
        const k = (t - t0) / (t1 - t0);
        return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
      }
    }
    return s[s.length - 1][1];
  };
}
/** Contrast S-curve: a blend of linear and smoothstep (k = 0 is linear, 1 is full smoothstep). */
const sCurve = (t, k) => clamp01((1 - k) * t + k * smooth(0, 1, t));

/** Seeded PRNG (mulberry32) so the grain is reproducible. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function greyRaw(input, opts = {}) {
  let img = sharp(input).resize(W, H, { fit: "cover" }).greyscale();
  if (opts.sharpen) img = img.sharpen(opts.sharpen);
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  return data; // 1 channel
}

async function blurThreshold(mask, sigma, threshold) {
  const { data } = await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
    .blur(sigma)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(W * H);
  for (let i = 0; i < out.length; i++) out[i] = data[i] >= threshold ? 255 : 0;
  return out;
}

/** Fills enclosed background regions (anything not reachable from the image border). */
function fillHoles(mask) {
  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    const i = y * W + x;
    if (mask[i] === 0 && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < W; x++) {
    push(x, 0);
    push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    push(0, y);
    push(W - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W;
    const y = (i - x) / W;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }
  const out = Buffer.alloc(W * H);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 255;
  return out;
}

async function buildAlpha(lum) {
  // binary silhouette, then a closing (dilate, then erode) to fill interior shadows
  const bin = Buffer.alloc(W * H);
  for (let i = 0; i < bin.length; i++) bin[i] = lum[i] / 255 > 0.06 ? 255 : 0;
  const dilated = await blurThreshold(bin, 34, 30);
  const closed = fillHoles(await blurThreshold(dilated, 34, 226));
  const { data: soft } = await sharp(closed, { raw: { width: W, height: H, channels: 1 } }).blur(1.6).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(W * H);
  for (let i = 0; i < alpha.length; i++) {
    const y = Math.floor(i / W) / H;
    const ramp = smooth(0.045, 0.2, lum[i] / 255);
    // the photo fades to black toward the base: the silhouette fades with it (no hard plinth edge)
    const base = 1 - smooth(0.74, 0.93, y);
    alpha[i] = Math.round(Math.max((soft[i] / 255) * base, ramp) * 255);
  }
  return alpha;
}

async function main() {
  if (!check) {
    const lum = await greyRaw(SRC);
    const lumSharp = await greyRaw(SRC, { sharpen: { sigma: 2.2, m1: 0.4, m2: 1.4 } });
    const alpha = await buildAlpha(lum);

    const lo = 0.035;
    const hi = 0.93;
    const marbleMap = gradient([
      [0, "#09090B"],
      [0.55, "#9C968C"],
      [1, "#F3EDE1"],
    ]);
    const goldMap = gradient([
      [0, "#120B04"],
      [0.3, "#6B4718"],
      [0.6, "#CF9A3A"],
      [0.84, "#F0CF86"],
      [1, "#FFF4D6"],
    ]);
    const rnd = prng(0x0157a7);
    const marble = Buffer.alloc(W * H * 4);
    const gold = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const t = clamp01((lum[i] / 255 - lo) / (hi - lo));
      const ts = clamp01((lumSharp[i] / 255 - lo) / (hi - lo));
      const m = marbleMap(sCurve(t, 0.25));
      const grain = (rnd() - 0.5) * 0.05 * (0.4 + 0.6 * ts);
      const g = goldMap(clamp01(sCurve(ts, 0.55) + grain));
      const a = alpha[i];
      marble[i * 4] = m[0];
      marble[i * 4 + 1] = m[1];
      marble[i * 4 + 2] = m[2];
      marble[i * 4 + 3] = a;
      gold[i * 4] = g[0];
      gold[i * 4 + 1] = g[1];
      gold[i * 4 + 2] = g[2];
      gold[i * 4 + 3] = a;
    }
    const webp = { quality: 70, alphaQuality: 70, effort: 6, smartSubsample: true };
    await sharp(marble, { raw: { width: W, height: H, channels: 4 } }).webp(webp).toFile(path.join(ART, "statue-marble.webp"));
    await sharp(gold, { raw: { width: W, height: H, channels: 4 } }).webp({ ...webp, quality: 72 }).toFile(path.join(ART, "statue-gold.webp"));

    // Grain: 256×256 monochrome noise in 4 levels around mid-grey (used at 6% over leaf surfaces).
    const G = 256;
    const noise = Buffer.alloc(G * G);
    const r2 = prng(0x6a1e);
    const levels = [96, 120, 136, 160];
    for (let i = 0; i < noise.length; i++) noise[i] = levels[Math.floor(r2() * 4)];
    await sharp(noise, { raw: { width: G, height: G, channels: 1 } })
      .png({ palette: true, colours: 4, compressionLevel: 9, effort: 10 })
      .toFile(path.join(ART, "grain.png"));
  }

  for (const f of ["statue-marble.webp", "statue-gold.webp", "grain.png"]) {
    const p = path.join(ART, f);
    const meta = await sharp(p).metadata();
    console.log(`${f}: ${meta.width}×${meta.height}, ${meta.channels} channels${meta.hasAlpha ? " (alpha)" : ""}, ${(statSync(p).size / 1024).toFixed(1)} KB`);
  }
}

await main();

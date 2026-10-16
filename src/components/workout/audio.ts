"use client";

// The optional end-of-rest chime (660 → 990 Hz). iOS only lets audio play after a user
// gesture, so the context is created/resumed on the first ✓ tap.

let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(c: AudioContext, freq: number, at: number, dur: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export function chime() {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + 0.01;
  tone(ctx, 660, t, 0.22);
  tone(ctx, 990, t + 0.2, 0.34);
}

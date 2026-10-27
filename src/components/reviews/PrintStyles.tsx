import { CSS } from "./print-css";

/**
 * "Save as PDF" theme. Scoped to #pgg-review: hides the app chrome and every control,
 * and re-points the design tokens to a clean ink-on-paper palette (gold stays as bronze),
 * so the browser's Save as PDF produces a readable, printable document.
 */
export function PrintStyles() {
  return <style>{CSS}</style>;
}

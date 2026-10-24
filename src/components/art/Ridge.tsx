/**
 * The mountain ridge, retired (docs/DESIGN-V3-SIMPLE.md §1.7.4): renders nothing. The path stays
 * exported because src/lib/progress/mountain.ts samples it; both go at integration (§6.7).
 */
export const RIDGE_PATH = "M0 300V242C120 228 196 206 300 207S468 172 560 152S722 134 800 110S940 70 1010 42C1042 29 1062 25 1082 31C1122 44 1160 68 1200 88V300Z";

export function Ridge(_props: { className?: string; opacity?: number }) {
  return null;
}

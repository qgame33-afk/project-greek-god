"use client";

/**
 * Haptics are removed for now (docs/DESIGN-V2.md §3.10, §7): iOS home-screen PWAs have no
 * Vibration API, and the hidden-switch trick is banned. Kept as a no-op so existing callers
 * compile; their owning streams delete the calls as they rebuild.
 */
export function haptic(pattern: number | number[] = 12) {
  void pattern;
}

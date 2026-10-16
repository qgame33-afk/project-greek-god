"use client";

import { useState } from "react";

/**
 * Re-seed a sheet's draft state each time it opens, during render (React's "adjust state when
 * a prop changes" pattern) rather than in an effect, so the first painted frame already shows
 * the current values.
 */
export function useResetOnOpen(open: boolean, reset: () => void) {
  const [prev, setPrev] = useState(false);
  if (open !== prev) {
    setPrev(open);
    if (open) reset();
  }
}

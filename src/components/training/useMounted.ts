"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False during server prerender and hydration, true on the client afterwards. Training
 * screens are built entirely from the signed-in user's data and today's local date, so they
 * render a skeleton on the server instead of markup that would not match the client.
 */
export function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

"use client";

import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** navigator.onLine as state (true on the server and when unknown). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine !== false, () => true);
}

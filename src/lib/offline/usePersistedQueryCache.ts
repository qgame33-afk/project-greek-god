"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearQueryCache, persistQueryCache, restoreQueryCache } from "./persist";

/** Never hold the first render longer than this for the restore. */
export const RESTORE_TIMEOUT_MS = 400;

/**
 * The offline cache for the app's QueryClient (mount once, in Providers): restores the
 * persisted queries for the user whose session is on this device (read locally, so it
 * works offline), then keeps them persisted. Sign-out or a different user deletes the
 * stored cache. Returns `ready` once the restore finished (or after a short timeout), so
 * the shell can render from cache on an offline cold start.
 */
export function usePersistedQueryCache(client: QueryClient): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    let alive = true;
    let resolved = false;
    let userId: string | null = null;
    let stop: (() => void) | null = null;
    const done = () => {
      if (alive) setReady(true);
    };
    const timeout = setTimeout(done, RESTORE_TIMEOUT_MS);

    void (async () => {
      try {
        userId = (await sb.auth.getSession()).data.session?.user.id ?? null;
      } catch {
        userId = null;
      }
      resolved = true;
      await restoreQueryCache(client, userId);
      clearTimeout(timeout);
      done();
      if (alive) stop = persistQueryCache(client, () => userId);
    })();

    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null;
      if (!resolved || id === userId) return;
      userId = id;
      void clearQueryCache();
    });

    return () => {
      alive = false;
      clearTimeout(timeout);
      stop?.();
      data.subscription.unsubscribe();
    };
  }, [client]);
  return ready;
}

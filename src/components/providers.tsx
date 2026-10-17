"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { applyAppearance, useReducedMotionPref } from "@/lib/appearance";
import { usePersistedQueryCache } from "@/lib/offline/usePersistedQueryCache";
import { supabaseBrowser } from "@/lib/supabase/client";

/** True once the persisted query cache has been restored (or the short restore timeout passed). */
const CacheReady = createContext(true);
export function useQueryCacheReady() {
  return useContext(CacheReady);
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, gcTime: 30 * 60_000, refetchOnWindowFocus: true, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );

  // The offline cache (src/lib/offline): the last known data comes back from IndexedDB before the
  // shell renders, so an offline cold start shows saved numbers instead of "—". The app shell waits
  // on `useQueryCacheReady()` (at most a few hundred ms); public pages (sign-in) never wait.
  const cacheReady = usePersistedQueryCache(client);

  // A different account must never see the previous account's cached data.
  useEffect(() => {
    const sb = supabaseBrowser();
    let current: string | null | undefined;
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null;
      if (current !== undefined && id !== current) client.clear();
      current = id;
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  // Appearance attributes (Motion, Reduce transparency, the night variant). The boot script in the
  // root layout set them before first paint; this keeps the night variant in step with the clock.
  useEffect(() => {
    applyAppearance();
    const tick = window.setInterval(() => applyAppearance(), 60_000);
    const onVisible = () => document.visibilityState === "visible" && applyAppearance();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const reduceMotion = useReducedMotionPref();

  // The service worker: push, plus the offline app shell. Its cache is versioned per deploy.
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const v = encodeURIComponent(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "1");
      navigator.serviceWorker.register(`/sw.js?v=${v}`, { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);

  return (
    <QueryClientProvider client={client}>
      <CacheReady.Provider value={cacheReady}>
        <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
          <LazyMotion features={domAnimation} strict>
            {children}
            <Toaster
              position="top-center"
              offset={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
              // under the 52 px header row (✦ and the avatar), never over it (DESIGN-V2 §3.13)
              mobileOffset={{ top: "calc(env(safe-area-inset-top) + 60px)" }}
              visibleToasts={2}
              duration={4000}
              theme="dark"
            />
          </LazyMotion>
        </MotionConfig>
      </CacheReady.Provider>
    </QueryClientProvider>
  );
}

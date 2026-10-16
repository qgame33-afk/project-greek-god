"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";

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

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);

  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation} strict>
          {children}
          <Toaster
            position="top-center"
            offset={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
            mobileOffset={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
            visibleToasts={2}
            duration={4000}
            theme="dark"
          />
        </LazyMotion>
      </MotionConfig>
    </QueryClientProvider>
  );
}

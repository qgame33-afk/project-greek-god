"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser Supabase client (singleton). Every query runs as the signed-in user under RLS. */
export function supabaseBrowser() {
  if (!client) {
    client = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      // TanStack Query already retries reads. PostgREST's own retry (3 more tries with 1+2+4 s
      // back-off) stacked on top kept screens on skeletons for 15–45 s before saying a load
      // failed; with one retry layer the error and its Retry button show within seconds.
      db: { retry: false },
    });
  }
  return client;
}

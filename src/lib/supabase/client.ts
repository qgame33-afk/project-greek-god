"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser Supabase client (singleton). Every query runs as the signed-in user under RLS. */
export function supabaseBrowser() {
  if (!client) {
    client = createBrowserClient<Database>(
      SUPABASE_URL,
      SUPABASE_PUBLIC_KEY,
    );
  }
  return client;
}

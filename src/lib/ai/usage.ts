import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { AIError } from "./gemini";

/** Daily per-user caps that keep one account comfortably inside the free Gemini quota. */
export const DAILY_LIMITS = { food_photo: 40, food_chat: 150, coach: 100, review: 10 } as const;
export type Feature = keyof typeof DAILY_LIMITS;

/** Atomically count one AI call for the signed-in user; throws when today's cap is reached. */
export async function chargeUsage(supabase: SupabaseClient<Database>, feature: Feature, localDate: string) {
  const { data, error } = await supabase.rpc("bump_ai_usage", { p_feature: feature, p_day: localDate, p_limit: DAILY_LIMITS[feature] });
  if (error) throw new AIError("upstream", "Couldn't check today's AI allowance. Try again.", 500);
  if (data === -1) throw new AIError("quota", `You've used today's ${DAILY_LIMITS[feature]} ${feature.replace("_", " ")} requests. They reset tomorrow.`, 429);
}

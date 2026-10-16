// Honest delivery status for the Reminders settings: is push configured, is the 15-minute
// database schedule running, and how many of the user's devices are registered.

import { requireUser } from "@/lib/supabase/server";
import { adminOrNull, schedulerStatus, type SchedulerStatus } from "@/lib/reminders/server";

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "Sign in again.", code: "unauthorized" }, { status: 401 });
  const admin = adminOrNull();
  const { count } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true });
  let scheduler: SchedulerStatus = { state: "unknown", url: null, lastRunAt: null };
  if (admin) {
    try {
      scheduler = await schedulerStatus(admin);
    } catch {
      // keep "unknown"
    }
  }
  return Response.json({ pushConfigured: !!admin, devices: count ?? 0, scheduler }, { headers: { "Cache-Control": "private, no-store" } });
}

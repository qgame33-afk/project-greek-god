// VAPID public key for pushManager.subscribe(). The key pair is generated on first use and
// kept server-side in app_secrets; only the public half ever leaves the server.

import { requireUser } from "@/lib/supabase/server";
import { adminOrNull, getVapidKeys } from "@/lib/reminders/server";

export async function GET() {
  const { user } = await requireUser();
  if (!user) return Response.json({ error: "Sign in again.", code: "unauthorized" }, { status: 401 });
  const admin = adminOrNull();
  if (!admin) {
    return Response.json(
      { error: "Push isn't configured on the server yet (SUPABASE_SERVICE_ROLE_KEY is missing).", code: "not_configured" },
      { status: 503 },
    );
  }
  try {
    const { publicKey } = await getVapidKeys(admin);
    return Response.json({ publicKey }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[push/key]", e);
    return Response.json({ error: "Couldn't prepare push keys. Try again.", code: "upstream" }, { status: 500 });
  }
}

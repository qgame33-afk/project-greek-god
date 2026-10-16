// Reminder dispatcher. Called every 15 minutes by the database scheduler (pg_cron +
// pg_net, set up by scripts/migrate.mjs on deploy) with the shared x-cron-secret.
// Public path in the proxy, so the secret is the only gate — compared in constant time.

import { z } from "zod";
import { runDispatch } from "@/lib/reminders/dispatch";
import { adminDispatchDeps, adminOrNull, getCronSecrets, getVapidKeys, secretMatches, stampLastRun, vapidSubject } from "@/lib/reminders/server";

export const maxDuration = 60;

const Body = z
  .object({
    /** report what would be sent without sending or recording anything */
    dryRun: z.boolean().optional(),
    /** simulate another instant (dry runs and non-production only) */
    now: z.string().datetime({ offset: true }).optional(),
    source: z.string().max(40).optional(),
  })
  .passthrough();

export async function POST(req: Request) {
  const admin = adminOrNull();
  const expected = await getCronSecrets(admin).catch(() => [] as string[]);
  if (!expected.length) return Response.json({ error: "Reminder delivery isn't configured on this server.", code: "not_configured" }, { status: 503 });
  if (!secretMatches(req.headers.get("x-cron-secret"), expected)) return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 401 });
  if (!admin) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is missing.", code: "not_configured" }, { status: 503 });

  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "Invalid JSON body.", code: "bad_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body.", code: "bad_request" }, { status: 400 });
  const { dryRun = false } = parsed.data;
  const allowTimeTravel = dryRun || process.env.NODE_ENV !== "production";
  const now = parsed.data.now && allowTimeTravel ? new Date(parsed.data.now) : new Date();

  try {
    const keys = await getVapidKeys(admin);
    const summary = await runDispatch(adminDispatchDeps(admin, keys, vapidSubject(new URL(req.url).origin)), { now, dryRun });
    if (!dryRun) await stampLastRun(admin, new Date());
    console.info(`[reminders] users=${summary.users} due=${summary.due} sent=${summary.sent} failed=${summary.failed} removed=${summary.removedSubscriptions}`);
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[reminders/dispatch]", e);
    return Response.json({ error: "Dispatch failed.", code: "upstream" }, { status: 500 });
  }
}

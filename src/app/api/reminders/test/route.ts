// Sends one test notification to every device the signed-in user has enabled.

import { requireUser } from "@/lib/supabase/server";
import { adminOrNull, getVapidKeys, sendPush, vapidSubject } from "@/lib/reminders/server";

const fail = (status: number, code: string, error: string) => Response.json({ error, code }, { status });

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "unauthorized", "Sign in again.");
  const admin = adminOrNull();
  if (!admin) return fail(503, "not_configured", "Push isn't configured on the server yet.");

  const { data: subs, error } = await supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth");
  if (error) return fail(500, "upstream", "Couldn't load your devices. Try again.");
  if (!subs?.length) return fail(409, "no_device", "Turn on reminders for this device first.");

  const keys = await getVapidKeys(admin);
  const subject = vapidSubject(new URL(req.url).origin);
  let sent = 0;
  let removed = 0;
  let failed = 0;
  for (const s of subs) {
    const res = await sendPush(keys, subject, s, {
      title: "Reminders are on",
      body: "This is how reminders will appear on this device.",
      url: "/settings#reminders",
      tag: "pgg-test",
      kind: "test",
    });
    if (res.ok) sent++;
    else if (res.gone) {
      await supabase.from("push_subscriptions").delete().eq("id", s.id);
      removed++;
    } else {
      failed++;
      console.warn("[reminders/test] send failed", res.status, res.error);
    }
  }
  if (!sent) return Response.json({ ok: false, sent, removed, failed, error: removed ? "This device's subscription had expired. Turn reminders on again." : "The push service didn't accept the message. Try again." }, { status: 502 });
  return Response.json({ ok: true, sent, removed, failed });
}

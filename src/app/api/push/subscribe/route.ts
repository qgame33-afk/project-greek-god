// Registers (POST) or forgets (DELETE) this device's Web Push subscription for the
// signed-in user. Endpoints are restricted to the real browser push services so the
// server can never be pointed at an arbitrary URL.

import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { adminOrNull } from "@/lib/reminders/server";

// Chrome: fcm.googleapis.com and newer *.google.com/fcm/send/… endpoints · Firefox: Mozilla
// autopush · Safari: web.push.apple.com · Edge: WNS.
const PUSH_HOSTS: { host: RegExp; path?: RegExp }[] = [
  { host: /(^|\.)googleapis\.com$/, path: /^\/(fcm|gcm|wp)\// },
  { host: /(^|\.)google\.com$/, path: /^\/(fcm|gcm|wp)\// },
  { host: /(^|\.)push\.services\.mozilla\.com$/ },
  { host: /(^|\.)push\.apple\.com$/ },
  { host: /(^|\.)notify\.windows\.com$/ },
];

const b64url = z.string().min(8).max(256).regex(/^[A-Za-z0-9_-]+={0,2}$/, "Invalid key");

const Endpoint = z
  .string()
  .max(1024)
  .url()
  .refine((u) => {
    try {
      const url = new URL(u);
      return url.protocol === "https:" && PUSH_HOSTS.some((p) => p.host.test(url.hostname) && (!p.path || p.path.test(url.pathname)));
    } catch {
      return false;
    }
  }, "That push service isn't supported.");

const Subscribe = z.object({
  endpoint: Endpoint,
  keys: z.object({ p256dh: b64url, auth: b64url }),
  userAgent: z.string().max(300).optional(),
});

const Unsubscribe = z.object({ endpoint: z.string().max(1024) });

const fail = (status: number, code: string, error: string) => Response.json({ error, code }, { status });

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "unauthorized", "Sign in again.");
  const parsed = Subscribe.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid subscription.");
  const { endpoint, keys, userAgent } = parsed.data;
  const row = { user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: userAgent ?? req.headers.get("user-agent")?.slice(0, 300) ?? null };

  // A browser endpoint belongs to whoever is signed in on it now. The service role can
  // move it from a previous account on a shared device; under RLS we can only touch our own.
  const admin = adminOrNull();
  const { error } = admin
    ? await admin.from("push_subscriptions").upsert(row, { onConflict: "endpoint" })
    : await supabase.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
  if (error) {
    console.error("[push/subscribe]", error.message);
    return fail(500, "upstream", "Couldn't save this device. Try again.");
  }
  const { count } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true });
  return Response.json({ ok: true, devices: count ?? 1 });
}

export async function DELETE(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "unauthorized", "Sign in again.");
  const parsed = Unsubscribe.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, "bad_request", "Missing endpoint.");
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).eq("user_id", user.id);
  if (error) return fail(500, "upstream", "Couldn't remove this device. Try again.");
  const { count } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true });
  return Response.json({ ok: true, devices: count ?? 0 });
}

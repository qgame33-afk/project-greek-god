// LOCAL DEVELOPMENT ONLY. Sets the weight unit of a local test account (lengths are left alone).
//
//   node scripts/dev/set-unit.mjs <email|qa-name> lb|kg
//   node scripts/dev/set-unit.mjs qa-lb lb        → qa-lb@greekgod.local shows every weight in pounds
//
// Stored values never change: the database keeps pounds, the profile's weight_unit only decides
// what is shown and typed (src/lib/training/loads.ts). Refuses anything but the local stack.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const [who, unit] = process.argv.slice(2);
if (!who || !["lb", "kg"].includes(unit)) {
  console.error("usage: node scripts/dev/set-unit.mjs <email|qa-name> lb|kg");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error("Refusing: not a local Supabase URL");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const email = who.includes("@") ? who : `${who.startsWith("qa-") ? who : `qa-${who}`}@greekgod.local`;
const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;
const user = list.users.find((u) => u.email === email);
if (!user) throw new Error(`No local user ${email}`);
const { data, error } = await admin.from("profiles").update({ weight_unit: unit }).eq("id", user.id).select("weight_unit, length_unit").single();
if (error) throw error;
console.log(JSON.stringify({ email, ...data }));

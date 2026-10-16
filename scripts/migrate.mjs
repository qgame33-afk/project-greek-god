#!/usr/bin/env node
// Deploy-time database migrations for Project Greek God.
//
// Runs before `next build` on Vercel ("vercel-build": "node scripts/migrate.mjs && next build"):
//   1. connects with POSTGRES_URL_NON_POOLING (or POSTGRES_URL / SUPABASE_DB_URL / DATABASE_URL)
//   2. applies every supabase/migrations/*.sql not yet recorded in public.app_migrations,
//      each in its own transaction (a failure rolls that file back and fails the build)
//   3. makes sure public.app_secrets holds the cron_secret (CRON_SECRET from the environment
//      when set, else a random one generated once)
//   4. if VERCEL_PROJECT_PRODUCTION_URL (or APP_URL) is set and pg_cron + pg_net exist,
//      (re)creates the 'pgg-reminders' job: every 15 minutes POST /api/reminders/dispatch
//
// Production only on Vercel: Preview and Development deployments share the same env vars,
// so they skip everything (exit 0) unless MIGRATE_ON_BUILD=1 — a preview of an unmerged
// branch must never change the production schema or re-point the scheduler. Outside Vercel
// (VERCEL_ENV unset, e.g. running it by hand) it always runs.
//
// Idempotent: run it as often as you like. With no database URL (local builds) it prints a
// warning and exits 0.
//
// Adopting an existing database:
//   - files the Supabase CLI already applied (supabase_migrations.schema_migrations) are
//     recorded as applied, on every run;
//   - on the first run (no app_migrations yet) with the schema already present
//     (public.profiles exists), each remaining file is tried in a transaction: if it fails
//     only because its objects already exist (duplicate table/column/object/function), it
//     was applied by hand and is recorded as applied; if it succeeds it was needed and is
//     kept. Files starting with "-- migrate:idempotent" simply run.
//
// TLS: the server certificate is verified (system CAs, or DB_CA_CERT / PGSSLROOTCERT_PEM).
// If it can't be verified — Supabase's poolers use Supabase's own CA — the script reconnects
// encrypted without verification and says so, unless PGSSL_STRICT=1 or sslmode=verify-full.
//
// Flags: --dry-run (report only)   Env: REMINDERS_CRON=off (remove the job instead)

import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = process.env.MIGRATIONS_DIR || path.join(ROOT, "supabase", "migrations");
const DRY = process.argv.includes("--dry-run");
const LOCK_KEY = 7_316_053_421; // pg_advisory_lock id for this app's migrations
// "already exists" errors: duplicate_table, duplicate_object, duplicate_column,
// duplicate_function, duplicate_schema, duplicate_alias
const ALREADY_EXISTS = new Set(["42P07", "42710", "42701", "42723", "42P06", "42712"]);
const TLS_UNVERIFIED = new Set(["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_UNTRUSTED", "ERR_TLS_CERT_ALTNAME_INVALID"]);

const log = (...a) => console.log("[migrate]", ...a);
const warn = (...a) => console.warn("[migrate] warning:", ...a);

const VERCEL_ENV = process.env.VERCEL_ENV;
const FORCED = /^(1|true|yes)$/i.test(process.env.MIGRATE_ON_BUILD ?? "");
if (VERCEL_ENV && VERCEL_ENV !== "production" && !FORCED) {
  log(`VERCEL_ENV=${VERCEL_ENV}: skipping migrations and the reminders schedule (production deploys only; set MIGRATE_ON_BUILD=1 to override for a separate database).`);
  process.exit(0);
}
const PRODUCTION = !VERCEL_ENV || VERCEL_ENV === "production";

const DB_URL = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!DB_URL) {
  warn("no database URL (POSTGRES_URL_NON_POOLING / POSTGRES_URL / SUPABASE_DB_URL) — skipping migrations.");
  process.exit(0);
}

let pg;
try {
  pg = (await import("pg")).default;
} catch {
  console.error("[migrate] the 'pg' package is not installed. Add it to dependencies (npm i pg) so deploys can migrate the database.");
  process.exit(1);
}

/** Connection options. `verify` false = encrypted but the certificate isn't checked. */
function connectionConfig(raw, verify) {
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".local");
  const sslmode = url.searchParams.get("sslmode");
  for (const k of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat", "supa", "pgbouncer"]) url.searchParams.delete(k);
  const ca = process.env.DB_CA_CERT || process.env.PGSSLROOTCERT_PEM;
  const ssl = local || sslmode === "disable" ? false : verify ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : { rejectUnauthorized: false };
  return { connectionString: url.toString(), ssl, application_name: "pgg-migrate", connectionTimeoutMillis: 15_000, statement_timeout: 120_000 };
}

function strictTls(raw) {
  try {
    const mode = new URL(raw).searchParams.get("sslmode");
    return mode === "verify-full" || mode === "verify-ca" || /^(1|true|yes)$/i.test(process.env.PGSSL_STRICT ?? "") || !!(process.env.DB_CA_CERT || process.env.PGSSLROOTCERT_PEM);
  } catch {
    return false;
  }
}

function redact(raw) {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.username ? u.username + "@" : ""}${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return "(unparseable URL)";
  }
}

const files = readdirSync(DIR)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort();
const sqlOf = (f) => readFileSync(path.join(DIR, f), "utf8");
const isIdempotent = (sql) => /^\s*--\s*migrate:idempotent\b/i.test(sql);

let client;
const started = Date.now();

async function connect() {
  client = new pg.Client(connectionConfig(DB_URL, true));
  try {
    await client.connect();
    return;
  } catch (e) {
    const code = e.code ?? e.cause?.code;
    if (!TLS_UNVERIFIED.has(code) || strictTls(DB_URL)) throw e;
    await client.end().catch(() => {});
    warn(`the database certificate couldn't be verified (${code}). Connecting encrypted without verification. Set DB_CA_CERT to the CA from Supabase → Database settings → SSL to verify it, or PGSSL_STRICT=1 to refuse.`);
  }
  client = new pg.Client(connectionConfig(DB_URL, false));
  await client.connect();
}

async function exists(regclass) {
  const { rows } = await client.query("select to_regclass($1) is not null as ok", [regclass]);
  return rows[0].ok;
}

async function record(f, sql, cliHistory) {
  await client.query("insert into public.app_migrations (name) values ($1) on conflict do nothing", [f]);
  if (cliHistory) {
    // keep the Supabase CLI's history in step so `supabase db push` agrees
    const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
    await client.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3) on conflict (version) do nothing", [version, rest.join("_"), [sql]]);
  }
}

async function main() {
  log(`connecting to ${redact(DB_URL)}${DRY ? " (dry run)" : ""}`);
  await connect();
  await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
  try {
    /* ---------------------------------------------------------- history */
    const hadTable = await exists("public.app_migrations");
    if (!hadTable) {
      if (DRY) log("would create public.app_migrations");
      else {
        await client.query(`create table if not exists public.app_migrations (name text primary key, applied_at timestamptz not null default now())`);
        // server-only bookkeeping: no client access
        await client.query(`alter table public.app_migrations enable row level security`);
        log("created public.app_migrations");
      }
    }
    const applied = new Set(hadTable ? (await client.query("select name from public.app_migrations")).rows.map((r) => r.name) : []);
    const cliHistory = await exists("supabase_migrations.schema_migrations");

    // files the Supabase CLI applied (e.g. `supabase db push` or local `supabase start`)
    if (cliHistory) {
      const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
      const versions = new Set(rows.map((r) => String(r.version)));
      for (const f of files) {
        if (applied.has(f) || !versions.has(f.split("_")[0])) continue;
        applied.add(f);
        if (!DRY) await client.query("insert into public.app_migrations (name) values ($1) on conflict do nothing", [f]);
        log(`  adopted ${f} (applied by the Supabase CLI)`);
      }
    }
    // first run against a schema created by hand: find out file by file
    const adopting = !hadTable && (await exists("public.profiles"));
    if (adopting) log("schema already present without app_migrations: checking each remaining migration");

    /* ----------------------------------------------------------- apply */
    const pending = files.filter((f) => !applied.has(f));
    if (!pending.length) log(`database is up to date (${files.length} migrations)`);
    for (const f of pending) {
      const sql = sqlOf(f);
      if (DRY) {
        log(`would ${adopting && !isIdempotent(sql) ? "try" : "apply"} ${f}`);
        continue;
      }
      const t0 = Date.now();
      try {
        await client.query("begin");
        await client.query(sql);
        await record(f, sql, cliHistory);
        await client.query("commit");
        log(`applied ${f} (${Date.now() - t0} ms)`);
      } catch (e) {
        await client.query("rollback").catch(() => {});
        if (adopting && !isIdempotent(sql) && ALREADY_EXISTS.has(e.code)) {
          // its objects are already there: it was applied before history was kept
          await record(f, sql, cliHistory);
          log(`  adopted ${f} (already applied: ${e.message})`);
          continue;
        }
        const pos = e.position ? ` at character ${e.position}` : "";
        console.error(`[migrate] FAILED ${f}${pos}: ${e.message}`);
        if (e.position) {
          const p = Number(e.position);
          console.error("[migrate] near: " + sql.slice(Math.max(0, p - 120), p + 80).replace(/\s+/g, " "));
        }
        throw new Error(`migration ${f} failed`);
      }
    }

    /* ---------------------------------------------------- cron secret */
    if (await exists("public.app_secrets")) {
      const fromEnv = process.env.CRON_SECRET;
      if (DRY) log(`would ensure app_secrets.cron_secret${fromEnv ? " = CRON_SECRET" : ""}`);
      else if (fromEnv) {
        // the pg_cron job sends the stored secret; keep it equal to the env one the app checks
        await client.query("insert into public.app_secrets (key, value) values ('cron_secret', $1) on conflict (key) do update set value = excluded.value", [fromEnv]);
        log("cron_secret set from CRON_SECRET");
      } else {
        const { rowCount } = await client.query("insert into public.app_secrets (key, value) values ('cron_secret', $1) on conflict (key) do nothing", [randomBytes(32).toString("hex")]);
        log(rowCount ? "created cron_secret" : "cron_secret present");
      }
    } else warn("public.app_secrets is missing — the reminders scheduler can't authenticate.");

    /* ------------------------------------------------------- scheduler */
    if (PRODUCTION) await scheduleReminders();
    else log(`VERCEL_ENV=${VERCEL_ENV}: reminders schedule left unchanged (production only).`);
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
  }
}

async function scheduleReminders() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.APP_URL;
  const off = /^(off|false|0|no)$/i.test(process.env.REMINDERS_CRON ?? "");
  const hasHelper = (await client.query("select to_regprocedure('public.pgg_schedule_reminders(text)') is not null as ok")).rows[0].ok;
  if (off) {
    if (DRY || !hasHelper) return log(DRY ? "would remove the reminders schedule" : "REMINDERS_CRON=off: nothing to remove");
    const { rows } = await client.query("select public.pgg_unschedule_reminders() as msg");
    return log(`reminders schedule: ${rows[0].msg}`);
  }
  if (!host) return log("no VERCEL_PROJECT_PRODUCTION_URL / APP_URL — reminders schedule not changed.");
  const { rows: ext } = await client.query("select name from pg_available_extensions where name in ('pg_cron','pg_net')");
  const names = new Set(ext.map((r) => r.name));
  if (!names.has("pg_cron") || !names.has("pg_net")) {
    return warn(`pg_cron/pg_net aren't available on this database (found: ${[...names].join(", ") || "none"}). Reminders won't be delivered until they are enabled (Supabase → Database → Extensions), then redeploy.`);
  }
  if (!hasHelper) return warn("public.pgg_schedule_reminders() is missing — run the reminders migration first.");
  if (DRY) return log(`would schedule reminders → ${host}`);
  try {
    const { rows } = await client.query("select public.pgg_schedule_reminders($1) as msg", [host]);
    log(`reminders schedule: ${rows[0].msg}`);
  } catch (e) {
    // a scheduling problem must not block the deploy; the app works without reminders
    warn(`couldn't set up the reminders schedule: ${e.message}`);
  }
}

try {
  await main();
  log(`done in ${Date.now() - started} ms`);
  await client.end();
  process.exit(0);
} catch (e) {
  const code = e.code ?? e.cause?.code;
  console.error(`[migrate] ${code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT" ? "couldn't reach the database" : "error"}: ${e.message}`);
  await client?.end().catch(() => {});
  process.exit(1);
}

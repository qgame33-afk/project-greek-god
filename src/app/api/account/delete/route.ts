import { NextResponse, type NextRequest } from "next/server";
import { listAllFiles, removeFiles } from "@/lib/export/storage";
import { PHOTO_BUCKETS, type PhotoBucket } from "@/lib/export/tables";
import { requireUser, serviceRoleKey, supabaseAdmin } from "@/lib/supabase/server";

/**
 * Permanently delete the signed-in user's account.
 * 1. Removes every file under <uid>/ in both private photo buckets.
 * 2. Deletes the auth user — every table references auth.users with ON DELETE CASCADE,
 *    so all rows go with it.
 * Requires the body {"confirm":"DELETE"} and a same-origin request.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    return NextResponse.json({ code: "forbidden", message: "Cross-site request refused." }, { status: 403 });
  }

  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ code: "unauthorized", message: "Your session expired. Sign in again." }, { status: 401 });

  let body: { confirm?: unknown } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (body?.confirm !== "DELETE") {
    return NextResponse.json({ code: "confirm_required", message: 'Type "DELETE" to confirm.' }, { status: 400 });
  }

  if (!serviceRoleKey()) {
    return NextResponse.json(
      {
        code: "not_configured",
        message: "Account deletion needs SUPABASE_SERVICE_ROLE_KEY on the server. Nothing was deleted.",
      },
      { status: 503 },
    );
  }

  const admin = supabaseAdmin();
  const files: Partial<Record<PhotoBucket, number>> = {};
  for (const bucket of PHOTO_BUCKETS) {
    try {
      const store = admin.storage.from(bucket);
      const list = await listAllFiles(store, user.id);
      files[bucket] = await removeFiles(
        store,
        list.map((f) => f.path),
      );
    } catch (e) {
      return NextResponse.json(
        {
          code: "storage_failed",
          message: `Couldn't remove files in ${bucket}, so your account was kept. Try again. (${e instanceof Error ? e.message : String(e)})`,
          files,
        },
        { status: 502 },
      );
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json(
      { code: "delete_failed", message: `Photos were removed but the account couldn't be deleted: ${error.message}. Try again.`, files },
      { status: 502 },
    );
  }

  // End the session here, so the response clears the auth cookies. The browser then signs out
  // locally without calling the auth server for a user that no longer exists.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});

  return NextResponse.json({ ok: true, files });
}

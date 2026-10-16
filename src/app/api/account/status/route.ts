import { NextResponse } from "next/server";
import { aiConfigured, isMock } from "@/lib/ai/gemini";
import { requireUser } from "@/lib/supabase/server";
import pkg from "../../../../../package.json";

/**
 * Which server-side integrations are configured, for the Settings "About" panel. Reports
 * presence only — never a key or any part of one.
 */
export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ code: "unauthorized", message: "Sign in again." }, { status: 401 });
  return NextResponse.json(
    {
      version: pkg.version,
      ai: { configured: aiConfigured(), mock: isMock(), provider: "Google Gemini" },
      accountDeletion: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

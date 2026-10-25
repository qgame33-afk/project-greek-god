"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/components/workout/stores";

// A screen's code didn't arrive (offline navigation) or it threw while rendering (docs/
// DESIGN-V3-SIMPLE.md §4.12). The shell (tab bar, top bar) stays; this replaces only the screen with
// a centred card, instead of the framework's white fallback page.
const CHUNK = /chunk|dynamically imported module|importing a module script|loading css|failed to fetch/i;

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const online = useOnline();
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  const missingCode = CHUNK.test(message);

  useEffect(() => {
    console.error(error);
  }, [error]);

  // Code that failed to download needs a fresh page load; anything else can re-render.
  const tryAgain = () => (missingCode ? window.location.reload() : retry());

  // Back online after an offline navigation: load the screen without another tap.
  useEffect(() => {
    if (!missingCode) return;
    const on = () => window.location.reload();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [missingCode]);

  return (
    <div role="alert" className="flex min-h-[60dvh] items-center justify-center py-10">
      <div className="w-full max-w-[400px] rounded-card bg-card px-6 py-7 text-center">
        <h1 className="t-sheet">Something went wrong.</h1>
        <p className="t-label mx-auto mt-2 max-w-[32ch]">
          {online ? "Nothing you logged was lost." : "You're offline. This screen opens once you're back."}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="secondary" block onClick={tryAgain}>
            Try again
          </Button>
          <Button asChild variant="ghost" block>
            <Link href="/">Go to Today</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

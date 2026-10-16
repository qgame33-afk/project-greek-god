"use client";

import Link from "next/link";
import { useEffect } from "react";
import { EmptyArt } from "@/components/art/Motifs";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/components/workout/stores";

// A screen's code didn't arrive (offline navigation) or it threw while rendering. The shell
// (tab bar, top bar) stays; this replaces only the screen, in the app's own style, instead of
// the framework's white fallback page.
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

  const offline = !online;
  return (
    <div role="alert" className="mx-auto flex max-w-[420px] flex-col items-center px-2 pb-10 pt-12 text-center lg:pt-20">
      <EmptyArt kind="column" size={72} className="text-gold-500" />
      <p className="eyebrow mt-5">{offline ? "No connection" : "Something broke"}</p>
      <h1 className="t-h2 mt-2">{offline ? "You're offline" : "This screen didn't load"}</h1>
      <p className="mt-2 max-w-[34ch] text-[14px] leading-relaxed text-fg-2">
        {offline
          ? "Your logs are safe in your account. This screen opens once the connection is back."
          : "Nothing you logged was lost. Try again, or head back to Today."}
      </p>
      <div className="mt-6 flex w-full max-w-[300px] flex-col gap-2.5">
        <Button variant="outline-gold" size="md" onClick={tryAgain}>
          Try again
        </Button>
        <Button asChild variant="ghost" size="md">
          <Link href="/">Go to Today</Link>
        </Button>
      </div>
    </div>
  );
}

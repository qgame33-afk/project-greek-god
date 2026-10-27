import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Sign-in (docs/DESIGN-V3-SIMPLE.md §4.11): the laurel-A app icon (the only surviving Olympus
 * mark), "Project Greek God", "Sign in to keep going.", the fields, a gold "Sign in", then
 * "Create account" and "Forgot password". No statue. The form is live from the first frame.
 */
export default function SignInPage() {
  return (
    <main className="min-h-dvh bg-bg px-gutter pb-[calc(var(--safe-bottom)+1.5rem)] pt-[calc(var(--safe-top)+5rem)] short:pt-[calc(var(--safe-top)+2rem)]">
      <div className="mx-auto w-full max-w-[25rem]">
        <Image src="/icons/icon-192.png" alt="Project Greek God" width={76} height={76} priority className="size-[4.75rem] overflow-hidden" style={{ borderRadius: 18 }} />
        <Suspense>
          <SignInForm />
        </Suspense>
        <p className="t-label mt-10 text-center">Private by default. Only you can see your logs and photos.</p>
      </div>
    </main>
  );
}

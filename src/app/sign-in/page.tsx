import type { Metadata } from "next";
import { Suspense } from "react";
import { Statue } from "@/components/art/Statue";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Sign-in, the museum entrance (docs/DESIGN-V2.md §3.12): obsidian and marble veins, the statue in
 * marble standing in near-darkness while one warm light comes up over it (1.2 s; static under
 * reduced motion), the wordmark, and the form. The form is live from the first frame.
 *
 * Phones: the statue sits above the form and gives way to it on short screens (its height is what
 * the form leaves). From 1024 px the exhibit takes the left half and the form the right.
 */
export default function SignInPage() {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-obsidian text-ivory lg:grid lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
      {/* the exhibit */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-[calc(var(--safe-top)+1rem)] lg:relative lg:inset-auto lg:h-dvh lg:items-center lg:pt-0">
        <div className="absolute inset-0 bg-[url('/art/marble-veins.svg')] bg-size-[400px_400px]" />
        <div className="spot-in absolute inset-0 [animation-duration:1200ms]" style={{ background: "radial-gradient(60% 46% at 50% 30%, rgb(236 200 140 / .13), transparent 70%)" }} />
        <div className="spot-in relative [animation-duration:1200ms] lg:hidden" style={{ height: "clamp(12rem, calc(100dvh - 27rem), 30rem)", aspectRatio: "3 / 4" }}>
          <Statue p={0} mode="oath" priority label="" />
          {/* near-darkness: the light falls on the face; the back of the head and the plinth go to black */}
          <div className="absolute inset-0" style={{ background: "radial-gradient(75% 65% at 38% 38%, transparent 55%, var(--obsidian) 100%)" }} />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-b from-transparent to-obsidian" />
        </div>
        <div className="spot-in relative hidden h-[78dvh] max-h-[52rem] [animation-duration:1200ms] lg:block" style={{ aspectRatio: "3 / 4" }}>
          <Statue p={0} mode="oath" label="" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(75% 65% at 38% 38%, transparent 55%, var(--obsidian) 100%)" }} />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-b from-transparent to-obsidian" />
        </div>
        <p className="t-eyebrow absolute inset-x-0 bottom-10 hidden text-center lg:block">The Ascent · MMXXVI – MMXXVII</p>
      </div>

      <main className="relative flex min-h-dvh flex-col justify-end px-gutter pb-[calc(var(--safe-bottom)+1.5rem)] pt-[max(11rem,calc(100dvh-27rem))] lg:justify-center lg:border-l lg:border-vein lg:bg-night lg:px-16 lg:py-16">
        <div className="mx-auto w-full max-w-[25rem]">
          <Suspense>
            <SignInForm />
          </Suspense>
          <p className="t-meta mt-8 text-center text-ash">Private by default. Only you can see your logs and photos.</p>
        </div>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg-deep lg:grid lg:grid-cols-[55fr_45fr]">
      {/* The exhibit */}
      <div className="pointer-events-none absolute inset-0 lg:pointer-events-auto lg:relative">
        <div className="absolute inset-0 spotlight" />
        <div className="absolute inset-0 bg-[url('/art/marble-veins.svg')] bg-[length:400px_400px] opacity-60" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/art/statue-hero.webp"
          alt=""
          width={900}
          height={1200}
          decoding="async"
          className="absolute -right-[18%] top-[calc(var(--safe-top)+8px)] h-[62vh] w-auto max-w-none object-contain opacity-[.22] [mask-image:linear-gradient(to_bottom,black_55%,transparent)] lg:inset-y-0 lg:right-auto lg:left-1/2 lg:top-[8vh] lg:h-[84vh] lg:-translate-x-1/2 lg:opacity-[.85]"
        />
        <div className="absolute inset-x-0 bottom-12 hidden text-center lg:block">
          <p className="t-plaque">The Ascent · MMXXVI – MMXXVII</p>
        </div>
      </div>

      <main className="relative z-10 flex min-h-dvh flex-col justify-end px-6 pb-[calc(var(--safe-bottom)+28px)] pt-[38vh] lg:justify-center lg:border-l lg:border-line-hair lg:bg-bg lg:px-16 lg:py-16">
        <div className="mx-auto w-full max-w-[400px]">
          <Suspense>
            <SignInForm />
          </Suspense>
          <p className="mt-8 text-center text-[12px] font-medium text-fg-3">Private by default. Only you can see your logs and photos.</p>
        </div>
      </main>
    </div>
  );
}

"use client";

import { cn } from "@/lib/cn";

/**
 * The scanner's viewfinder (docs/DESIGN-V2.md §3.5.5): leaf corner brackets over the photo (or an
 * empty plate outline before one is taken). While the photo is read it stays frozen under one
 * slow Sheen pass (once per analysis; none under reduced motion or in Seal). `fill` lets it take
 * the height it's given (full-bleed on phones) instead of a 4:3 box.
 */
export function PhotoFrame({
  src,
  scanning,
  dim,
  fill,
  className,
  children,
}: {
  src?: string | null;
  scanning?: boolean;
  dim?: boolean;
  fill?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative w-full overflow-hidden bg-m1", fill ? "h-full" : "aspect-[4/3] rounded-card shadow-[inset_0_0_0_1px_var(--vein-2)]", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
        <img src={src} alt="Your meal photo" className={cn("absolute inset-0 size-full object-cover transition-opacity duration-(--dur-base)", dim && "opacity-45")} />
      ) : (
        <svg viewBox="0 0 400 300" className="absolute inset-0 size-full text-vein-3" fill="none" preserveAspectRatio="xMidYMid meet" aria-hidden>
          <circle cx="200" cy="150" r="92" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="200" cy="150" r="66" stroke="currentColor" strokeWidth="1" strokeDasharray="2 6" opacity=".7" />
          <path d="M84 104v92M78 104v26a6 6 0 0 0 12 0v-26M316 104c8 10 8 34 0 44v48" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity=".85" />
        </svg>
      )}
      {scanning && src && (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute inset-0 bg-night/25" />
          <span
            className="absolute inset-y-0 left-0 w-2/3 animate-[sheen_2400ms_var(--ease-out)_300ms_1_both] bg-[linear-gradient(100deg,transparent_15%,rgb(255_244_220/.22)_50%,transparent_85%)]"
            // the start position is a transform (not Tailwind's `translate`), so the keyframe replaces it
            style={{ transform: "translateX(-120%)", opacity: "var(--sheen-opacity)" }}
          />
        </span>
      )}
      <Brackets />
      {children}
    </div>
  );
}

function Brackets() {
  const c = "absolute size-8 border-leaf-300";
  return (
    <div className="pointer-events-none absolute inset-4" aria-hidden>
      <span className={cn(c, "left-0 top-0 rounded-tl-field border-l-2 border-t-2")} />
      <span className={cn(c, "right-0 top-0 rounded-tr-field border-r-2 border-t-2")} />
      <span className={cn(c, "bottom-0 left-0 rounded-bl-field border-b-2 border-l-2")} />
      <span className={cn(c, "bottom-0 right-0 rounded-br-field border-b-2 border-r-2")} />
    </div>
  );
}

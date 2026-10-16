"use client";

import { cn } from "@/lib/cn";

/** 4:3 capture frame with gold corner brackets; shows the photo and the analysis scan line. */
export function PhotoFrame({
  src,
  scanning,
  dim,
  className,
  children,
}: {
  src?: string | null;
  scanning?: boolean;
  dim?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative aspect-[4/3] w-full overflow-hidden rounded-[22px] border border-line bg-s1", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
        <img src={src} alt="Your meal photo" className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", dim && "opacity-45")} />
      ) : (
        <div className="absolute inset-0" style={{ background: "radial-gradient(70% 60% at 50% 45%, rgb(213 172 103 / .07), transparent 70%)" }} aria-hidden>
          <svg viewBox="0 0 400 300" className="absolute inset-0 size-full" fill="none">
            <circle cx="200" cy="150" r="92" stroke="rgb(255 255 255 / .07)" strokeWidth="1.25" />
            <circle cx="200" cy="150" r="66" stroke="rgb(255 255 255 / .05)" strokeWidth="1" strokeDasharray="2 6" />
            <path
              d="M84 104v92M78 104v26a6 6 0 0 0 12 0v-26M316 104c8 10 8 34 0 44v48"
              stroke="rgb(255 255 255 / .06)"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
      {scanning && (
        <>
          <div className="absolute inset-0 bg-[rgb(8_9_12/.28)]" aria-hidden />
          <div className="scan-sweep pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(180deg, transparent, rgb(213 172 103 / .16))" }} />
            <div
              className="absolute inset-x-0 bottom-0 h-[2px]"
              style={{
                background: "linear-gradient(90deg, transparent, #F3DDA8 20%, #D5AC67 50%, #F3DDA8 80%, transparent)",
                boxShadow: "0 0 14px 2px rgb(213 172 103 / .45)",
              }}
            />
          </div>
          <style>{`@keyframes scan-sweep{from{transform:translateY(-100%)}to{transform:translateY(0)}}.scan-sweep{animation:scan-sweep 1.6s var(--ease-out) infinite}@media (prefers-reduced-motion:reduce){.scan-sweep{animation:none;transform:translateY(-50%)}}`}</style>
        </>
      )}
      <Brackets />
      {children}
    </div>
  );
}

function Brackets() {
  const c = "absolute size-7 border-gold-400/85";
  return (
    <div className="pointer-events-none absolute inset-3" aria-hidden>
      <span className={cn(c, "left-0 top-0 rounded-tl-[10px] border-l-2 border-t-2")} />
      <span className={cn(c, "right-0 top-0 rounded-tr-[10px] border-r-2 border-t-2")} />
      <span className={cn(c, "bottom-0 left-0 rounded-bl-[10px] border-b-2 border-l-2")} />
      <span className={cn(c, "bottom-0 right-0 rounded-br-[10px] border-b-2 border-r-2")} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Meander } from "@/components/art/Motifs";

/**
 * Seven Greek-key segments. Completed and current segments are drawn in gold leaf (the
 * current one draws itself in as you arrive); upcoming ones are a faint outline.
 */
export function MeanderProgress({ step, total, className }: { step: number; total: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setW(el.clientWidth);
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const gap = 6;
  const seg = w > 0 ? Math.max(12, Math.floor((w - gap * (total - 1)) / total)) : 0;
  return (
    <div
      ref={ref}
      className={className}
      role="progressbar"
      aria-label="Onboarding progress"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step + 1}
      aria-valuetext={`Step ${step + 1} of ${total}`}
    >
      {seg > 0 && (
        <div className="flex items-center" style={{ gap }}>
          {Array.from({ length: total }, (_, i) => (
            <Meander key={i} width={seg} height={10} strokeWidth={1.25} progress={i <= step ? 1 : 0} />
          ))}
        </div>
      )}
    </div>
  );
}

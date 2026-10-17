"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Tag } from "@/components/ui/tag";
import type { CalorieSuggestion } from "@/lib/bodyweight";
import { cn } from "@/lib/cn";
import { calorieCall, windowPhrase } from "@/lib/progress/ascent-copy";
import { gaugeGeometry } from "@/lib/progress/mountain";
import type { Pace } from "@/lib/progress/pace";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";

const fmt = (lb: number, unit: WeightUnit, sign = false) => {
  const v = round(toDisplayWeight(lb, unit), 2);
  const s = Math.abs(v).toFixed(2);
  return v < 0 ? `−${s}` : sign && v > 0 ? `+${s}` : s;
};

/**
 * The pace gauge (docs/DESIGN-V2.md §3.6.1 item 5): 0 → 0.8 lb a week (stretched for faster or
 * negative rates), the corridor window as an outlined segment, a leaf diamond at THE rate (CALC),
 * and the calorie rule's call (RULE). Targets never change from here: a suggested change links
 * to Settings → Nutrition targets, which confirms and records it.
 */
export function PaceGauge({ pace, calorie, calories, unit, today }: { pace: Pace; calorie: CalorieSuggestion | null; calories: number | null; unit: WeightUnit; today: string }) {
  const rate = pace.rate.status === "ok" ? pace.rate.lbPerWeek : null;
  const c = pace.corridor;
  const g = gaugeGeometry(rate, c ? { minRate: c.minRate, maxRate: c.maxRate } : null);
  const phrase = windowPhrase(pace);
  const call = calorie && calories != null ? calorieCall(calorie, calories, unit, today) : null;
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const aria =
    rate != null && c
      ? `Rate ${fmt(rate, unit)} ${unit === "kg" ? "kilograms" : "pounds"} a week; window ${fmt(c.minRate, unit)} to ${fmt(c.maxRate, unit)}; ${(phrase ?? "").replace(/\.$/, "").toLowerCase()}`
      : c
        ? `No rate yet. The window is ${fmt(c.minRate, unit)} to ${fmt(c.maxRate, unit)} ${unit === "kg" ? "kilograms" : "pounds"} a week`
        : "No rate yet";

  return (
    <section aria-labelledby="gauge-h" className="@container">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="gauge-h" className="t-eyebrow">
          Pace · last 4 weeks
        </h2>
        <span className="t-meta text-stone">{unit} a week</span>
      </div>

      <div className="mt-3 flex items-end gap-3 @max-[19rem]:flex-col @max-[19rem]:items-start">
        <p className="flex items-baseline gap-2">
          <span className="t-dial tnum text-ivory">{rate != null ? fmt(rate, unit, true) : "—"}</span>
          {rate != null && <Tag kind="CALC" explain={`Least-squares slope of ${pace.rate.n} weigh-ins from ${pace.rate.from} to ${pace.rate.to}, times 7.`} />}
        </p>
        {c && (
          <p className="t-callout mb-1.5 text-stone @max-[19rem]:mb-0">
            Window <span className="tnum font-semibold text-ivory">{fmt(c.minRate, unit)}–{fmt(c.maxRate, unit)}</span>
          </p>
        )}
      </div>
      {rate == null && <p className="t-callout mt-1 text-stone">{pace.detail}.</p>}

      {/* the scale */}
      <div className="relative mt-5 h-12" role="img" aria-label={aria}>
        <div className="absolute inset-x-0 top-5 h-1.5 rounded-full bg-m3" />
        {g.window && (
          <div
            className="absolute top-[17px] h-3.5 rounded-[4px] shadow-[inset_0_0_0_1.5px_var(--ivory)]"
            style={{ left: pct(g.window.from), width: pct(Math.max(0.01, g.window.to - g.window.from)) }}
          />
        )}
        {g.ticks.map((t) => (
          <span key={t.v} className="absolute top-[30px] -translate-x-1/2" style={{ left: pct(t.at) }}>
            <span className="mx-auto block h-1.5 w-px bg-ui-line" />
            <span className="t-meta tnum mt-0.5 block text-stone">{t.v.toFixed(1)}</span>
          </span>
        ))}
        {g.rate != null && (
          <span className="absolute top-[13px] -translate-x-1/2" style={{ left: pct(Math.min(1, Math.max(0, g.rate))) }}>
            <span className="block size-[15px] rotate-45 rounded-[2px] border-2 border-night bg-leaf-100 shadow-(--glow)" />
          </span>
        )}
      </div>

      {/* the RULE call */}
      {(phrase || call) && (
        <div className="mt-5 border-t border-vein pt-3.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="t-title-3 text-ivory">{[phrase, call?.call].filter(Boolean).join(" ")}</span>
            {call && <Tag kind="RULE" explain="The calorie rule: under half the needed rate suggests eating a little more; over twice it suggests a little less. It waits 14 days after any change." />}
          </p>
          {call?.detail && <p className="t-meta mt-1 text-stone">{call.detail}</p>}
          {call?.next != null && (
            <Link href="/settings#nutrition" className={cn("press -ml-1 mt-1 inline-flex h-11 items-center gap-1 rounded-field px-1 font-semibold text-leaf-300 hover:text-leaf-200", "t-callout")}>
              Change it in Settings <ChevronRight className="size-4" strokeWidth={1.6} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

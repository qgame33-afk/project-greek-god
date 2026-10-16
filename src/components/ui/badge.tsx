import { ArrowUpRight, BadgeCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const base = "inline-flex h-5 shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-[10.5px] font-bold uppercase leading-none tracking-[0.06em]";

/** Recorded by the user. */
export function LoggedBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "bg-white/8 text-fg", className)}>
      <span className="size-1.5 rounded-full bg-marble" aria-hidden />
      Logged
    </span>
  );
}

/** AI / heuristic estimate. `confidence` 0–1 drives a 3-pip meter. */
export function EstimateBadge({ confidence, className, children }: { confidence?: number; className?: string; children?: ReactNode }) {
  const pips = confidence == null ? null : confidence >= 0.75 ? 3 : confidence >= 0.45 ? 2 : 1;
  return (
    <span className={cn(base, "border border-dashed border-[rgb(163_169_180/.5)] text-fg-2", className)}>
      <span aria-hidden>≈</span>
      {children ?? "Estimate"}
      {pips != null && (
        <span className="ml-0.5 inline-flex items-center gap-[2px]" aria-label={`${pips === 1 ? "low" : pips === 2 ? "medium" : "high"} confidence`}>
          {[1, 2, 3].map((i) => (
            <span key={i} className={cn("h-2 w-[3px] rounded-[1px]", i <= pips ? "bg-gold-400" : "bg-white/15")} />
          ))}
          {pips === 1 && <span className="ml-0.5">Low</span>}
        </span>
      )}
    </span>
  );
}

/** A published, retrieved source. Only render when a real URL exists. */
export function SourceBadge({ name, url, className }: { name: string; url: string; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, "max-w-full border border-line-gold bg-gold-tint text-gold-300 hover:text-gold-200", className)}
    >
      <BadgeCheck className="size-3" aria-hidden />
      <span className="truncate">Source · {name}</span>
    </a>
  );
}

/** Database match (USDA / Open Food Facts) — data, not a guess. */
export function DatabaseBadge({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  const inner = (
    <>
      <BadgeCheck className="size-3" aria-hidden />
      <span className="truncate">{name}</span>
    </>
  );
  const cls = cn(base, "max-w-full border border-verdigris/40 bg-verdigris/10 text-verdigris", className);
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

/** A recommendation, never applied automatically. */
export function SuggestedBadge({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <span className={cn(base, "border border-lapis/35 bg-lapis/10 text-[#8fb8f0]", className)}>
      <ArrowUpRight className="size-3" aria-hidden />
      {children ?? "Suggested"}
    </span>
  );
}

export function PRBadge({ className }: { className?: string }) {
  return <span className={cn(base, "h-[18px] bg-[image:var(--grad-leaf)] text-ink", className)}>PR</span>;
}

export function OptionalBadge({ className, children }: { className?: string; children?: ReactNode }) {
  return <span className={cn(base, "border border-line text-fg-3", className)}>{children ?? "Optional"}</span>;
}

export function AutoBadge({ className }: { className?: string }) {
  return <span className={cn(base, "h-4 px-1 text-[9.5px] text-fg-3 ring-1 ring-line", className)}>Auto</span>;
}

/** Planned / illustrative value — never data. */
export function PlanBadge({ className, children }: { className?: string; children?: ReactNode }) {
  return <span className={cn(base, "border border-dashed border-line-strong text-fg-3", className)}>{children ?? "Plan"}</span>;
}

/** First-ever log of an exercise: a baseline, not a record (never gold). */
export function FirstBenchmarkBadge({ className }: { className?: string }) {
  return <span className={cn(base, "border border-marble/60 text-marble", className)}>First benchmark</span>;
}

"use client";

import Link from "next/link";
import { Coins, Gauge, Globe, Heart, Leaf, Package, RotateCcw, Sparkles, Star, ThumbsDown, ThumbsUp, Utensils, type LucideIcon } from "lucide-react";
import { useId } from "react";
import { SealTick } from "@/components/art/icons";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { relativeDay } from "@/lib/dates";
import type { WhyReason } from "@/lib/meals/types";

const WHY_ICON: Record<WhyReason["kind"], LucideIcon> = {
  liked_similar: Heart,
  liked_ingredient: Leaf,
  liked_cuisine: Globe,
  favourite: Star,
  difficulty_fit: Gauge,
  macro_fit: Utensils,
  budget_fit: Coins,
  new_for_you: Sparkles,
  pantry: Package,
  repeat: RotateCcw,
};

/**
 * "Why this meal?": the reasons stored with the pick, strongest first. They come from the score
 * terms that actually raised it (engine/explain.ts), so nothing here is invented.
 */
export function WhyThisMeal({ reasons, className }: { reasons: WhyReason[]; className?: string }) {
  const titleId = useId(); // the recipe screen renders this twice (phone column, desktop aside)
  const list = [...reasons].sort((a, b) => b.weight - a.weight);
  if (!list.length) return null;
  return (
    <section className={cn("border-y border-vein py-4", className)} aria-labelledby={titleId}>
      <h2 id={titleId} className="t-eyebrow mb-3">
        Why this meal?
      </h2>
      <ul className="space-y-3">
        {list.map((r, i) => {
          const Icon = WHY_ICON[r.kind] ?? Sparkles;
          return (
            <li key={`${r.kind}-${i}`} className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full text-stone shadow-[inset_0_0_0_1px_var(--vein-3)]">
                <Icon className="size-4" strokeWidth={1.6} aria-hidden />
              </span>
              <p className="t-callout pt-1 text-ivory">{r.text}</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <Tag kind="RULE" />
        <p className="t-meta text-stone">Why the planner picked it for this slot. Rate meals to teach it.</p>
      </div>
    </section>
  );
}

/** Favourite and thumbs: the explicit taste signals the planner learns from. */
export function TasteCard({
  favourite,
  onFavourite,
  thumbs,
  onThumbs,
  className,
}: {
  favourite: boolean;
  onFavourite: () => void;
  thumbs: "up" | "down" | null;
  onThumbs: (t: "up" | "down") => void;
  className?: string;
}) {
  const titleId = useId();
  // an opinion, not something earned: selected is ivory, never gold
  const pill = "press t-callout inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 font-semibold transition-colors";
  const on = "bg-m4 text-ivory shadow-[inset_0_0_0_1px_var(--ivory)]";
  const off = "bg-m3 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory";
  return (
    <section className={cn("", className)} aria-labelledby={titleId}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={titleId} className="t-eyebrow">
          Your taste
        </h2>
        <span className="t-meta text-stone">Teaches your planner</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" aria-pressed={favourite} onClick={onFavourite} className={cn(pill, favourite ? on : off)}>
          <Star className="size-[18px]" fill={favourite ? "currentColor" : "none"} aria-hidden />
          {favourite ? "Saved" : "Save"}
        </button>
        <button type="button" aria-pressed={thumbs === "up"} onClick={() => onThumbs("up")} className={cn(pill, thumbs === "up" ? on : off)}>
          <ThumbsUp className="size-[18px]" fill={thumbs === "up" ? "currentColor" : "none"} aria-hidden />
          {thumbs === "up" ? "Liked" : "Like"}
        </button>
        <button type="button" aria-pressed={thumbs === "down"} onClick={() => onThumbs("down")} className={cn(pill, thumbs === "down" ? "bg-m4 text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)]" : off)}>
          <ThumbsDown className="size-[18px]" fill={thumbs === "down" ? "currentColor" : "none"} aria-hidden />
          {thumbs === "down" ? "Disliked" : "Dislike"}
        </button>
      </div>
    </section>
  );
}

/** "Logged today · 1,155 kcal" / "Logged on Oct 14 · 900 kcal". */
export function loggedText(date: string, today: string, kcal: number): string {
  const rd = relativeDay(date, today);
  const when = /^(Today|Yesterday|Tomorrow)$/.test(rd) ? rd.toLowerCase() : `on ${rd}`;
  return `Logged ${when} · ${Math.round(Number.isFinite(kcal) ? kcal : 0).toLocaleString("en-US")} kcal`;
}

/** "Logged today · 1,155 kcal" after this meal went into the food diary, with Undo when we can. */
export function LoggedStrip({ text, onUndo, href = "/nutrition", className }: { text: string; onUndo?: () => void; href?: string; className?: string }) {
  return (
    <div className={cn("flex min-h-14 items-center gap-3 rounded-btn bg-leaf-tint py-1.5 pl-3.5 pr-1.5 shadow-[inset_0_0_0_1px_var(--leaf-line)]", className)} role="status">
      <SealTick className="seal-in size-6 shrink-0 text-leaf-300" />
      <p className="t-callout min-w-0 flex-1 truncate font-semibold text-ivory">{text}</p>
      {onUndo ? (
        <button type="button" onClick={onUndo} className="press t-callout inline-flex h-11 shrink-0 items-center rounded-field px-3 font-semibold text-ivory">
          Undo
        </button>
      ) : (
        <Link href={href} className="press t-callout inline-flex h-11 shrink-0 items-center rounded-field px-3 font-semibold text-ivory">
          View
        </Link>
      )}
    </div>
  );
}

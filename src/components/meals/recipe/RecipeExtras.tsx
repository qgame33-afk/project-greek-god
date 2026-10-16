"use client";

import Link from "next/link";
import { Check, Coins, Gauge, Globe, Heart, Leaf, Package, RotateCcw, Sparkles, Star, ThumbsDown, ThumbsUp, Utensils, type LucideIcon } from "lucide-react";
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
  const list = [...reasons].sort((a, b) => b.weight - a.weight);
  if (!list.length) return null;
  return (
    <section className={cn("card p-4 sm:p-5", className)} aria-labelledby="why-title">
      <h2 id="why-title" className="eyebrow mb-3">
        Why this meal?
      </h2>
      <ul className="space-y-3">
        {list.map((r, i) => {
          const Icon = WHY_ICON[r.kind] ?? Sparkles;
          return (
            <li key={`${r.kind}-${i}`} className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-lapis-line bg-lapis-tint text-lapis-text">
                <Icon className="size-4" aria-hidden />
              </span>
              <p className="pt-[5px] text-[14.5px] font-medium leading-snug text-fg">{r.text}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">Why the planner picked it for this slot. Rate meals to teach it.</p>
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
  const pill = "press inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border px-3 text-[14px] font-bold transition-colors";
  const on = "border-line-gold bg-gold-tint text-gold-300";
  const off = "border-line bg-s3 text-fg-2 hover:text-fg";
  return (
    <section className={cn("card p-4 sm:p-5", className)} aria-labelledby="taste-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="taste-title" className="eyebrow">
          Your taste
        </h2>
        <span className="text-[12px] font-medium text-fg-3">Teaches your planner</span>
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
        <button type="button" aria-pressed={thumbs === "down"} onClick={() => onThumbs("down")} className={cn(pill, thumbs === "down" ? "border-line-strong bg-s5 text-fg" : off)}>
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
    <div className={cn("flex min-h-[52px] items-center gap-3 rounded-[14px] border border-success/25 bg-success-tint py-1.5 pl-3.5 pr-1.5", className)} role="status">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-success text-ink">
        <Check className="size-4" strokeWidth={3} aria-hidden />
      </span>
      <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{text}</p>
      {onUndo ? (
        <button type="button" onClick={onUndo} className="press inline-flex h-11 shrink-0 items-center rounded-[10px] px-3 text-[13.5px] font-bold text-gold-300 hover:text-gold-200">
          Undo
        </button>
      ) : (
        <Link href={href} className="press inline-flex h-11 shrink-0 items-center rounded-[10px] px-3 text-[13.5px] font-bold text-gold-300 hover:text-gold-200">
          View
        </Link>
      )}
    </div>
  );
}

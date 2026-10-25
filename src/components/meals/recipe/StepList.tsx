"use client";

import { Thermometer } from "lucide-react";
import { cn } from "@/lib/cn";
import { kitchenText } from "../cook/cook-model";

/** "Step 2 · Brown the beef" for timers and announcements. */
export function stepLabel(i: number, text: string): string {
  const first = text.split(/[.;:]/)[0].trim();
  const short = first.length > 40 ? `${first.slice(0, 38).replace(/\s+\S*$/, "")}…` : first;
  return `Step ${i + 1} · ${short}`;
}

/** A step's food-safety note (Health Canada temperatures): a calm card, never red. */
export function SafetyNote({ text, className, large }: { text: string; className?: string; large?: boolean }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-tile-lg bg-surface px-4 py-3.5", className)} role="note">
      <Thermometer className={cn("mt-0.5 shrink-0 text-fg", large ? "size-5" : "size-4")} strokeWidth={1.9} aria-hidden />
      <p className={large ? "t-body" : "t-label text-fg"} data-food="">
        <span className="sr-only">Food safety: </span>
        {kitchenText(text)}
      </p>
    </div>
  );
}

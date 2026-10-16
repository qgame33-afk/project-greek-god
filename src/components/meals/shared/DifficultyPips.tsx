import { cn } from "@/lib/cn";
import type { Difficulty } from "@/lib/meals/types";
import { DIFFICULTY_LABEL, DIFFICULTY_LEVEL } from "./format";

const HEIGHT = ["h-[6px]", "h-[9px]", "h-[12px]"];

/**
 * Difficulty as three rising bars (1 = Super Easy, 3 = I Like Cooking) plus its name. The
 * bars are a data mark (gold-400); the label carries the meaning for screen readers and anyone
 * who can't tell the bars apart.
 */
export function DifficultyPips({
  difficulty,
  label = true,
  className,
  size = "md",
}: {
  difficulty: Difficulty;
  /** Show the level's name next to the bars (default). */
  label?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const n = DIFFICULTY_LEVEL[difficulty] ?? 1;
  const name = DIFFICULTY_LABEL[difficulty] ?? "Super Easy";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span
        role="img"
        aria-label={label ? undefined : `Difficulty: ${name}`}
        aria-hidden={label ? true : undefined}
        className={cn("inline-flex items-end gap-[2px]", size === "sm" && "scale-90")}
      >
        {HEIGHT.map((h, i) => (
          <span key={h} className={cn("w-[3px] rounded-[1px]", h, i < n ? "bg-gold-400" : "bg-white/15")} />
        ))}
      </span>
      {label && <span>{name}</span>}
    </span>
  );
}

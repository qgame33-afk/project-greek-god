"use client";

import { ArrowRight, Check, Sparkles, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { OriginBadge, RecipeGlyph } from "@/components/meals/shared";
import { Button, Spinner } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useToday } from "@/lib/data/core";
import { simplifyRecipe } from "@/lib/meals/engine";
import type { AISimplifyResponse } from "@/lib/meals/ai";
import type { ConstraintPrefs } from "@/lib/meals/recipe";
import type { Recipe } from "@/lib/meals/types";
import { compareRecipes } from "./easier";
import { useMealsAIStatus } from "./hooks";

export interface EasierChoice {
  recipe: Recipe;
  /** easier_version: a library recipe (nothing to store). simplified: store it first. ai: already stored by the server. */
  kind: "easier_version" | "simplified" | "ai";
  changes: string[];
}

/** The engine's reason without repeating the heading: "2 min, 2 ingredients, 2 steps. Nothing left to cut." */
function honestReason(reason: string): string {
  const m = /^This is already as simple as it gets:\s*(.+)$/i.exec(reason);
  if (!m) return reason;
  const rest = m[1].trim().replace(/\.?$/, ".");
  return `${rest.charAt(0).toUpperCase()}${rest.slice(1)} Nothing left to cut.`;
}

type AIState = { s: "idle" } | { s: "loading"; since: number } | { s: "done"; res: AISimplifyResponse } | { s: "error"; message: string };

// the comparison table already shows time, counts and nutrition: don't say them twice
const SAID_IN_TABLE = [/^About \d+ min instead of/i, /^\d+ (ingredient|step)s? instead of/i, /^Nutrition /i];

/**
 * "Make this easier": the app's own simplifier first (instant, no AI): the recipe's hand-written
 * easier version, or shortcut swaps. Shows before → after and what changes; nothing is stored or
 * swapped until "Use easier version". When nothing can honestly be simplified it says so, and,
 * only if the server has an AI key, offers an AI attempt (labelled AI, checked like any recipe).
 */
export function MakeEasierSheet({
  open,
  onOpenChange,
  recipe,
  prefs,
  lookup,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recipe: Recipe;
  prefs: ConstraintPrefs;
  lookup: (key: string) => Recipe | undefined;
  onConfirm: (c: EasierChoice) => void;
  pending: boolean;
}) {
  const result = useMemo(() => (open ? simplifyRecipe(recipe, { prefs, lookup }) : null), [open, recipe, prefs, lookup]);
  const ai = useMealsAIStatus(open && !!result && !result.ok);
  const [aiState, setAiState] = useState<AIState>({ s: "idle" });
  const today = useToday();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setAiState({ s: "idle" });
  }

  const askAI = async () => {
    setAiState({ s: "loading", since: Date.now() });
    try {
      const r = await fetch("/api/meals/ai/simplify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipe: recipe.origin === "library" ? { key: recipe.key } : recipe, localDate: today }),
      });
      const j = (await r.json().catch(() => null)) as (AISimplifyResponse & { error?: string; code?: string }) | null;
      if (!r.ok || !j) {
        const msg =
          j?.code === "not_configured"
            ? "Meal AI isn't connected yet. It needs a GEMINI_API_KEY on the server."
            : j?.code === "bad_output"
              ? "The AI's easier version didn't pass the recipe checks, so the original stays."
              : (j?.error ?? "Couldn't reach the AI. Try again.");
        setAiState({ s: "error", message: msg });
        return;
      }
      setAiState({ s: "done", res: j });
    } catch {
      setAiState({ s: "error", message: "Couldn't reach the AI. Check your connection and try again." });
    }
  };

  let choice: EasierChoice | null = null;
  if (result?.ok) choice = { recipe: result.recipe, kind: result.kind, changes: result.changes };
  else if (aiState.s === "done" && aiState.res.ok) choice = { recipe: aiState.res.recipe, kind: "ai", changes: aiState.res.changes };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Make this easier"
      description={recipe.name}
      footer={
        choice ? (
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
            <Button variant="secondary" size="lg" className="px-3" onClick={() => onOpenChange(false)} disabled={pending}>
              Keep original
            </Button>
            <Button variant="primary" size="lg" className="px-3" onClick={() => choice && onConfirm(choice)} loading={pending}>
              Use easier
            </Button>
          </div>
        ) : undefined
      }
    >
      {!result ? null : choice ? (
        <EasierPreview from={recipe} choice={choice} />
      ) : (
        <div className="space-y-5 pb-2">
          <div className="card-inset flex items-start gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white/[.05] text-fg-2">
              <WandSparkles className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-fg">{result.ok ? "" : result.reason.startsWith("This is already") ? "Already as simple as it gets" : "No honest shortcut"}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-fg-2">{!result.ok && honestReason(result.reason)}</p>
            </div>
          </div>

          {aiState.s === "done" && !aiState.res.ok && <p className="rounded-[12px] border border-line px-3.5 py-3 text-[14px] leading-relaxed text-fg-2">AI: {aiState.res.reason}</p>}
          {aiState.s === "error" && (
            <p className="rounded-[12px] border border-line px-3.5 py-3 text-[14px] leading-relaxed text-fg-2" role="status">
              {aiState.message}
            </p>
          )}

          {ai.data?.configured && aiState.s !== "done" && (
            <div className="rounded-[16px] border border-lapis-line bg-lapis-tint p-4">
              <p className="flex items-center gap-2 text-[14px] font-bold text-lapis-text">
                <Sparkles className="size-4" aria-hidden />
                Try an AI version
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">
                AI writes a shortcut version using only ingredients from the app&apos;s list. It&apos;s checked against your allergies and diet, and the nutrition is recalculated. Labelled AI.
              </p>
              <Button variant="secondary" block className="mt-3" onClick={askAI} disabled={aiState.s === "loading"}>
                {aiState.s === "loading" ? (
                  <>
                    <Spinner />
                    Asking the AI…
                  </>
                ) : aiState.s === "error" ? (
                  "Try again"
                ) : (
                  "Ask AI for an easier version"
                )}
              </Button>
              {ai.data.mock && <p className="mt-2 text-[12px] font-medium text-fg-3">Dev mode: canned AI answers, not a live model.</p>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function EasierPreview({ from, choice }: { from: Recipe; choice: EasierChoice }) {
  const rows = compareRecipes(from, choice.recipe);
  const changes = choice.changes.filter((c) => !SAID_IN_TABLE.some((re) => re.test(c)));
  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-start gap-3">
        <RecipeGlyph recipe={choice.recipe} size="lg" />
        <div className="min-w-0 pt-0.5">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {choice.kind === "ai" ? <OriginBadge origin="ai" /> : choice.kind === "simplified" ? <OriginBadge origin="simplified" /> : <span className="eyebrow">Easier version</span>}
          </div>
          <p className="text-[17px] font-bold leading-tight text-fg">{choice.recipe.name}</p>
          {choice.recipe.blurb && <p className="mt-1 text-[13.5px] leading-snug text-fg-2">{choice.recipe.blurb}</p>}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-line">
        {rows.map((r, i) => (
          <div key={r.label} className={cn("grid grid-cols-[1fr_auto_16px_auto] items-center gap-2.5 px-4 py-2.5", i > 0 && "border-t border-line-hair")}>
            <span className="text-[13.5px] font-semibold text-fg-2">{r.label}</span>
            <span className="num text-right text-[17px] text-fg-3 line-through decoration-fg-3/50">{r.before}</span>
            <ArrowRight className="size-3.5 text-fg-3" aria-label="to" />
            <span className={cn("num min-w-[64px] text-right text-[19px] font-semibold", r.better ? "text-success" : "text-fg")}>{r.after}</span>
          </div>
        ))}
        <p className="border-t border-line-hair px-4 py-2 text-[12px] font-medium text-fg-3">Per serving. Nutrition is an estimate from the ingredients.</p>
      </div>

      {changes.length > 0 && (
        <div>
          <p className="eyebrow mb-2">What changes</p>
          <ul className="space-y-2">
            {changes.map((c) => (
              <li key={c} className="flex items-start gap-2.5 text-[14.5px] leading-snug text-fg">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[12.5px] leading-relaxed text-fg-3">
        {choice.kind === "simplified" ? "Saved to your recipes when you use it." : choice.kind === "ai" ? "AI-written, then checked by the app. Saved to your recipes." : "A recipe from the app's library."}
      </p>
    </div>
  );
}

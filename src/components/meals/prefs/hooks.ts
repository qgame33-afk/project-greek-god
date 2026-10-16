"use client";

// "What the planner has learned → Reset": the one write the shared meal hooks don't cover.
// Learning is rebuilt from meal_feedback every time (docs/MEALS.md §4), so forgetting it means
// removing those rows. Undo puts every row back with its original time, so decay is unchanged.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAll, must, sb, type Row } from "@/lib/data/core";

type FeedbackRow = Row<"meal_feedback">;

export function useResetLearning() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["meal-learning-reset"],
    mutationFn: async () => {
      const rows = await fetchAll((a, b) => sb().from("meal_feedback").select("*").order("created_at").order("id").range(a, b));
      // ids go in the query string, so delete in chunks
      for (let i = 0; i < rows.length; i += 200) {
        must(await sb().from("meal_feedback").delete().in("id", rows.slice(i, i + 200).map((r) => r.id)));
      }
      return rows as FeedbackRow[];
    },
    onSuccess: (rows) => {
      if (!rows.length) return;
      toast("The planner starts fresh", {
        description: `${rows.length} ${rows.length === 1 ? "signal" : "signals"} forgotten. Your preferences and favourites stay.`,
        duration: 8000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              for (let i = 0; i < rows.length; i += 500) {
                must(await sb().from("meal_feedback").upsert(rows.slice(i, i + 500), { onConflict: "id", ignoreDuplicates: true }));
              }
            } catch (e) {
              toast.error("Couldn't undo", { description: e instanceof Error ? e.message : String(e) });
            } finally {
              qc.invalidateQueries({ queryKey: ["meal-feedback"] });
            }
          },
        },
      });
    },
    onError: (e: Error) => toast.error("Couldn't reset what the planner learned", { description: e.message }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["meal-feedback"] }),
  });
}

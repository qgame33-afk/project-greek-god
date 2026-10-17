"use client";

import { useSearchParams } from "next/navigation";
import { parseMonthParam } from "@/lib/reviews/compute";
import { ChronicleStory } from "./chronicle/ChronicleStory";
import { MonthlyReview } from "./MonthlyReview";

/**
 * /reviews/[month] (docs/DESIGN-V2.md §3.8): the Chronicle story by default; `?view=ledger` is the
 * full printable review. A month that isn't one, or lies outside the programme, goes to the ledger,
 * which explains it plainly.
 */
export function ReviewRoute({ monthParam }: { monthParam: string }) {
  const params = useSearchParams();
  const month = parseMonthParam(monthParam);
  if (!month || params.get("view") === "ledger") return <MonthlyReview monthParam={monthParam} />;
  return <ChronicleStory month={month} />;
}

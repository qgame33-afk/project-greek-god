"use client";

import { useSearchParams } from "next/navigation";
import { parseMonthParam } from "@/lib/reviews/compute";
import { MonthlyReview } from "./MonthlyReview";
import { RecapMonth } from "./RecapMonth";

/**
 * /reviews/[month] (docs/DESIGN-V3-SIMPLE.md §3.7, §4.5.6): the month's recap by default;
 * `?view=ledger` is the full printable page (content unchanged). A month that isn't one goes to
 * the printable page, which says so plainly.
 */
export function ReviewRoute({ monthParam }: { monthParam: string }) {
  const params = useSearchParams();
  const month = parseMonthParam(monthParam);
  if (!month || params.get("view") === "ledger") return <MonthlyReview monthParam={monthParam} />;
  return <RecapMonth month={month} />;
}

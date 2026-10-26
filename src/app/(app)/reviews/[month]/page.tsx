import type { Metadata } from "next";
import { Suspense } from "react";
import { monthName } from "@/lib/dates";
import { parseMonthParam } from "@/lib/reviews/compute";
import { ReviewSkeleton } from "@/components/reviews/MonthlyReview";
import { ReviewRoute } from "@/components/reviews/ReviewRoute";

/** "September recap" (§2.2 page titles); a param that isn't a month keeps the list's title. */
export async function generateMetadata({ params }: PageProps<"/reviews/[month]">): Promise<Metadata> {
  const { month } = await params;
  const m = parseMonthParam(month);
  return { title: m ? `${monthName(m)} recap` : "Monthly recap" };
}

export default function MonthlyReviewPage({ params }: PageProps<"/reviews/[month]">) {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <MonthFromParams params={params} />
    </Suspense>
  );
}

async function MonthFromParams({ params }: { params: PageProps<"/reviews/[month]">["params"] }) {
  const { month } = await params;
  return <ReviewRoute monthParam={month} />;
}

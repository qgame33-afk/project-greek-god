import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewSkeleton } from "@/components/reviews/MonthlyReview";
import { ReviewRoute } from "@/components/reviews/ReviewRoute";

export const metadata: Metadata = { title: "The Chronicle" };

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

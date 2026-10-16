import type { Metadata } from "next";
import { Suspense } from "react";
import { MonthlyReview, ReviewSkeleton } from "@/components/reviews/MonthlyReview";

export const metadata: Metadata = { title: "Monthly review" };

export default function MonthlyReviewPage({ params }: PageProps<"/reviews/[month]">) {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <MonthFromParams params={params} />
    </Suspense>
  );
}

async function MonthFromParams({ params }: { params: PageProps<"/reviews/[month]">["params"] }) {
  const { month } = await params;
  return <MonthlyReview monthParam={month} />;
}

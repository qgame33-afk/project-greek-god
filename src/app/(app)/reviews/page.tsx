import type { Metadata } from "next";
import { ReviewsIndex } from "@/components/reviews/ReviewsIndex";

export const metadata: Metadata = { title: "Monthly reviews" };

export default function ReviewsPage() {
  return <ReviewsIndex />;
}

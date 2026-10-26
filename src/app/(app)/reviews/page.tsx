import type { Metadata } from "next";
import { RecapList } from "@/components/reviews/RecapList";

export const metadata: Metadata = { title: "Monthly recap" };

export default function ReviewsPage() {
  return <RecapList />;
}

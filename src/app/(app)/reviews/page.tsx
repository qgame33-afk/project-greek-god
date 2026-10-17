import type { Metadata } from "next";
import { ChronicleIndex } from "@/components/reviews/ChronicleIndex";

export const metadata: Metadata = { title: "The Chronicle" };

export default function ReviewsPage() {
  return <ChronicleIndex />;
}

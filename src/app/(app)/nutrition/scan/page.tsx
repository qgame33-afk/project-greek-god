import type { Metadata } from "next";
import { FoodScanner } from "@/components/food-ai/scanner/FoodScanner";

export const metadata: Metadata = { title: "Scan meal" };

export default function ScanPage() {
  return <FoodScanner />;
}

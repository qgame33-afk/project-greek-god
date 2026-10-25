import type { Metadata } from "next";
import { FoodScanner } from "@/components/food-ai/scanner/FoodScanner";

export const metadata: Metadata = { title: "Scan food" };

export default function ScanPage() {
  return <FoodScanner />;
}

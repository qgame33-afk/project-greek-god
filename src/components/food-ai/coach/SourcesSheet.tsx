"use client";

import { Sheet } from "@/components/ui/sheet";

/** Where the food coach's numbers come from: database values, estimates, published numbers, privacy. */
export function SourcesSheet({ open, onOpenChange, usda }: { open: boolean; onOpenChange: (o: boolean) => void; usda?: "key" | "demo_key" }) {
  const rows: { title: string; body: string }[] = [
    {
      title: "Database values",
      body: `Generic foods are checked against USDA FoodData Central, packaged products against Open Food Facts. Matched rows link to the exact record.${
        usda === "demo_key" ? " USDA is running on a shared demo key, so some lookups may fall back to estimates." : ""
      }`,
    },
    {
      title: "Estimates",
      body: "When nothing matches confidently, and for every restaurant item, the row is an AI estimate with a confidence mark. Check portions before logging.",
    },
    {
      title: "Published restaurant numbers",
      body: "Coach can't browse the web. On a restaurant row, Research it hands the question to ChatGPT or Claude; paste the answer back. Their links are shown as reported, because the app didn't open those pages itself.",
    },
    { title: "Privacy", body: "Chats and photos are stored in your account only. Deleting a chat deletes its photos; logged food stays in your diary." },
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Where the numbers come from">
      <dl className="divide-y divide-line border-y border-line pb-1">
        {rows.map((r) => (
          <div key={r.title} className="py-3.5">
            <dt className="t-row text-fg">{r.title}</dt>
            <dd className="t-label mt-1 text-fg-2">{r.body}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { DetailSkeleton } from "@/components/training/Skeletons";
import { TemplateEditor } from "@/components/training/TemplateEditor";

export const metadata: Metadata = { title: "Edit workout" };

export default function ProgramTemplatePage({ params }: { params: Promise<{ key: string }> }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <TemplateEditor templateKey={decodeURIComponent(key)} />;
}

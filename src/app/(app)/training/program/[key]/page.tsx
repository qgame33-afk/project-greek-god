import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DetailSkeleton } from "@/components/training/Skeletons";
import { TemplateEditor } from "@/components/training/TemplateEditor";
import { templateDef } from "@/lib/training/programs";

type Params = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { key } = await params;
  return { title: templateDef(decodeURIComponent(key))?.name ?? "Workout" };
}

/** The workout editor: any key of either program; anything else is a 404. */
export default function ProgramTemplatePage({ params }: Params) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Params) {
  const { key } = await params;
  const k = decodeURIComponent(key);
  if (!templateDef(k)) notFound();
  return <TemplateEditor templateKey={k} />;
}

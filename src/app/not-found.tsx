import Link from "next/link";
import { Button } from "@/components/ui/button";

// A page that doesn't exist (an unknown URL, or a screen that calls notFound(), such as
// /training/program/<unknown key>): the V3 card, in place of the framework's default 404 page.
export default function NotFound() {
  return (
    <div role="alert" className="flex min-h-[60dvh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px] rounded-card bg-card px-6 py-7 text-center">
        <h1 className="t-sheet">This page isn&apos;t here.</h1>
        <p className="t-label mx-auto mt-2 max-w-[32ch]">The link may be old. Everything you logged is safe.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild variant="secondary" block>
            <Link href="/">Go to Today</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

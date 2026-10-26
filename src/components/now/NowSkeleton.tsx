import { Skeleton } from "@/components/ui/misc";

/** Today's first-load placeholder (§4.1.9): header, strip, hero, trio and one card in their final shapes. */
export function NowSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading Today" className="pb-2">
      <div className="mb-1 mt-1 flex min-h-14 items-center justify-between">
        <Skeleton className="h-8 w-28 rounded-tile" />
        <Skeleton className="size-10 rounded-full" />
      </div>
      <div className="mb-4 grid grid-cols-7 justify-items-center gap-1 pt-6">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="size-[38px] rounded-full" />
        ))}
      </div>
      <Skeleton className="h-[160px] rounded-card" />
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[150px] rounded-tile-lg short:h-[64px]" />
        ))}
      </div>
      <Skeleton className="mt-3 h-[118px] rounded-card" />
    </div>
  );
}

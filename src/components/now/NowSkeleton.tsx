import { Skeleton } from "@/components/ui/misc";

/** Now's first-load placeholder: the hero, the climb rule and the Now card in their final shapes. */
export function NowSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading Now" className="pb-2">
      <div className="relative min-h-[296px] pt-2">
        <div className="w-[calc(100%-178px)] space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-5 h-7 w-40" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="absolute right-0 top-4 h-[260px] w-[150px] rounded-t-full rounded-b-card" />
      </div>
      <Skeleton className="mt-1 h-2 w-full" />
      <div className="slab mt-6 space-y-3 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full rounded-btn" />
      </div>
    </div>
  );
}

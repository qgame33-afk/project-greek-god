import { Skeleton } from "@/components/ui/misc";

/** The Week's shape while its data loads: the same blocks at the same heights, so nothing jumps. */
export function WeekSkeleton() {
  return (
    <div aria-hidden>
      <div className="flex items-end justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-36" />
          <Skeleton className="mt-2.5 h-3.5 w-48" />
        </div>
        <div className="flex flex-col items-end">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="mt-1.5 h-3 w-14" />
        </div>
      </div>
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-12">
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3.5 h-2 w-full rounded-full" />
          <Skeleton className="mx-auto mt-6 aspect-[320/96] w-full max-w-110" />
          <Skeleton className="mx-auto mt-2 h-8 w-full max-w-110" />
          <Skeleton className="mt-4 h-31 w-full rounded-card" />
        </div>
        <div className="mt-4 space-y-8 lg:mt-0">
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-18 rounded-card" />
            <Skeleton className="h-18 rounded-card" />
          </div>
          <div>
            <Skeleton className="h-3 w-36" />
            <Skeleton className="mt-4 h-4 w-60" />
            <div className="mt-3 space-y-4">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

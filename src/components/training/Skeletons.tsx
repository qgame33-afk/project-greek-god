import { Skeleton } from "@/components/ui/misc";

/** Shape-matched placeholder for /training while the route's client code and data load. */
export function TrainingSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-9 w-44" />
      </div>
      <div className="grid gap-3 lg:grid-cols-12 lg:gap-4">
        <Skeleton className="h-[236px] rounded-[20px] lg:col-span-7" />
        <Skeleton className="h-[300px] rounded-[20px] lg:col-span-5" />
      </div>
      <Skeleton className="mt-8 h-11 w-full rounded-[12px] lg:max-w-[480px]" />
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-11 w-28 rounded-[12px]" />
      <Skeleton className="mt-6 h-3 w-32" />
      <Skeleton className="mt-3 h-9 w-64" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[92px] rounded-[16px]" />
        ))}
      </div>
      <Skeleton className="mt-4 h-[280px] rounded-[20px]" />
    </div>
  );
}

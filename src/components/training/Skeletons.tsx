import { Skeleton } from "@/components/ui/misc";
import { WeekSkeleton } from "./week/WeekSkeleton";

/** /training while the route's client code loads: the segments and the Week's shape. */
export function TrainingSkeleton() {
  return (
    <div aria-hidden className="pb-4">
      <Skeleton className="mb-6 h-11 w-full rounded-field lg:max-w-sm" />
      <WeekSkeleton />
    </div>
  );
}

/** An exercise or template page while it loads: back link, title, the stat row and the chart. */
export function DetailSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-11 w-28 rounded-field" />
      <Skeleton className="mt-5 h-3 w-36" />
      <Skeleton className="mt-3 h-9 w-64" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-px sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-21 rounded-none" />
        ))}
      </div>
      <Skeleton className="mt-8 h-80 rounded-card" />
    </div>
  );
}

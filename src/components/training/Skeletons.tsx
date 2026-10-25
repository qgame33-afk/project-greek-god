import { Skeleton } from "@/components/ui/misc";
import { WeekSkeleton } from "./week/WeekSkeleton";

/** /training while the route's client code loads: the title row and the week's shape. */
export function TrainingSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-1 mt-1 flex min-h-14 items-center justify-between">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-9 w-24 rounded-pill" />
      </div>
      <WeekSkeleton />
    </div>
  );
}

/** An exercise or workout page while it loads: back link, title, a card and rows. */
export function DetailSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-11 w-24 rounded-pill" />
      <Skeleton className="mt-2 h-9 w-64" />
      <Skeleton className="mt-5 h-[168px] rounded-card" />
      <Skeleton className="mt-3 h-[240px] rounded-card" />
      <Skeleton className="mt-7 h-[200px] rounded-tile-lg" />
    </div>
  );
}

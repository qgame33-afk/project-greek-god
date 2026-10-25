import { Skeleton } from "@/components/ui/misc";

/** Train while its week loads (§4.12): the strip, the hero and the lift rows in their final shapes. */
export function WeekSkeleton() {
  return (
    <div aria-hidden>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="size-[38px] rounded-full" />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-4 h-[212px] rounded-card" />
      <Skeleton className="mt-7 h-5 w-32" />
      <Skeleton className="mt-3 h-[340px] rounded-tile-lg" />
    </div>
  );
}

import { Skeleton } from "@/components/ui/misc";

/** Content-shaped placeholder; appears only after 150ms so fast loads never flash it. */
export function TodaySkeleton() {
  return (
    <div className="@container" aria-busy="true" aria-label="Loading today" style={{ animation: "rise 220ms var(--ease-out) 150ms both" }}>
      <div className="grid grid-cols-1 gap-3 @min-[760px]:grid-cols-12 @min-[760px]:gap-4">
        <div className="card-monument p-5 @min-[760px]:col-span-7">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-7 w-56" />
          <Skeleton className="mt-2 h-7 w-36" />
          <Skeleton className="mt-4 h-4 w-64" />
          <div className="mt-6 flex items-end justify-between">
            <Skeleton className="h-14 w-28" />
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="mt-6 h-3.5 w-full" />
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
        <div className="card-accent p-5 @min-[760px]:col-span-5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-8 w-32" />
          <Skeleton className="mt-3 h-4 w-56" />
          <Skeleton className="mt-5 h-14 w-full rounded-[14px]" />
          <Skeleton className="mt-4 h-10 w-full" />
          <Skeleton className="mt-2 h-10 w-full" />
        </div>
        <div className="card h-[300px] p-5 @min-[760px]:col-span-7 @min-[1100px]:col-span-5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-12 w-40" />
        </div>
        <div className="card h-[300px] p-5 @min-[760px]:col-span-5 @min-[1100px]:col-span-4">
          <Skeleton className="mx-auto size-[136px] rounded-full" />
        </div>
        <div className="card h-[300px] p-5 @min-[760px]:col-span-5 @min-[1100px]:col-span-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-10 w-full" />
          <Skeleton className="mt-2 h-10 w-full" />
          <Skeleton className="mt-2 h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

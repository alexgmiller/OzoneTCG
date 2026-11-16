import { Skeleton } from "@/components/ui";

// ── Home skeleton ── mirrors DashboardServer's layout so nothing shifts on resolve
// (one column on a phone; chart card + side column + full-width grid on lg+)

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4 lg:max-w-6xl">
      <div className="space-y-6 lg:grid lg:grid-cols-3 lg:grid-rows-home lg:items-start lg:gap-6 lg:space-y-0">
        {/* Value | Profit, hero, chart, range, counts */}
        <div className="space-y-4 lg:col-span-2 lg:row-span-2 lg:row-start-1 lg:rounded-2xl lg:bg-surface lg:p-4">
          <Skeleton className="h-12 rounded-full lg:w-64" />
          <div className="flex flex-col items-center gap-2">
            <Skeleton variant="text" className="w-28" />
            <Skeleton className="h-12 w-48" />
          </div>
          <Skeleton className="h-40 lg:h-72" />
          <div className="flex justify-between lg:hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="text" className="w-8" />
            ))}
          </div>
          <div className="grid grid-cols-3 lg:border-t lg:border-border lg:pt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton variant="text" className="w-12" />
                <Skeleton variant="text" className="w-8" />
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="lg:col-start-3 lg:row-start-1">
          <div className="grid grid-cols-4 lg:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton variant="circle" className="h-11 w-11" />
                <Skeleton variant="text" className="w-8" />
              </div>
            ))}
          </div>
          <div className="hidden grid-cols-2 gap-3 lg:grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        </div>

        {/* Most valuable */}
        <div className="space-y-3 lg:col-span-3 lg:row-start-3">
          <Skeleton variant="text" className="w-28" />
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 md:mx-0 md:px-0 lg:grid lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[63/88] w-36 shrink-0 rounded-2xl lg:w-full" />
            ))}
          </div>
        </div>

        {/* Recent */}
        <div className="space-y-3 lg:col-start-3 lg:row-start-2">
          <Skeleton variant="text" className="w-16" />
          <div className="overflow-hidden rounded-2xl bg-surface">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex h-16 items-center gap-3 border-b border-border px-3 last:border-b-0">
                <Skeleton className="h-12 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" className="w-40" />
                  <Skeleton variant="text" className="w-24" />
                </div>
                <Skeleton variant="text" className="w-14" />
              </div>
            ))}
            <Skeleton className="h-11 rounded-t-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

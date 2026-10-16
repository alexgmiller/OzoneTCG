import { Skeleton } from "@/components/ui";

// ── Home skeleton ── mirrors DashboardServer's layout so nothing shifts on resolve

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4">
      {/* Value | Profit */}
      <Skeleton className="h-12 rounded-full" />

      {/* Hero + chart + range */}
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2">
          <Skeleton variant="text" className="w-28" />
          <Skeleton className="h-12 w-48" />
        </div>
        <Skeleton className="h-40" />
        <div className="flex justify-between">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="text" className="w-8" />
          ))}
        </div>
      </div>

      {/* Raw | Graded | Sealed */}
      <div className="grid grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton variant="text" className="w-12" />
            <Skeleton variant="text" className="w-8" />
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton variant="circle" className="h-11 w-11" />
            <Skeleton variant="text" className="w-8" />
          </div>
        ))}
      </div>

      {/* Most valuable */}
      <div className="space-y-3">
        <Skeleton variant="text" className="w-28" />
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[63/88] w-[140px] shrink-0 rounded-2xl" />
          ))}
        </div>
      </div>

      {/* Recent */}
      <div className="space-y-3">
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
  );
}

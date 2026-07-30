import { Skeleton } from "@/components/ui";

/** Mirrors ShowsServer: title, 4-up stat grid, then past-show rows. */
export default function ShowsLoading() {
  return (
    <div className="p-4 space-y-5">
      <Skeleton className="h-7 w-24 rounded-lg" />

      {/* Stat grid — P&L, avg, best, count */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-xl p-3 space-y-2">
            <Skeleton className="h-2.5 w-20 rounded" />
            <Skeleton className="h-6 w-24 rounded-lg" />
            <Skeleton className="h-2.5 w-16 rounded" />
          </div>
        ))}
      </div>

      {/* Past shows */}
      <div className="border rounded-xl overflow-hidden">
        <div className="border-b px-4 py-3">
          <Skeleton variant="text" className="w-28" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 rounded" style={{ width: `${40 + (i % 3) * 16}%` }} />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
            <Skeleton className="h-5 w-16 rounded shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui";

// ── Payout skeleton ── mirrors PayoutServer + PayoutClient so nothing shifts on resolve

function Rows({ count }: { count: number }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3">
          <Skeleton variant="text" className={i % 2 === 0 ? "w-32" : "w-40"} />
          <Skeleton variant="text" className="w-16" />
        </div>
      ))}
    </div>
  );
}

export default function PayoutLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 py-4">
      {/* Page title */}
      <Skeleton className="h-7 w-24 rounded-lg" />

      <div className="space-y-6">
        {/* Current period: header, stat tiles, net, breakdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton variant="text" className="w-28" />
            <Skeleton variant="text" className="w-36" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="col-span-2 h-24 sm:col-span-1" />
          </div>
          <Skeleton className="h-24" />
          <Rows count={2} />
        </div>

        {/* Partner spend */}
        <div className="space-y-3">
          <Skeleton variant="text" className="w-28" />
          <Rows count={3} />
        </div>

        {/* Sales */}
        <div className="space-y-3">
          <Skeleton variant="text" className="w-16" />
          <Rows count={2} />
        </div>

        {/* Settle up */}
        <div className="space-y-3">
          <Skeleton variant="text" className="w-20" />
          <Skeleton className="h-44" />
        </div>

        {/* Past periods */}
        <div className="space-y-3">
          <Skeleton variant="text" className="w-28" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

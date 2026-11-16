import { Skeleton } from "@/components/ui";

// ── Finance skeleton ── mirrors FinanceClient: title, 4 stat tiles, tabs, rows,
// categories (lg+: tiles in one row, P&L on the left, categories on the right)

export default function FinanceLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 py-4 lg:max-w-6xl">
      <Skeleton className="h-7 w-28 rounded-lg" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="space-y-5 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-3 lg:col-span-2">
          <Skeleton className="h-11 rounded-xl lg:max-w-sm" />
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                <Skeleton variant="text" className="w-24" />
                <Skeleton variant="text" className="w-40" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton variant="text" className="w-36" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  );
}

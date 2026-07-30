import { Skeleton } from "@/components/ui";

/** Mirrors ExpensesServer: summary stats, filter row, then expense rows. */
export default function ExpensesLoading() {
  return (
    <div className="w-full py-4 sm:py-6 space-y-4 max-w-4xl mx-auto overflow-x-hidden px-4">
      {/* Header + add button */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border rounded-xl p-4 space-y-2">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-6 w-24 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-hidden">
        {[64, 80, 72, 56].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-full shrink-0" style={{ width: w }} />
        ))}
      </div>

      {/* Expense rows */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border overflow-hidden">
            <div className="flex items-start gap-2.5 px-3 py-3">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 rounded" style={{ width: `${42 + (i % 4) * 13}%` }} />
                <Skeleton className="h-3 w-2/5 rounded" />
              </div>
              <Skeleton className="h-5 w-16 rounded shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

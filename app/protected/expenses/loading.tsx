import { Skeleton } from "@/components/ui";

// Mirrors ExpensesServer: header, stat cards, filter pills, then expense rows.
export default function ExpensesLoading() {
  return (
    <div className="w-full py-4 sm:py-6 space-y-4 max-w-4xl mx-auto overflow-x-hidden">
      {/* Header: title + tax report link + year select */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28 rounded-lg" />
          <Skeleton className="h-11 w-20 rounded-lg" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`space-y-2 rounded-xl border border-border p-4 ${i === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
            <Skeleton className="h-3 w-20 rounded-lg" />
            <Skeleton className="h-6 w-24 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-hidden">
        {[64, 80, 72, 56].map((w, i) => (
          <Skeleton key={i} className="h-11 shrink-0 rounded-full" style={{ width: w }} />
        ))}
      </div>

      {/* Expense rows */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-start gap-3 px-3 py-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 rounded-lg" style={{ width: `${42 + (i % 4) * 13}%` }} />
                <Skeleton className="h-3 w-2/5 rounded-lg" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

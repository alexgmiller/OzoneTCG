import { Skeleton } from "@/components/ui";

// Mirrors ExpensesServer: header, stat cards, filter pills, then expense rows.
// lg+: stats in the right column, filters and rows on the left two thirds.
export default function ExpensesLoading() {
  return (
    <div className="w-full py-4 sm:py-6 space-y-4 max-w-4xl mx-auto overflow-x-hidden lg:max-w-6xl">
      {/* Header: title + tax report link + year select */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28 rounded-lg" />
          <Skeleton className="h-11 w-20 rounded-lg" />
        </div>
      </div>

      <div className="space-y-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-start-3 lg:row-start-1 lg:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`space-y-2 rounded-xl border border-border p-4 ${i === 2 ? "col-span-2 sm:col-span-1 lg:col-span-2" : ""}`}>
              <Skeleton className="h-3 w-20 rounded-lg" />
              <Skeleton className="h-6 w-24 rounded-lg" />
            </div>
          ))}
        </div>

        <div className="space-y-4 lg:col-span-2 lg:row-start-1">
          {/* Filter pills */}
          <div className="flex gap-2 overflow-hidden">
            {["w-16", "w-20", "w-16", "w-14"].map((w, i) => (
              <Skeleton key={i} className={`h-11 shrink-0 rounded-full ${w}`} />
            ))}
          </div>

          {/* Expense rows */}
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border">
                <div className="flex items-start gap-3 px-3 py-3">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className={`h-3.5 rounded-lg ${["w-2/5", "w-1/2", "w-2/3", "w-3/4"][i % 4]}`} />
                    <Skeleton className="h-3 w-2/5 rounded-lg" />
                  </div>
                  <Skeleton className="h-5 w-16 shrink-0 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui";

// ── Transactions skeleton ── mirrors LedgerClient: title, filter grid, list rows

export default function TransactionsLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-4">
      <Skeleton className="h-7 w-36 rounded-lg" />

      {/* Filters: three selects, then two date inputs */}
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-lg" />
        ))}
        <Skeleton className="col-span-3 h-11 rounded-lg sm:col-span-1" />
        <Skeleton className="col-span-3 h-11 rounded-lg sm:col-span-1" />
      </div>

      {/* Deal rows */}
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex min-h-14 items-center gap-3 p-3">
            <Skeleton variant="text" className="w-12 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton variant="text" className={i % 2 === 0 ? "w-2/3" : "w-1/2"} />
              <Skeleton variant="text" className="w-2/5" />
            </div>
            <Skeleton variant="text" className="w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

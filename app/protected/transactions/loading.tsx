import { Skeleton } from "@/components/ui";

// ── Transactions skeleton ── mirrors LedgerClient: title, filters, count line,
// then list rows on a phone / table rows on lg+

export default function TransactionsLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-4 lg:max-w-6xl">
      <Skeleton className="h-7 w-36 rounded-lg" />

      {/* Filters: three selects, then two date inputs (one row of five on lg+) */}
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-lg" />
        ))}
        <Skeleton className="col-span-3 h-11 rounded-lg sm:col-span-1" />
        <Skeleton className="col-span-3 h-11 rounded-lg sm:col-span-1" />
      </div>

      <div className="flex justify-between">
        <Skeleton variant="text" className="w-16" />
        <Skeleton variant="text" className="w-24" />
      </div>

      {/* Deal rows (phone) */}
      <div className="divide-y divide-border rounded-xl border border-border bg-card lg:hidden">
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

      {/* Table rows (lg+) */}
      <div className="hidden overflow-hidden rounded-2xl bg-surface lg:block">
        <div className="h-11 border-b border-border" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex h-14 items-center gap-8 border-b border-border px-4 last:border-b-0">
            <Skeleton variant="text" className="w-24 shrink-0" />
            <Skeleton className="h-5 w-12 shrink-0 rounded-full" />
            <Skeleton variant="text" className={i % 2 === 0 ? "w-1/3" : "w-1/4"} />
            <Skeleton variant="text" className="ml-auto w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

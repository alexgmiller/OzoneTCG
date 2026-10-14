import { Skeleton } from "@/components/ui";

// ── Finance skeleton ── mirrors FinanceClient: title, 4 stat tiles, tabs, rows

export default function FinanceLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 py-4">
      <Skeleton className="h-7 w-28 rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-11 rounded-xl" />
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <Skeleton variant="text" className="w-24" />
            <Skeleton variant="text" className="w-40" />
          </div>
        ))}
      </div>
      <Skeleton variant="text" className="w-36" />
      <Skeleton className="h-40" />
    </div>
  );
}

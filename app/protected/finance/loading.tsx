import { Page, Skeleton } from "@/components/ui";

// ── Finance skeleton ── mirrors FinanceClient: title, 4 stat tiles, then
// P&L (two thirds on lg+) beside categories + exports

export default function FinanceLoading() {
  return (
    <Page width="wide">
      <Skeleton className="h-7 w-28 rounded-lg" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="space-y-3 lg:col-span-2">
          <Skeleton className="h-11 rounded-xl" />
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                <Skeleton variant="text" className="w-24" />
                <Skeleton variant="text" className="w-40" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton variant="text" className="w-36" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </Page>
  );
}

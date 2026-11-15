import { Page, Skeleton } from "@/components/ui";

// ── POS skeleton ── mirrors PosClient: show card, mode switch, entry row, form

export default function PosLoading() {
  return (
    <Page>
      {/* Page header */}
      <Skeleton className="h-7 w-24 rounded-lg" />

      {/* Show session */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-11 flex-1 rounded-lg" />
          <div className="w-24 space-y-1">
            <Skeleton variant="text" className="w-full" />
            <Skeleton variant="text" className="ml-auto w-16" />
          </div>
        </div>
        <div className="flex justify-end border-t border-border pt-2">
          <Skeleton className="h-11 w-24 rounded-lg" />
        </div>
      </div>

      {/* Mode switch */}
      <Skeleton className="h-12" />

      {/* Category chips + card entry */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-20 rounded-full" />
        ))}
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-lg" />
        <Skeleton className="h-11 w-24 rounded-lg" />
        <Skeleton className="h-11 w-16 rounded-lg" />
      </div>

      {/* Transaction form */}
      <div className="space-y-3 border-t border-border pt-3">
        <Skeleton className="h-14 rounded-lg" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-20 shrink-0 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-11 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-14" />
      </div>
    </Page>
  );
}

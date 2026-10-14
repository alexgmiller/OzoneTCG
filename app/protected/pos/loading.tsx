import { Skeleton } from "@/components/ui";

// ── POS skeleton ── mirrors PosClient: show card, mode switch, entry row, form

export default function PosLoading() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 py-4">
      {/* Show session */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
        <Skeleton className="h-11 flex-1 rounded-lg" />
        <Skeleton variant="text" className="w-16" />
        <Skeleton className="h-11 w-16 rounded-lg" />
      </div>

      {/* Mode switch */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>

      {/* Category chips + card entry */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-20 rounded-lg" />
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
    </div>
  );
}

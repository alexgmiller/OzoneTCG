import { Skeleton } from "@/components/ui";

// ── Mirrors ConsignersClient: header row, then one card per consigner ──

export default function ConsignersLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32 rounded-lg" />
          <Skeleton className="h-3 w-40 rounded-lg" />
        </div>
        <Skeleton className="h-11 w-24 rounded-lg" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-start gap-3 p-4">
              <Skeleton variant="circle" className="h-11 w-11 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="w-32" />
                <Skeleton className="h-3 w-40 rounded-lg" />
              </div>
              <div className="space-y-2 text-right">
                <Skeleton className="ml-auto h-3 w-10 rounded-lg" />
                <Skeleton className="h-6 w-20 rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 pb-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-16 rounded-lg" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 pb-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-11 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

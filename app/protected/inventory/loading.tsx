import { Skeleton } from "@/components/ui";

export default function InventoryLoading() {
  return (
    <div className="w-full space-y-4 py-4">
      {/* ── Page header ── */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton variant="text" className="w-40" />
      </div>

      {/* ── Add panel + search ── */}
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-11 w-full rounded-lg" />

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>

      {/* ── Item cards ── */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Skeleton className="h-5 w-5 rounded-lg" />
            <Skeleton className="h-20 w-14 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton variant="text" className={i % 2 === 0 ? "w-3/4" : "w-1/2"} />
              <Skeleton variant="text" className="w-2/5" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-5 w-16 rounded-lg" />
              <Skeleton variant="text" className="w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

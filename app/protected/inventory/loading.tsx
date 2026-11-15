import { Page, Skeleton } from "@/components/ui";

export default function InventoryLoading() {
  return (
    <Page width="wide">
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

      {/* ── List header: label + select all + layout toggle ── */}
      <div className="flex min-h-11 items-center justify-between">
        <Skeleton variant="text" className="w-24" />
        <Skeleton className="h-11 w-24" />
      </div>

      {/* ── Items ── rows on phones, tiles from md up (the default view per breakpoint) */}
      <div className="space-y-2 md:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Skeleton className="h-5 w-5 rounded-lg" />
            <Skeleton className="aspect-card w-14 shrink-0 rounded-lg" />
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
      <div className="hidden grid-cols-3 gap-3 md:grid lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border bg-card p-2.5">
            <Skeleton className="aspect-card w-full rounded-lg" />
            <Skeleton variant="text" className={i % 2 === 0 ? "w-3/4" : "w-1/2"} />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </Page>
  );
}

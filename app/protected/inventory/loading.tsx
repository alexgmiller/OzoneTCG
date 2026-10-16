import { Skeleton } from "@/components/ui";

// ── Inventory skeleton ── mirrors the header, filter row and a tile grid

export default function InventoryLoading() {
  return (
    <div className="w-full space-y-4 py-4">
      {/* Search + icon buttons */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-11 flex-1 rounded-full" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="circle" className="h-11 w-11" />)}
      </div>

      {/* Hero + count */}
      <div className="flex items-end justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton variant="text" className="w-24" />
      </div>

      {/* In stock | Sold + chips */}
      <Skeleton className="h-10 rounded-full" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-20 rounded-full" />)}
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[63/88] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

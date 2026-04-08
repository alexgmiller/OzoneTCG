export default function InventoryLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Add item bar */}
      <div className="border rounded-xl h-12 bg-muted/30" />

      {/* Search bar */}
      <div className="border rounded-xl h-12 bg-muted/30" />

      {/* Grid */}
      <div className="border rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b h-10 bg-muted/20" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="border rounded-xl p-3 space-y-2">
              <div className="w-full aspect-[5/7] bg-muted rounded-lg" />
              <div className="h-3 w-3/4 bg-muted rounded" />
              <div className="h-3 w-1/2 bg-muted rounded" />
              <div className="h-8 bg-muted rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

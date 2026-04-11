export default function InventoryLoading() {
  return (
    <div className="p-4 space-y-4">
      {/* Page header */}
      <div className="space-y-1.5">
        <div className="skeleton h-6 w-24 rounded-lg" />
        <div className="skeleton h-3.5 w-40 rounded" />
      </div>

      {/* Summary bar */}
      <div className="border rounded-xl px-3 py-2 flex items-center gap-3 overflow-hidden">
        {[80, 64, 72, 56].map((w, i) => (
          <div key={i} className="flex flex-col gap-1 flex-shrink-0">
            <div className="skeleton h-2.5 rounded" style={{ width: w }} />
            <div className="skeleton h-5 rounded" style={{ width: w - 16 }} />
          </div>
        ))}
      </div>

      {/* Inventory panel */}
      <div className="border rounded-xl overflow-hidden">
        {/* Toolbar */}
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <div className="skeleton h-4 w-20 rounded" />
          <div className="skeleton h-7 w-16 rounded-lg" />
        </div>

        {/* Search bar */}
        <div className="px-3 py-2 border-b">
          <div className="skeleton h-8 w-full rounded-lg" />
        </div>

        {/* Section header — Slabs */}
        <div className="px-3 py-2 border-b flex items-center gap-2">
          <div className="skeleton h-3 w-3 rounded-sm" />
          <div className="skeleton h-3 w-10 rounded" />
          <div className="skeleton h-4 w-6 rounded-full" />
        </div>

        {/* Slab rows */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`slab-${i}`} className="flex items-center gap-2 px-3 py-2.5 border-b">
            <div className="skeleton w-4 h-4 rounded flex-shrink-0" />
            <div className="skeleton w-[60px] h-[84px] rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="skeleton h-3.5 rounded" style={{ width: `${55 + (i % 3) * 15}%` }} />
              <div className="skeleton h-3 w-2/5 rounded" />
              <div className="skeleton h-5 w-16 rounded-full" />
            </div>
            {/* Mobile price */}
            <div className="md:hidden skeleton h-5 w-16 rounded flex-shrink-0" />
            {/* Desktop columns */}
            <div className="hidden md:block skeleton h-5 w-20 rounded flex-shrink-0" />
            <div className="hidden md:block skeleton h-5 w-16 rounded flex-shrink-0" />
            <div className="hidden md:block skeleton h-5 w-12 rounded flex-shrink-0" />
          </div>
        ))}

        {/* Section header — Raw Cards */}
        <div className="px-3 py-2 border-b flex items-center gap-2">
          <div className="skeleton h-3 w-3 rounded-sm" />
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-4 w-6 rounded-full" />
        </div>

        {/* Raw card rows */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`raw-${i}`} className="flex items-center gap-2 px-3 py-2.5 border-b last:border-b-0">
            <div className="skeleton w-4 h-4 rounded flex-shrink-0" />
            <div className="skeleton w-[60px] h-[84px] rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="skeleton h-3.5 rounded" style={{ width: `${50 + (i % 4) * 12}%` }} />
              <div className="skeleton h-3 w-1/3 rounded" />
              <div className="skeleton h-5 w-12 rounded-full" />
            </div>
            <div className="md:hidden skeleton h-5 w-14 rounded flex-shrink-0" />
            <div className="hidden md:block skeleton h-5 w-20 rounded flex-shrink-0" />
            <div className="hidden md:block skeleton h-5 w-16 rounded flex-shrink-0" />
            <div className="hidden md:block skeleton h-5 w-12 rounded flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

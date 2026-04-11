export default function TransactionsLoading() {
  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="skeleton h-6 w-32 rounded-lg" />
          <div className="skeleton h-3.5 w-40 rounded" />
        </div>
        <div className="skeleton h-9 w-28 rounded-xl" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 border rounded-xl">
        {[56, 44, 48, 52, 44].map((w, i) => (
          <div key={i} className="skeleton h-8 rounded-lg flex-1" />
        ))}
      </div>

      {/* Buys section */}
      <div className="border rounded-xl overflow-hidden">
        <div className="px-3 py-2.5 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="skeleton h-4 w-4 rounded-sm" />
            <div className="skeleton h-4 w-24 rounded" />
          </div>
          <div className="skeleton h-5 w-16 rounded" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`buy-${i}`} className="flex items-center gap-3 px-3 py-3 border-b last:border-b-0">
            <div className="skeleton w-10 h-10 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 rounded" style={{ width: `${50 + (i % 3) * 18}%` }} />
              <div className="skeleton h-3 w-28 rounded" />
            </div>
            <div className="text-right space-y-1.5 flex-shrink-0">
              <div className="skeleton h-4 w-16 rounded" />
              <div className="skeleton h-3 w-12 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Sales section */}
      <div className="border rounded-xl overflow-hidden">
        <div className="px-3 py-2.5 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="skeleton h-4 w-4 rounded-sm" />
            <div className="skeleton h-4 w-20 rounded" />
          </div>
          <div className="skeleton h-5 w-16 rounded" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`sale-${i}`} className="flex items-center gap-3 px-3 py-3 border-b last:border-b-0">
            <div className="skeleton w-10 h-10 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 rounded" style={{ width: `${45 + (i % 4) * 13}%` }} />
              <div className="skeleton h-3 w-24 rounded" />
            </div>
            <div className="text-right space-y-1.5 flex-shrink-0">
              <div className="skeleton h-4 w-14 rounded" />
              <div className="skeleton h-3 w-10 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

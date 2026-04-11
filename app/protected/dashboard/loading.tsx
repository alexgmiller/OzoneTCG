export default function DashboardLoading() {
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="skeleton h-6 w-28 rounded-lg" />
        <div className="skeleton h-3.5 w-44 rounded" />
      </div>

      {/* Metric cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-xl p-4 space-y-2">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton h-7 w-3/4 rounded-lg" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>

      {/* Secondary metric row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border rounded-xl p-4 space-y-2">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-6 w-2/3 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-7 w-24 rounded-lg" />
        </div>
        <div className="p-4">
          <div className="skeleton h-48 w-full rounded-xl" />
        </div>
      </div>

      {/* Recent activity */}
      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="skeleton h-4 w-36 rounded" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="skeleton w-8 h-8 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 rounded" style={{ width: `${45 + (i % 3) * 20}%` }} />
                <div className="skeleton h-3 w-24 rounded" />
              </div>
              <div className="skeleton h-4 w-16 rounded flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

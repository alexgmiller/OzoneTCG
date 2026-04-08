export default function DealsLoading() {
  return (
    <div className="max-w-2xl mx-auto p-4 pb-20 md:pb-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1.5">
          <div className="h-5 w-24 bg-muted rounded-lg" />
          <div className="h-3 w-20 bg-muted rounded-lg" />
        </div>
        <div className="h-10 w-24 bg-muted rounded-xl" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-muted/40 rounded-xl p-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 h-9 bg-muted rounded-lg" />
        ))}
      </div>

      {/* Deal cards */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border rounded-2xl overflow-hidden">
            <div className="w-full h-44 bg-muted" />
            <div className="px-3 py-2.5 flex items-center gap-2">
              <div className="flex-1 space-y-1.5">
                <div className="flex gap-2">
                  <div className="h-4 w-12 bg-muted rounded-full" />
                  <div className="h-4 w-24 bg-muted rounded-lg" />
                </div>
                <div className="h-3 w-3/4 bg-muted rounded-lg" />
              </div>
              <div className="h-10 w-20 bg-muted rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

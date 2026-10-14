import { Skeleton } from "@/components/ui";

// ── Home skeleton ── mirrors DashboardServer's layout so nothing shifts on resolve

function StatGrid({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4">
      {/* Active show chip */}
      <Skeleton className="h-12" />

      {/* Today */}
      <div className="space-y-3">
        <Skeleton variant="text" className="w-14" />
        <StatGrid count={4} />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>

      {/* Recent activity */}
      <div className="space-y-3">
        <Skeleton variant="text" className="w-32" />
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="w-24" />
                <Skeleton variant="text" className="w-40" />
              </div>
              <Skeleton variant="text" className="w-16" />
            </div>
          ))}
          <Skeleton className="h-11 rounded-t-none" />
        </div>
      </div>

      {/* Lifetime */}
      <div className="space-y-3">
        <Skeleton variant="text" className="w-20" />
        <StatGrid count={4} />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui";

// Mirrors ShowsServer: title, New show button, section labels, show cards
// (lg+: list on the left two thirds, cards two per row; New show on the right)
export default function ShowsLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-4 lg:max-w-6xl">
      <Skeleton className="h-7 w-24" />
      <div className="space-y-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
        <Skeleton className="h-11 w-full rounded-full lg:col-start-3 lg:row-start-1" />

        <div className="space-y-4 lg:col-span-2 lg:row-start-1">
          {[2, 3].map((n, s) => (
            <div key={s} className="space-y-2">
              <Skeleton variant="text" className="w-20" />
              <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
                {Array.from({ length: n }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-2xl bg-surface p-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton variant="text" className={i % 2 === 0 ? "w-2/3" : "w-1/2"} />
                      <Skeleton variant="text" className="w-28" />
                    </div>
                    <Skeleton className="h-5 w-16 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

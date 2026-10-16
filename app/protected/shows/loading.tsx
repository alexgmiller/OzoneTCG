import { Skeleton } from "@/components/ui";

// Mirrors ShowsServer: title, New show button, section labels, show cards
export default function ShowsLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-4">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-11 w-full rounded-full" />

      {[2, 3].map((n, s) => (
        <div key={s} className="space-y-2">
          <Skeleton variant="text" className="w-20" />
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
      ))}
    </div>
  );
}

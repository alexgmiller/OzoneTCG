import { Skeleton } from "@/components/ui";

// Mirrors the show detail page: back link, header, 2x2 stats, deal rows
export default function ShowDetailLoading() {
  return (
    <div className="w-full max-w-2xl mx-auto py-4 space-y-5">
      <Skeleton className="h-4 w-16 rounded-lg" />

      <div className="space-y-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-7 w-2/3 rounded-lg" />
        <Skeleton className="h-4 w-40 rounded-lg" />
      </div>

      <Skeleton className="h-11 w-full rounded-lg" />

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-4">
            <Skeleton className="h-3 w-16 rounded-lg" />
            <Skeleton className="h-6 w-24 rounded-lg" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-12 rounded-lg" />
        <div className="divide-y divide-border rounded-xl border border-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="h-6 w-12 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className={`h-3.5 rounded-lg ${i % 2 === 0 ? "w-2/3" : "w-1/2"}`} />
              </div>
              <Skeleton className="h-4 w-14 shrink-0 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

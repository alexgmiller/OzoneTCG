import { Skeleton } from "@/components/ui";

/** Mirrors PayoutServer: title, then PayoutClient's period panel + history. */
export default function PayoutLoading() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-7 w-24 rounded-lg" />

      <div className="space-y-6">
        {/* Current period panel */}
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b space-y-1.5">
            <Skeleton variant="text" className="w-32" />
            <Skeleton className="h-3 w-48 rounded" />
          </div>
          {/* Collapsed sections: expenses, purchases, sales */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b px-4 py-2.5 last:border-b-0"
            >
              <Skeleton className="h-3 rounded" style={{ width: `${34 + (i % 3) * 12}%` }} />
              <Skeleton className="h-4 w-16 rounded" />
            </div>
          ))}
        </div>

        {/* Settle bar */}
        <div className="border rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-6 w-28 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>

        {/* Past periods */}
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b">
            <Skeleton variant="text" className="w-28" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b px-4 py-3 last:border-b-0"
            >
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-36 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
              <Skeleton className="h-4 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

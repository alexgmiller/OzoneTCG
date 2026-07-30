import { Skeleton } from "@/components/ui";

/** Mirrors SoldServer: title, then a stack of sale cards with line items. */
export default function SoldLoading() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-7 w-36 rounded-lg" />

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-xl overflow-hidden">
            {/* Sale header — date + buyer */}
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <Skeleton className="h-3.5 w-28 rounded" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>

            {/* Line items */}
            {Array.from({ length: (i % 2) + 1 }).map((_, j) => (
              <div
                key={j}
                className="flex items-center justify-between gap-3 px-4 py-3 border-t first:border-t-0"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 rounded" style={{ width: `${48 + (j % 3) * 14}%` }} />
                  <Skeleton className="h-3 w-2/5 rounded" />
                </div>
                <div className="shrink-0 space-y-1.5 text-right">
                  <Skeleton className="h-3.5 w-16 rounded" />
                  <Skeleton className="h-3 w-12 rounded" />
                </div>
              </div>
            ))}

            {/* Sale total */}
            <div className="flex items-center justify-between border-t px-4 py-2">
              <Skeleton className="h-3.5 w-20 rounded" />
              <Skeleton className="h-3.5 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

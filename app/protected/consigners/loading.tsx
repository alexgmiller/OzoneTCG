import { Skeleton } from "@/components/ui";

/** Mirrors ConsignersServer: title, then a card per consigner. */
export default function ConsignersLoading() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="space-y-1.5">
                <Skeleton variant="text" className="w-28" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
            {/* Consigned totals row */}
            <div className="grid grid-cols-3 gap-3 px-4 py-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <Skeleton className="h-2.5 w-14 rounded" />
                  <Skeleton className="h-5 w-16 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

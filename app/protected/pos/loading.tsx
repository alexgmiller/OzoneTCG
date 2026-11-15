import { Skeleton } from "@/components/ui";
import { POS_GRID } from "./DealColumns";

// ── POS skeleton ── tab strip, show chip, entry card, form cards
// (desktop: the same 3/5 · 2/5 columns as PosClient and DealColumns)

export default function PosLoading() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 py-4 lg:max-w-6xl">
      <div className={`space-y-4 lg:space-y-0 ${POS_GRID}`}>
        <div className="flex border-b border-border lg:col-span-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="text" className="mx-auto my-3 w-12" />)}
        </div>
        <Skeleton className="h-11 rounded-full lg:col-span-2" />
      </div>

      <div className={`space-y-3 lg:space-y-0 ${POS_GRID}`}>
        <div className="space-y-3 rounded-2xl bg-surface p-3 lg:col-span-3">
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-20 rounded-full" />)}
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-11 flex-1 rounded-xl" />
            <Skeleton className="h-11 w-24 rounded-xl" />
            <Skeleton className="h-11 w-16 rounded-full" />
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <div className="space-y-3 rounded-2xl bg-surface p-3">
            <Skeleton className="h-16 rounded-xl" />
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-20 shrink-0 rounded-full" />)}
            </div>
          </div>
          <div className="space-y-3 rounded-2xl bg-surface p-3">
            <Skeleton className="h-11 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-20 w-20 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

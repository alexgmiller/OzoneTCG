import { Skeleton } from "@/components/ui";

/** Mirrors BuyServer: title, mode tabs, card entry panel, running lot total. */
export default function BuyLoading() {
  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-4 overflow-x-hidden">
      <Skeleton className="h-7 w-32 rounded-lg" />

      {/* Buy / Trade mode toggle */}
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 flex-1 rounded-lg" />
      </div>

      {/* Card entry panel */}
      <div className="border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <Skeleton variant="text" className="w-24" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <div className="p-4 space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Cards added to the lot */}
      <div className="border rounded-xl overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
          >
            <Skeleton className="h-[52px] w-9 rounded-lg shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 rounded" style={{ width: `${45 + (i % 3) * 15}%` }} />
              <Skeleton className="h-3 w-1/3 rounded" />
            </div>
            <Skeleton className="h-5 w-14 rounded shrink-0" />
          </div>
        ))}
      </div>

      {/* Sticky lot total */}
      <div className="border rounded-xl p-4 flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-6 w-24 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
    </div>
  );
}

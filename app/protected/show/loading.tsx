import { Skeleton } from "@/components/ui";

/**
 * Show Mode skeleton — session header, the three running totals, and the
 * mode tab row.
 *
 * ShowClient renders this for its own `phase === "loading"` too, so the
 * route-level fallback and the client's internal loading state are the same
 * shape and the screen doesn't jump between them.
 */
export default function ShowLoading() {
  return (
    <div className="space-y-3 p-4 -mx-4 sm:-mx-8">
      {/* Session header */}
      <div className="flex items-center gap-3 border-b px-4 pb-1.5 pt-2">
        <Skeleton className="h-5 w-5 rounded-lg" />
        <Skeleton className="h-4 w-40 rounded" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-7 w-20 rounded-lg" />
          <Skeleton className="h-7 w-14 rounded-lg" />
        </div>
      </div>

      {/* Running totals — bought / sold / net */}
      <div className="grid grid-cols-3 gap-2 px-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>

      {/* Mode tabs — scan / buy / sell / deal / trade */}
      <div className="flex gap-1.5 px-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 flex-1 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

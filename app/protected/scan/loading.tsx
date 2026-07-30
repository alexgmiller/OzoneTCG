import { Skeleton } from "@/components/ui";

/** Mirrors CertScanner's idle phase: header, company pills, viewfinder, input. */
export default function ScanLoading() {
  return (
    <div className="w-full max-w-lg mx-auto space-y-3 pb-24 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-6 w-28 rounded-lg" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>

      {/* Grading company pills */}
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-14 rounded-full" />
        ))}
      </div>

      {/* Camera viewfinder */}
      <Skeleton className="aspect-[4/3] w-full rounded-2xl" />

      {/* Manual cert entry */}
      <div className="flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-lg" />
        <Skeleton className="h-11 w-20 rounded-lg" />
      </div>
    </div>
  );
}

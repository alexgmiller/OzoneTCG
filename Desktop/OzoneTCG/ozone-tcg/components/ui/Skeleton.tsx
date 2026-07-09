import { cn } from "@/lib/cn";

/**
 * Skeleton — shimmer placeholder sized to the shape it's replacing.
 *
 * USE while data is loading. Size the Skeleton to match the final content
 * so there's no layout shift on resolve.
 * DON'T use a spinner in its place for list/grid loading — always skeleton.
 * DON'T animate a generic "loading..." — shape-matched skeletons only.
 */
export function Skeleton({
  className,
  variant = "rect",
}: {
  className?: string;
  variant?: "rect" | "circle" | "text";
}) {
  const shape =
    variant === "circle"
      ? "rounded-full"
      : variant === "text"
        ? "rounded-lg h-3.5"
        : "rounded-xl";
  return (
    <div
      className={cn(
        "animate-pulse bg-white/[0.06]",
        shape,
        className,
      )}
      aria-hidden
    />
  );
}

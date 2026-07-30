import { cn } from "@/lib/cn";

/**
 * Skeleton — shimmer placeholder sized to the shape it's replacing.
 *
 * USE while data is loading. Size the Skeleton to match the final content
 * so there's no layout shift on resolve.
 * DON'T use a spinner in its place for list/grid loading — always skeleton.
 * DON'T animate a generic "loading..." — shape-matched skeletons only.
 *
 * Rendering is delegated to the `.skeleton` class in globals.css, which owns
 * the shimmer keyframes and resolves its colours from the surface tokens, so
 * it reads correctly in both light and dark themes. A plain white overlay
 * would be invisible against a light background.
 */
export function Skeleton({
  className,
  variant = "rect",
  style,
}: {
  className?: string;
  variant?: "rect" | "circle" | "text";
  /** For computed widths that vary per row — prefer a class where you can. */
  style?: React.CSSProperties;
}) {
  const shape =
    variant === "circle"
      ? "rounded-full"
      : variant === "text"
        ? "rounded-lg h-3.5"
        : "rounded-xl";
  return <div className={cn("skeleton", shape, className)} style={style} aria-hidden />;
}

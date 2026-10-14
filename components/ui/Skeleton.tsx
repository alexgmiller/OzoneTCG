import { cn } from "@/lib/utils";

// ── Skeleton ──
// Shimmer placeholder sized to the shape it replaces. The `.skeleton` class in
// globals.css owns the keyframes and reads its colours from the surface tokens,
// so it renders correctly in both themes.
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

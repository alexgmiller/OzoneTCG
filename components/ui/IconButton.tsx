"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// ── IconButton ──
// 44px round --surface button. `label` is required: it is the accessible
// name, and renders below the icon when `showLabel` is set (Home quick actions).
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  showLabel?: boolean;
  active?: boolean;
  tone?: "surface" | "accent";
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, showLabel = false, active = false, tone = "surface", className, children, ...rest }, ref,
) {
  const btn = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-40",
        tone === "accent"
          ? "bg-accent text-bg"
          : active
            ? "bg-accent-tint text-accent"
            : "bg-surface text-foreground hover:bg-surface-2",
        !showLabel && className,
      )}
      {...rest}
    >
      {children}
    </button>
  );

  if (!showLabel) return btn;
  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      {btn}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
});

import * as React from "react";

import { cn } from "@/lib/utils";

// ── Chip ──
// Tappable pill for filters, presets and multi-select toggles. Selection is
// always the violet accent (never emerald). For one-of-N tabs use <Segmented />.
// A toggle reports aria-pressed; inside a role="radiogroup", pass role="radio"
// and the chip reports aria-checked instead.
export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  size?: "default" | "sm";
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, selected = false, size = "default", type, role, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? "button"}
      role={role}
      {...(role === "radio" ? { "aria-checked": selected } : { "aria-pressed": selected })}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border text-sm",
        "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "px-3" : "px-4",
        selected
          ? "border-accent-primary bg-accent-primary-soft font-medium text-accent-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Chip.displayName = "Chip";

export { Chip };

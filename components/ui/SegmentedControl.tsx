"use client";

import { cn } from "@/lib/utils";

// ── SegmentedControl ──
// Pill track with the selected segment raised (Value | Profit, Raw | Graded).
type Props<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
};

export function SegmentedControl<T extends string>({
  value, onChange, options, className, size = "md", ...rest
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest["aria-label"]}
      className={cn("inline-flex w-full rounded-full bg-surface-2 p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-full font-medium transition-colors duration-150",
              size === "sm" ? "h-8 text-xs" : "h-10 text-sm",
              active ? "bg-surface text-foreground" : "text-muted-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

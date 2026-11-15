"use client";

import { cn } from "@/lib/utils";

// ── Segmented ──
// One-of-N switcher (POS mode, list/grid, period). Bordered strip with dividers,
// selected segment filled violet. For independent toggles use <Chip />.
// kind="tabs" (default) swaps a view (tablist/tab); kind="radio" picks a value,
// e.g. a setting (radiogroup/radio).
export type SegmentedOption<T extends string> = T | { value: T; label: React.ReactNode };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "default",
  kind = "tabs",
  className,
  "aria-label": ariaLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "default" | "lg";
  kind?: "tabs" | "radio";
  className?: string;
  "aria-label": string;
}) {
  const radio = kind === "radio";
  return (
    <div
      role={radio ? "radiogroup" : "tablist"}
      aria-label={ariaLabel}
      className={cn("flex divide-x divide-border overflow-hidden rounded-xl border border-border bg-muted", className)}
    >
      {options.map((opt) => {
        const v = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            role={radio ? "radio" : "tab"}
            {...(radio ? { "aria-checked": on } : { "aria-selected": on })}
            onClick={() => onChange(v)}
            className={cn(
              "flex-1 px-3 text-sm font-semibold transition-colors duration-150",
              size === "lg" ? "h-12" : "h-11",
              on ? "bg-accent-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

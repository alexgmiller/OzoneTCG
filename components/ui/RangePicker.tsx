"use client";

import { cn } from "@/lib/utils";

// ── RangePicker ──
// Plain-text range buttons; the active one is bright, the rest muted.
export const DEFAULT_RANGES = ["1W", "1M", "3M", "6M", "1Y", "All"] as const;

type Props<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  ranges?: readonly T[];
  className?: string;
};

export function RangePicker<T extends string>({ value, onChange, ranges, className }: Props<T>) {
  const list = (ranges ?? DEFAULT_RANGES) as readonly T[];
  return (
    <div role="radiogroup" aria-label="Range" className={cn("flex items-center justify-between", className)}>
      {list.map((r) => {
        const active = r === value;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(r)}
            className={cn(
              "h-9 min-w-10 rounded-full px-2 text-sm font-medium tabular-nums transition-colors duration-150",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

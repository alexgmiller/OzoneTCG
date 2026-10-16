"use client";

import { cn } from "@/lib/utils";

// ── TabStrip ──
// Text tabs with a 2px accent underline on the active one (Buy | Sell | Trade).
type Props<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  tabs: readonly { value: T; label: string }[];
  className?: string;
  "aria-label"?: string;
};

export function TabStrip<T extends string>({ value, onChange, tabs, className, ...rest }: Props<T>) {
  return (
    <div role="tablist" aria-label={rest["aria-label"]} className={cn("flex border-b border-border", className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative h-11 flex-1 text-sm font-medium transition-colors duration-150",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {t.label}
            {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

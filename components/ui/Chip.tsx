"use client";

import { cn } from "@/lib/utils";

// ── Chip ──
// Filter pill. Selected = accent tint background + accent text.
type Props = {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

export function Chip({ selected = false, onClick, children, className, icon, disabled }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-150 disabled:opacity-40",
        selected
          ? "bg-accent-tint text-accent"
          : "bg-surface-2 text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ── ChipRow ──
// Horizontally scrolling rail for Chips; hides its scrollbar.
export function ChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4", className)}>
      {children}
    </div>
  );
}

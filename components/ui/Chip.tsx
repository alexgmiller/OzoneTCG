"use client";

import { cn } from "@/lib/utils";

// ── Chip ──
// Filter pill. Selected = accent tint background + accent text. Drawn 36px
// tall; .tap-target makes it take taps across 44px.
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
        "tap-target relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition duration-150 ease-out motion-safe:enabled:active:scale-press disabled:opacity-40",
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
// Horizontally scrolling rail for Chips; hides its scrollbar. The 4px of
// padding (cancelled by the negative margin) keeps the chips' 44px tap zones
// from being clipped by the scroll container.
export function ChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("no-scrollbar -mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1", className)}>
      {children}
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";

// ── Chip ──
// Filter pill. Selected = accent tint background + accent text. Drawn 36px
// tall; .tap-target makes it take taps across 44px.
//
// Extra button props and the ref go through to the <button>, so a Chip can be
// a menu trigger (<DropdownMenuTrigger asChild>): the trigger opens the menu
// through the handlers, aria attributes and ref it hands its child. As a
// trigger it reports the menu's state (aria-expanded), not aria-pressed.
type Props = Omit<React.ComponentPropsWithRef<"button">, "children"> & {
  selected?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
};

export function Chip({ selected = false, children, className, icon, type = "button", ...rest }: Props) {
  const isMenuTrigger = rest["aria-haspopup"] != null;
  return (
    <button
      type={type}
      aria-pressed={isMenuTrigger ? undefined : selected}
      {...rest}
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

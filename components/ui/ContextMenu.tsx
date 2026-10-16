"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PressPoint } from "./useLongPress";

// ── ContextMenu ──
// Dims the page and lifts a surface-2 card near the press point. Full-width
// rows of icon + label separated by hairlines; a `destructive` row renders
// in the down colour after a thicker gap. Escape or backdrop closes.
export type ContextMenuItem = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type Props = {
  open: boolean;
  at: PressPoint | null;
  items: ContextMenuItem[];
  onClose: () => void;
  title?: string;
};

const MENU_W = 240;
const GUTTER = 12;

export function ContextMenu({ open, at, items, onClose, title }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Clamp to the viewport once the card has a measured height
  useLayoutEffect(() => {
    if (!open || !at || !ref.current) return;
    const h = ref.current.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.min(Math.max(GUTTER, at.x - MENU_W / 2), vw - MENU_W - GUTTER);
    const top = at.y + h + GUTTER > vh ? Math.max(GUTTER, at.y - h - GUTTER) : at.y + GUTTER;
    setPos({ left, top });
  }, [open, at, items.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !at) return null;

  const regular = items.filter((i) => !i.destructive);
  const destructive = items.filter((i) => i.destructive);

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="menu"
        aria-label={title ?? "Item actions"}
        style={{ left: pos?.left ?? at.x, top: pos?.top ?? at.y, width: MENU_W, visibility: pos ? "visible" : "hidden" }}
        className="absolute overflow-hidden rounded-2xl bg-surface-2"
      >
        {title && <div className="truncate px-4 pt-3 text-xs text-muted-foreground">{title}</div>}
        <Rows items={regular} onClose={onClose} />
        {destructive.length > 0 && (
          <div className="mt-2 border-t-4 border-bg">
            <Rows items={destructive} onClose={onClose} />
          </div>
        )}
      </div>
    </div>
  );
}

function Rows({ items, onClose }: { items: ContextMenuItem[]; onClose: () => void }) {
  return (
    <>
      {items.map((i) => {
        const Icon = i.icon;
        return (
          <button
            key={i.label}
            type="button"
            role="menuitem"
            disabled={i.disabled}
            onClick={() => { onClose(); i.onSelect(); }}
            className={cn(
              "flex h-12 w-full items-center gap-3 border-b border-border px-4 text-left text-sm font-medium transition-colors duration-150 last:border-b-0 hover:bg-surface disabled:opacity-40",
              i.destructive ? "text-down" : "text-foreground",
            )}
          >
            <Icon size={18} strokeWidth={1.75} className={i.destructive ? "text-down" : "text-muted-foreground"} />
            {i.label}
          </button>
        );
      })}
    </>
  );
}

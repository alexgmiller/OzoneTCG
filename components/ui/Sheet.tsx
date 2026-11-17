"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "./ConfirmDialog";
import { SCRIM_MOTION, usePresence } from "./usePresence";

// ── Sheet ──
// Bottom sheet: drag handle, rounded-3xl top corners, --surface background.
// Drag down past the threshold or tap X to close; with unsaved changes
// (`dirty`), closing asks first. `footer` is pinned above the safe area for
// the Save button. On md+ it renders as a centred card instead.
// It slides up on open and down on close (a dragged sheet continues from where
// it was let go); on md+ the card fades and scales instead.
type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dirty?: boolean;
  className?: string;
};

const CLOSE_DRAG_PX = 120;

export function Sheet({ open, onClose, title, children, footer, dirty = false, className }: Props) {
  const confirm = useConfirm();
  const [dy, setDy] = useState(0);
  const startY = useRef<number | null>(null);

  const { present, closing, view } = usePresence(open, { title, children, footer });

  // Resolves false when the user keeps their unsaved changes
  async function requestClose(): Promise<boolean> {
    if (closing) return true;
    if (dirty) {
      const ok = await confirm({ title: "Discard changes?", description: "You have unsaved edits.", confirmLabel: "Discard", destructive: true });
      if (!ok) return false;
    }
    onClose();
    return true;
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") void requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  // A drag offset is kept while closing so the exit continues from it
  useEffect(() => { if (open) setDy(0); }, [open]);

  if (!present) return null;

  const drag = {
    onPointerDown: (e: React.PointerEvent) => { startY.current = e.clientY; (e.target as Element).setPointerCapture?.(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => { if (startY.current != null) setDy(Math.max(0, e.clientY - startY.current)); },
    onPointerUp: () => {
      const d = dy;
      startY.current = null;
      if (d > CLOSE_DRAG_PX) void requestClose().then((closed) => { if (!closed) setDy(0); });
      else setDy(0);
    },
    onPointerCancel: () => { startY.current = null; setDy(0); },
  };

  return (
    <div className={cn("fixed inset-0 z-50 md:flex md:items-center md:justify-center md:p-4", closing && "pointer-events-none")} role="presentation">
      <div className={cn("absolute inset-0 bg-scrim backdrop-blur-sm", closing ? SCRIM_MOTION.exit : SCRIM_MOTION.enter)}
        onClick={() => void requestClose()} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={view.title}
        style={dy ? { transform: `translateY(${dy}px)` } : undefined}
        className={cn(
          "sheet-panel absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl bg-surface text-foreground",
          dy === 0 && "transition-transform duration-200 ease-out",
          "md:relative md:inset-auto md:w-full md:max-w-md md:rounded-3xl",
          closing
            ? "animate-out slide-out-to-bottom duration-150 ease-in fill-mode-forwards md:slide-out-to-bottom-0 md:fade-out-0 md:zoom-out-95"
            : "animate-in slide-in-from-bottom duration-200 ease-out md:slide-in-from-bottom-0 md:fade-in-0 md:zoom-in-95",
          "motion-reduce:animate-none",
          className,
        )}
      >
        {/* Drag handle + header */}
        <div className="shrink-0 touch-none select-none" {...drag}>
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-surface-2 md:hidden" aria-hidden />
          <div className="flex h-12 items-center gap-2 px-2">
            <button type="button" onClick={() => void requestClose()} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground active:bg-surface-2">
              <X size={20} />
            </button>
            <h2 className="text-lg font-semibold tracking-tight">{view.title}</h2>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{view.children}</div>

        {view.footer && <div className="pb-safe shrink-0 border-t border-border px-4 pt-3">{view.footer}</div>}
      </div>
    </div>
  );
}

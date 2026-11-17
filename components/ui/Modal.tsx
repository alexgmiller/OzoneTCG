"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { POP_MOTION, SCRIM_MOTION, usePresence } from "./usePresence";

// ── Modal ──
// Fixed overlay: backdrop + panel. One modal at a time; use <Toast /> for
// passive notifications. The backdrop fades and the panel fades and scales in
// and out (usePresence), all ≤ 200ms.
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { present, closing, view } = usePresence(open, { title, children });
  if (!present) return null;

  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center p-4", closing && "pointer-events-none")}>
      <div
        className={cn("absolute inset-0 bg-scrim backdrop-blur-sm", closing ? SCRIM_MOTION.exit : SCRIM_MOTION.enter)}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={view.title}
        className={cn(
          "relative max-h-full w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-5 text-foreground",
          closing ? POP_MOTION.exit : POP_MOTION.enter,
          className,
        )}
      >
        {view.title ? (
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-foreground">
            {view.title}
          </h2>
        ) : null}
        {view.children}
      </div>
    </div>
  );
}

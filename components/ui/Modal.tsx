"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

// ── Modal ──
// Fixed overlay: backdrop + panel. One modal at a time; use <Toast /> for
// passive notifications. Backdrop and panel both transition ≤ 200ms.
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-150"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative w-full max-w-md rounded-xl border border-border bg-card p-5 text-foreground",
          "transition-all duration-150",
          className,
        )}
      >
        {title ? (
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h2>
        ) : null}
        {children}
      </div>
    </div>
  );
}

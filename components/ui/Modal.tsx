"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

/**
 * Modal — standard fixed-positioned overlay with backdrop + panel.
 *
 * USE for confirmations, detail sheets, focused tasks that need interruption.
 * DON'T stack modals. If you find yourself opening a modal from a modal,
 *   re-think the flow — use a multi-step in-panel stepper instead.
 * DON'T use for passive notifications — use <Toast /> instead.
 *
 * The backdrop fades; the panel slides up slightly. Both ≤ 200ms per §5.
 */
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
        className={cn(
          "absolute inset-0 bg-slate-950/70 backdrop-blur-sm",
          "transition-opacity duration-150",
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-5",
          "transition-all duration-150",
          className,
        )}
      >
        {title ? (
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-white">
            {title}
          </h2>
        ) : null}
        {children}
      </div>
    </div>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Toast — non-blocking notification, bottom-center stacked.
 *
 * USE for transient results: "Saved", "Undone", "Connection lost".
 * DON'T use for blocking confirmations — use <Modal /> for those.
 * DON'T auto-dismiss errors — require manual dismissal so the user sees them.
 *
 * Wire the provider once at the app root, then call `useToast()` anywhere:
 *   const toast = useToast();
 *   toast.success("Batch saved");
 *   toast.error("Offline — we'll retry");
 */

export type ToastTone = "success" | "error" | "warning" | "info";

type Toast = {
  id: string;
  tone: ToastTone;
  message: string;
  autoDismissMs: number | null;
};

const Ctx = createContext<{
  push: (t: Omit<Toast, "id">) => void;
} | null>(null);

const DEFAULT_DISMISS: Record<ToastTone, number | null> = {
  success: 4000,
  warning: 6000,
  info: 4000,
  error: null, // manual dismiss per §7
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...t, id }].slice(-3));
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    if (toast.autoDismissMs == null) return;
    const id = window.setTimeout(onDismiss, toast.autoDismissMs);
    return () => window.clearTimeout(id);
  }, [toast.autoDismissMs, onDismiss]);

  const toneClass = {
    success: "bg-positive-soft border-positive-border text-positive",
    error: "bg-negative-soft border-negative-border text-negative",
    warning: "bg-warning-soft border-warning-border text-warning",
    info: "bg-accent-primary-soft border-accent-primary-border text-accent-secondary",
  }[toast.tone];

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3",
        "text-sm font-medium",
        "transition-opacity duration-150",
        toneClass,
      )}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="font-mono text-xs uppercase tracking-wider text-neutral hover:text-white transition-colors duration-150"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return {
    success: (message: string) =>
      ctx.push({ tone: "success", message, autoDismissMs: DEFAULT_DISMISS.success }),
    error: (message: string) =>
      ctx.push({ tone: "error", message, autoDismissMs: DEFAULT_DISMISS.error }),
    warning: (message: string) =>
      ctx.push({ tone: "warning", message, autoDismissMs: DEFAULT_DISMISS.warning }),
    info: (message: string) =>
      ctx.push({ tone: "info", message, autoDismissMs: DEFAULT_DISMISS.info }),
  };
}

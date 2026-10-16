"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Toast ──
// Bottom-center stacked notifications, max 3. Errors never auto-dismiss.
//   const toast = useToast();
//   toast.success("Batch saved");

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
  error: null,
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
      {/* .above-tabbar clears the floating mobile tab bar (+ safe area); the bar is md:hidden */}
      <div className="above-tabbar pointer-events-none fixed inset-x-0 z-50 flex flex-col items-start gap-2 pl-4 pr-20 md:bottom-5 md:items-center md:px-4">
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

  // Opaque card surface so the toast reads over any page content in both themes.
  const toneClass = {
    success: "border-positive-border text-positive-strong dark:text-positive",
    error: "border-negative-border text-negative-strong dark:text-negative",
    warning: "border-warning-border text-warning-strong dark:text-warning",
    info: "border-accent-primary-border text-accent-primary",
  }[toast.tone];

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-xl border bg-card py-2 pl-4 pr-2",
        "text-sm font-medium",
        "transition-opacity duration-150",
        toneClass,
      )}
    >
      <span className="flex-1 py-1">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        aria-label="Dismiss"
      >
        <X size={16} />
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

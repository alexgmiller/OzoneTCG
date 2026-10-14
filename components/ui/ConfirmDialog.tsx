"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { cn } from "@/lib/utils";

// ── Confirmation UI ──
// <ConfirmPanel /> is the presentational body rendered inside <Modal />.
// useConfirm() is the promise-based wrapper that replaces native confirm().
// components/ConfirmationModal.tsx wraps the same panel for declarative call sites.

export type ConfirmPanelProps = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Negative-toned confirm button + warning icon.
  destructive?: boolean;
  // When set, confirm stays disabled until the user types this exact string.
  requireTyping?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmPanel({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  requireTyping,
  onConfirm,
  onCancel,
}: ConfirmPanelProps) {
  const [typedValue, setTypedValue] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const canConfirm = requireTyping ? typedValue === requireTyping : true;

  // Focus the type-to-confirm input, else Cancel, so a stray Enter never confirms.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (requireTyping) inputRef.current?.focus();
      else cancelRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(id);
  }, [requireTyping]);

  async function handleConfirm() {
    if (!canConfirm || loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {destructive && (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-negative-border bg-negative-soft">
            <AlertTriangle size={16} className="text-negative-strong dark:text-negative" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-snug text-foreground">{title}</h2>
          {description && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>

      {requireTyping && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            Type{" "}
            <span className="font-mono font-semibold text-foreground">{requireTyping}</span>{" "}
            to confirm
          </label>
          <input
            ref={inputRef}
            type="text"
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
            }}
            className={cn(
              "h-11 w-full rounded-lg border border-border bg-background px-3",
              "font-mono text-sm text-foreground placeholder:text-muted-foreground",
              "focus:border-negative-border focus:outline-none",
            )}
            placeholder={requireTyping}
            autoComplete="off"
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={loading}
          className={cn(
            "h-11 rounded-lg border border-border px-4 text-sm font-medium",
            "text-muted-foreground transition-colors duration-150",
            "hover:bg-muted hover:text-foreground disabled:opacity-40",
          )}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm || loading}
          className={cn(
            "h-11 rounded-lg border px-4 text-sm font-semibold transition-colors duration-150",
            "disabled:opacity-30",
            destructive
              ? "border-negative-border bg-negative-soft text-negative-strong hover:bg-negative/20 dark:text-negative"
              : "border-transparent bg-accent-primary text-primary-foreground hover:bg-accent-primary-hover",
          )}
        >
          {loading ? "…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

// ── Promise-based API ──

export type ConfirmOptions = Omit<ConfirmPanelProps, "onConfirm" | "onCancel">;

const Ctx = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  // Backdrop and Escape dismissal must resolve too, or the caller awaits forever.
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setPending(opts);
      }),
    [],
  );

  const settle = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setPending(null);
  }, []);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal open={pending !== null} onClose={() => settle(false)}>
        {pending && (
          <ConfirmPanel
            {...pending}
            onConfirm={() => settle(true)}
            onCancel={() => settle(false)}
          />
        )}
      </Modal>
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

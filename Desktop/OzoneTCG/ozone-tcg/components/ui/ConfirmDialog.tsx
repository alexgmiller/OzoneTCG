"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { cn } from "@/lib/cn";

/**
 * Confirmation UI — one implementation, two APIs.
 *
 *  <ConfirmPanel />  presentational body, rendered inside <Modal />.
 *  useConfirm()      promise-based imperative wrapper, for replacing the
 *                    native `confirm()` at call sites that already read
 *                    `if (!ok) return;`.
 *
 * `components/ConfirmationModal.tsx` is the declarative wrapper over the same
 * panel, kept for the call sites that hold their own open/close state.
 *
 * USE for destructive or irreversible actions.
 * DON'T use to report a result — that's <Toast />.
 */

export type ConfirmPanelProps = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Negative-toned confirm button + warning icon. */
  destructive?: boolean;
  /**
   * When set, the confirm button stays disabled until the user types this
   * exact string. Use for high-stakes irreversible actions.
   */
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

  // Focus the type-to-confirm input, else the cancel button so a stray Enter
  // never fires a destructive action.
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
            <AlertTriangle size={16} className="text-negative" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-snug text-white">{title}</h2>
          {description && (
            <p className="mt-1 text-sm leading-relaxed text-neutral">{description}</p>
          )}
        </div>
      </div>

      {requireTyping && (
        <div className="space-y-2">
          <label className="text-xs text-neutral">
            Type{" "}
            <span className="font-mono font-semibold text-white">{requireTyping}</span>{" "}
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
              "w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2",
              "font-mono text-sm text-white",
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
            "rounded-lg border border-white/10 px-4 py-2 text-sm font-medium",
            "text-neutral transition-colors duration-150",
            "hover:text-white disabled:opacity-40",
          )}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm || loading}
          className={cn(
            "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors duration-150",
            "disabled:opacity-30",
            destructive
              ? "border-negative-border bg-negative-soft text-negative hover:bg-negative/20"
              : "border-accent-primary-border bg-accent-primary-soft text-accent-secondary hover:bg-accent-primary/20",
          )}
        >
          {loading ? "…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

// ── Promise-based API ────────────────────────────────────────────────────────

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

"use client";

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon */
  destructive?: boolean;
  /**
   * When set, the confirm button stays disabled until the user types this
   * exact string. Use for high-stakes irreversible actions.
   */
  requireTyping?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmationModal({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  requireTyping,
  onConfirm,
  onCancel,
}: Props) {
  const [typedValue, setTypedValue] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const canConfirm = requireTyping ? typedValue === requireTyping : true;

  // Focus the type-to-confirm input or the cancel button on mount
  useEffect(() => {
    setTimeout(() => {
      if (requireTyping) {
        inputRef.current?.focus();
      } else {
        cancelRef.current?.focus();
      }
    }, 50);
  }, [requireTyping]);

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onCancel();
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={handleBackdrop}
    >
      <div className="relative w-full max-w-sm bg-background border rounded-2xl shadow-2xl p-5 space-y-4">
        {/* Close button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-3 right-3 p-1.5 rounded-lg opacity-40 hover:opacity-80 transition-opacity"
        >
          <X size={14} />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 pr-6">
          {destructive && (
            <div className="shrink-0 w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center mt-0.5">
              <AlertTriangle size={16} className="text-red-500" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-semibold text-base leading-snug">{title}</h2>
            {description && (
              <p className="text-sm opacity-60 mt-1 leading-relaxed">{description}</p>
            )}
          </div>
        </div>

        {/* Type-to-confirm input */}
        {requireTyping && (
          <div className="space-y-1.5">
            <label className="text-xs opacity-60">
              Type <span className="font-mono font-semibold opacity-90">{requireTyping}</span> to confirm
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
              className="w-full bg-background border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder={requireTyping}
              autoComplete="off"
            />
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 justify-end pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm border hover:bg-muted/50 disabled:opacity-40 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className={`px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-30 transition-colors ${
              destructive
                ? "bg-red-600 hover:bg-red-500"
                : "bg-violet-600 hover:bg-violet-500"
            }`}
          >
            {loading ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Camera, FileText, TriangleAlert } from "lucide-react";
import { MoneyDisplay } from "@/components/ui";
import { GHOST_BTN, RECEIPT_REQUIRED_THRESHOLD } from "./shared";

// ── $75+ documentation warning (in-panel step, replaces the form body) ────────

export function DocWarningPanel({
  onAddPhoto,
  onAddNote,
  onSaveAnyway,
}: {
  onAddPhoto: () => void;
  onAddNote: () => void;
  onSaveAnyway: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-warning-border bg-warning-soft">
          <TriangleAlert size={16} className="text-warning" />
        </div>
        <div className="min-w-0 space-y-2 text-sm text-muted-foreground">
          <p className="leading-relaxed">
            The IRS requires documentation for expenses of{" "}
            <MoneyDisplay amount={RECEIPT_REQUIRED_THRESHOLD} tone="neutral" /> or more. Any of these count:
          </p>
          <ul className="space-y-1 text-xs leading-relaxed">
            <li>• Photo of receipt or item</li>
            <li>• Screenshot of Venmo, Zelle, or bank transfer</li>
            <li>• Written note describing the payment (who, what, when)</li>
          </ul>
          <p className="text-xs italic leading-relaxed">
            You can save without documentation, but this deduction may be rejected if audited.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent"
          onClick={onAddPhoto}
        >
          <Camera size={16} /> Add photo
        </button>
        <button type="button" className={GHOST_BTN} onClick={onAddNote}>
          <FileText size={16} /> Add note
        </button>
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
          onClick={onSaveAnyway}
        >
          Save anyway (no documentation)
        </button>
      </div>
    </div>
  );
}

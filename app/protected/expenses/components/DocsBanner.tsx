"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui";
import { RECEIPT_IRS_THRESHOLD } from "./expenseMeta";

const DOC_EXAMPLES = [
  "Photo of a paper receipt",
  "Screenshot of a Venmo, Zelle, or bank transfer",
  "Email or order confirmation",
  "Written note: who you paid, when, why",
];

// ── One-time educational banner ───────────────────────────────────────────────

export function DocsBanner({ onDismiss }: { onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-accent-primary-border bg-accent-primary-soft px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm">📸</span>
        <span className="min-w-0 flex-1 text-sm text-muted-foreground">
          Photos, screenshots, or notes all count as documentation.
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="h-11 shrink-0 px-2 text-sm text-accent-primary transition-colors duration-150 hover:text-accent-primary-hover"
        >
          {expanded ? "Less ↑" : "More ↓"}
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 border-t border-accent-primary-border pt-2 text-sm text-muted-foreground">
          {DOC_EXAMPLES.map((line) => <p key={line}>• {line}</p>)}
          <p className="pt-1 text-xs">
            Expenses ≥ ${RECEIPT_IRS_THRESHOLD} need documentation. Mileage log counts for mileage.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Re-openable explanation modal ─────────────────────────────────────────────

export function DocsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="IRS Documentation">
      <div className="space-y-3 text-sm text-muted-foreground">
        <p className="leading-relaxed">
          The IRS accepts any proof of payment for business expenses. You don&apos;t need a paper receipt.
        </p>
        <ul className="space-y-1 leading-relaxed">
          {DOC_EXAMPLES.map((line) => <li key={line}>• {line}</li>)}
        </ul>
        <p className="text-xs leading-relaxed">
          Expenses ${RECEIPT_IRS_THRESHOLD} or more require documentation. Mileage is documented by your log — no receipt needed.
        </p>
        <button
          onClick={onClose}
          className="h-11 w-full rounded-lg border border-border text-sm text-foreground transition-colors duration-150 hover:bg-muted"
        >
          Got it
        </button>
      </div>
    </Modal>
  );
}

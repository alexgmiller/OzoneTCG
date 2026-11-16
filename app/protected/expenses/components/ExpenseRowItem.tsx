"use client";

import { useState } from "react";
import { Camera, ChevronDown, ChevronUp, FileText, Paperclip, TriangleAlert } from "lucide-react";
import { MoneyDisplay } from "@/components/ui";
import { estimateTaxSavings } from "@/lib/taxEstimate";
import type { ExpenseRow } from "../ExpensesServer";
import { CAT_TOKEN, RECEIPT_IRS_THRESHOLD, fmtDate } from "./expenseMeta";

const ICON_BTN = "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150";
const ACTION_BTN = "inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors duration-150";

function Spinner() {
  return <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

// ── Single expense row ────────────────────────────────────────────────────────

export function ExpenseRowItem({
  expense: e,
  uploading,
  onEdit,
  onDelete,
  onReceiptPick,
  onLightbox,
}: {
  expense: ExpenseRow;
  uploading: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReceiptPick: () => void;
  onLightbox: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tok = CAT_TOKEN[e.category];
  const deductibleAmt = e.cost * e.deductible_percentage / 100;
  const hasPhoto = !!e.receipt_url;
  const hasNoteDoc = !!e.documentation_notes;
  const hasAnyDoc = hasPhoto || hasNoteDoc;
  const missingReceipt = e.category !== "mileage" && !hasAnyDoc && e.cost >= RECEIPT_IRS_THRESHOLD;

  // Warning border overrides the category border when docs are missing.
  const leftBorder = missingReceipt ? "border-l-warning" : tok.border;

  return (
    <div className={`overflow-hidden rounded-xl border border-border border-l-4 bg-card ${leftBorder}`}>
      {/* ── Main row ── */}
      <div className="flex items-start gap-3 px-3 py-3">
        {/* Documentation status */}
        {hasPhoto ? (
          <button
            className={`${ICON_BTN} overflow-hidden border-border`}
            onClick={() => onLightbox(e.receipt_url!)}
            aria-label="View receipt"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.receipt_url!} alt="" className="h-full w-full object-cover" />
          </button>
        ) : hasNoteDoc ? (
          <button
            className={`${ICON_BTN} border-positive-border bg-positive-soft text-positive`}
            onClick={onEdit}
            title="Written record attached"
          >
            <FileText size={16} />
          </button>
        ) : missingReceipt ? (
          <button
            className={`${ICON_BTN} border-dashed border-warning-border text-warning hover:bg-warning-soft`}
            onClick={onReceiptPick}
            title="Documentation needed — tap to add"
          >
            {uploading ? <Spinner /> : <TriangleAlert size={16} />}
          </button>
        ) : (
          <button
            className={`${ICON_BTN} border-dashed border-border text-muted-foreground hover:bg-muted`}
            onClick={onReceiptPick}
            title="Attach documentation"
          >
            {uploading ? <Spinner /> : <Paperclip size={16} />}
          </button>
        )}

        {/* Content column: tap anywhere to expand */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <div className="mb-0.5 flex items-center gap-2">
            <span className={`shrink-0 rounded-lg border px-1.5 font-mono text-xs font-bold uppercase tracking-wide ${tok.pill}`}>
              {tok.label}
            </span>
            <span className="truncate text-sm font-medium">{e.vendor_name || e.description}</span>
            {e.vendor_name && e.description && (
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">— {e.description}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{fmtDate(e.expense_date)}</span>
            <span>·</span>
            <span className="capitalize">{e.paid_by}</span>
            {e.category === "mileage" && e.mileage_miles && (
              <>
                <span>·</span>
                <span className="font-mono tabular-nums">{e.mileage_miles} mi</span>
              </>
            )}
          </div>
        </button>

        {/* Amount column */}
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold">
            <MoneyDisplay amount={e.cost} tone="negative" />
          </div>
          {e.deductible_percentage === 100 && e.cost > 0 && (
            <div className="font-mono text-xs text-positive">100% ded.</div>
          )}
          {e.deductible_percentage > 0 && e.deductible_percentage < 100 && (
            <div className="font-mono text-xs tabular-nums text-positive">
              <MoneyDisplay amount={deductibleAmt} tone="positive" /> ded.
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* ── Expanded detail strip ── */}
      {expanded && (
        <div className="flex flex-wrap items-center gap-3 px-3 pb-3 pl-14 text-xs text-muted-foreground">
          {e.payment_method && <span>{e.payment_method}</span>}
          {deductibleAmt > 0 && (
            <span>~<MoneyDisplay amount={estimateTaxSavings(deductibleAmt)} tone="neutral" /> saved on this</span>
          )}
          {missingReceipt && (
            <span className="flex items-center gap-1 text-warning">
              <TriangleAlert size={12} /> Docs needed ≥ ${RECEIPT_IRS_THRESHOLD}
            </span>
          )}
          {hasNoteDoc && !hasPhoto && (
            <span className="flex items-center gap-1 text-positive">
              <FileText size={12} /> Written record
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {!hasAnyDoc && (
              <button onClick={onReceiptPick} className={`${ACTION_BTN} border-border text-foreground hover:bg-muted`}>
                <Camera size={14} /> Add docs
              </button>
            )}
            <button onClick={onEdit} className={`${ACTION_BTN} border-border text-foreground hover:bg-muted`}>
              Edit
            </button>
            <button onClick={onDelete} className={`${ACTION_BTN} border-negative-border text-negative hover:bg-negative-soft`}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

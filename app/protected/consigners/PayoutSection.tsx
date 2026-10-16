"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Modal, MoneyDisplay, useToast } from "@/components/ui";
import { recordPayout } from "./actions";
import {
  type Consigner, type PayoutRecord, errorMessage, fmtDate, todayISO,
  INPUT, FIELD_LABEL, BTN_PRIMARY, BTN_GHOST,
} from "./shared";

// ── Payment methods ──

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "venmo", label: "Venmo" },
  { value: "paypal", label: "PayPal" },
  { value: "check", label: "Check" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

function methodLabel(value: string | null) {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value ?? "—";
}

// ── Record payout modal ──

export function RecordPayoutModal({
  consigner,
  onClose,
}: {
  consigner: Consigner;
  onClose: () => void;
}) {
  const toast = useToast();
  const [amountStr, setAmountStr] = useState(
    consigner.pending_payout > 0 ? consigner.pending_payout.toFixed(2) : "",
  );
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = parseFloat(amountStr) || 0;
  const differsFromPending =
    consigner.pending_payout > 0 && amount > 0 && Math.abs(amount - consigner.pending_payout) > 0.01;

  async function handleSubmit() {
    if (amount <= 0) {
      toast.warning("Enter a payout amount");
      return;
    }
    setBusy(true);
    try {
      await recordPayout({
        consignerId: consigner.id,
        amount,
        paymentMethod: method,
        date: new Date(date).toISOString(),
        notes: notes.trim() || null,
      });
      toast.success(`Payout recorded for ${consigner.name}`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Record payout">
      <p className="-mt-2 mb-4 text-xs text-muted-foreground">{consigner.name}</p>

      <div className="space-y-4">
        {consigner.pending_payout > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-positive-border bg-positive-soft px-4 py-3 text-sm">
            <span className="text-muted-foreground">Owed right now</span>
            <MoneyDisplay amount={consigner.pending_payout} tone="positive" className="font-semibold" />
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="payout-amount" className={FIELD_LABEL}>Amount</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              id="payout-amount"
              type="number" min="0" step="0.01" inputMode="decimal"
              className={`${INPUT} pl-7 tabular-nums`}
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              autoFocus
            />
          </div>
          {differsFromPending && (
            <button
              type="button"
              className="h-11 text-xs text-accent underline-offset-2 hover:underline"
              onClick={() => setAmountStr(consigner.pending_payout.toFixed(2))}
            >
              Use owed amount (<MoneyDisplay amount={consigner.pending_payout} tone="positive" />)
            </button>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="payout-method" className={FIELD_LABEL}>Paid via</label>
          <select
            id="payout-method"
            className={INPUT}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="payout-date" className={FIELD_LABEL}>Date</label>
          <input
            id="payout-date"
            type="date"
            className={`${INPUT} tabular-nums`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="payout-notes" className={FIELD_LABEL}>Notes <span className="font-normal">(optional)</span></label>
          <input
            id="payout-notes"
            className={INPUT}
            placeholder="Memo, reference…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`${BTN_GHOST} flex-1`} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || amount <= 0}
            className={`${BTN_PRIMARY} flex-1`}
          >
            {busy ? "Saving…" : "Record payout"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Payout history (collapsible, one row per payment) ──

export function PayoutHistory({
  payouts,
  totalPaidOut,
}: {
  payouts: PayoutRecord[];
  totalPaidOut: number;
}) {
  const [open, setOpen] = useState(false);
  if (payouts.length === 0) return null;

  return (
    <div className="border-t border-border">
      <button
        type="button"
        className="flex h-11 w-full items-center justify-between px-4 text-sm transition-colors duration-150 hover:bg-muted"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
          {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
          Payouts <span className="tabular-nums text-muted-foreground">({payouts.length})</span>
        </span>
        <span className="text-xs text-muted-foreground">
          <MoneyDisplay amount={totalPaidOut} tone="neutral" /> paid
        </span>
      </button>

      {open && (
        <ul className="border-t border-border">
          {payouts.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="min-w-0">
                <div className="tabular-nums text-foreground">{fmtDate(p.date)}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {methodLabel(p.payment_method)}
                  {p.notes && ` · ${p.notes}`}
                </div>
              </div>
              <MoneyDisplay amount={p.amount} tone="positive" className="shrink-0 font-semibold" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

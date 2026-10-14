"use client";

import type { CertLookupResult } from "@/app/api/cert-lookup/route";
import { Modal } from "@/components/ui";
import { METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from "@/app/protected/pos/ledger";
import { MoneyOrDash, btnPrimary, gradeString, inputClass, offerValue, type Owner } from "./shared";

// ── BuyModal ──
// Confirms a single-card or bulk buy: payment method + owner, then records it.

const OWNERS: { value: Owner; label: string }[] = [
  { value: "shared", label: "Shared" },
  { value: "alex", label: "Alex" },
  { value: "mila", label: "Mila" },
];

export function BuyModal({
  open,
  onClose,
  bulk,
  batchCount,
  batchTotalMarket,
  batchTotalOffer,
  result,
  selectedPct,
  payment,
  onPaymentChange,
  owner,
  onOwnerChange,
  loading,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  bulk: boolean;
  batchCount: number;
  batchTotalMarket: number;
  batchTotalOffer: number;
  result: CertLookupResult | null;
  selectedPct: number;
  payment: PaymentMethod;
  onPaymentChange: (m: PaymentMethod) => void;
  owner: Owner;
  onOwnerChange: (o: Owner) => void;
  loading: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={bulk ? `Bulk buy (${batchCount} slabs)` : "Record buy"}>
      <div className="space-y-4">
        {bulk ? (
          <div className="space-y-1 rounded-xl bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cards</span>
              <span className="font-medium tabular-nums">{batchCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total market</span>
              <span className="font-medium"><MoneyOrDash amount={batchTotalMarket} /></span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total cost</span>
              <MoneyOrDash amount={batchTotalOffer} tone="negative" />
            </div>
          </div>
        ) : result ? (
          <div className="rounded-xl bg-muted p-3 text-sm">
            <div className="font-medium">{result.name}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{gradeString(result)}</div>
            <div className="mt-2 flex justify-between">
              <span className="text-muted-foreground">Market <MoneyOrDash amount={result.market} /></span>
              <span className="font-semibold tabular-nums">
                {selectedPct}% = <MoneyOrDash amount={offerValue(result.market, selectedPct)} tone="negative" />
              </span>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Payment</span>
            <select
              value={payment}
              onChange={(e) => onPaymentChange(e.target.value as PaymentMethod)}
              className={inputClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{METHOD_LABELS[m]}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Owner</span>
            <select
              value={owner}
              onChange={(e) => onOwnerChange(e.target.value as Owner)}
              className={inputClass}
            >
              {OWNERS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        <button type="button" onClick={onConfirm} disabled={loading} className={`${btnPrimary} w-full`}>
          {loading ? "Recording…" : "Confirm buy"}
        </button>
      </div>
    </Modal>
  );
}

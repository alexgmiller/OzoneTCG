"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import type { OfflineResult } from "@/lib/offlineAwareActions";
import { attachPhoto } from "./actions";
import { METHOD_LABELS, PAYMENT_METHODS, type Mode, type Payer, type PaymentMethod } from "./ledger";
import { INPUT, chip } from "./ui";
import PhotoCapture from "./PhotoCapture";

export type DealForm = {
  amount: number; // trade: > 0 we pay, < 0 they pay
  payment_method: PaymentMethod;
  counterparty: string;
  notes: string;
  paid_by: Payer;
};

const PAYERS = ["shared", "alex", "mila"] as const;

export default function TransactionForm({ mode, suggested, ready, submit, onDone }: {
  mode: Mode;
  suggested: number;
  ready: boolean;
  submit: (f: DealForm) => Promise<OfflineResult>;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [wePay, setWePay] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>(mode === "trade" ? "trade" : "cash");
  const [paidBy, setPaidBy] = useState<Payer>("shared");
  const [counterparty, setCounterparty] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [busy, setBusy] = useState(false);

  const value = amount === "" ? suggested : Number(amount) || 0;

  async function confirm() {
    setBusy(true);
    try {
      const res = await submit({
        amount: mode === "trade" ? (wePay ? value : -value) : value,
        payment_method: method, counterparty, notes, paid_by: paidBy,
      });
      if (res.queued) {
        toast.warning(photos.length ? "Saved offline — photos weren't kept, add them later" : "Saved offline — will sync when connected");
      } else {
        for (const p of photos) {
          const fd = new FormData();
          fd.append("photo", new File([p], "photo.jpg", { type: "image/jpeg" }));
          await attachPhoto(res.result.id, fd).catch(() => toast.error("A photo failed to upload"));
        }
        toast.success(`${mode[0].toUpperCase()}${mode.slice(1)} recorded`);
        router.refresh();
      }
      setAmount(""); setCounterparty(""); setNotes(""); setPhotos([]);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      {mode === "trade" && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cash direction">
          <button type="button" role="radio" aria-checked={wePay} className={chip(wePay)} onClick={() => setWePay(true)}>We pay cash</button>
          <button type="button" role="radio" aria-checked={!wePay} className={chip(!wePay)} onClick={() => setWePay(false)}>They pay cash</button>
        </div>
      )}

      {/* ── Amount ── suggested value is the placeholder; blank means "use it" */}
      <input type="number" inputMode="decimal" min="0" step="0.01" value={amount}
        onChange={(e) => setAmount(e.target.value)} placeholder={suggested.toFixed(2)}
        aria-label={mode === "trade" ? "Cash difference" : "Amount"}
        className={`${INPUT} h-14 w-full text-lg font-semibold tabular-nums`} />

      <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Payment method">
        {PAYMENT_METHODS.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={method === m} className={chip(method === m)} onClick={() => setMethod(m)}>
            {METHOD_LABELS[m]}
          </button>
        ))}
      </div>

      {mode !== "sell" && (
        <div className="flex items-center gap-2 text-sm" role="radiogroup" aria-label="Paid by">
          <span className="shrink-0 text-muted-foreground">Paid by</span>
          {PAYERS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={paidBy === p} className={`${chip(paidBy === p)} capitalize`} onClick={() => setPaidBy(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)}
        placeholder="Who (name or handle)" aria-label="Counterparty" className={`${INPUT} w-full`} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
        placeholder="Notes" aria-label="Notes"
        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground" />
      <PhotoCapture photos={photos} onChange={setPhotos} />

      <button type="button" disabled={!ready || busy} onClick={confirm}
        className="h-14 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent-primary-hover disabled:opacity-40">
        {busy ? "Saving…" : `Confirm ${mode}`}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, ChipRow, useToast } from "@/components/ui";
import type { OfflineResult } from "@/lib/offlineAwareActions";
import { attachPhoto } from "./actions";
import { METHOD_LABELS, PAYMENT_METHODS, type Mode, type Payer, type PaymentMethod } from "./ledger";
import { CARD, INPUT } from "./ui";
import PhotoCapture from "./PhotoCapture";

export type DealForm = {
  amount: number; // trade: > 0 we pay, < 0 they pay
  payment_method: PaymentMethod;
  counterparty: string;
  notes: string;
  paid_by: Payer;
};

const PAYERS = ["shared", "alex", "mila"] as const;

// ── Transaction form ──
// Big numeric amount, payment method chips, counterparty + notes, photo
// thumbnails, and a full-width accent confirm pinned above the tab bar.
export default function TransactionForm({ mode, suggested, ready, submit, onDone, onAmountChange }: {
  mode: Mode;
  suggested: number;
  ready: boolean;
  submit: (f: DealForm) => Promise<OfflineResult>;
  onDone: () => void;
  // Live typed amount (null = blank, i.e. the suggested value); Sell uses it to allocate across lines
  onAmountChange?: (v: number | null) => void;
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
    <div className="space-y-3">
      <div className={CARD}>
        {mode === "trade" && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cash direction">
            <Chip selected={wePay} onClick={() => setWePay(true)} className="justify-center">We pay cash</Chip>
            <Chip selected={!wePay} onClick={() => setWePay(false)} className="justify-center">They pay cash</Chip>
          </div>
        )}

        {/* ── Amount ── suggested value is the placeholder; blank means "use it" */}
        <div className="flex h-16 items-center rounded-xl bg-surface-2 px-4">
          <span className="text-xl font-bold text-muted-foreground">$</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={amount}
            onChange={(e) => { setAmount(e.target.value); onAmountChange?.(e.target.value === "" ? null : Number(e.target.value) || 0); }}
            placeholder={suggested.toFixed(2)}
            aria-label={mode === "trade" ? "Cash difference" : "Amount"}
            className="h-full w-full bg-transparent pl-1 text-2xl font-bold tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none" />
        </div>

        <ChipRow>
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} selected={method === m} onClick={() => setMethod(m)}>{METHOD_LABELS[m]}</Chip>
          ))}
        </ChipRow>

        {mode !== "sell" && (
          <div className="flex items-center gap-2 text-sm" role="radiogroup" aria-label="Paid by">
            <span className="shrink-0 text-muted-foreground">Paid by</span>
            {PAYERS.map((p) => (
              <Chip key={p} selected={paidBy === p} onClick={() => setPaidBy(p)} className="capitalize">{p}</Chip>
            ))}
          </div>
        )}
      </div>

      <div className={CARD}>
        <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)}
          placeholder="Who (name or handle)" aria-label="Counterparty" className={`${INPUT} w-full`} />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          placeholder="Notes" aria-label="Notes"
          className={`${INPUT} h-auto w-full resize-none py-3`} />
        <PhotoCapture photos={photos} onChange={setPhotos} />
      </div>

      {/* ── Confirm ── pinned above the floating tab bar on phones */}
      <div className="above-tabbar fixed inset-x-4 z-30 md:static md:inset-auto">
        <button type="button" disabled={!ready || busy} onClick={confirm}
          className="h-14 w-full rounded-full bg-accent text-base font-semibold text-bg shadow-tabbar transition-colors duration-150 disabled:opacity-40 md:shadow-none">
          {busy ? "Saving…" : `Confirm ${mode}`}
        </button>
      </div>
    </div>
  );
}

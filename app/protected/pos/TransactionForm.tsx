"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Chip, ChipRow, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { OfflineResult } from "@/lib/offlineAwareActions";
import { attachPhoto } from "./actions";
import { METHOD_LABELS, PAYMENT_METHODS, type Mode, type Payer, type PaymentMethod } from "./ledger";
import { CARD, INPUT } from "./ui";
import PhotoCapture from "./PhotoCapture";
import { usePaymentMethod } from "./usePaymentMethod";

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
// Confirming answers as soon as the deal is saved: the button shows a check,
// the phone buzzes, the form clears, and any photos upload in the background.
// The payment method starts on the one this device last confirmed with.
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
  const [method, setMethod, rememberMethod] = usePaymentMethod(mode);
  const [paidBy, setPaidBy] = useState<Payer>("shared");
  const [counterparty, setCounterparty] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [busy, setBusy] = useState(false);
  // A check on the button for a moment after a deal saves, until the next card is added
  const [done, setDone] = useState(false);
  const doneTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(doneTimer.current), []);
  useEffect(() => { if (ready) setDone(false); }, [ready]);

  function flashDone() {
    setDone(true);
    window.clearTimeout(doneTimer.current);
    doneTimer.current = window.setTimeout(() => setDone(false), 1500);
    try { navigator.vibrate?.(10); } catch { /* not supported */ }
  }

  // Runs after the deal is recorded; the toast reports a failure
  async function uploadPhotos(transactionId: string, shots: Blob[]) {
    let failed = 0;
    for (const p of shots) {
      const fd = new FormData();
      fd.append("photo", new File([p], "photo.jpg", { type: "image/jpeg" }));
      await attachPhoto(transactionId, fd).catch(() => { failed += 1; });
    }
    if (failed) toast.error(failed === 1 ? "A photo failed to upload" : `${failed} photos failed to upload`);
  }

  const value = amount === "" ? suggested : Number(amount) || 0;

  async function confirm() {
    setBusy(true);
    const shots = photos;
    try {
      const res = await submit({
        amount: mode === "trade" ? (wePay ? value : -value) : value,
        payment_method: method, counterparty, notes, paid_by: paidBy,
      });
      rememberMethod();
      setAmount(""); setCounterparty(""); setNotes(""); setPhotos([]);
      onDone();
      flashDone();
      if (res.queued) {
        toast.warning(shots.length ? "Saved offline — photos weren't kept, add them later" : "Saved offline — will sync when connected");
      } else {
        toast.success(`${mode[0].toUpperCase()}${mode.slice(1)} recorded${shots.length ? " · uploading photos" : ""}`);
        router.refresh();
        if (shots.length) void uploadPhotos(res.result.id, shots);
      }
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

        {/* Scrolls sideways on a phone; wraps on desktop where the row would clip */}
        <ChipRow className="lg:mx-0 lg:flex-wrap lg:px-0">
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

      {/* ── Confirm ── pinned above the floating tab bar on phones (h-14, a big
          thumb target); inline on md+ at h-11 to match the other controls */}
      <div className="above-tabbar fixed inset-x-4 z-30 md:static md:inset-auto">
        <button type="button" disabled={!ready || busy} onClick={confirm}
          className={cn(
            "inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-base font-semibold text-bg shadow-tabbar transition-colors duration-150 disabled:opacity-40 md:h-11 md:text-sm md:shadow-none",
            done && !ready && "disabled:opacity-100",
          )}>
          {busy ? "Saving…" : done && !ready
            ? <><Check size={20} aria-hidden /> {mode[0].toUpperCase()}{mode.slice(1)} recorded</>
            : `Confirm ${mode}`}
        </button>
      </div>
    </div>
  );
}

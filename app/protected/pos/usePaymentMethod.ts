"use client";

import { useCallback, useEffect, useState } from "react";
import { PAYMENT_METHODS, type Mode, type PaymentMethod } from "./ledger";

// ── usePaymentMethod ──
// The payment method a deal starts on: the one this device last confirmed a
// buy (or sell, or trade) with. Stored per browser in localStorage, every
// read and write wrapped in try/catch (private windows and cleared site data
// can throw or come back empty). With nothing stored: Trade for trades, Cash
// otherwise. Picking a chip doesn't save; confirming the deal does, so a
// mis-tap isn't remembered.
const key = (mode: Mode) => `ozone.pos.method.${mode}`;
const fallback = (mode: Mode): PaymentMethod => (mode === "trade" ? "trade" : "cash");

export function storedMethod(mode: Mode, raw: string | null): PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(raw ?? "") ? (raw as PaymentMethod) : fallback(mode);
}

export function usePaymentMethod(mode: Mode): [PaymentMethod, (m: PaymentMethod) => void, () => void] {
  const [method, setMethod] = useState<PaymentMethod>(fallback(mode));

  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(key(mode)); } catch { /* use the default */ }
    setMethod(storedMethod(mode, raw));
  }, [mode]);

  const remember = useCallback(() => {
    try { localStorage.setItem(key(mode), method); } catch { /* best effort */ }
  }, [mode, method]);

  return [method, setMethod, remember];
}

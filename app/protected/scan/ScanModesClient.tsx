"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/ui";
import { CardScanner } from "@/components/scan/CardScanner";
import CardDetailSheet from "@/app/protected/search/CardDetailSheet";
import type { CatalogCard } from "@/app/protected/search/catalog";

// ── Scan: Cert | Card ──
// Cert reads a slab's barcode (CertScanner). Card identifies any raw card or
// slab from a photo (components/scan/CardScanner) and opens its card sheet,
// the same one Search shows: prices, Add to inventory, Buy in POS. A match
// that isn't in our catalog opens Search on its name instead.
//
// The last mode is remembered on this device; with nothing stored it opens
// on Cert, as before.

type Mode = "cert" | "card";
const KEY = "ozone.scan.mode";
const MODES = [{ value: "cert", label: "Cert" }, { value: "card", label: "Card" }] as const;

function useScanMode(): [Mode, (m: Mode) => void] {
  const [mode, setMode] = useState<Mode>("cert");
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "cert" || v === "card") setMode(v);
    } catch { /* private window or cleared storage: stay on Cert */ }
  }, []);
  const set = useCallback((m: Mode) => {
    setMode(m);
    try { localStorage.setItem(KEY, m); } catch { /* best effort */ }
  }, []);
  return [mode, set];
}

export function ScanModesClient({ cert }: { cert: React.ReactNode }) {
  const router = useRouter();
  const [mode, setMode] = useScanMode();
  const [card, setCard] = useState<CatalogCard | null>(null);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 overflow-x-hidden">
      <SegmentedControl value={mode} onChange={setMode} options={MODES} aria-label="What to scan" className="mt-2" />
      {mode === "cert" ? cert : (
        <div className="space-y-4 pb-24">
          <h1 className="text-lg font-semibold">Card scan</h1>
          <CardScanner
            pickLabel="Open"
            onPick={(m) => {
              if (m.card) setCard(m.card);
              else router.push(`/protected/search?q=${encodeURIComponent(`${m.name} ${(m.number ?? "").split("/")[0]}`.trim())}`);
            }}
          />
        </div>
      )}
      <CardDetailSheet card={card} onClose={() => setCard(null)} />
    </div>
  );
}

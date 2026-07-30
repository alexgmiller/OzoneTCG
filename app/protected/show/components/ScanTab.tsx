"use client";

import React from "react";
import { ScanLine, X as XIcon } from "lucide-react";
import CertLookupWidget, { type CertWidgetResult } from "@/components/CertLookupWidget";
import { BUY_PCTS, money } from "../utils";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  scanResult: CertWidgetResult | null;
  setScanResult: React.Dispatch<React.SetStateAction<CertWidgetResult | null>>;
  scanOwner: "shared" | "alex" | "mila";
  setScanOwner: React.Dispatch<React.SetStateAction<"shared" | "alex" | "mila">>;
  scanMarket: string;
  setScanMarket: React.Dispatch<React.SetStateAction<string>>;
  scanCustomPct: string;
  setScanCustomPct: React.Dispatch<React.SetStateAction<string>>;
  scanShowCustom: boolean;
  setScanShowCustom: React.Dispatch<React.SetStateAction<boolean>>;
  scanFlatAmount: string;
  setScanFlatAmount: React.Dispatch<React.SetStateAction<string>>;
  scanShowFlat: boolean;
  setScanShowFlat: React.Dispatch<React.SetStateAction<boolean>>;
  busy: boolean;
  onScanResult: (r: CertWidgetResult) => void;
  handleScanBuy: (pct: number) => void;
  handleScanBuyFlat: () => void;
  handleScanPass: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScanTab({
  scanResult,
  setScanResult,
  scanOwner,
  setScanOwner,
  scanMarket,
  setScanMarket,
  scanCustomPct,
  setScanCustomPct,
  scanShowCustom,
  setScanShowCustom,
  scanFlatAmount,
  setScanFlatAmount,
  scanShowFlat,
  setScanShowFlat,
  busy,
  onScanResult,
  handleScanBuy,
  handleScanBuyFlat,
  handleScanPass,
}: Props) {
  return (
    <div className="space-y-3">
      {/* Camera or collapsed "Scan another" bar */}
      {scanResult ? (
        <button
          onClick={() => {
            setScanResult(null);
            setScanMarket("");
            setScanShowCustom(false);
            setScanCustomPct("");
            setScanShowFlat(false);
            setScanFlatAmount("");
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm opacity-60 hover:opacity-80 transition-opacity"
        >
          <ScanLine size={14} />
          Scan another cert
        </button>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <CertLookupWidget
            embedded
            defaultCameraOn
            onResult={onScanResult}
          />
        </div>
      )}

      {/* Buy / pass UI — appears after a card is scanned */}
      {scanResult && (
        <div className="border rounded-xl p-4 space-y-3">
          {/* Card info */}
          <div>
            <div className="text-sm font-semibold">{scanResult.name}</div>
            <div className="text-xs opacity-50 mt-0.5">
              {[scanResult.company, scanResult.gradeLabel, scanResult.grade].filter(Boolean).join(" ")}
              {scanResult.setName && ` · ${scanResult.setName}`}
            </div>
          </div>

          {/* Market + Owner row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs opacity-50 mb-1">Market price</div>
              <input
                type="number"
                inputMode="decimal"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                placeholder="$0.00"
                value={scanMarket}
                onChange={(e) => setScanMarket(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs opacity-50 mb-1">Owner</div>
              <div className="flex gap-1 flex-wrap">
                {(["shared", "alex", "mila"] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => setScanOwner(o)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors capitalize ${
                      scanOwner === o ? "text-white" : "opacity-40 hover:opacity-60"
                    }`}
                    style={scanOwner === o ? { background: "var(--accent-primary)", borderColor: "var(--accent-primary)" } : undefined}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Buy percentage buttons */}
          <div className="space-y-2">
            <div className="grid grid-cols-5 gap-1">
              {BUY_PCTS.map((pct) => {
                const market = parseFloat(scanMarket) || 0;
                const cost = market > 0 ? parseFloat((market * pct / 100).toFixed(2)) : null;
                return (
                  <button
                    key={pct}
                    onClick={() => handleScanBuy(pct)}
                    disabled={busy || !parseFloat(scanMarket)}
                    className="flex flex-col items-center py-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 transition-colors"
                  >
                    <span className="text-xs font-bold">{pct}%</span>
                    <span className="text-[10px] opacity-70">{cost != null ? money(cost) : "—"}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom % / Flat $ */}
            {scanShowCustom ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background"
                  placeholder="Custom %"
                  value={scanCustomPct}
                  onChange={(e) => setScanCustomPct(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => { const p = parseFloat(scanCustomPct); if (p > 0) handleScanBuy(p); }}
                  disabled={busy || !parseFloat(scanCustomPct)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-30"
                  style={{ background: "var(--accent-primary)" }}
                >
                  Buy
                </button>
                <button onClick={() => setScanShowCustom(false)} className="px-3 py-2 rounded-lg border text-sm opacity-50"><XIcon size={13} /></button>
              </div>
            ) : scanShowFlat ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                  placeholder="Flat $ amount"
                  value={scanFlatAmount}
                  onChange={(e) => setScanFlatAmount(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={handleScanBuyFlat}
                  disabled={busy || !parseFloat(scanFlatAmount)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-30"
                  style={{ background: "var(--accent-primary)" }}
                >
                  Buy
                </button>
                <button onClick={() => setScanShowFlat(false)} className="px-3 py-2 rounded-lg border text-sm opacity-50"><XIcon size={13} /></button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setScanShowCustom(true); setScanShowFlat(false); }}
                  className="flex-1 py-2 rounded-lg border text-xs opacity-50 hover:opacity-70 transition-opacity"
                >
                  Custom %
                </button>
                <button
                  onClick={() => { setScanShowFlat(true); setScanShowCustom(false); }}
                  className="flex-1 py-2 rounded-lg border text-xs opacity-50 hover:opacity-70 transition-opacity"
                >
                  Flat $
                </button>
              </div>
            )}

            {/* Pass */}
            <button
              onClick={handleScanPass}
              disabled={busy}
              className="w-full py-3 rounded-xl border text-sm font-medium opacity-50 hover:opacity-70 transition-opacity"
            >
              Pass
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { SectionHeader } from "@/components/ui";
import { MoneyOrDash, OFFER_PRESETS, inputClass, offerValue } from "./shared";

// ── OfferCalc ──
// Percent-of-market presets plus a custom percent input.

export function OfferCalc({
  market,
  selectedPct,
  onSelectPct,
}: {
  market: number | null;
  selectedPct: number;
  onSelectPct: (pct: number) => void;
}) {
  const [customVal, setCustomVal] = useState("");
  const customNum = parseFloat(customVal);

  function applyCustom() {
    if (customNum > 0 && customNum <= 200) onSelectPct(customNum);
  }

  return (
    <div>
      <SectionHeader className="mb-2">Offer calculator</SectionHeader>
      <div className="grid grid-cols-5 gap-2">
        {OFFER_PRESETS.map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => onSelectPct(pct)}
            className={`flex h-14 flex-col items-center justify-center rounded-lg border transition-colors duration-150 ${
              selectedPct === pct
                ? "border-accent bg-accent-tint"
                : "border-border bg-card hover:border-accent"
            }`}
          >
            <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
            <span className="text-xs font-semibold">
              <MoneyOrDash amount={offerValue(market, pct)} />
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Custom %</span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={200}
          value={customVal}
          onChange={(e) => setCustomVal(e.target.value)}
          onBlur={applyCustom}
          onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); }}
          placeholder="e.g. 72"
          className={`${inputClass} w-24 text-center tabular-nums`}
        />
        {customVal && !OFFER_PRESETS.includes(customNum) && (
          <span className="text-sm font-semibold">
            = <MoneyOrDash amount={offerValue(market, customNum || 0)} />
          </span>
        )}
      </div>
    </div>
  );
}

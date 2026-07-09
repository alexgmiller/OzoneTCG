"use client";

import { useState } from "react";
import { money, moneyRound, StepFooter, BackButton, PrimaryButton, type DealCard, type DealCustomerChoice } from "./DealFlowShared";

// ── OfferCard ─────────────────────────────────────────────────────────────────

type OfferCardProps = {
  kind: "cash" | "trade";
  selected: boolean;
  onClick: () => void;
  label: string;
  amount: number;
  pct: number;
  onPctChange: (p: number) => void;
  color: string;
  colorDim: string;
  colorBorder: string;
};

function OfferCard({ kind, selected, onClick, label, amount, pct, onPctChange, color, colorDim, colorBorder }: OfferCardProps) {
  const [editing, setEditing] = useState(false);

  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        padding: "16px 14px 14px",
        borderRadius: 16,
        background: selected
          ? `linear-gradient(180deg, ${colorDim} 0%, rgba(22,18,34,0.8) 100%)`
          : "rgba(255,255,255,0.02)",
        border: `${selected ? 2 : 1}px solid ${selected ? colorBorder : "rgba(255,255,255,0.06)"}`,
        boxShadow: selected ? `0 0 0 4px ${colorDim}, 0 0 24px ${colorDim}` : "none",
        cursor: "pointer",
        textAlign: "left",
        overflow: "hidden",
        transition: "all 200ms ease",
        width: "100%",
      }}
    >
      {selected && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(115deg, transparent 35%, ${color}22 50%, transparent 65%)`,
            pointerEvents: "none",
            animation: "dealSweep 600ms ease-out",
          }}
        />
      )}

      {/* Kind label row */}
      <div className="flex items-center gap-1.5 mb-2">
        <div
          style={{
            width: 22, height: 22, borderRadius: 7,
            background: selected ? colorDim : "rgba(255,255,255,0.04)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {kind === "cash" ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={selected ? color : "#94a3b8"} strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={selected ? color : "#94a3b8"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          )}
        </div>
        <div
          style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
            color: selected ? color : "#94a3b8",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {label}
        </div>
      </div>

      {/* Amount */}
      <div
        style={{
          fontSize: 28, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
          fontFeatureSettings: '"tnum"', color: selected ? "#f8fafc" : "#cbd5e1",
          letterSpacing: "-0.7px", lineHeight: 1,
        }}
      >
        {moneyRound(amount)}
      </div>

      {/* Pct — tap to edit */}
      <div className="flex items-center gap-1.5 mt-2.5" style={{ position: "relative", zIndex: 2 }}>
        <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>at</span>
        {editing ? (
          <input
            type="number" min="0" max="100" value={pct}
            onChange={(e) => onPctChange(Math.max(0, Math.min(100, +e.target.value || 0)))}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 46, borderRadius: 6, padding: "2px 6px",
              background: "rgba(255,255,255,0.06)",
              border: `1px solid ${colorBorder}`,
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: "#f8fafc", outline: "none",
            }}
          />
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: selected ? color : "#94a3b8", fontWeight: 700,
              padding: "2px 6px", borderRadius: 5,
              background: "rgba(255,255,255,0.04)",
              border: "1px dashed rgba(255,255,255,0.12)",
              cursor: "text",
            }}
          >
            {pct}%
          </span>
        )}
        <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>mkt</span>
      </div>

      {/* Pick indicator */}
      {selected && (
        <div
          style={{
            position: "absolute", top: 10, right: 10,
            width: 22, height: 22, borderRadius: 999,
            background: color,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 12px ${color}66`,
            animation: "dealPop 300ms cubic-bezier(.34,1.56,.64,1)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0810" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
      )}
    </button>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  cards: DealCard[];
  cashCards: DealCard[];
  tradeCards: DealCard[];
  undecidedCards: DealCard[];
  cashTotal: number;
  tradeTotal: number;
  totalMarket: number;
  cashPct: number;
  onCashPctChange: (p: number) => void;
  tradePct: number;
  onTradePctChange: (p: number) => void;
  customerChoice: DealCustomerChoice;
  onAllCash: () => void;
  onAllTrade: () => void;
  onSplit: () => void;
  onSetDisposition: (id: string, d: DealCard["disposition"]) => void;
  onSetBuyPrice: (id: string, val: string) => void;
  onBack: () => void;
  onNext: () => void;
  onComplete: () => void;
  busy: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function DealStepQuote({
  cards, cashCards, tradeCards, undecidedCards,
  cashTotal, tradeTotal, totalMarket,
  cashPct, onCashPctChange, tradePct, onTradePctChange,
  customerChoice, onAllCash, onAllTrade, onSplit,
  onSetDisposition, onSetBuyPrice,
  onBack, onNext, onComplete, busy,
}: Props) {
  const [splitCashPct, setSplitCashPct] = useState(50);

  const cashOffer = Math.round(totalMarket * cashPct / 100);
  const tradeOffer = Math.round(totalMarket * tradePct / 100);
  const splitCashAmt = Math.round(totalMarket * (splitCashPct / 100) * cashPct / 100);
  const splitTradeAmt = Math.round(totalMarket * ((100 - splitCashPct) / 100) * tradePct / 100);

  const isCash = customerChoice === "all-cash";
  const isTrade = customerChoice === "all-trade";
  const isSplit = customerChoice === "split";
  const undecided = customerChoice === "undecided";

  const ctaDisabled = undecided || busy;
  const ctaLabel = isCash ? (busy ? "Recording…" : "Pay cash & complete") : busy ? "Recording…" : "Pick trade cards";

  function handleCta() {
    if (isCash) onComplete();
    else onNext();
  }

  return (
    <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>

      {/* Market value anchor */}
      <div
        className="px-4 pt-4 pb-3.5 text-center"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div
          className="text-[9px] font-bold tracking-[0.2em] uppercase"
          style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
        >
          Total market value
        </div>
        <div
          className="tabular-nums mt-1 leading-none"
          style={{
            fontSize: 34, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            fontFeatureSettings: '"tnum"',
            color: "#f8fafc", letterSpacing: "-1.2px",
          }}
        >
          {money(totalMarket)}
        </div>
        <div className="text-xs mt-1.5" style={{ color: "#64748b" }}>
          from {cards.length} card{cards.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-2.5">

        {/* Offer tiles */}
        <div
          className="text-[10px] font-bold tracking-[0.2em] uppercase text-center mb-3"
          style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
        >
          Pick an offer
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <OfferCard
            kind="cash"
            selected={isCash}
            onClick={onAllCash}
            label="Cash"
            amount={cashOffer}
            pct={cashPct}
            onPctChange={onCashPctChange}
            color="#34d399"
            colorDim="rgba(52,211,153,0.12)"
            colorBorder="rgba(52,211,153,0.4)"
          />
          <OfferCard
            kind="trade"
            selected={isTrade}
            onClick={onAllTrade}
            label="Trade"
            amount={tradeOffer}
            pct={tradePct}
            onPctChange={onTradePctChange}
            color="#c4b5fd"
            colorDim="rgba(139,92,246,0.14)"
            colorBorder="rgba(139,92,246,0.45)"
          />
        </div>

        {/* Split button */}
        <button
          onClick={onSplit}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 14,
            background: isSplit
              ? "linear-gradient(180deg, rgba(234,179,8,0.12), rgba(234,179,8,0.04))"
              : "rgba(255,255,255,0.02)",
            border: isSplit
              ? "1.5px solid rgba(234,179,8,0.45)"
              : "1px solid rgba(255,255,255,0.06)",
            boxShadow: isSplit ? "0 0 0 4px rgba(234,179,8,0.10), 0 0 20px rgba(234,179,8,0.15)" : "none",
            cursor: "pointer",
            display: "flex", alignItems: "center", gap: 12,
            transition: "all 200ms ease",
          }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: isSplit ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.04)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isSplit ? "#fbbf24" : "#94a3b8"} strokeWidth="2" strokeLinecap="round">
              <path d="M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <div style={{ fontSize: 13, fontWeight: 700, color: isSplit ? "#fbbf24" : "#e2e8f0" }}>Split</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>Some cash + some trade credit</div>
          </div>
          {isSplit && (
            <div className="text-right">
              <div
                style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#f8fafc" }}
              >
                {moneyRound(splitCashAmt + splitTradeAmt)}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>
                {moneyRound(splitCashAmt)}c + {moneyRound(splitTradeAmt)}t
              </div>
            </div>
          )}
        </button>

        {/* Split controls */}
        {isSplit && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(234,179,8,0.04)",
              borderRadius: 12,
              border: "1px solid rgba(234,179,8,0.15)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div
                style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
              >
                {splitCashPct}% cash / {100 - splitCashPct}% trade
              </div>
              <button
                onClick={() => setSplitCashPct(50)}
                style={{ fontSize: 10, color: "#c4b5fd", background: "none", border: "none", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}
              >
                50/50
              </button>
            </div>
            <input
              type="range" min="0" max="100" value={splitCashPct}
              onChange={(e) => setSplitCashPct(+e.target.value)}
              style={{ width: "100%", accentColor: "#eab308" }}
            />

            {/* Per-card disposition */}
            <div className="mt-3 space-y-2">
              {cards.map((card) => {
                const cashOff = card.buyPrice ?? (card.marketPrice != null ? parseFloat((card.marketPrice * cashPct / 100).toFixed(2)) : null);
                const tradeOff = card.marketPrice != null ? parseFloat((card.marketPrice * tradePct / 100).toFixed(2)) : null;
                return (
                  <div key={card._id} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(36,30,53,0.5)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <div className="text-xs font-medium truncate mb-1.5" style={{ color: "#f8fafc" }}>{card.name}</div>
                    <div className="flex items-center gap-1.5">
                      {(["cash", "trade", "undecided"] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => onSetDisposition(card._id, d)}
                          className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-lg border transition-colors"
                          style={card.disposition === d
                            ? { background: d === "cash" ? "#10b981" : d === "trade" ? "#8b5cf6" : "#71717a", border: "none", color: "#fff" }
                            : { background: "transparent", borderColor: "rgba(255,255,255,0.12)", color: "#64748b" }
                          }
                        >
                          {d === "undecided" ? "?" : d}
                        </button>
                      ))}
                      <div className="flex-1" />
                      {card.disposition !== "undecided" && (
                        <div className="relative shrink-0">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: "#64748b" }}>$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            className="w-16 rounded pl-5 pr-1.5 py-0.5 text-[10px] font-mono text-right"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none" }}
                            value={card.disposition === "cash" ? (cashOff?.toFixed(2) ?? "") : (tradeOff?.toFixed(2) ?? "")}
                            onChange={(e) => onSetBuyPrice(card._id, e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Customer-readable summary */}
        <div
          style={{
            padding: "12px 14px",
            background: "linear-gradient(180deg, rgba(36,30,53,0.7), rgba(22,18,34,0.7))",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div
            className="text-[9px] font-bold tracking-[0.18em] uppercase mb-1.5"
            style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Show customer
          </div>
          <div className="text-sm leading-relaxed" style={{ color: "#e2e8f0" }}>
            {undecided && <span style={{ color: "#475569" }}>Select an offer above.</span>}
            {isCash && (
              <>
                I can give you{" "}
                <b style={{ color: "#34d399", fontFamily: "'JetBrains Mono', monospace" }}>{moneyRound(cashOffer)} cash</b>{" "}
                for all of this.
              </>
            )}
            {isTrade && (
              <>
                Or{" "}
                <b style={{ color: "#c4b5fd", fontFamily: "'JetBrains Mono', monospace" }}>{moneyRound(tradeOffer)} trade credit</b>{" "}
                toward anything in the case.
              </>
            )}
            {isSplit && (
              <>
                <b style={{ color: "#34d399", fontFamily: "'JetBrains Mono', monospace" }}>{moneyRound(cashTotal)} cash</b>
                {" + "}
                <b style={{ color: "#c4b5fd", fontFamily: "'JetBrains Mono', monospace" }}>{moneyRound(tradeTotal)} trade</b>
                {" credit — "}
                <b style={{ fontFamily: "'JetBrains Mono', monospace" }}>{moneyRound(cashTotal + tradeTotal)} total</b>.
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <StepFooter>
        <BackButton onClick={onBack} />
        <PrimaryButton onClick={handleCta} disabled={ctaDisabled}>
          {ctaLabel}
        </PrimaryButton>
      </StepFooter>

      <style>{`
        @keyframes dealSweep {
          from { opacity: 1; transform: translateX(-60%); }
          to   { opacity: 0; transform: translateX(60%); }
        }
        @keyframes dealPop {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

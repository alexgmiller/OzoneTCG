"use client";

import { useState } from "react";
import { money, StepFooter, type DealCard, type DealTradeSelection } from "./DealFlowShared";

function ReceiptRow({ label, value, color, big }: { label: string; value: string; color?: string; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between" style={{ padding: "5px 0" }}>
      <div className="text-xs" style={{ color: "#94a3b8" }}>{label}</div>
      <div
        className="font-bold tabular-nums"
        style={{
          fontSize: big ? 16 : 13,
          color: color ?? "#f8fafc",
          fontFamily: "'JetBrains Mono', monospace",
          fontFeatureSettings: '"tnum"',
          letterSpacing: "-0.2px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

type Props = {
  cards: DealCard[];
  tradeSelections: DealTradeSelection[];
  completeSummary: { scanId: string; cashOut: number; tradeValue: number } | null;
  onReset: () => void;
};

export function DealStepComplete({ cards, tradeSelections, completeSummary, onReset }: Props) {
  const [photoTaken, setPhotoTaken] = useState(false);

  const totalMarket = cards.reduce((s, c) => s + (c.marketPrice ?? 0), 0);
  const now = new Date();
  const txnTime = `${now.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" })} · ${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

  return (
    <div className="flex flex-col" style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>

      {/* Radial glow */}
      <div
        style={{
          position: "absolute",
          top: -120, left: "50%", transform: "translateX(-50%)",
          width: 500, height: 500, borderRadius: 999,
          background: "radial-gradient(circle, rgba(52,211,153,0.18) 0%, rgba(139,92,246,0.06) 40%, transparent 70%)",
          pointerEvents: "none",
          animation: "dealPulse 3s ease-out infinite",
        }}
      />

      <div className="flex-1 overflow-y-auto px-5 py-7 space-y-4" style={{ position: "relative" }}>

        {/* Success mark */}
        <div className="flex flex-col items-center mb-2">
          <div
            style={{
              width: 72, height: 72, borderRadius: 999,
              background: "linear-gradient(145deg, rgba(52,211,153,0.2), rgba(52,211,153,0.05))",
              border: "2px solid rgba(52,211,153,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 0 6px rgba(52,211,153,0.08), 0 0 30px rgba(52,211,153,0.3)",
              animation: "dealPop 500ms cubic-bezier(.34,1.56,.64,1)",
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <div
            className="text-xl font-bold mt-3.5"
            style={{ color: "#f8fafc", letterSpacing: "-0.5px" }}
          >
            Deal complete
          </div>
          <div
            className="text-xs mt-1"
            style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
          >
            TXN · {txnTime}
          </div>
        </div>

        {/* Receipt summary */}
        <div
          style={{
            background: "linear-gradient(180deg, rgba(36,30,53,0.7), rgba(22,18,34,0.7))",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.05)",
            padding: "14px 16px",
          }}
        >
          <div
            className="text-[9px] font-bold tracking-[0.18em] uppercase mb-2.5"
            style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Summary
          </div>

          <ReceiptRow
            label="Customer brought"
            value={`${cards.length} card${cards.length === 1 ? "" : "s"} · ${money(totalMarket)}`}
          />
          {completeSummary && completeSummary.cashOut > 0 && (
            <ReceiptRow label="Cash out" value={money(completeSummary.cashOut)} color="#f87171" />
          )}
          {completeSummary && completeSummary.tradeValue > 0 && (
            <ReceiptRow
              label={`Trade out (${tradeSelections.length} card${tradeSelections.length === 1 ? "" : "s"})`}
              value={money(completeSummary.tradeValue)}
              color="#c4b5fd"
            />
          )}

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "10px 0" }} />

          {completeSummary && (
            <ReceiptRow
              label="Net P&L"
              value={`+${money(totalMarket - completeSummary.cashOut - completeSummary.tradeValue)}`}
              color="#34d399"
              big
            />
          )}
        </div>

        {/* Photo prompt */}
        <div
          style={{
            background: photoTaken ? "rgba(52,211,153,0.05)" : "rgba(139,92,246,0.05)",
            borderRadius: 12,
            border: `1px solid ${photoTaken ? "rgba(52,211,153,0.2)" : "rgba(139,92,246,0.18)"}`,
            padding: "12px 14px",
            display: "flex", alignItems: "center", gap: 12,
          }}
        >
          <div
            style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: photoTaken ? "rgba(52,211,153,0.15)" : "rgba(139,92,246,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {photoTaken ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: "#f8fafc" }}>
              {photoTaken ? "Photo attached" : "Add photo?"}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>
              {photoTaken ? `${cards.length} cards captured` : "Customer's pile for records"}
            </div>
          </div>
          {!photoTaken && (
            <button
              onClick={() => setPhotoTaken(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{
                background: "rgba(139,92,246,0.18)",
                border: "1px solid rgba(139,92,246,0.35)",
                color: "#c4b5fd",
                cursor: "pointer",
              }}
            >
              Camera
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <StepFooter>
        <button
          style={{
            height: 44, padding: "0 14px", borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#94a3b8", fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}
        >
          Receipt
        </button>
        <button
          onClick={onReset}
          style={{
            flex: 1, height: 44, borderRadius: 12,
            background: "linear-gradient(180deg, #8b5cf6, #6d42d8)",
            border: "none", color: "#fff", fontWeight: 700, fontSize: 14,
            boxShadow: "0 6px 18px rgba(139,92,246,0.4)",
            cursor: "pointer",
          }}
        >
          Start next deal
        </button>
      </StepFooter>

      <style>{`
        @keyframes dealPulse {
          0%, 100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
          50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
        }
        @keyframes dealPop {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

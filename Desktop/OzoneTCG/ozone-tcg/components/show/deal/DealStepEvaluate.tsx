"use client";

import { Camera } from "lucide-react";
import CardAutocomplete, { type AutocompleteCard } from "@/components/CardAutocomplete";
import CertLookupWidget from "@/components/CertLookupWidget";
import { money, StepFooter, PrimaryButton, type DealCard } from "./DealFlowShared";

const CONDITIONS_LIST = [
  "Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged",
] as const;
const COND_ABBREV: Record<string, string> = {
  "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP",
  "Heavily Played": "HP", "Damaged": "DMG",
};

type Props = {
  cards: DealCard[];
  cashPct: number;
  addName: string;
  onAddNameChange: (v: string) => void;
  addCard: AutocompleteCard | null;
  onAddCardChange: (c: AutocompleteCard | null) => void;
  addMarket: string;
  onAddMarketChange: (v: string) => void;
  addCondition: string;
  onAddConditionChange: (v: string) => void;
  addGrade: string;
  onAddGradeChange: (v: string) => void;
  certOpen: boolean;
  onCertOpenChange: (v: boolean) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onScanOpen: () => void;
  onNext: () => void;
};

export function DealStepEvaluate({
  cards, cashPct,
  addName, onAddNameChange, addCard, onAddCardChange,
  addMarket, onAddMarketChange, addCondition, onAddConditionChange,
  addGrade, onAddGradeChange, certOpen, onCertOpenChange,
  onAdd, onRemove, onScanOpen, onNext,
}: Props) {
  const totalMarket = cards.reduce((s, c) => s + (c.marketPrice ?? 0), 0);
  const totalBuy = cards.reduce(
    (s, c) => s + (c.buyPrice ?? (c.marketPrice != null ? c.marketPrice * cashPct / 100 : 0)),
    0,
  );

  return (
    <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>

      {/* Context bar */}
      <div
        className="flex items-center px-3.5 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="min-w-0 flex-1">
          <div
            className="text-[9px] font-bold tracking-[0.18em] uppercase"
            style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Customer Brought
          </div>
          <div className="text-sm font-semibold mt-0.5" style={{ color: "#f8fafc" }}>
            {cards.length} card{cards.length === 1 ? "" : "s"}
            {totalMarket > 0 && (
              <>
                {" · "}
                <span
                  className="tabular-nums"
                  style={{ color: "#c4b5fd", fontFamily: "'JetBrains Mono', monospace", fontFeatureSettings: '"tnum"' }}
                >
                  {money(totalMarket)}
                </span>
                {" market"}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Autocomplete search — hero interaction */}
      <div className="px-3.5 pt-3.5 pb-2.5">
        <div
          className="relative"
          style={{
            background: "linear-gradient(180deg, rgba(36,30,53,0.8), rgba(22,18,34,0.8))",
            border: "1.5px solid rgba(139,92,246,0.35)",
            borderRadius: 14,
            boxShadow: "0 0 0 4px rgba(139,92,246,0.10), 0 8px 20px rgba(0,0,0,0.3)",
          }}
        >
          <svg
            width="17" height="17" viewBox="0 0 24 24" fill="none"
            stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", zIndex: 1 }}
          >
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <CardAutocomplete
            value={addName}
            onChange={(q) => { onAddNameChange(q); if (!q) onAddCardChange(null); }}
            onSelect={(card) => {
              onAddCardChange(card);
              onAddNameChange(card.name);
              if (card.market != null) onAddMarketChange(card.market.toFixed(2));
            }}
            placeholder="Add a card…"
            className="pl-10 pr-4 py-3.5 text-sm bg-transparent border-none outline-none rounded-[13px] text-white w-full"
          />
        </div>
      </div>

      {/* Secondary form fields */}
      <div className="px-3.5 space-y-2 pb-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div
              className="text-[9px] font-bold tracking-[0.14em] uppercase mb-1"
              style={{ color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}
            >
              Market price
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#64748b" }}>$</span>
              <input
                type="number"
                inputMode="decimal"
                className="w-full rounded-lg pl-6 pr-3 py-2 text-sm font-mono tabular-nums"
                style={{
                  background: "rgba(36,30,53,0.6)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#f8fafc",
                  outline: "none",
                }}
                placeholder="0.00"
                value={addMarket}
                onChange={(e) => onAddMarketChange(e.target.value)}
              />
            </div>
          </div>
          <div>
            <div
              className="text-[9px] font-bold tracking-[0.14em] uppercase mb-1"
              style={{ color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}
            >
              Condition
            </div>
            <select
              className="w-full rounded-lg px-2.5 py-2 text-sm"
              style={{
                background: "rgba(36,30,53,0.6)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#f8fafc",
                outline: "none",
              }}
              value={addCondition}
              onChange={(e) => onAddConditionChange(e.target.value)}
            >
              {CONDITIONS_LIST.map((c) => (
                <option key={c} value={c}>{COND_ABBREV[c]}</option>
              ))}
            </select>
          </div>
        </div>

        <input
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{
            background: "rgba(36,30,53,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#f8fafc",
            outline: "none",
          }}
          placeholder="Grade (e.g. PSA 9, BGS 9.5)"
          value={addGrade}
          onChange={(e) => onAddGradeChange(e.target.value)}
        />

        <button
          onClick={() => onCertOpenChange(!certOpen)}
          className="text-[10px] transition-opacity hover:opacity-70"
          style={{ color: "#64748b", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          {certOpen ? "▲ Hide cert lookup" : "▼ Lookup cert #"}
        </button>

        {certOpen && (
          <CertLookupWidget
            embedded
            onResult={(r) => {
              onAddNameChange(r.name);
              onAddGradeChange(`${r.company} ${r.gradeLabel ?? ""} ${r.grade}`.trim());
              if (r.market != null) onAddMarketChange(r.market.toFixed(2));
            }}
          />
        )}

        <div className="flex gap-2">
          <button
            onClick={onScanOpen}
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-opacity"
            style={{
              background: "rgba(36,30,53,0.6)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#94a3b8",
              cursor: "pointer",
            }}
          >
            <Camera size={15} />
          </button>
          <button
            onClick={onAdd}
            disabled={!addName.trim()}
            className="flex-1 h-10 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-30"
            style={{ background: "linear-gradient(180deg, #8b5cf6, #6d42d8)", border: "none", cursor: "pointer" }}
          >
            + Add Card
          </button>
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-3.5" style={{ paddingBottom: 4 }}>
        {cards.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-3xl mb-2" style={{ opacity: 0.25 }}>◈</div>
            <div className="text-sm font-medium" style={{ color: "#94a3b8" }}>Add cards to start the deal</div>
            <div className="text-xs mt-1" style={{ color: "#475569" }}>Search by name or set number</div>
          </div>
        ) : (
          <div className="space-y-1.5 pb-2">
            {cards.map((card) => {
              const buyAmt = card.buyPrice ?? (card.marketPrice != null ? card.marketPrice * cashPct / 100 : null);
              return (
                <div
                  key={card._id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{
                    background: "rgba(36,30,53,0.5)",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  {card.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.image_url}
                      alt=""
                      className="rounded object-cover shrink-0"
                      style={{ width: 28, height: 40 }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: "#f8fafc" }}>{card.name}</div>
                    <div
                      className="flex items-center gap-2 mt-0.5 text-[10px]"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {card.marketPrice != null && (
                        <span style={{ color: "#94a3b8" }}>
                          MKT <span style={{ color: "#c4b5fd", fontWeight: 700 }}>{money(card.marketPrice)}</span>
                        </span>
                      )}
                      {buyAmt != null && (
                        <>
                          <span style={{ color: "#475569" }}>|</span>
                          <span style={{ color: "#94a3b8" }}>
                            BUY <span style={{ color: "#34d399", fontWeight: 700 }}>{money(buyAmt)}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onRemove(card._id)}
                    className="shrink-0 flex items-center justify-center rounded-lg text-sm font-bold"
                    style={{
                      width: 26, height: 26,
                      background: "rgba(244,63,94,0.08)",
                      border: "none",
                      color: "#f87171",
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <StepFooter>
        <div className="flex-1 min-w-0">
          <div
            className="text-[9px] font-bold tracking-[0.16em] uppercase"
            style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Buy total
          </div>
          <div
            className="text-lg font-bold tabular-nums leading-none mt-0.5"
            style={{
              color: "#f8fafc",
              fontFamily: "'JetBrains Mono', monospace",
              fontFeatureSettings: '"tnum"',
              letterSpacing: "-0.4px",
            }}
          >
            {money(totalBuy)}
          </div>
        </div>
        <PrimaryButton onClick={onNext} disabled={cards.length === 0}>
          Quote offer
        </PrimaryButton>
      </StepFooter>

      <style>{`
        @keyframes evalSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

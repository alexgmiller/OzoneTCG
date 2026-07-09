"use client";

import { Camera } from "lucide-react";
import { InventoryCardGrid } from "@/components/show/InventoryCardGrid";
import type { InventorySearchResult } from "@/app/protected/show/actions";
import { money, StepFooter, BackButton, PrimaryButton, type DealCard, type DealTradeSelection, type SortBy, type PriceRange } from "./DealFlowShared";

// ── Budget hero bar ────────────────────────────────────────────────────────────

type BudgetState = "good" | "close" | "over" | "empty";

const STATE_COLOR: Record<BudgetState, string> = {
  good: "#34d399", close: "#fbbf24", over: "#f87171", empty: "#94a3b8",
};
const STATE_BG: Record<BudgetState, string> = {
  good: "rgba(52,211,153,0.08)", close: "rgba(234,179,8,0.08)",
  over: "rgba(244,63,94,0.08)", empty: "rgba(255,255,255,0.02)",
};

function BudgetBar({ budget, spent }: { budget: number; spent: number }) {
  const remaining = budget - spent;
  const pct = budget > 0 ? Math.min(100, Math.max(0, (spent / budget) * 100)) : 0;
  const state: BudgetState =
    remaining < -5 ? "over"
    : remaining < budget * 0.08 && budget > 0 ? "close"
    : budget === 0 || spent === 0 ? "empty"
    : "good";
  const c = STATE_COLOR[state];

  return (
    <div
      style={{
        padding: "14px 16px",
        background: STATE_BG[state],
        borderBottom: `1px solid ${state !== "empty" ? c + "33" : "rgba(255,255,255,0.05)"}`,
        transition: "all 200ms ease",
      }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div
            className="text-[9px] font-bold tracking-[0.18em] uppercase"
            style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Remaining budget
          </div>
          <div
            className="tabular-nums mt-0.5 leading-none"
            style={{
              fontSize: 28, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
              fontFeatureSettings: '"tnum"', color: c, letterSpacing: "-0.8px",
            }}
          >
            {remaining < 0 ? "−" : ""}{money(Math.abs(remaining))}
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-[9px] font-bold tracking-[0.18em] uppercase"
            style={{ color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}
          >
            of {money(budget)}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${c}, ${c}cc)`,
            borderRadius: 999,
            transition: "all 200ms ease",
            boxShadow: `0 0 8px ${c}66`,
          }}
        />
      </div>

      {/* Hint */}
      <div className="flex items-center gap-1.5 mt-2 text-xs font-medium" style={{ color: c }}>
        {state === "empty" && <>Pick cards worth up to {money(budget)} in trade credit</>}
        {state === "good" && <><span className="text-sm">◆</span> Room for more — keep going</>}
        {state === "close" && <><span className="text-sm">◆</span> Nearly perfect match</>}
        {state === "over" && <><span className="text-sm">⚠</span> Over by {money(Math.abs(remaining))} — they owe boot cash</>}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  cashCards: DealCard[];
  tradeCards: DealCard[];
  undecidedCards: DealCard[];
  cashTotal: number;
  tradeTotal: number;
  tradeSelections: DealTradeSelection[];
  onTradeSelectionsChange: (s: DealTradeSelection[]) => void;
  inventoryDisplay: InventorySearchResult[];
  inventoryLoaded: boolean;
  inventoryTerms: string[];
  inventoryShowMore: boolean;
  onInventoryShowMoreToggle: () => void;
  inventoryQuery: string;
  onInventoryQueryChange: (v: string) => void;
  inventoryFilter: "all" | "single" | "slab" | "sealed";
  onInventoryFilterChange: (f: "all" | "single" | "slab" | "sealed") => void;
  sortBy: SortBy;
  onSortByChange: (s: SortBy) => void;
  priceRange: PriceRange;
  onPriceRangeChange: (r: PriceRange) => void;
  onScanOpen: () => void;
  onBack: () => void;
  onComplete: () => void;
  busy: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

const SHOW_COUNT = 12;

export function DealStepFulfill({
  cashCards, tradeCards, undecidedCards,
  cashTotal, tradeTotal,
  tradeSelections, onTradeSelectionsChange,
  inventoryDisplay, inventoryLoaded, inventoryTerms,
  inventoryShowMore, onInventoryShowMoreToggle,
  inventoryQuery, onInventoryQueryChange,
  inventoryFilter, onInventoryFilterChange,
  sortBy, onSortByChange,
  priceRange, onPriceRangeChange,
  onScanOpen, onBack, onComplete, busy,
}: Props) {
  const spent = tradeSelections.reduce((s, g) => s + (parseFloat(g.tradeValue) || (g.item.market ?? 0)), 0);
  const remaining = tradeTotal - spent;
  const isOver = remaining < -5;
  const canComplete = !busy && (cashCards.length + tradeCards.length) > 0 && undecidedCards.length === 0 && !isOver;
  const displayItems = inventoryShowMore ? inventoryDisplay : inventoryDisplay.slice(0, SHOW_COUNT);

  return (
    <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>

      {/* Deal summary pills */}
      <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {cashCards.length > 0 && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums"
            style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", color: "#34d399" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            {money(cashTotal)} cash
          </div>
        )}
        {tradeCards.length > 0 && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums"
            style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>
            {money(tradeTotal)} credit
          </div>
        )}
      </div>

      {/* Budget bar — only if trade credit in play */}
      {tradeCards.length > 0 && <BudgetBar budget={tradeTotal} spent={spent} />}

      {/* Inventory picker — only if trade credit */}
      {tradeCards.length > 0 && (
        <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <div
              className="text-[10px] font-bold tracking-[0.18em] uppercase"
              style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
            >
              Your inventory
            </div>
            <button
              onClick={onScanOpen}
              className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-opacity"
              style={{
                background: "rgba(139,92,246,0.08)",
                border: "1px solid rgba(139,92,246,0.2)",
                color: "#c4b5fd",
                cursor: "pointer",
              }}
            >
              <Camera size={11} /> Scan
            </button>
          </div>

          {/* Search */}
          <input
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{
              background: "rgba(36,30,53,0.6)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#f8fafc",
              outline: "none",
            }}
            placeholder="Search inventory…"
            value={inventoryQuery}
            onChange={(e) => onInventoryQueryChange(e.target.value)}
          />

          {/* Category filter */}
          <div className="flex gap-1.5">
            {(["all", "single", "slab", "sealed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => onInventoryFilterChange(f)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors"
                style={inventoryFilter === f
                  ? { background: "var(--accent-primary)", color: "#fff", border: "none" }
                  : { background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#64748b" }
                }
              >
                {f}
              </button>
            ))}
          </div>

          {/* Sort + price range */}
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-lg px-2.5 py-1.5 text-xs"
              style={{ background: "rgba(36,30,53,0.6)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", outline: "none" }}
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value as SortBy)}
            >
              <option value="name">Name A–Z</option>
              <option value="price-high">Price ↑</option>
              <option value="price-low">Price ↓</option>
              <option value="recent">Recently Added</option>
            </select>
            <select
              className="flex-1 rounded-lg px-2.5 py-1.5 text-xs"
              style={{ background: "rgba(36,30,53,0.6)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", outline: "none" }}
              value={priceRange}
              onChange={(e) => onPriceRangeChange(e.target.value as PriceRange)}
            >
              <option value="all">All Prices</option>
              <option value="under25">Under $25</option>
              <option value="25to100">$25–$100</option>
              <option value="100to500">$100–$500</option>
              <option value="over500">$500+</option>
            </select>
          </div>

          {/* Grid */}
          <InventoryCardGrid
            items={displayItems}
            isLoading={!inventoryLoaded}
            selectedIds={new Set(tradeSelections.map((s) => s.item.id))}
            onToggle={(item) => {
              const isSelected = tradeSelections.some((s) => s.item.id === item.id);
              if (isSelected) {
                onTradeSelectionsChange(tradeSelections.filter((s) => s.item.id !== item.id));
              } else {
                onTradeSelectionsChange([...tradeSelections, {
                  item,
                  tradeValue: item.sticker_price != null
                    ? item.sticker_price.toFixed(2)
                    : item.market != null ? item.market.toFixed(2) : "",
                }]);
              }
            }}
            searchTerms={inventoryTerms}
            selectionVariant="violet"
            footerVariant="sticker-or-market"
          />

          {inventoryDisplay.length > SHOW_COUNT && (
            <button
              onClick={onInventoryShowMoreToggle}
              className="w-full text-xs py-2 transition-opacity hover:opacity-70"
              style={{ color: "#64748b" }}
            >
              {inventoryShowMore ? "Show less" : `Show ${inventoryDisplay.length - SHOW_COUNT} more…`}
            </button>
          )}

          {/* Going-out panel */}
          {tradeSelections.length > 0 && (
            <div
              style={{
                padding: "12px 14px",
                background: "linear-gradient(180deg, rgba(36,30,53,0.7), rgba(22,18,34,0.7))",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div
                className="text-[9px] font-bold tracking-[0.18em] uppercase mb-2"
                style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
              >
                Going out
              </div>
              <div className="space-y-2">
                {tradeSelections.map((sel) => (
                  <div key={sel.item.id} className="flex items-center gap-2">
                    <div
                      className="rounded overflow-hidden shrink-0"
                      style={{ width: 28, height: 40, background: "rgba(255,255,255,0.04)" }}
                    >
                      {sel.item.image_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={sel.item.image_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-[7px] opacity-20 font-bold uppercase">{sel.item.category}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: "#f8fafc" }}>{sel.item.name}</div>
                      <div className="text-[10px] truncate" style={{ color: "#475569" }}>{sel.item.grade ?? sel.item.condition}</div>
                    </div>
                    <div className="relative shrink-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: "#64748b" }}>$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="rounded text-right font-mono text-xs"
                        style={{
                          width: 70,
                          padding: "3px 6px 3px 18px",
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "#f8fafc",
                          outline: "none",
                        }}
                        value={sel.tradeValue}
                        onChange={(e) =>
                          onTradeSelectionsChange(
                            tradeSelections.map((s) =>
                              s.item.id === sel.item.id ? { ...s, tradeValue: e.target.value } : s
                            )
                          )
                        }
                        placeholder="0.00"
                      />
                    </div>
                    <button
                      onClick={() => onTradeSelectionsChange(tradeSelections.filter((s) => s.item.id !== sel.item.id))}
                      className="text-xs shrink-0"
                      style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", opacity: 0.6 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div
                  className="flex justify-between text-xs pt-1.5 tabular-nums"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "#94a3b8" }}
                >
                  <span>Trade-out value</span>
                  <span className="font-semibold" style={{ color: "#c4b5fd" }}>{money(spent)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* If no trade cards, show spacer */}
      {tradeCards.length === 0 && <div className="flex-1" />}

      {/* Footer */}
      <StepFooter>
        <BackButton onClick={onBack} />
        <PrimaryButton onClick={onComplete} disabled={!canComplete}>
          {busy ? "Recording…" : "Review & complete"}
        </PrimaryButton>
      </StepFooter>
    </div>
  );
}

"use client";

import React from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { InventorySearchResult } from "../actions";
import type { SortBy, PriceRange } from "../types";
import {
  money,
  queryTerms,
  filterInventory,
  applyInventoryFilters,
  HighlightTerms,
} from "../utils";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  tradeInventory: InventorySearchResult[];
  tradeInventoryLoaded: boolean;
  tab: "scan" | "buy" | "sell" | "deal" | "trade";
  sellQuery: string;
  setSellQuery: React.Dispatch<React.SetStateAction<string>>;
  sellCategoryFilter: "all" | "single" | "slab" | "sealed";
  setSellCategoryFilter: React.Dispatch<React.SetStateAction<"all" | "single" | "slab" | "sealed">>;
  sellSortBy: SortBy;
  setSellSortBy: React.Dispatch<React.SetStateAction<SortBy>>;
  sellPriceRange: PriceRange;
  setSellPriceRange: React.Dispatch<React.SetStateAction<PriceRange>>;
  sellSelected: Map<string, InventorySearchResult>;
  setSellSelected: React.Dispatch<React.SetStateAction<Map<string, InventorySearchResult>>>;
  sellBottomExpanded: boolean;
  setSellBottomExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  sellPrices: Record<string, string>;
  sellPriceLocked: Set<string>;
  sellTotalInput: string;
  busy: boolean;
  isMounted: boolean;
  toggleSellSelect: (item: InventorySearchResult) => void;
  handleSellItemPrice: (itemId: string, raw: string) => void;
  handleSellTotalChange: (raw: string) => void;
  handleConfirmSell: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SellTab({
  tradeInventory,
  tradeInventoryLoaded,
  tab,
  sellQuery,
  setSellQuery,
  sellCategoryFilter,
  setSellCategoryFilter,
  sellSortBy,
  setSellSortBy,
  sellPriceRange,
  setSellPriceRange,
  sellSelected,
  setSellSelected,
  sellBottomExpanded,
  setSellBottomExpanded,
  sellPrices,
  sellPriceLocked,
  sellTotalInput,
  busy,
  isMounted,
  toggleSellSelect,
  handleSellItemPrice,
  handleSellTotalChange,
  handleConfirmSell,
}: Props) {
  const filtered = filterInventory(tradeInventory, sellQuery);
  const categoryFiltered = sellCategoryFilter === "all"
    ? filtered
    : filtered.filter((i) => i.category === sellCategoryFilter);
  const displayItems = applyInventoryFilters(categoryFiltered, sellSortBy, sellPriceRange);
  const searchTerms = queryTerms(sellQuery);
  const selCount = sellSelected.size;
  const selectedArr = Array.from(sellSelected.values());
  const totalSell = selectedArr.reduce((s, i) => s + (parseFloat(sellPrices[i.id]) || 0), 0);
  const totalMarket = selectedArr.reduce((s, i) => s + (i.market ?? 0), 0);
  const totalPct = totalMarket > 0 && totalSell > 0 ? Math.round((totalSell / totalMarket) * 100) : null;

  function pctColor(pct: number) {
    if (pct >= 90) return "text-emerald-400";
    if (pct >= 75) return "opacity-60";
    return "text-rose-400";
  }

  return (
    <>
      {/* ── TOP ZONE ── */}
      <div
        className="space-y-3"
        style={{ paddingBottom: sellBottomExpanded ? "calc(45vh + 60px)" : "68px" }}
      >
        <input
          className="w-full border rounded-xl px-4 py-2.5 text-sm bg-background"
          placeholder="Search by name, set, or card number…"
          value={sellQuery}
          onChange={(e) => setSellQuery(e.target.value)}
          autoFocus={tab === "sell"}
        />

        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 flex-1">
            {(["all", "single", "slab", "sealed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSellCategoryFilter(f)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                  sellCategoryFilter === f ? "text-white" : "border opacity-40 hover:opacity-60"
                }`}
                style={sellCategoryFilter === f ? { background: "var(--accent-primary)" } : undefined}
              >
                {f}
              </button>
            ))}
          </div>
          {selCount > 0 && (
            <button onClick={() => setSellSelected(new Map())} className="text-[10px] opacity-40 hover:opacity-70 shrink-0">
              Clear {selCount}
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <select
            className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background"
            value={sellSortBy}
            onChange={(e) => setSellSortBy(e.target.value as SortBy)}
          >
            <option value="name">Name A–Z</option>
            <option value="price-high">Price ↑</option>
            <option value="price-low">Price ↓</option>
            <option value="recent">Recently Added</option>
          </select>
          <select
            className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background"
            value={sellPriceRange}
            onChange={(e) => setSellPriceRange(e.target.value as PriceRange)}
          >
            <option value="all">All Prices</option>
            <option value="under25">Under $25</option>
            <option value="25to100">$25–$100</option>
            <option value="100to500">$100–$500</option>
            <option value="over500">$500+</option>
          </select>
        </div>

        {!tradeInventoryLoaded ? (
          <div className="text-xs opacity-40 text-center py-6">Loading inventory…</div>
        ) : displayItems.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {displayItems.map((item) => {
              const selected = sellSelected.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => toggleSellSelect(item)}
                  className={`relative flex flex-col rounded-xl overflow-hidden text-left transition-all border-2 ${
                    selected ? "border-emerald-500 shadow-sm shadow-emerald-500/20" : "border-border/40"
                  }`}
                >
                  <div className="relative w-full aspect-[3/4] bg-muted overflow-hidden">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center opacity-20 text-[10px] font-bold uppercase tracking-wide text-center px-1">
                        {item.category}
                      </div>
                    )}
                    {item.grade && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                        <div className="text-[8px] font-bold text-white text-center truncate">{item.grade}</div>
                      </div>
                    )}
                    {selected && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">✓</span>
                      </div>
                    )}
                  </div>
                  <div className="px-1.5 pt-1 pb-1.5 bg-background">
                    <div className="text-[9px] font-medium leading-tight truncate">
                      <HighlightTerms text={item.name} terms={searchTerms} />
                    </div>
                    {(item.set_name || item.card_number) && (
                      <div className="text-[8px] opacity-40 truncate">
                        <HighlightTerms
                          text={[item.set_name, item.card_number ? `#${item.card_number}` : null].filter(Boolean).join(" ")}
                          terms={searchTerms}
                        />
                      </div>
                    )}
                    <div className="text-[9px] opacity-50 mt-0.5">
                      {item.sticker_price != null ? money(item.sticker_price) : item.market != null ? money(item.market) : "—"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : sellQuery.trim() ? (
          <div className="text-xs opacity-40 text-center py-4">No results for &ldquo;{sellQuery}&rdquo;</div>
        ) : (
          <div className="text-xs opacity-40 text-center py-6">No items in inventory</div>
        )}
      </div>

      {/* ── BOTTOM ZONE ── */}
      {isMounted && createPortal(
        <div
          className="fixed left-0 right-0 z-40 bg-background border-t"
          style={{ bottom: "3.5rem", boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }}
        >
          {/* Collapsed header */}
          {selCount === 0 ? (
            <div className="px-4 py-3">
              <span className="text-xs opacity-40">Tap cards above to sell</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-3">
              <button
                className="flex-1 flex items-center gap-2 min-w-0 text-left"
                onClick={() => setSellBottomExpanded((v) => !v)}
              >
                <span className="text-sm font-semibold">{selCount} selected</span>
                <span className="text-emerald-400 font-semibold text-sm">{money(totalSell)}</span>
                {totalPct != null && (
                  <span className={`text-xs font-semibold ${pctColor(totalPct)}`}>{totalPct}%</span>
                )}
                <ChevronDown
                  size={15}
                  className={`shrink-0 opacity-40 transition-transform ml-auto ${sellBottomExpanded ? "rotate-180" : ""}`}
                />
              </button>
              <button
                onClick={handleConfirmSell}
                disabled={busy || totalSell <= 0}
                className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-30"
                style={{ background: "#22c55e" }}
              >
                {busy ? "…" : "Record Sale →"}
              </button>
            </div>
          )}

          {/* Expanded content */}
          {sellBottomExpanded && selCount > 0 && (
            <div className="border-t max-h-[45vh] overflow-y-auto">
              <div className="px-4 pt-3 pb-4 space-y-2">
                {selectedArr.map((item) => {
                  const price = parseFloat(sellPrices[item.id]) || 0;
                  const isLocked = sellPriceLocked.has(item.id);
                  const cardPct = item.market != null && item.market > 0 && price > 0
                    ? Math.round((price / item.market) * 100) : null;
                  return (
                    <div key={item.id} className="flex items-center gap-2">
                      <div className="w-8 h-11 rounded overflow-hidden bg-muted shrink-0">
                        {item.image_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-[7px] opacity-20 font-bold uppercase">{item.category}</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{item.name}</div>
                        <div className="text-[10px] opacity-40 truncate">
                          {item.grade ?? item.condition}
                          {item.market != null && <span> · Mkt {money(item.market)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-40">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            className={`w-20 border rounded-lg pl-5 pr-2 py-1 text-xs font-mono text-right bg-background ${isLocked ? "border-emerald-500/40" : ""}`}
                            value={sellPrices[item.id] ?? ""}
                            onChange={(e) => handleSellItemPrice(item.id, e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        {cardPct != null && (
                          <div className={`text-[9px] font-semibold ${pctColor(cardPct)}`}>{cardPct}%</div>
                        )}
                      </div>
                      <button
                        onClick={() => toggleSellSelect(item)}
                        className="text-xs opacity-30 hover:opacity-60 shrink-0"
                      >✕</button>
                    </div>
                  );
                })}

                {/* Total + proportional edit */}
                <div className="pt-1 border-t space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs opacity-50">
                      Total
                      {totalPct != null && (
                        <span className={`ml-2 font-semibold ${pctColor(totalPct)}`}>{totalPct}% of mkt</span>
                      )}
                      {totalPct != null && totalPct < 75 && (
                        <span className="ml-1 text-rose-400"> · heavy discount</span>
                      )}
                    </div>
                    <div className="relative shrink-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-40">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="w-24 border rounded-lg pl-5 pr-2 py-1 text-xs font-mono text-right bg-background"
                        value={sellTotalInput}
                        onChange={(e) => handleSellTotalChange(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="text-[9px] opacity-30 text-right">Editing total redistributes across unlocked cards</div>
                </div>

                <button
                  onClick={handleConfirmSell}
                  disabled={busy || totalSell <= 0}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30"
                  style={{ background: "#22c55e" }}
                >
                  {busy ? "Recording…" : `Record Sale · ${money(totalSell)}`}
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

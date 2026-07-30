"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronDown } from "lucide-react";
import CertLookupWidget, { type CertWidgetResult } from "@/components/CertLookupWidget";
import type { InventorySearchResult } from "../actions";
import type { SortBy, PriceRange, TradeComingIn } from "../types";
import {
  money,
  queryTerms,
  filterInventory,
  applyInventoryFilters,
  HighlightTerms,
  blankTradeComingIn,
} from "../utils";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  tradeInventory: InventorySearchResult[];
  tradeInventoryLoaded: boolean;
  tradeInventoryQuery: string;
  setTradeInventoryQuery: React.Dispatch<React.SetStateAction<string>>;
  tradeGoingOut: { item: InventorySearchResult; tradeValue: string }[];
  setTradeGoingOut: React.Dispatch<React.SetStateAction<{ item: InventorySearchResult; tradeValue: string }[]>>;
  tradeComingIn: TradeComingIn[];
  setTradeComingIn: React.Dispatch<React.SetStateAction<TradeComingIn[]>>;
  tradeCashOverride: string;
  setTradeCashOverride: React.Dispatch<React.SetStateAction<string>>;
  tradeCashDir: "received" | "paid";
  setTradeCashDir: React.Dispatch<React.SetStateAction<"received" | "paid">>;
  tradeNotes: string;
  setTradeNotes: React.Dispatch<React.SetStateAction<string>>;
  tradeBottomExpanded: boolean;
  setTradeBottomExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  tradeCategoryFilter: "all" | "single" | "slab" | "sealed";
  setTradeCategoryFilter: React.Dispatch<React.SetStateAction<"all" | "single" | "slab" | "sealed">>;
  tradeSortBy: SortBy;
  setTradeSortBy: React.Dispatch<React.SetStateAction<SortBy>>;
  tradePriceRange: PriceRange;
  setTradePriceRange: React.Dispatch<React.SetStateAction<PriceRange>>;
  tradeShowMore: boolean;
  setTradeShowMore: React.Dispatch<React.SetStateAction<boolean>>;
  busy: boolean;
  isMounted: boolean;
  setScannerOpen: React.Dispatch<React.SetStateAction<"buy" | "trade-getting" | "trade-inventory" | "deal-add" | "deal-inventory" | null>>;
  setScannerTradeCardId: React.Dispatch<React.SetStateAction<string | null>>;
  handleRecordTrade: () => void;
  err: (msg: string) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TradeTab({
  tradeInventory,
  tradeInventoryLoaded,
  tradeInventoryQuery,
  setTradeInventoryQuery,
  tradeGoingOut,
  setTradeGoingOut,
  tradeComingIn,
  setTradeComingIn,
  tradeCashOverride,
  setTradeCashOverride,
  tradeCashDir,
  setTradeCashDir,
  tradeNotes,
  setTradeNotes,
  tradeBottomExpanded,
  setTradeBottomExpanded,
  tradeCategoryFilter,
  setTradeCategoryFilter,
  tradeSortBy,
  setTradeSortBy,
  tradePriceRange,
  setTradePriceRange,
  tradeShowMore,
  setTradeShowMore,
  busy,
  isMounted,
  setScannerOpen,
  setScannerTradeCardId,
  handleRecordTrade,
  err,
}: Props) {
  const gaveTotal = tradeGoingOut.reduce((s, g) => s + (parseFloat(g.tradeValue) || (g.item.market ?? 0)), 0);
  const gotTotal  = tradeComingIn.reduce((s, c) => s + (parseFloat(c.marketPrice) || 0), 0);
  const autoCash  = parseFloat((gotTotal - gaveTotal).toFixed(2));

  const categoryFiltered = tradeCategoryFilter === "all"
    ? tradeInventory
    : tradeInventory.filter((i) => i.category === tradeCategoryFilter);
  const searchFiltered   = filterInventory(categoryFiltered, tradeInventoryQuery);
  const filteredInventory = applyInventoryFilters(searchFiltered, tradeSortBy, tradePriceRange);
  const tradeSearchTerms  = queryTerms(tradeInventoryQuery);

  function handleRecordTradeNow() {
    if (tradeGoingOut.length === 0 && tradeComingIn.every((c) => !c.name.trim())) { err("Add cards to the trade"); return; }
    if (tradeComingIn.some((c) => !c.name.trim())) { err("Enter a name for each incoming card"); return; }
    handleRecordTrade();
  }

  return (
    <>
      {/* ── TOP ZONE ── */}
      <div
        className="space-y-3"
        style={{ paddingBottom: tradeBottomExpanded ? "calc(45vh + 60px)" : "68px" }}
      >
        {/* Search */}
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-xl px-4 py-2.5 text-sm bg-background"
            placeholder="Search by name, set, or card number…"
            value={tradeInventoryQuery}
            onChange={(e) => setTradeInventoryQuery(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setScannerOpen("trade-inventory")}
            className="flex items-center justify-center w-10 rounded-xl border border-border/60 opacity-60 hover:opacity-100 transition-opacity shrink-0"
            title="Scan card with camera"
          >
            <Camera size={16} />
          </button>
        </div>

        {/* Category filter pills + clear */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 flex-1">
            {(["all", "single", "slab", "sealed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTradeCategoryFilter(f)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                  tradeCategoryFilter === f ? "text-white" : "border opacity-40 hover:opacity-60"
                }`}
                style={tradeCategoryFilter === f ? { background: "var(--accent-primary)" } : undefined}
              >
                {f}
              </button>
            ))}
          </div>
          {tradeGoingOut.length > 0 && (
            <button onClick={() => setTradeGoingOut([])} className="text-[10px] opacity-40 hover:opacity-70 shrink-0">
              Clear {tradeGoingOut.length}
            </button>
          )}
        </div>

        {/* Sort + price dropdowns */}
        <div className="flex gap-2">
          <select
            className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background"
            value={tradeSortBy}
            onChange={(e) => setTradeSortBy(e.target.value as SortBy)}
          >
            <option value="name">Name A–Z</option>
            <option value="price-high">Price ↑</option>
            <option value="price-low">Price ↓</option>
            <option value="recent">Recently Added</option>
          </select>
          <select
            className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background"
            value={tradePriceRange}
            onChange={(e) => setTradePriceRange(e.target.value as PriceRange)}
          >
            <option value="all">All Prices</option>
            <option value="under25">Under $25</option>
            <option value="25to100">$25–$100</option>
            <option value="100to500">$100–$500</option>
            <option value="over500">$500+</option>
          </select>
        </div>

        {/* Inventory grid */}
        {!tradeInventoryLoaded ? (
          <div className="text-xs opacity-40 text-center py-6">Loading inventory…</div>
        ) : filteredInventory.length === 0 ? (
          <div className="text-xs opacity-40 text-center py-4">{tradeInventoryQuery ? `No results for "${tradeInventoryQuery}"` : "No items in inventory"}</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {filteredInventory.slice(0, tradeShowMore ? undefined : 15).map((item) => {
                const selected = !!tradeGoingOut.find((g) => g.item.id === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => setTradeGoingOut((prev) => {
                      const exists = prev.find((g) => g.item.id === item.id);
                      if (exists) return prev.filter((g) => g.item.id !== item.id);
                      return [...prev, { item, tradeValue: item.market != null ? item.market.toFixed(2) : "" }];
                    })}
                    className={`relative flex flex-col rounded-xl overflow-hidden text-left transition-all border-2 ${
                      selected ? "border-rose-500 shadow-sm shadow-rose-500/20" : "border-border/40"
                    }`}
                  >
                    <div className="relative w-full aspect-[3/4] bg-muted overflow-hidden">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-20 text-[9px] font-bold uppercase tracking-wide text-center px-1">
                          {item.category}
                        </div>
                      )}
                      {item.grade && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                          <div className="text-[7px] font-bold text-white text-center truncate">{item.grade}</div>
                        </div>
                      )}
                      {selected && (
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center">
                          <span className="text-white text-[8px] font-bold">✓</span>
                        </div>
                      )}
                    </div>
                    <div className="px-1.5 pt-1 pb-1.5 bg-background">
                      <div className="text-[9px] font-medium leading-tight truncate">
                        <HighlightTerms text={item.name} terms={tradeSearchTerms} />
                      </div>
                      {(item.set_name || item.card_number) && (
                        <div className="text-[8px] opacity-40 truncate">
                          <HighlightTerms
                            text={[item.set_name, item.card_number ? `#${item.card_number}` : null].filter(Boolean).join(" ")}
                            terms={tradeSearchTerms}
                          />
                        </div>
                      )}
                      {item.market != null && (
                        <div className="text-[8px] opacity-50 mt-0.5">{money(item.market)}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {!tradeShowMore && filteredInventory.length > 15 && (
              <button onClick={() => setTradeShowMore(true)} className="w-full text-[10px] opacity-40 hover:opacity-70 transition-opacity py-1">
                Show {filteredInventory.length - 15} more…
              </button>
            )}
          </>
        )}
      </div>

      {/* ── BOTTOM ZONE ── */}
      {isMounted && createPortal(
        <div
          className="fixed left-0 right-0 z-40 bg-background border-t"
          style={{ bottom: "3.5rem", boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }}
        >
          {/* Collapsed header */}
          {tradeGoingOut.length === 0 ? (
            <div className="px-4 py-3">
              <span className="text-xs opacity-40">Tap cards above to select for trade</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-3">
              <button
                className="flex-1 flex items-center gap-2 min-w-0 text-left"
                onClick={() => setTradeBottomExpanded((v) => !v)}
              >
                <span className="text-sm font-semibold">{tradeGoingOut.length} giving</span>
                <span className="text-rose-400 font-semibold text-sm">{money(gaveTotal)}</span>
                {gotTotal > 0 && <span className="opacity-40 text-xs shrink-0">→ getting {money(gotTotal)}</span>}
                <ChevronDown
                  size={15}
                  className={`shrink-0 opacity-40 transition-transform ml-auto ${tradeBottomExpanded ? "rotate-180" : ""}`}
                />
              </button>
              <button
                onClick={handleRecordTradeNow}
                disabled={busy}
                className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-30"
                style={{ background: "var(--accent-primary)" }}
              >
                {busy ? "…" : "Record Trade →"}
              </button>
            </div>
          )}

          {/* Expanded content */}
          {tradeBottomExpanded && (
            <div className="border-t max-h-[45vh] overflow-y-auto">
              <div className="px-4 pt-3 pb-4 space-y-3">

                {/* Giving Up rows */}
                {tradeGoingOut.length > 0 && (
                  <div className="space-y-2">
                    {tradeGoingOut.map((g) => {
                      const tv = parseFloat(g.tradeValue) || g.item.market || 0;
                      const tradePct = g.item.market != null && g.item.market > 0 && tv > 0
                        ? Math.round((tv / g.item.market) * 100) : null;
                      return (
                        <div key={g.item.id} className="flex items-center gap-2">
                          <div className="w-8 h-11 rounded overflow-hidden bg-muted shrink-0">
                            {g.item.image_url
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={g.item.image_url} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-[7px] opacity-20 font-bold uppercase">{g.item.category}</div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{g.item.name}</div>
                            {g.item.grade && <div className="text-[10px] opacity-40">{g.item.grade}</div>}
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <input
                              type="number"
                              inputMode="decimal"
                              className="w-20 border rounded-lg px-2 py-1 text-xs bg-background text-right font-mono"
                              value={g.tradeValue}
                              onChange={(e) => setTradeGoingOut((prev) => prev.map((x) => x.item.id === g.item.id ? { ...x, tradeValue: e.target.value } : x))}
                            />
                            {tradePct != null && (
                              <div className={`text-[9px] font-semibold ${tradePct >= 90 ? "text-emerald-400" : tradePct >= 75 ? "opacity-50" : "text-rose-400"}`}>
                                {tradePct}%
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setTradeGoingOut((prev) => prev.filter((x) => x.item.id !== g.item.id))}
                            className="text-xs opacity-30 hover:opacity-60 shrink-0"
                          >✕</button>
                        </div>
                      );
                    })}
                    <div className="text-xs text-right opacity-50 pt-0.5">
                      Total giving: <span className="font-semibold text-rose-400">{money(gaveTotal)}</span>
                    </div>
                  </div>
                )}

                <div className="border-t" />

                {/* Getting section */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide opacity-50">Getting</div>
                  {tradeComingIn.map((card, idx) => (
                    <div key={card._id} className="border rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] opacity-40">Card {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          {/* Camera scan for incoming card */}
                          <button
                            type="button"
                            onClick={() => { setScannerTradeCardId(card._id); setScannerOpen("trade-getting"); }}
                            className="opacity-40 hover:opacity-80 transition-opacity p-0.5"
                            title="Scan card with camera"
                          >
                            <Camera size={13} />
                          </button>
                          <CertLookupWidget
                            label="Cert"
                            onResult={(r: CertWidgetResult) =>
                              setTradeComingIn((prev) =>
                                prev.map((c) => c._id === card._id ? {
                                  ...c,
                                  name: r.name,
                                  grade: r.gradeLabel ? `${r.company} ${r.gradeLabel} ${r.grade}` : r.grade ? `${r.company} ${r.grade}` : "",
                                  marketPrice: r.market != null ? r.market.toFixed(2) : c.marketPrice,
                                } : c)
                              )
                            }
                          />
                          {tradeComingIn.length > 1 && (
                            <button className="text-[10px] text-red-500 hover:opacity-80" onClick={() => setTradeComingIn((prev) => prev.filter((c) => c._id !== card._id))}>Remove</button>
                          )}
                        </div>
                      </div>
                      <input
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                        placeholder="Card name *"
                        value={card.name}
                        onChange={(e) => setTradeComingIn((prev) => prev.map((c) => c._id === card._id ? { ...c, name: e.target.value } : c))}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="border rounded-lg px-2 py-2 text-sm bg-background"
                          placeholder="Grade (e.g. PSA 10)"
                          value={card.grade}
                          onChange={(e) => setTradeComingIn((prev) => prev.map((c) => c._id === card._id ? { ...c, grade: e.target.value } : c))}
                        />
                        <input
                          type="number"
                          inputMode="decimal"
                          className="border rounded-lg px-2 py-2 text-sm bg-background font-mono"
                          placeholder="Market $"
                          value={card.marketPrice}
                          onChange={(e) => setTradeComingIn((prev) => prev.map((c) => c._id === card._id ? { ...c, marketPrice: e.target.value } : c))}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    className="w-full border border-dashed rounded-lg py-2 text-xs opacity-50 hover:opacity-70 transition-opacity"
                    onClick={() => setTradeComingIn((prev) => [...prev, blankTradeComingIn()])}
                  >
                    + Add another card
                  </button>
                  {gotTotal > 0 && (
                    <div className="text-xs text-right opacity-50">Total getting: <span className="font-semibold text-emerald-400">{money(gotTotal)}</span></div>
                  )}
                </div>

                <div className="border-t" />

                {/* Cash & Notes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="opacity-50">Auto cash</span>
                    <span className={`font-semibold ${Math.abs(autoCash) < 0.01 ? "opacity-40" : autoCash > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {Math.abs(autoCash) < 0.01 ? "Even" : autoCash > 0 ? `We receive ${money(autoCash)}` : `We pay ${money(Math.abs(autoCash))}`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <select className="border rounded-lg px-2 py-1.5 text-xs bg-background" value={tradeCashDir} onChange={(e) => setTradeCashDir(e.target.value as "received" | "paid")}>
                      <option value="received">We receive</option>
                      <option value="paid">We pay</option>
                    </select>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="flex-1 border rounded-lg px-3 py-1.5 text-sm bg-background font-mono"
                      placeholder="Override cash $"
                      value={tradeCashOverride}
                      onChange={(e) => setTradeCashOverride(e.target.value)}
                    />
                  </div>
                  <input
                    className="w-full border rounded-lg px-3 py-1.5 text-xs bg-background opacity-70"
                    placeholder="Notes (optional)"
                    value={tradeNotes}
                    onChange={(e) => setTradeNotes(e.target.value)}
                  />
                </div>

                <button
                  onClick={handleRecordTradeNow}
                  disabled={busy}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30"
                  style={{ background: "var(--accent-primary)" }}
                >
                  {busy ? "Recording…" : "Record Trade"}
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

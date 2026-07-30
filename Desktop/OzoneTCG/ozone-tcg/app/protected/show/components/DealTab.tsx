"use client";

import React from "react";
import { Camera, Handshake } from "lucide-react";
import CardAutocomplete, { type AutocompleteCard } from "@/components/CardAutocomplete";
import CertLookupWidget from "@/components/CertLookupWidget";
import type { InventorySearchResult } from "../actions";
import type { DealCard, DealStep, SortBy, PriceRange } from "../types";
import {
  CONDITIONS_LIST,
  COND_ABBREV,
  money,
  queryTerms,
  filterInventory,
  applyInventoryFilters,
  HighlightTerms,
} from "../utils";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  dealCards: DealCard[];
  setDealCards: React.Dispatch<React.SetStateAction<DealCard[]>>;
  dealStep: DealStep;
  setDealStep: React.Dispatch<React.SetStateAction<DealStep>>;
  dealCashPct: number;
  setDealCashPct: React.Dispatch<React.SetStateAction<number>>;
  dealTradePct: number;
  setDealTradePct: React.Dispatch<React.SetStateAction<number>>;
  dealTradeSelections: { item: InventorySearchResult; tradeValue: string }[];
  setDealTradeSelections: React.Dispatch<React.SetStateAction<{ item: InventorySearchResult; tradeValue: string }[]>>;
  dealAddName: string;
  setDealAddName: React.Dispatch<React.SetStateAction<string>>;
  setDealAddCard: React.Dispatch<React.SetStateAction<AutocompleteCard | null>>;
  dealAddGrade: string;
  setDealAddGrade: React.Dispatch<React.SetStateAction<string>>;
  dealAddCondition: string;
  setDealAddCondition: React.Dispatch<React.SetStateAction<string>>;
  dealAddMarket: string;
  setDealAddMarket: React.Dispatch<React.SetStateAction<string>>;
  dealInventoryQuery: string;
  setDealInventoryQuery: React.Dispatch<React.SetStateAction<string>>;
  dealInventoryFilter: "all" | "single" | "slab" | "sealed";
  setDealInventoryFilter: React.Dispatch<React.SetStateAction<"all" | "single" | "slab" | "sealed">>;
  dealSortBy: SortBy;
  setDealSortBy: React.Dispatch<React.SetStateAction<SortBy>>;
  dealPriceRange: PriceRange;
  setDealPriceRange: React.Dispatch<React.SetStateAction<PriceRange>>;
  dealCertOpen: boolean;
  setDealCertOpen: React.Dispatch<React.SetStateAction<boolean>>;
  dealInventoryShowMore: boolean;
  setDealInventoryShowMore: React.Dispatch<React.SetStateAction<boolean>>;
  dealCompleteSummary: { scanId: string; cashOut: number; tradeValue: number } | null;
  tradeInventory: InventorySearchResult[];
  tradeInventoryLoaded: boolean;
  busy: boolean;
  handleDealAddCard: () => void;
  handleDealRemoveCard: (id: string) => void;
  handleDealSetDisposition: (id: string, disposition: DealCard["disposition"]) => void;
  handleDealSetBuyPrice: (id: string, val: string) => void;
  handleDealReset: () => void;
  handleCompleteDeal: () => void;
  setScannerOpen: React.Dispatch<React.SetStateAction<"buy" | "trade-getting" | "trade-inventory" | "deal-add" | "deal-inventory" | null>>;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function DealTab({
  dealCards,
  setDealCards,
  dealStep,
  setDealStep,
  dealCashPct,
  setDealCashPct,
  dealTradePct,
  setDealTradePct,
  dealTradeSelections,
  setDealTradeSelections,
  dealAddName,
  setDealAddName,
  setDealAddCard,
  dealAddGrade,
  setDealAddGrade,
  dealAddCondition,
  setDealAddCondition,
  dealAddMarket,
  setDealAddMarket,
  dealInventoryQuery,
  setDealInventoryQuery,
  dealInventoryFilter,
  setDealInventoryFilter,
  dealSortBy,
  setDealSortBy,
  dealPriceRange,
  setDealPriceRange,
  dealCertOpen,
  setDealCertOpen,
  dealInventoryShowMore,
  setDealInventoryShowMore,
  dealCompleteSummary,
  tradeInventory,
  tradeInventoryLoaded,
  busy,
  handleDealAddCard,
  handleDealRemoveCard,
  handleDealSetDisposition,
  handleDealSetBuyPrice,
  handleDealReset,
  handleCompleteDeal,
  setScannerOpen,
}: Props) {
  const cashCards = dealCards.filter((c) => c.disposition === "cash");
  const tradeCards = dealCards.filter((c) => c.disposition === "trade");
  const undecidedCards = dealCards.filter((c) => c.disposition === "undecided");

  const cashTotal = cashCards.reduce((s, c) => s + (c.buyPrice ?? (c.marketPrice ? c.marketPrice * dealCashPct / 100 : 0)), 0);
  const tradeTotal = tradeCards.reduce((s, c) => s + (c.buyPrice ?? (c.marketPrice ? c.marketPrice * dealTradePct / 100 : 0)), 0);
  const totalOffer = cashTotal + tradeTotal;

  const dealInventoryCategoryFiltered = dealInventoryFilter === "all"
    ? tradeInventory
    : tradeInventory.filter((i) => i.category === dealInventoryFilter);
  const dealInventoryFiltered = filterInventory(dealInventoryCategoryFiltered, dealInventoryQuery);
  const dealInventoryDisplay = applyInventoryFilters(dealInventoryFiltered, dealSortBy, dealPriceRange);
  const dealInventoryTerms = queryTerms(dealInventoryQuery);

  const SHOW_COUNT = dealInventoryShowMore ? dealInventoryDisplay.length : 12;

  // Step progress indicator
  const steps: { key: DealStep; label: string }[] = [
    { key: "evaluate", label: "Evaluate" },
    { key: "quote", label: "Quote" },
    { key: "fulfill", label: "Fulfill" },
    { key: "complete", label: "Done" },
  ];
  const stepIdx = steps.findIndex((s) => s.key === dealStep);

  return (
    <div className="space-y-4">
      {/* Step progress bar */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <React.Fragment key={s.key}>
            <button
              className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg transition-colors ${
                i === stepIdx
                  ? "text-white"
                  : i < stepIdx
                  ? "opacity-60 hover:opacity-80"
                  : "opacity-20"
              }`}
              style={i === stepIdx ? { background: "var(--accent-primary)" } : undefined}
              onClick={() => {
                if (i <= stepIdx || i === stepIdx + 1) setDealStep(s.key);
              }}
              disabled={i > stepIdx + 1}
            >
              {s.label}
            </button>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px ${i < stepIdx ? "bg-primary/40" : "bg-border"}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* ── STEP 1: EVALUATE ── */}
      {dealStep === "evaluate" && (
        <div className="space-y-4">
          <div className="text-xs opacity-50">Add cards the customer wants to sell or trade.</div>

          {/* Existing cards list */}
          {dealCards.length > 0 && (
            <div className="space-y-2">
              {dealCards.map((card) => (
                <div
                  key={card._id}
                  className="flex items-center gap-2 border rounded-xl p-2.5"
                >
                  {card.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.image_url} alt="" className="w-8 h-11 rounded object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{card.name}</div>
                    <div className="text-[10px] opacity-40 truncate">
                      {[card.grade, card.set_name, card.card_number ? `#${card.card_number}` : null].filter(Boolean).join(" · ")}
                    </div>
                    {card.marketPrice != null && (
                      <div className="text-xs opacity-60 mt-0.5">Mkt {money(card.marketPrice)}</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDealRemoveCard(card._id)}
                    className="text-xs opacity-30 hover:opacity-60 shrink-0 p-1"
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Add card form */}
          <div className="border rounded-xl p-3 space-y-2.5">
            <div className="text-[10px] font-bold uppercase opacity-40">Add a card</div>

            <div className="flex gap-2">
              <div className="flex-1">
                <CardAutocomplete
                  value={dealAddName}
                  onChange={(q) => { setDealAddName(q); if (!q) setDealAddCard(null); }}
                  onSelect={(card) => {
                    setDealAddCard(card);
                    setDealAddName(card.name);
                    if (card.market != null) setDealAddMarket(card.market.toFixed(2));
                  }}
                  placeholder="Card name…"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
                />
              </div>
              <button
                onClick={() => setScannerOpen("deal-add")}
                className="shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center opacity-60 hover:opacity-90 transition-opacity"
                title="Scan card"
              >
                <Camera size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] opacity-40 mb-1">Market price</div>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs opacity-40">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="w-full border rounded-lg pl-6 pr-3 py-2 text-sm bg-background font-mono"
                    placeholder="0.00"
                    value={dealAddMarket}
                    onChange={(e) => setDealAddMarket(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <div className="text-[10px] opacity-40 mb-1">Condition</div>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                  value={dealAddCondition}
                  onChange={(e) => setDealAddCondition(e.target.value)}
                >
                  {CONDITIONS_LIST.map((c) => <option key={c} value={c}>{COND_ABBREV[c] ?? c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="text-[10px] opacity-40 mb-1">Grade (optional)</div>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                placeholder="e.g. PSA 9, BGS 9.5"
                value={dealAddGrade}
                onChange={(e) => setDealAddGrade(e.target.value)}
              />
            </div>

            {/* Cert lookup toggle */}
            <button
              onClick={() => setDealCertOpen((v) => !v)}
              className="text-[10px] opacity-40 hover:opacity-70 transition-opacity"
            >
              {dealCertOpen ? "▲ Hide cert lookup" : "▼ Lookup cert #"}
            </button>
            {dealCertOpen && (
              <CertLookupWidget
                embedded
                onResult={(r) => {
                  setDealAddName(r.name);
                  setDealAddGrade(`${r.company} ${r.gradeLabel ?? ""} ${r.grade}`.trim());
                  if (r.market != null) setDealAddMarket(r.market.toFixed(2));
                }}
              />
            )}

            <button
              onClick={handleDealAddCard}
              disabled={!dealAddName.trim()}
              className="w-full py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-30 transition-opacity"
              style={{ background: "var(--accent-primary)" }}
            >
              + Add Card
            </button>
          </div>

          {dealCards.length > 0 && (
            <button
              onClick={() => setDealStep("quote")}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: "var(--accent-primary)" }}
            >
              Review {dealCards.length} card{dealCards.length !== 1 ? "s" : ""} →
            </button>
          )}
        </div>
      )}

      {/* ── STEP 2: QUOTE ── */}
      {dealStep === "quote" && (
        <div className="space-y-4">
          {/* Percentage controls */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded-xl p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase opacity-40">Cash %</div>
              <div className="flex flex-wrap gap-1">
                {[60, 65, 70, 75, 80].map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setDealCashPct(p);
                      setDealCards((prev) => prev.map((c) => ({
                        ...c,
                        buyPrice: c.marketPrice != null ? parseFloat((c.marketPrice * p / 100).toFixed(2)) : c.buyPrice,
                      })));
                    }}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      dealCashPct === p ? "text-white border-transparent" : "opacity-40"
                    }`}
                    style={dealCashPct === p ? { background: "var(--accent-primary)", borderColor: "var(--accent-primary)" } : undefined}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
            <div className="border rounded-xl p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase opacity-40">Trade %</div>
              <div className="flex flex-wrap gap-1">
                {[75, 80, 85, 90, 95].map((p) => (
                  <button
                    key={p}
                    onClick={() => setDealTradePct(p)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      dealTradePct === p ? "text-white border-transparent" : "opacity-40"
                    }`}
                    style={dealTradePct === p ? { background: "#8b5cf6", borderColor: "#8b5cf6" } : undefined}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cards with disposition selectors */}
          <div className="space-y-2">
            {dealCards.map((card) => {
              const cashOffer = card.buyPrice ?? (card.marketPrice != null ? parseFloat((card.marketPrice * dealCashPct / 100).toFixed(2)) : null);
              const tradeOffer = card.marketPrice != null ? parseFloat((card.marketPrice * dealTradePct / 100).toFixed(2)) : null;
              return (
                <div key={card._id} className="border rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {card.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.image_url} alt="" className="w-8 h-11 rounded object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{card.name}</div>
                      <div className="text-[10px] opacity-40 truncate">{[card.grade, card.condition].filter(Boolean).join(" · ")}</div>
                      {card.marketPrice != null && (
                        <div className="text-xs opacity-50 mt-0.5">Mkt {money(card.marketPrice)}</div>
                      )}
                    </div>
                  </div>

                  {/* Disposition + price */}
                  <div className="flex items-center gap-2">
                    {(["cash", "trade", "undecided"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => handleDealSetDisposition(card._id, d)}
                        className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg border transition-colors ${
                          card.disposition === d ? "text-white border-transparent" : "opacity-30 hover:opacity-60"
                        }`}
                        style={card.disposition === d
                          ? { background: d === "cash" ? "#f59e0b" : d === "trade" ? "#8b5cf6" : "#71717a" }
                          : undefined}
                      >
                        {d === "undecided" ? "?" : d}
                      </button>
                    ))}
                    <div className="flex-1" />
                    {card.disposition !== "undecided" && (
                      <div className="relative shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-40">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          className="w-20 border rounded-lg pl-5 pr-2 py-1 text-xs font-mono text-right bg-background"
                          value={card.disposition === "cash" ? (cashOffer?.toFixed(2) ?? "") : (tradeOffer?.toFixed(2) ?? "")}
                          onChange={(e) => handleDealSetBuyPrice(card._id, e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {dealCards.length > 0 && (
            <div className="border rounded-xl p-3 space-y-1.5">
              {cashCards.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="opacity-60">{cashCards.length} card{cashCards.length !== 1 ? "s" : ""} · cash</span>
                  <span className="font-semibold text-amber-400">{money(cashTotal)}</span>
                </div>
              )}
              {tradeCards.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="opacity-60">{tradeCards.length} card{tradeCards.length !== 1 ? "s" : ""} · trade credit</span>
                  <span className="font-semibold text-violet-400">{money(tradeTotal)}</span>
                </div>
              )}
              {undecidedCards.length > 0 && (
                <div className="text-xs opacity-40">{undecidedCards.length} card{undecidedCards.length !== 1 ? "s" : ""} not yet assigned</div>
              )}
              {totalOffer > 0 && (
                <div className="flex justify-between text-sm font-bold border-t pt-1.5">
                  <span>Total offer</span>
                  <span>{money(totalOffer)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setDealStep("evaluate")}
              className="px-4 py-2.5 rounded-xl text-sm border opacity-50 hover:opacity-80 transition-opacity"
            >
              ← Back
            </button>
            <button
              onClick={() => setDealStep("fulfill")}
              disabled={dealCards.length === 0 || undecidedCards.length === dealCards.length}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30"
              style={{ background: "var(--accent-primary)" }}
            >
              Proceed to Fulfill →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: FULFILL ── */}
      {dealStep === "fulfill" && (
        <div className="space-y-4">
          {/* Summary of what we owe */}
          <div className="border rounded-xl p-3 space-y-1.5">
            <div className="text-[10px] font-bold uppercase opacity-40 mb-1">Deal Summary</div>
            {cashCards.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="opacity-60">Cash to pay</span>
                <span className="font-semibold text-amber-400">{money(cashTotal)}</span>
              </div>
            )}
            {tradeCards.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="opacity-60">Trade credit</span>
                <span className="font-semibold text-violet-400">{money(tradeTotal)}</span>
              </div>
            )}
          </div>

          {/* Trade credit — pick from inventory */}
          {tradeCards.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold opacity-60">Pick items to trade out</div>
                <button
                  onClick={() => setScannerOpen("deal-inventory")}
                  className="flex items-center gap-1 text-[10px] opacity-50 hover:opacity-80 border rounded-lg px-2 py-1 transition-opacity"
                >
                  <Camera size={11} /> Scan
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  className="flex-1 border rounded-xl px-3 py-2 text-sm bg-background"
                  placeholder="Search inventory…"
                  value={dealInventoryQuery}
                  onChange={(e) => setDealInventoryQuery(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <div className="flex gap-1 flex-1 flex-wrap">
                  {(["all", "single", "slab", "sealed"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setDealInventoryFilter(f)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                        dealInventoryFilter === f ? "text-white" : "border opacity-40"
                      }`}
                      style={dealInventoryFilter === f ? { background: "var(--accent-primary)" } : undefined}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <select className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background" value={dealSortBy} onChange={(e) => setDealSortBy(e.target.value as SortBy)}>
                  <option value="name">Name A–Z</option>
                  <option value="price-high">Price ↑</option>
                  <option value="price-low">Price ↓</option>
                  <option value="recent">Recently Added</option>
                </select>
                <select className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background" value={dealPriceRange} onChange={(e) => setDealPriceRange(e.target.value as PriceRange)}>
                  <option value="all">All Prices</option>
                  <option value="under25">Under $25</option>
                  <option value="25to100">$25–$100</option>
                  <option value="100to500">$100–$500</option>
                  <option value="over500">$500+</option>
                </select>
              </div>

              {!tradeInventoryLoaded ? (
                <div className="text-xs opacity-40 text-center py-4">Loading inventory…</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {dealInventoryDisplay.slice(0, SHOW_COUNT).map((item) => {
                    const selected = dealTradeSelections.some((s) => s.item.id === item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (selected) {
                            setDealTradeSelections((prev) => prev.filter((s) => s.item.id !== item.id));
                          } else {
                            setDealTradeSelections((prev) => [...prev, {
                              item,
                              tradeValue: item.sticker_price != null ? item.sticker_price.toFixed(2) : item.market != null ? item.market.toFixed(2) : "",
                            }]);
                          }
                        }}
                        className={`relative flex flex-col rounded-xl overflow-hidden text-left transition-all border-2 ${
                          selected ? "border-violet-500 shadow-sm shadow-violet-500/20" : "border-border/40"
                        }`}
                      >
                        <div className="relative w-full aspect-[3/4] bg-muted overflow-hidden">
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center opacity-20 text-[10px] font-bold uppercase text-center px-1">{item.category}</div>
                          )}
                          {item.grade && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                              <div className="text-[8px] font-bold text-white text-center truncate">{item.grade}</div>
                            </div>
                          )}
                          {selected && (
                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center">
                              <span className="text-white text-[8px] font-bold">✓</span>
                            </div>
                          )}
                        </div>
                        <div className="px-1.5 pt-1 pb-1.5 bg-background">
                          <div className="text-[9px] font-medium leading-tight truncate">
                            <HighlightTerms text={item.name} terms={dealInventoryTerms} />
                          </div>
                          <div className="text-[9px] opacity-50 mt-0.5">
                            {item.sticker_price != null ? money(item.sticker_price) : item.market != null ? money(item.market) : "—"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {dealInventoryDisplay.length > 12 && (
                <button
                  onClick={() => setDealInventoryShowMore((v) => !v)}
                  className="w-full text-xs opacity-40 hover:opacity-70 py-2"
                >
                  {dealInventoryShowMore ? "Show less" : `Show ${dealInventoryDisplay.length - 12} more…`}
                </button>
              )}

              {/* Selected trade-out items */}
              {dealTradeSelections.length > 0 && (
                <div className="border rounded-xl p-3 space-y-2">
                  <div className="text-[10px] font-bold uppercase opacity-40">Going out</div>
                  {dealTradeSelections.map((sel) => (
                    <div key={sel.item.id} className="flex items-center gap-2">
                      <div className="w-7 h-10 rounded overflow-hidden bg-muted shrink-0">
                        {sel.item.image_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={sel.item.image_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-[7px] opacity-20 font-bold uppercase">{sel.item.category}</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{sel.item.name}</div>
                        <div className="text-[10px] opacity-40 truncate">{sel.item.grade ?? sel.item.condition}</div>
                      </div>
                      <div className="relative shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-40">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          className="w-20 border rounded-lg pl-5 pr-2 py-1 text-xs font-mono text-right bg-background"
                          value={sel.tradeValue}
                          onChange={(e) => setDealTradeSelections((prev) =>
                            prev.map((s) => s.item.id === sel.item.id ? { ...s, tradeValue: e.target.value } : s)
                          )}
                          placeholder="0.00"
                        />
                      </div>
                      <button
                        onClick={() => setDealTradeSelections((prev) => prev.filter((s) => s.item.id !== sel.item.id))}
                        className="text-xs opacity-30 hover:opacity-60 shrink-0"
                      >✕</button>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs opacity-60 pt-1 border-t">
                    <span>Trade-out value</span>
                    <span className="font-semibold">
                      {money(dealTradeSelections.reduce((s, g) => s + (parseFloat(g.tradeValue) || (g.item.market ?? 0)), 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setDealStep("quote")}
              className="px-4 py-2.5 rounded-xl text-sm border opacity-50 hover:opacity-80 transition-opacity"
            >
              ← Back
            </button>
            <button
              onClick={handleCompleteDeal}
              disabled={busy || dealCards.length === 0 || undecidedCards.length === dealCards.length}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30"
              style={{ background: "var(--accent-primary)" }}
            >
              {busy ? "Recording…" : `Complete Deal · ${money(totalOffer)}`}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: COMPLETE ── */}
      {dealStep === "complete" && (
        <div className="space-y-4 text-center">
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
            style={{ background: "rgba(34,197,94,0.15)" }}
          >
            <Handshake size={28} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-lg font-bold">Deal done!</div>
            {dealCompleteSummary && (
              <div className="text-sm opacity-60 mt-1 space-y-0.5">
                {dealCompleteSummary.cashOut > 0 && <div>Cash paid: {money(dealCompleteSummary.cashOut)}</div>}
                {dealCompleteSummary.tradeValue > 0 && <div>Trade credit: {money(dealCompleteSummary.tradeValue)}</div>}
              </div>
            )}
          </div>
          <button
            onClick={handleDealReset}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--accent-primary)" }}
          >
            New Deal
          </button>
        </div>
      )}
    </div>
  );
}

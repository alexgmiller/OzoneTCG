"use client";

import { Trophy, CreditCard, Folder, Clock, ChevronDown } from "lucide-react";
import type { SlabPrice, RawCardPrice } from "../InventoryServer";
import { makeSlabPriceKey, parseGrade } from "@/lib/ebay-client";
import { makeRawCardPriceKey, priceForCondition } from "@/lib/justtcg";
import { type FMVResult } from "@/lib/fmv";
import type { Category, SortKey, ConsignerOption, Item } from "../types";
import {
  fmt, effectiveCost, getMovement, MovementBadge, sealedTypeLabel,
  buildSlabEbayQuery, buildRawEbayQuery, categoryColors, gradeStyle, isSlabTierStale,
} from "../utils";

export default function InventoryListView({
  items,
  displayedSlabs,
  displayedRawCards,
  displayedSealed,
  sort,
  setSort,
  selectedIds,
  toggleSelect,
  consignerMap,
  mergedSlabPrices,
  mergedRawCardPrices,
  slabFMVData,
  slabRefreshing,
  slabRateLimited,
  rawCardRefreshing,
  sealedRefreshing,
  priceFlash,
  slabsCollapsed,
  setSlabsCollapsed,
  rawCollapsed,
  setRawCollapsed,
  sealedCollapsed,
  setSealedCollapsed,
  inlineAskId,
  inlineAskVal,
  setInlineAskId,
  setInlineAskVal,
  inlineCostId,
  inlineCostVal,
  setInlineCostId,
  setInlineCostVal,
  handleSaveInlineAsk,
  handleSaveInlineCost,
  handleRefreshSlabPrice,
  handleRefreshRawCardPrice,
  handleRefreshSealedPrice,
  openRawCardModal,
  setPricingDetailItem,
  setSoldExpanded,
  setMobileDetailItem,
  openEdit,
  openAddPreset,
  busy,
}: {
  items: Item[];
  displayedSlabs: Item[];
  displayedRawCards: Item[];
  displayedSealed: Item[];
  sort: SortKey;
  setSort: (v: SortKey) => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  consignerMap: Map<string, ConsignerOption>;
  mergedSlabPrices: Record<string, SlabPrice>;
  mergedRawCardPrices: Record<string, RawCardPrice>;
  slabFMVData: Record<string, FMVResult>;
  slabRefreshing: Record<string, boolean>;
  slabRateLimited: Record<string, boolean>;
  rawCardRefreshing: Record<string, boolean>;
  sealedRefreshing: Record<string, boolean>;
  priceFlash: Record<string, "up" | "down">;
  slabsCollapsed: boolean;
  setSlabsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  rawCollapsed: boolean;
  setRawCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  sealedCollapsed: boolean;
  setSealedCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  inlineAskId: string | null;
  inlineAskVal: string;
  setInlineAskId: (v: string | null) => void;
  setInlineAskVal: (v: string) => void;
  inlineCostId: string | null;
  inlineCostVal: string;
  setInlineCostId: (v: string | null) => void;
  setInlineCostVal: (v: string) => void;
  handleSaveInlineAsk: (id: string) => void;
  handleSaveInlineCost: (id: string) => void;
  handleRefreshSlabPrice: (it: Item) => void;
  handleRefreshRawCardPrice: (it: Item) => void;
  handleRefreshSealedPrice: (it: Item) => void;
  openRawCardModal: (it: Item) => void;
  setPricingDetailItem: (v: { item: Item; slabKey: string } | null) => void;
  setSoldExpanded: (v: boolean) => void;
  setMobileDetailItem: (v: Item | null) => void;
  openEdit: (it: Item) => void;
  openAddPreset: (category: Category) => void;
  busy: boolean;
}) {
  return (
    <div className="divide-y">
      {/* Column headers */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-background border-b text-[11px] font-semibold uppercase tracking-wider opacity-40 select-none sticky top-0 z-10">
        <div className="w-4 flex-shrink-0" />
        <div className="w-[60px] flex-shrink-0" />
        <button className="flex-1 text-left flex items-center gap-1 hover:opacity-100 transition-opacity" onClick={() => setSort(sort === "name-asc" ? "name-desc" : "name-asc")}>
          Name {sort === "name-asc" ? "↑" : sort === "name-desc" ? "↓" : ""}
        </button>
        <button className="w-36 text-right flex items-center justify-end gap-1 hover:opacity-100 transition-opacity" onClick={() => setSort(sort === "fmv-asc" ? "fmv-desc" : "fmv-asc")}>
          Suggested {sort === "fmv-asc" ? "↑" : sort === "fmv-desc" ? "↓" : ""}
        </button>
        <div className="w-[88px] text-right flex-shrink-0">My Ask</div>
        <button className="w-[100px] text-right flex items-center justify-end gap-1 hover:opacity-100 transition-opacity" onClick={() => setSort(sort === "cost-asc" ? "cost-desc" : "cost-asc")}>
          Cost {sort === "cost-asc" ? "↑" : sort === "cost-desc" ? "↓" : ""}
        </button>
        <button className="w-[100px] text-right flex items-center justify-end gap-1 hover:opacity-100 transition-opacity" onClick={() => setSort(sort === "margin-asc" ? "margin-desc" : "margin-asc")}>
          Margin {sort === "margin-asc" ? "↑" : sort === "margin-desc" ? "↓" : ""}
        </button>
        <button className="w-[72px] text-right flex items-center justify-end gap-1 hover:opacity-100 transition-opacity" onClick={() => setSort(sort === "movement-asc" ? "movement-desc" : "movement-asc")}>
          Move {sort === "movement-asc" ? "↑" : sort === "movement-desc" ? "↓" : ""}
        </button>
        <div className="w-[60px] flex-shrink-0" />
      </div>
      {/* Slabs section */}
      <>
        <button
          className="section-header-slab w-full px-3 py-2 border-b border-purple-500/10 flex items-center gap-2 hover:bg-purple-500/10 transition-colors duration-150 text-left cursor-pointer"
          onClick={() => setSlabsCollapsed((v) => !v)}
        >
          <ChevronDown size={13} className={`text-purple-400/60 flex-shrink-0 transition-transform duration-200 pointer-events-none ${slabsCollapsed ? "-rotate-90" : ""}`} />
          <Trophy size={13} className="text-purple-400 flex-shrink-0 pointer-events-none" />
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-purple-400 inv-label pointer-events-none">Slabs</span>
          <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold tabular-nums shadow-[0_0_6px_1px_rgb(167_139_250/0.2)] pointer-events-none">{displayedSlabs.length}</span>
        </button>
        {!slabsCollapsed && (displayedSlabs.length === 0 ? (
          <div className="px-3 py-8 text-center space-y-2">
            <div className="flex justify-center opacity-25"><Trophy size={28} /></div>
            {items.some((i) => i.category === "slab" && i.status !== "grading") ? (
              <div className="text-xs opacity-40">No slabs match your filters</div>
            ) : (
              <>
                <div className="text-xs opacity-40">No slabs yet</div>
                <button
                  className="text-xs px-3 py-1.5 rounded-lg border font-medium border-purple-300 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors"
                  onClick={() => openAddPreset("slab")}
                >
                  + Add Slab
                </button>
              </>
            )}
          </div>
        ) : displayedSlabs.map((it) => {
          const isSelected = selectedIds.has(it.id);
          const consigner = it.consigner_id ? consignerMap.get(it.consigner_id) : null;
          const parsed = it.grade ? parseGrade(it.grade) : null;
          const slabKey = parsed ? makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade) : null;
          const sp = slabKey ? mergedSlabPrices[slabKey] : null;
          const fmv = slabFMVData[it.id]?.fmv ?? it.market;
          const isRefreshing = slabRefreshing[it.id];
          const isRateLimited = slabRateLimited[it.id];
          const isStale = isSlabTierStale(sp, fmv);
          // suggested = eBay cache; ask = user's saved price; margin against effective price
          const suggested = slabFMVData[it.id]?.fmv ?? null;
          const askPrice = it.market;
          const isCustomAsk = askPrice != null && askPrice !== suggested;
          const effectivePrice = askPrice ?? suggested;
          const ec = effectiveCost(it);
          const marginAmtEff = effectivePrice != null && ec != null && ec > 0 ? effectivePrice - ec : null;
          const marginPctEff = effectivePrice != null && ec != null && ec > 0 ? ((effectivePrice - ec) / ec) * 100 : null;
          const ebayQ = buildSlabEbayQuery(it.name, it.grade, it.set_name, it.card_number);
          const ebayEnc = encodeURIComponent(ebayQ);
          return (
            <div
              key={it.id}
              className={`relative inv-row inv-row-slab flex items-center gap-2 px-3 py-2.5 cursor-pointer ${isSelected ? "bg-green-500/8 dark:bg-green-500/10" : ""} ${consigner ? "border-l-2 border-l-amber-500/60" : ""}`}
              onClick={() => toggleSelect(it.id)}
            >
              {/* Mobile tap target — opens detail sheet instead of selecting */}
              <button className="md:hidden absolute inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMobileDetailItem(it); }} />
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 accent-green-600 flex-shrink-0" />
              <div className="flex-shrink-0 w-[60px]">
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image_url} alt={it.name} className={`card-thumb object-cover ${(() => { const n = it.grade ? parseFloat(it.grade.replace(/[^0-9.]/g, "")) : 0; return n >= 9 ? "card-thumb-gold" : ""; })()}`} />
                ) : (
                  <div className="card-thumb-placeholder flex items-center justify-center"><span className="text-[10px] opacity-30">?</span></div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="inv-card-name">{it.name}</div>
                {(it.set_name || it.card_number) && (
                  <div className="inv-card-meta">{[it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ")}</div>
                )}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {it.grade && <span className={gradeStyle(it.grade)}>{it.grade}</span>}
                    {consigner ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">{consigner.name}</span>
                    ) : it.owner !== "shared" ? (
                      <span className="text-[11px] opacity-40 border rounded px-1 py-0.5">{it.owner}</span>
                    ) : null}
                  </div>
                  {/* Mobile-only price — shown inline with grade badge */}
                  <div className={`md:hidden flex items-center gap-1 flex-shrink-0${isRefreshing ? " price-refreshing" : ""}`}>
                    <span className="text-sm font-semibold inv-price">{fmv != null ? fmt(fmv) : "—"}</span>
                    <MovementBadge pct={getMovement(fmv ?? it.market, it.acquired_market_price)} />
                  </div>
                </div>
              </div>
              {/* Suggested price (eBay FMV) — desktop only */}
              <div className="hidden md:block flex-shrink-0 w-36 text-right">
                {isRefreshing ? (
                  <div className="flex justify-end"><span className="text-base spin opacity-50 inline-block price-refreshing">↻</span></div>
                ) : isRateLimited ? (
                  <button className="text-xs text-orange-500 underline" onClick={(e) => { e.stopPropagation(); handleRefreshSlabPrice(it); }}>Rate limited</button>
                ) : !sp ? (
                  <button className="text-xs px-2 py-1 rounded-lg border font-medium border-purple-300 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/20 whitespace-nowrap" onClick={(e) => { e.stopPropagation(); handleRefreshSlabPrice(it); }}>Get Price</button>
                ) : (
                  <div>
                    <div className="flex items-center justify-end gap-1">
                      <button className={`inv-price-display ${isStale ? "opacity-40 hover:opacity-75" : ""} ${fmv != null && fmv >= 200 ? "price-high-value" : ""}`} onClick={(e) => { e.stopPropagation(); setPricingDetailItem({ item: it, slabKey: slabKey! }); setSoldExpanded(false); }}>
                        {fmv != null ? fmt(fmv) : "—"}{isStale ? <Clock size={11} className="inline ml-0.5 opacity-60" /> : null}
                      </button>
                      <button className={`transition-opacity text-[14px] ${isRefreshing ? "opacity-50 spin" : "opacity-30 hover:opacity-70"}`} title="Refresh price from eBay" onClick={(e) => { e.stopPropagation(); handleRefreshSlabPrice(it); }}>↺</button>
                    </div>
                    <div className="inv-price-source">{isStale ? "eBay · stale" : `eBay${sp.sold_count > 0 ? ` · ${sp.sold_count} sold${sp.sold_count < 3 ? " ⚠" : ""}` : ""}`}</div>
                    <div className="flex justify-end gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                      <a href={`https://www.ebay.com/sch/i.html?_nkw=${ebayEnc}&LH_Complete=1&LH_Sold=1&_sacat=183454`} target="_blank" rel="noopener noreferrer" className="row-link-btn">Sold ↗</a>
                      <a href={`https://www.ebay.com/sch/i.html?_nkw=${ebayEnc}&_sacat=183454`} target="_blank" rel="noopener noreferrer" className="row-link-btn">List ↗</a>
                    </div>
                  </div>
                )}
              </div>
              {/* My Ask */}
              <div className="hidden md:flex flex-shrink-0 w-[88px] justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {isCustomAsk && <div className="ask-custom-dot" title="Custom price set" />}
                {inlineAskId === it.id ? (
                  <input
                    autoFocus
                    className={isCustomAsk ? "ask-custom" : "ask-auto"}
                    value={inlineAskVal}
                    inputMode="decimal"
                    onChange={(e) => setInlineAskVal(e.target.value)}
                    onBlur={() => handleSaveInlineAsk(it.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveInlineAsk(it.id); if (e.key === "Escape") { setInlineAskId(null); setInlineAskVal(""); } }}
                  />
                ) : (
                  <button
                    className={isCustomAsk ? "ask-custom" : "ask-auto"}
                    onClick={() => { setInlineAskId(it.id); setInlineAskVal(askPrice?.toFixed(2) ?? suggested?.toFixed(2) ?? ""); }}
                  >
                    {askPrice != null ? fmt(askPrice) : suggested != null ? fmt(suggested) : "—"}
                  </button>
                )}
              </div>
              {/* Cost */}
              <div className="hidden md:block flex-shrink-0 w-[100px] text-right">
                {inlineCostId === it.id ? (
                  <input
                    autoFocus
                    className="w-20 border rounded px-1 py-0.5 text-xs text-right bg-background inv-price"
                    value={inlineCostVal}
                    inputMode="decimal"
                    onChange={(e) => setInlineCostVal(e.target.value)}
                    onBlur={() => handleSaveInlineCost(it.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveInlineCost(it.id); if (e.key === "Escape") setInlineCostId(null); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : ec != null ? (
                  <span className="inv-price text-sm opacity-70" title={it.cost_basis != null ? `Trade chain cost basis` : undefined}>{fmt(ec)}{it.cost_basis != null && <span className="text-[9px] opacity-40 ml-0.5">cb</span>}</span>
                ) : (
                  <button className="cost-ghost-btn" onClick={(e) => { e.stopPropagation(); setInlineCostId(it.id); setInlineCostVal(""); }}>+ add cost</button>
                )}
              </div>
              {/* Margin — against ask price */}
              <div className="hidden md:block flex-shrink-0 w-[100px] text-right text-xs font-medium inv-price">
                {marginAmtEff != null && marginPctEff != null ? (
                  <span className={marginPctEff >= 0 ? "margin-positive" : "margin-negative"}>
                    {marginPctEff >= 0 ? "+" : ""}{fmt(marginAmtEff)} <span className="opacity-70">({marginPctEff >= 0 ? "+" : ""}{marginPctEff.toFixed(0)}%)</span>
                  </span>
                ) : <span className="opacity-30">—</span>}
                {it.acquisition_type && (
                  <div className="mt-0.5 flex items-center justify-end gap-1">
                    <span
                      className={`text-[9px] px-1 py-0.5 rounded font-bold font-mono ${it.acquisition_type === "trade" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-blue-500/15 text-blue-600 dark:text-blue-400"}`}
                      title={it.acquisition_type === "trade" ? `Trade chain depth ${it.chain_depth}${it.original_cash_invested != null ? `, orig. cash: $${it.original_cash_invested.toFixed(2)}` : ""}` : `Bought at ${it.buy_percentage != null ? it.buy_percentage + "%" : "custom price"}`}
                    >
                      {it.acquisition_type === "trade" ? `T${it.chain_depth > 0 ? it.chain_depth : ""}` : "B"}
                    </span>
                  </div>
                )}
              </div>
              {/* Movement — desktop only */}
              <div className="hidden md:flex flex-shrink-0 w-[72px] justify-end items-center">
                <MovementBadge pct={getMovement(fmv ?? it.market, it.acquired_market_price)} />
              </div>
              <div className="hidden md:flex flex-shrink-0 w-[60px] justify-end">
                <button className="text-xs px-2 py-1.5 rounded-lg border font-medium hover:bg-muted transition-colors duration-150" onClick={(e) => { e.stopPropagation(); openEdit(it); }} disabled={busy}>Edit</button>
              </div>
            </div>
          );
        }))}
      </>
      {/* Raw Cards section */}
      <>
        <button
          className="section-header-raw w-full px-3 py-2 border-b border-blue-500/10 flex items-center gap-2 hover:bg-blue-500/10 transition-colors duration-150 text-left cursor-pointer"
          onClick={() => setRawCollapsed((v) => !v)}
        >
          <ChevronDown size={13} className={`text-blue-400/60 flex-shrink-0 transition-transform duration-200 pointer-events-none ${rawCollapsed ? "-rotate-90" : ""}`} />
          <CreditCard size={13} className="text-blue-400 flex-shrink-0 pointer-events-none" />
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue-400 inv-label pointer-events-none">Raw Cards</span>
          <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold tabular-nums shadow-[0_0_6px_1px_rgb(96_165_250/0.2)] pointer-events-none">{displayedRawCards.length}</span>
        </button>
        {!rawCollapsed && (displayedRawCards.length === 0 ? (
          <div className="px-3 py-8 text-center space-y-2">
            <div className="flex justify-center opacity-25"><CreditCard size={28} /></div>
            {items.some((i) => i.category === "single" && i.status !== "grading") ? (
              <div className="text-xs opacity-40">No singles match your filters</div>
            ) : (
              <>
                <div className="text-xs opacity-40">No singles yet</div>
                <button
                  className="text-xs px-3 py-1.5 rounded-lg border font-medium border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                  onClick={() => openAddPreset("single")}
                >
                  + Add Single
                </button>
              </>
            )}
          </div>
        ) : displayedRawCards.map((it) => {
          const isSelected = selectedIds.has(it.id);
          const consigner = it.consigner_id ? consignerMap.get(it.consigner_id) : null;
          const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
          const rcp = mergedRawCardPrices[rawKey];
          const condPrice = rcp
            ? priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, it.condition)
            : null;
          // suggested = TCGPlayer cache; ask = user's saved price; margin against effective price
          const suggested = condPrice;
          const askPrice = it.market;
          const isCustomAsk = askPrice != null && askPrice !== suggested;
          const effectivePrice = askPrice ?? suggested;
          const ecRaw = effectiveCost(it);
          const marginAmt = effectivePrice != null && ecRaw != null && ecRaw > 0 ? effectivePrice - ecRaw : null;
          const marginPct = effectivePrice != null && ecRaw != null && ecRaw > 0 ? ((effectivePrice - ecRaw) / ecRaw) * 100 : null;
          const isRawRefreshing = rawCardRefreshing[it.id];
          const rawEbayQ = buildRawEbayQuery(it.name, it.set_name, it.card_number);
          const rawEbayEnc = encodeURIComponent(rawEbayQ);
          const cleanNameRaw = it.name.replace(/\b(JP|JPN|EN|ENG|Japanese|English)\b\s*/gi, "").trim();
          const tcgQ = encodeURIComponent([cleanNameRaw, it.set_name].filter(Boolean).join(" "));
          return (
            <div
              key={it.id}
              className={`relative inv-row inv-row-raw flex items-center gap-2 px-3 py-2.5 cursor-pointer ${isSelected ? "bg-green-500/8 dark:bg-green-500/10" : ""} ${consigner ? "border-l-2 border-l-amber-500/60" : ""}`}
              onClick={() => toggleSelect(it.id)}
            >
              {/* Mobile tap target — opens detail sheet instead of selecting */}
              <button className="md:hidden absolute inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMobileDetailItem(it); }} />
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 accent-green-600 flex-shrink-0" />
              <div className="flex-shrink-0 w-[60px]">
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image_url} alt={it.name} className="card-thumb object-cover" />
                ) : (
                  <div className="card-thumb-placeholder flex items-center justify-center"><span className="text-[10px] opacity-30">?</span></div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="inv-card-name">{it.name}</div>
                {(it.set_name || it.card_number) && (
                  <div className="inv-card-meta">{[it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ")}</div>
                )}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {it.category === "single" && it.condition && (
                      <span className={`condition-badge ${{ "Near Mint": "cond-nm", "Lightly Played": "cond-lp", "Moderately Played": "cond-mp", "Heavily Played": "cond-hp", "Damaged": "cond-dmg" }[it.condition] ?? "cond-nm"}`}>
                        {{ "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", "Damaged": "Dmg" }[it.condition] ?? it.condition}
                      </span>
                    )}
                    {it.category !== "single" && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${categoryColors[it.category]}`}>{it.category}</span>}
                    {consigner ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">{consigner.name}</span>
                    ) : it.owner !== "shared" ? (
                      <span className="text-[11px] opacity-40 border rounded px-1 py-0.5">{it.owner}</span>
                    ) : null}
                  </div>
                  {/* Mobile-only price */}
                  <div className={`md:hidden flex items-center gap-1 flex-shrink-0${isRawRefreshing ? " price-refreshing" : ""}`}>
                    <span className="text-sm font-semibold inv-price">{condPrice != null ? fmt(condPrice) : it.market != null ? fmt(it.market) : "—"}</span>
                    <MovementBadge pct={getMovement(condPrice ?? it.market, it.acquired_market_price)} />
                  </div>
                </div>
              </div>
              {/* Suggested price (TCGPlayer) — desktop only */}
              <div className="hidden md:block flex-shrink-0 w-36 text-right">
                {isRawRefreshing ? (
                  <div className="flex justify-end"><span className="text-base spin opacity-50 inline-block">↻</span></div>
                ) : !rcp ? (
                  <button
                    className="text-xs px-2 py-1 rounded-lg border font-medium border-blue-400/40 text-blue-400 hover:bg-blue-500/10 whitespace-nowrap transition-colors"
                    onClick={(e) => { e.stopPropagation(); handleRefreshRawCardPrice(it); }}
                  >Get Price</button>
                ) : (
                  <div>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className={`inv-price-display ${suggested != null && suggested >= 200 ? "price-high-value" : ""} ${priceFlash[it.id] === "up" ? "price-flash-up" : priceFlash[it.id] === "down" ? "price-flash-down" : ""}`}
                        onClick={(e) => { e.stopPropagation(); openRawCardModal(it); }}
                      >{fmt(suggested)}</button>
                      <button className={`transition-opacity text-[14px] ${isRawRefreshing ? "opacity-50 spin" : "opacity-30 hover:opacity-70"}`} title="Refresh price from TCGPlayer" onClick={(e) => { e.stopPropagation(); handleRefreshRawCardPrice(it); }}>↺</button>
                    </div>
                    <div className="inv-price-source">TCGPlayer</div>
                    <div className="flex justify-end gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                      <a href={`https://www.ebay.com/sch/i.html?_nkw=${rawEbayEnc}&LH_Complete=1&LH_Sold=1&_sacat=183454`} target="_blank" rel="noopener noreferrer" className="row-link-btn">Sold ↗</a>
                      <a href={`https://www.ebay.com/sch/i.html?_nkw=${rawEbayEnc}&_sacat=183454`} target="_blank" rel="noopener noreferrer" className="row-link-btn">List ↗</a>
                      <a href={`https://www.tcgplayer.com/search/pokemon/product?q=${tcgQ}&view=grid`} target="_blank" rel="noopener noreferrer" className="row-link-btn">TCG ↗</a>
                    </div>
                  </div>
                )}
              </div>
              {/* My Ask */}
              <div className="hidden md:flex flex-shrink-0 w-[88px] justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {isCustomAsk && <div className="ask-custom-dot" title="Custom price set" />}
                {inlineAskId === it.id ? (
                  <input
                    autoFocus
                    className={isCustomAsk ? "ask-custom" : "ask-auto"}
                    value={inlineAskVal}
                    inputMode="decimal"
                    onChange={(e) => setInlineAskVal(e.target.value)}
                    onBlur={() => handleSaveInlineAsk(it.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveInlineAsk(it.id); if (e.key === "Escape") { setInlineAskId(null); setInlineAskVal(""); } }}
                  />
                ) : (
                  <button
                    className={isCustomAsk ? "ask-custom" : "ask-auto"}
                    onClick={() => { setInlineAskId(it.id); setInlineAskVal(askPrice?.toFixed(2) ?? suggested?.toFixed(2) ?? ""); }}
                  >
                    {askPrice != null ? fmt(askPrice) : suggested != null ? fmt(suggested) : "—"}
                  </button>
                )}
              </div>
              {/* Cost */}
              <div className="hidden md:block flex-shrink-0 w-[100px] text-right">
                {inlineCostId === it.id ? (
                  <input
                    autoFocus
                    className="w-20 border rounded px-1 py-0.5 text-xs text-right bg-background inv-price"
                    value={inlineCostVal}
                    inputMode="decimal"
                    onChange={(e) => setInlineCostVal(e.target.value)}
                    onBlur={() => handleSaveInlineCost(it.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveInlineCost(it.id); if (e.key === "Escape") setInlineCostId(null); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : ecRaw != null ? (
                  <span className="inv-price text-sm opacity-70" title={it.cost_basis != null ? `Trade chain cost basis` : undefined}>{fmt(ecRaw)}{it.cost_basis != null && <span className="text-[9px] opacity-40 ml-0.5">cb</span>}</span>
                ) : (
                  <button className="cost-ghost-btn" onClick={(e) => { e.stopPropagation(); setInlineCostId(it.id); setInlineCostVal(""); }}>+ add cost</button>
                )}
              </div>
              {/* Margin — against ask/effective price */}
              <div className="hidden md:block flex-shrink-0 w-[100px] text-right text-xs font-medium inv-price">
                {marginAmt != null && marginPct != null ? (
                  <span className={marginPct >= 0 ? "margin-positive" : "margin-negative"}>
                    {marginPct >= 0 ? "+" : ""}{fmt(marginAmt)} <span className="opacity-70">({marginPct >= 0 ? "+" : ""}{marginPct.toFixed(0)}%)</span>
                  </span>
                ) : <span className="opacity-30">—</span>}
                {it.acquisition_type && (
                  <div className="mt-0.5 flex items-center justify-end gap-1">
                    <span
                      className={`text-[9px] px-1 py-0.5 rounded font-bold font-mono ${it.acquisition_type === "trade" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-blue-500/15 text-blue-600 dark:text-blue-400"}`}
                      title={it.acquisition_type === "trade" ? `Trade chain depth ${it.chain_depth}${it.original_cash_invested != null ? `, orig. cash: $${it.original_cash_invested.toFixed(2)}` : ""}` : `Bought at ${it.buy_percentage != null ? it.buy_percentage + "%" : "custom price"}`}
                    >
                      {it.acquisition_type === "trade" ? `T${it.chain_depth > 0 ? it.chain_depth : ""}` : "B"}
                    </span>
                  </div>
                )}
              </div>
              {/* Movement — desktop only */}
              <div className="hidden md:flex flex-shrink-0 w-[72px] justify-end items-center">
                <MovementBadge pct={getMovement(effectivePrice, it.acquired_market_price)} />
              </div>
              <div className="hidden md:flex flex-shrink-0 w-[60px] justify-end">
                <button className="text-xs px-2 py-1.5 rounded-lg border font-medium hover:bg-muted transition-colors duration-150" onClick={(e) => { e.stopPropagation(); openEdit(it); }} disabled={busy}>Edit</button>
              </div>
            </div>
          );
        }))}
      </>

      {/* Sealed section */}
      <>
        <button
          className="w-full px-3 py-2 border-b border-teal-500/10 flex items-center gap-2 hover:bg-teal-500/10 transition-colors duration-150 text-left cursor-pointer"
          onClick={() => setSealedCollapsed((v) => !v)}
        >
          <ChevronDown size={13} className={`text-teal-400/60 flex-shrink-0 transition-transform duration-200 pointer-events-none ${sealedCollapsed ? "-rotate-90" : ""}`} />
          <Folder size={13} className="text-teal-400 flex-shrink-0 pointer-events-none" />
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-teal-400 inv-label pointer-events-none">Sealed</span>
          <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full font-bold tabular-nums shadow-[0_0_6px_1px_rgb(45_212_191/0.2)] pointer-events-none">{displayedSealed.length}</span>
        </button>
        {!sealedCollapsed && (displayedSealed.length === 0 ? (
          <div className="px-3 py-8 text-center space-y-2">
            <div className="flex justify-center opacity-25"><Folder size={28} /></div>
            {items.some((i) => i.category === "sealed" && i.status !== "grading") ? (
              <div className="text-xs opacity-40">No sealed products match your filters</div>
            ) : (
              <>
                <div className="text-xs opacity-40">No sealed products yet</div>
                <button
                  className="text-xs px-3 py-1.5 rounded-lg border font-medium border-teal-300 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors"
                  onClick={() => openAddPreset("sealed")}
                >
                  + Add Sealed Product
                </button>
              </>
            )}
          </div>
        ) : displayedSealed.map((it) => {
          const isSelected = selectedIds.has(it.id);
          const consigner = it.consigner_id ? consignerMap.get(it.consigner_id) : null;
          const price = it.market;
          const askPrice = it.market;
          const isSealedRefreshing = sealedRefreshing[it.id];
          const ebayQ = encodeURIComponent([it.name, it.set_name].filter(Boolean).join(" "));
          const ecSealed = effectiveCost(it);
          const marginAmt = askPrice != null && ecSealed != null && ecSealed > 0 ? askPrice - ecSealed : null;
          const marginPct = askPrice != null && ecSealed != null && ecSealed > 0 ? ((askPrice - ecSealed) / ecSealed) * 100 : null;
          return (
            <div
              key={it.id}
              className={`relative inv-row flex items-center gap-2 px-3 py-2.5 cursor-pointer ${isSelected ? "bg-green-500/8 dark:bg-green-500/10" : ""} ${consigner ? "border-l-2 border-l-amber-500/60" : ""}`}
              onClick={() => toggleSelect(it.id)}
            >
              <button className="md:hidden absolute inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMobileDetailItem(it); }} />
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 accent-green-600 flex-shrink-0" />
              <div className="flex-shrink-0 w-[60px]">
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image_url} alt={it.name} className="card-thumb object-cover" />
                ) : (
                  <div className="card-thumb-placeholder flex items-center justify-center"><span className="text-[10px] opacity-30">PKG</span></div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="inv-card-name">{it.name}</div>
                {it.set_name && <div className="inv-card-meta">{it.set_name}</div>}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400 font-medium">{sealedTypeLabel(it.product_type)}</span>
                    {it.quantity > 1 && <span className="text-[10px] opacity-50">×{it.quantity}</span>}
                    {it.language !== "english" && <span className="text-[10px] opacity-40 border rounded px-1 py-0.5 capitalize">{it.language}</span>}
                    {consigner ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">{consigner.name}</span>
                    ) : it.owner !== "shared" ? (
                      <span className="text-[11px] opacity-40 border rounded px-1 py-0.5">{it.owner}</span>
                    ) : null}
                  </div>
                  {/* Mobile-only price */}
                  <div className={`md:hidden flex items-center gap-1 flex-shrink-0${isSealedRefreshing ? " price-refreshing" : ""}`}>
                    <span className="text-sm font-semibold inv-price">{price != null ? fmt(price) : "—"}</span>
                  </div>
                </div>
              </div>
              {/* Suggested price — desktop only */}
              <div className="hidden md:block flex-shrink-0 w-36 text-right">
                {isSealedRefreshing ? (
                  <div className="flex justify-end"><span className="text-base spin opacity-50 inline-block">↻</span></div>
                ) : price == null ? (
                  <button
                    className="text-xs px-2 py-1 rounded-lg border font-medium border-teal-400/40 text-teal-400 hover:bg-teal-500/10 whitespace-nowrap transition-colors"
                    onClick={(e) => { e.stopPropagation(); handleRefreshSealedPrice(it); }}
                  >Get Price</button>
                ) : (
                  <div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="inv-price-display">{fmt(price)}</span>
                      <button className={`transition-opacity text-[14px] ${isSealedRefreshing ? "opacity-50 spin" : "opacity-30 hover:opacity-70"}`} title="Refresh price" onClick={(e) => { e.stopPropagation(); handleRefreshSealedPrice(it); }}>↺</button>
                    </div>
                    <div className="inv-price-source">eBay / PPT</div>
                    <div className="flex justify-end gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                      <a href={`https://www.ebay.com/sch/i.html?_nkw=${ebayQ}&LH_Complete=1&LH_Sold=1&_sacat=183454`} target="_blank" rel="noopener noreferrer" className="row-link-btn">Sold ↗</a>
                      <a href={`https://www.ebay.com/sch/i.html?_nkw=${ebayQ}&_sacat=183454`} target="_blank" rel="noopener noreferrer" className="row-link-btn">List ↗</a>
                    </div>
                  </div>
                )}
              </div>
              {/* My Ask */}
              <div className="hidden md:flex flex-shrink-0 w-[88px] justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {inlineAskId === it.id ? (
                  <input
                    autoFocus
                    className="ask-auto"
                    value={inlineAskVal}
                    inputMode="decimal"
                    onChange={(e) => setInlineAskVal(e.target.value)}
                    onBlur={() => handleSaveInlineAsk(it.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveInlineAsk(it.id); if (e.key === "Escape") { setInlineAskId(null); setInlineAskVal(""); } }}
                  />
                ) : (
                  <button
                    className="ask-auto"
                    onClick={() => { setInlineAskId(it.id); setInlineAskVal(askPrice?.toFixed(2) ?? ""); }}
                  >
                    {askPrice != null ? fmt(askPrice) : "—"}
                  </button>
                )}
              </div>
              {/* Cost */}
              <div className="hidden md:block flex-shrink-0 w-[100px] text-right">
                {inlineCostId === it.id ? (
                  <input
                    autoFocus
                    className="w-20 border rounded px-1 py-0.5 text-xs text-right bg-background inv-price"
                    value={inlineCostVal}
                    inputMode="decimal"
                    onChange={(e) => setInlineCostVal(e.target.value)}
                    onBlur={() => handleSaveInlineCost(it.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveInlineCost(it.id); if (e.key === "Escape") setInlineCostId(null); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : ecSealed != null ? (
                  <span className="inv-price text-sm opacity-70" title={it.cost_basis != null ? `Trade chain cost basis` : undefined}>{fmt(ecSealed)}{it.cost_basis != null && <span className="text-[9px] opacity-40 ml-0.5">cb</span>}</span>
                ) : (
                  <button className="cost-ghost-btn" onClick={(e) => { e.stopPropagation(); setInlineCostId(it.id); setInlineCostVal(""); }}>+ add cost</button>
                )}
              </div>
              {/* Margin */}
              <div className="hidden md:block flex-shrink-0 w-[100px] text-right text-xs font-medium inv-price">
                {marginAmt != null && marginPct != null ? (
                  <span className={marginPct >= 0 ? "margin-positive" : "margin-negative"}>
                    {marginPct >= 0 ? "+" : ""}{fmt(marginAmt)} <span className="opacity-70">({marginPct >= 0 ? "+" : ""}{marginPct.toFixed(0)}%)</span>
                  </span>
                ) : <span className="opacity-30">—</span>}
              </div>
              {/* Movement */}
              <div className="hidden md:flex flex-shrink-0 w-[72px] justify-end items-center">
                <MovementBadge pct={getMovement(price, it.acquired_market_price)} />
              </div>
              <div className="hidden md:flex flex-shrink-0 w-[60px] justify-end">
                <button className="text-xs px-2 py-1.5 rounded-lg border font-medium hover:bg-muted transition-colors duration-150" onClick={(e) => { e.stopPropagation(); openEdit(it); }} disabled={busy}>Edit</button>
              </div>
            </div>
          );
        }))}
      </>
    </div>
  );
}

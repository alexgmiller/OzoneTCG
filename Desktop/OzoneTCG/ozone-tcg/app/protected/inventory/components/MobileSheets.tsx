"use client";

import type { SlabPrice, RawCardPrice } from "../InventoryServer";
import { makeSlabPriceKey, parseGrade } from "@/lib/ebay-client";
import { makeRawCardPriceKey, priceForCondition } from "@/lib/justtcg";
import { type FMVResult } from "@/lib/fmv";
import type { Category, Owner, Status, SortKey, ConsignerOption, Item } from "../types";
import { fmt, effectiveCost, gradeStyle, sealedTypeLabel, buildSlabEbayQuery, buildRawEbayQuery } from "../utils";

/* ── Mobile Detail Modal ── */
export function MobileDetailModal({
  mobileDetailItem,
  setMobileDetailItem,
  mergedSlabPrices,
  mergedRawCardPrices,
  slabFMVData,
  slabRefreshing,
  rawCardRefreshing,
  sealedRefreshing,
  inlineCostId,
  inlineCostVal,
  setInlineCostId,
  setInlineCostVal,
  handleSaveInlineCost,
  handleRefreshSlabPrice,
  handleRefreshSealedPrice,
  handleRefreshRawCardPrice,
  setPricingDetailItem,
  setSoldExpanded,
  openEdit,
  toggleSelect,
}: {
  mobileDetailItem: Item;
  setMobileDetailItem: (v: Item | null) => void;
  mergedSlabPrices: Record<string, SlabPrice>;
  mergedRawCardPrices: Record<string, RawCardPrice>;
  slabFMVData: Record<string, FMVResult>;
  slabRefreshing: Record<string, boolean>;
  rawCardRefreshing: Record<string, boolean>;
  sealedRefreshing: Record<string, boolean>;
  inlineCostId: string | null;
  inlineCostVal: string;
  setInlineCostId: (v: string | null) => void;
  setInlineCostVal: (v: string) => void;
  handleSaveInlineCost: (id: string) => void;
  handleRefreshSlabPrice: (it: Item) => void;
  handleRefreshSealedPrice: (it: Item) => void;
  handleRefreshRawCardPrice: (it: Item) => void;
  setPricingDetailItem: (v: { item: Item; slabKey: string } | null) => void;
  setSoldExpanded: (v: boolean) => void;
  openEdit: (it: Item) => void;
  toggleSelect: (id: string) => void;
}) {
  const it = mobileDetailItem;
  const parsed = it.grade ? parseGrade(it.grade) : null;
  const slabKey = parsed ? makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade) : null;
  const sp = slabKey ? mergedSlabPrices[slabKey] : null;
  const fmv = it.category === "slab" ? (slabFMVData[it.id]?.fmv ?? it.market) : it.market;
  const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
  const rcp = it.category === "single" ? mergedRawCardPrices[rawKey] : null;
  const condPrice = rcp ? priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, it.condition) : null;
  const displayPrice = it.category === "slab" ? fmv : it.category === "sealed" ? it.market : (condPrice ?? it.market);
  const priceSource = it.category === "slab" ? "eBay" : it.category === "sealed" ? (it.market != null ? "eBay/PPT" : null) : (rcp ? "TCGPlayer" : null);
  const ecDetail = effectiveCost(it);
  const margin = displayPrice != null && ecDetail != null && ecDetail > 0 ? displayPrice - ecDetail : null;
  const marginPct = margin != null && ecDetail != null && ecDetail > 0 ? (margin / ecDetail) * 100 : null;
  const ebayQ = it.category === "slab"
    ? buildSlabEbayQuery(it.name, it.grade, it.set_name, it.card_number)
    : it.category === "sealed"
      ? [it.name, it.set_name].filter(Boolean).join(" ")
      : buildRawEbayQuery(it.name, it.set_name, it.card_number);
  const ebayEnc = encodeURIComponent(ebayQ);
  const cleanName = it.name.replace(/\b(JP|JPN|EN|ENG|Japanese|English)\b\s*/gi, "").trim();
  const tcgQ = encodeURIComponent([cleanName, it.set_name].filter(Boolean).join(" "));
  const isRefreshingSlab = slabRefreshing[it.id];
  const isRefreshingRaw = rawCardRefreshing[it.id];
  return (
    <div
      className="md:hidden fixed inset-0 z-[60] flex items-center justify-center modal-backdrop px-5"
      onClick={(e) => { if (e.target === e.currentTarget) setMobileDetailItem(null); }}
    >
      {/* Modal card */}
      <div className="modal-panel w-full max-w-sm max-h-[80vh] overflow-y-auto">

        {/* Close button */}
        <button
          onClick={() => setMobileDetailItem(null)}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:text-foreground transition-colors text-sm"
        >✕</button>

        {/* Card image — centered, generous */}
        <div className="flex justify-center pt-5 pb-3 px-6">
          {it.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.image_url} alt={it.name} className="w-32 h-auto rounded-xl object-contain shadow-md" />
          ) : (
            <div className="w-32 h-44 rounded-xl bg-muted flex items-center justify-center text-2xl opacity-20">?</div>
          )}
        </div>

        {/* Name + meta */}
        <div className="px-4 pb-3 text-center">
          <div className="font-bold text-base leading-snug">{it.name}</div>
          {(it.set_name || it.card_number) && (
            <div className="text-[13px] opacity-50 mt-0.5">{[it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ")}</div>
          )}
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            {it.grade && <span className={gradeStyle(it.grade)}>{it.grade}</span>}
            {it.category === "sealed" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400 font-medium">{sealedTypeLabel(it.product_type)}</span>
            )}
            {it.category === "single" && it.condition && (
              <span className={`condition-badge ${{ "Near Mint": "cond-nm", "Lightly Played": "cond-lp", "Moderately Played": "cond-mp", "Heavily Played": "cond-hp", "Damaged": "cond-dmg" }[it.condition] ?? "cond-nm"}`}>
                {{ "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", "Damaged": "Dmg" }[it.condition] ?? it.condition}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-border/50 mx-4" />

        {/* Price section */}
        <div className="px-4 py-3 space-y-2">
          {/* FMV / Market */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] uppercase tracking-wide opacity-40 font-semibold">{it.category === "slab" ? "FMV" : "Market"}</span>
              {priceSource && <span className="text-[10px] opacity-30 ml-1.5">{priceSource}{it.category === "slab" && sp?.sold_count != null ? ` · ${sp.sold_count} sold` : ""}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold inv-price">{displayPrice != null ? fmt(displayPrice) : "—"}</span>
              <button
                className="text-sm opacity-30 hover:opacity-70 transition-opacity"
                title="Refresh price"
                onClick={() => it.category === "slab" ? handleRefreshSlabPrice(it) : it.category === "sealed" ? handleRefreshSealedPrice(it) : handleRefreshRawCardPrice(it)}
              >
                {(isRefreshingSlab || isRefreshingRaw || sealedRefreshing[it.id]) ? <span className="inline-block spin">↻</span> : "↺"}
              </button>
            </div>
          </div>

          {/* Cost */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide opacity-40 font-semibold">Cost</span>
            {inlineCostId === it.id ? (
              <input
                autoFocus
                className="w-24 border rounded-lg px-2 py-1 text-sm text-right bg-background inv-price"
                value={inlineCostVal}
                inputMode="decimal"
                onChange={(e) => setInlineCostVal(e.target.value)}
                onBlur={() => handleSaveInlineCost(it.id)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveInlineCost(it.id); if (e.key === "Escape") setInlineCostId(null); }}
              />
            ) : ecDetail != null ? (
              <div className="flex flex-col items-end">
                <button
                  className="text-sm font-semibold inv-price opacity-70"
                  onClick={() => { setInlineCostId(it.id); setInlineCostVal(String(it.cost ?? "")); }}
                >{fmt(ecDetail)}</button>
                {it.cost_basis != null && (
                  <span className="text-[10px] opacity-40">trade chain</span>
                )}
              </div>
            ) : (
              <button
                className="text-sm text-violet-400 hover:text-violet-300"
                onClick={() => { setInlineCostId(it.id); setInlineCostVal(""); }}
              >+ add cost</button>
            )}
          </div>

          {/* Margin */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide opacity-40 font-semibold">Margin</span>
            {margin != null && marginPct != null ? (
              <span className={`text-sm font-semibold inv-price ${margin >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {margin >= 0 ? "+" : ""}{fmt(margin)} <span className="opacity-60 text-xs">({marginPct >= 0 ? "+" : ""}{marginPct.toFixed(0)}%)</span>
              </span>
            ) : <span className="text-sm opacity-30">—</span>}
          </div>
        </div>

        <div className="border-t border-border/50 mx-4" />

        {/* Links — full-width rows */}
        <div className="px-4 py-3 space-y-1">
          <a
            href={`https://www.ebay.com/sch/i.html?_nkw=${ebayEnc}&LH_Complete=1&LH_Sold=1&_sacat=183454`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between w-full px-3 py-3 rounded-xl hover:bg-muted/50 transition-colors text-sm font-medium min-h-[44px]"
          >
            <span>eBay Sold</span>
            <span className="opacity-40 text-base">→</span>
          </a>
          <a
            href={`https://www.ebay.com/sch/i.html?_nkw=${ebayEnc}&_sacat=183454`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between w-full px-3 py-3 rounded-xl hover:bg-muted/50 transition-colors text-sm font-medium min-h-[44px]"
          >
            <span>eBay Listed</span>
            <span className="opacity-40 text-base">→</span>
          </a>
          {it.category !== "slab" && (
            <a
              href={`https://www.tcgplayer.com/search/pokemon/product?q=${tcgQ}&view=grid`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between w-full px-3 py-3 rounded-xl hover:bg-muted/50 transition-colors text-sm font-medium min-h-[44px]"
            >
              <span>TCGPlayer</span>
              <span className="opacity-40 text-base">→</span>
            </a>
          )}
        </div>

        <div className="border-t border-border/50 mx-4" />

        {/* Actions */}
        <div className="px-4 py-3 pb-5 space-y-2">
          {it.category === "slab" && slabKey && (
            <button
              className="w-full py-3 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400 text-sm font-semibold min-h-[44px] transition-colors hover:bg-purple-500/20"
              onClick={() => { setMobileDetailItem(null); setPricingDetailItem({ item: it, slabKey: slabKey! }); setSoldExpanded(false); }}
            >View Comps</button>
          )}
          <div className="flex gap-2">
            <button
              className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold min-h-[44px] transition-colors"
              onClick={() => { setMobileDetailItem(null); openEdit(it); }}
            >Edit</button>
            <button
              className="flex-1 py-3 rounded-xl border border-border text-sm font-medium min-h-[44px] hover:bg-muted transition-colors"
              onClick={() => { setMobileDetailItem(null); toggleSelect(it.id); }}
            >Select</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mobile Filter Bottom Sheet ── */
export function MobileFilterSheet({
  setMobileFilterOpen,
  search,
  setSearch,
  filterCategory,
  setFilterCategory,
  filterStatus,
  setFilterStatus,
  filterOwner,
  setFilterOwner,
  filterConsigner,
  setFilterConsigner,
  sort,
  setSort,
  consigners,
  isFiltered,
}: {
  setMobileFilterOpen: (v: boolean) => void;
  search: string;
  setSearch: (v: string) => void;
  filterCategory: Category | "all";
  setFilterCategory: (v: Category | "all") => void;
  filterStatus: Status | "all";
  setFilterStatus: (v: Status | "all") => void;
  filterOwner: Owner | "all";
  setFilterOwner: (v: Owner | "all") => void;
  filterConsigner: string;
  setFilterConsigner: (v: string) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  consigners: ConsignerOption[];
  isFiltered: boolean;
}) {
  return (
    <div
      className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) setMobileFilterOpen(false); }}
    >
      {/* Sheet */}
      <div className="modal-panel rounded-t-2xl px-4 pt-3 pb-10 space-y-3 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-border mx-auto mb-2" />
        {/* Title row */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Search &amp; Filter</span>
          <button
            onClick={() => setMobileFilterOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground text-sm"
          >✕</button>
        </div>
        {/* Search input */}
        <input
          className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {/* Filter dropdowns */}
        <div className="grid grid-cols-2 gap-2">
          <select className="border rounded-lg px-3 py-2.5 text-sm bg-background" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as Category | "all")}>
            <option value="all">All types</option>
            <option value="single">Singles</option>
            <option value="slab">Slabs</option>
            <option value="sealed">Sealed</option>
          </select>
          <select className="border rounded-lg px-3 py-2.5 text-sm bg-background" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as Status | "all")}>
            <option value="all">All statuses</option>
            <option value="inventory">Inventory</option>
          </select>
          <select className="border rounded-lg px-3 py-2.5 text-sm bg-background" value={filterOwner} onChange={(e) => setFilterOwner(e.target.value as Owner | "all")}>
            <option value="all">All owners</option>
            <option value="alex">Alex</option>
            <option value="mila">Mila</option>
            <option value="shared">Shared</option>
          </select>
          {consigners.length > 0 && (
            <select className="border rounded-lg px-3 py-2.5 text-sm bg-background" value={filterConsigner} onChange={(e) => setFilterConsigner(e.target.value)}>
              <option value="all">All consigners</option>
              <option value="none">Own inventory</option>
              {consigners.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <select className="border rounded-lg px-3 py-2.5 text-sm bg-background" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="name-asc">Name A→Z</option>
            <option value="name-desc">Name Z→A</option>
            <option value="market-desc">Market ↓</option>
            <option value="market-asc">Market ↑</option>
            <option value="cost-desc">Cost ↓</option>
            <option value="cost-asc">Cost ↑</option>
          </select>
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          {isFiltered ? (
            <button
              className="text-xs underline opacity-60"
              onClick={() => { setSearch(""); setFilterCategory("all"); setFilterStatus("all"); setFilterOwner("all"); setFilterConsigner("all"); }}
            >
              Clear filters
            </button>
          ) : <span />}
          <button
            className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold min-h-[44px]"
            onClick={() => setMobileFilterOpen(false)}
          >Done</button>
        </div>
      </div>
    </div>
  );
}

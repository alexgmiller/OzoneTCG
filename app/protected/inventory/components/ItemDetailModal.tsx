"use client";

import { RefreshCw } from "lucide-react";
import { Badge, Button, Input, Modal, MoneyDisplay } from "@/components/ui";
import type { SlabPrice, RawCardPrice } from "../InventoryServer";
import { makeRawCardPriceKey } from "@/lib/justtcg";
import { type FMVResult } from "@/lib/fmv";
import type { ConsignerOption, Item } from "../types";
import {
  effectiveCost, fmt, fmtDate, getMovement, MovementBadge, sealedTypeLabel, conditionShort, statusLabel, setLine,
  slabKeyFor, rawConditionPrice, ebayLinks,
} from "../utils";

// ── Item Detail Modal ──
// Opens when a row is tapped. Shows price, cost, margin, external links and actions.
// Sold rows show the sale price and realised profit instead of live market + refresh.
export function ItemDetailModal({
  item: it,
  consigner,
  selected,
  onClose,
  mergedSlabPrices,
  mergedRawCardPrices,
  slabFMVData,
  refreshing,
  inlineCostId,
  inlineCostVal,
  setInlineCostId,
  setInlineCostVal,
  handleSaveInlineCost,
  handleRefresh,
  openSlabComps,
  openRawCardModal,
  openEdit,
  toggleSelect,
}: {
  item: Item;
  consigner: ConsignerOption | null;
  selected: boolean;
  onClose: () => void;
  mergedSlabPrices: Record<string, SlabPrice>;
  mergedRawCardPrices: Record<string, RawCardPrice>;
  slabFMVData: Record<string, FMVResult>;
  refreshing: boolean;
  inlineCostId: string | null;
  inlineCostVal: string;
  setInlineCostId: (v: string | null) => void;
  setInlineCostVal: (v: string) => void;
  handleSaveInlineCost: (id: string) => void;
  handleRefresh: (it: Item) => void;
  openSlabComps: (it: Item, slabKey: string) => void;
  openRawCardModal: (it: Item) => void;
  openEdit: (it: Item) => void;
  toggleSelect: (id: string) => void;
}) {
  const slabKey = slabKeyFor(it);
  const sp = slabKey ? mergedSlabPrices[slabKey] : null;
  const rcp = it.category === "single" ? mergedRawCardPrices[makeRawCardPriceKey(it.name, it.set_name, it.card_number)] : null;
  const condPrice = rawConditionPrice(rcp, it.condition);
  const sold = it.status === "sold";
  const marketPrice = it.category === "slab" ? (slabFMVData[it.id]?.fmv ?? it.market) : it.category === "sealed" ? it.market : (condPrice ?? it.market);
  const displayPrice = sold ? it.sold_price ?? null : marketPrice;
  const priceLabel = sold ? "Sold for" : it.category === "slab" ? "FMV" : "Market";
  const priceSource = it.category === "slab" ? "eBay" : it.category === "sealed" ? (it.market != null ? "eBay/PPT" : null) : (rcp ? "TCGPlayer" : null);
  const priceMeta = sold
    ? (it.sold_at ? fmtDate(it.sold_at) : null)
    : priceSource ? `${priceSource}${it.category === "slab" && sp?.sold_count != null ? ` · ${sp.sold_count} sold` : ""}` : null;
  const cost = effectiveCost(it);
  const margin = displayPrice != null && cost != null && cost > 0 ? displayPrice - cost : null;
  const marginPct = margin != null && cost != null && cost > 0 ? (margin / cost) * 100 : null;
  const links = ebayLinks(it);
  const linkClass = "flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted";

  return (
    <Modal open onClose={onClose} className="max-h-full overflow-y-auto">
      {/* ── Image + identity ── */}
      <div className="flex gap-4">
        <div className="w-24 shrink-0">
          {it.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.image_url} alt={it.name} className="h-auto w-full rounded-lg object-contain" />
          ) : (
            <div className="flex aspect-card w-full items-center justify-center rounded-lg bg-muted text-xl text-muted-foreground">?</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold leading-snug text-foreground">{it.name}</div>
          {setLine(it) && <div className="mt-0.5 text-sm text-muted-foreground">{setLine(it)}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {it.grade && <Badge tone="accent">{it.grade}</Badge>}
            {it.category === "single" && it.condition && <Badge>{conditionShort(it.condition)}</Badge>}
            {it.category === "sealed" && <Badge>{sealedTypeLabel(it.product_type)}{it.quantity > 1 ? ` ×${it.quantity}` : ""}</Badge>}
            <Badge tone={sold ? "positive" : it.owner === "consigner" ? "warning" : "neutral"}>{statusLabel(it)}{consigner ? ` · ${consigner.name}` : ""}</Badge>
          </div>
        </div>
      </div>

      {/* ── Prices ── */}
      <div className="mt-4 space-y-2 border-t border-border pt-4">
        <div className="flex min-h-11 items-center justify-between">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-neutral">{priceLabel}</span>
            {priceMeta && <span className="ml-2 text-xs text-muted-foreground">{priceMeta}</span>}
          </div>
          <div className="flex items-center gap-2">
            {displayPrice != null ? <MoneyDisplay amount={displayPrice} tone={sold ? "positive" : "neutral"} className="text-lg font-bold" /> : <span className="text-lg text-muted-foreground">—</span>}
            {!sold && (
              <>
                <MovementBadge pct={getMovement(displayPrice, it.acquired_market_price)} />
                <Button variant="ghost" size="icon" title="Refresh price" aria-label="Refresh price" onClick={() => handleRefresh(it)} loading={refreshing}>
                  <RefreshCw size={16} />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex min-h-11 items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-neutral">Cost</span>
          {inlineCostId === it.id ? (
            <Input
              autoFocus
              className="w-28 text-right tabular-nums"
              value={inlineCostVal}
              inputMode="decimal"
              onChange={(e) => setInlineCostVal(e.target.value)}
              onBlur={() => handleSaveInlineCost(it.id)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveInlineCost(it.id); if (e.key === "Escape") setInlineCostId(null); }}
            />
          ) : cost != null ? (
            <button type="button" className="flex h-11 flex-col items-end justify-center" onClick={() => { setInlineCostId(it.id); setInlineCostVal(String(it.cost ?? "")); }}>
              <MoneyDisplay amount={cost} tone="neutral" className="text-sm font-semibold" />
              {it.cost_basis != null && <span className="text-xs text-muted-foreground">trade chain</span>}
            </button>
          ) : (
            <Button variant="link" className="h-11" onClick={() => { setInlineCostId(it.id); setInlineCostVal(""); }}>+ add cost</Button>
          )}
        </div>

        <div className="flex min-h-11 items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-neutral">{sold ? "Profit" : "Margin"}</span>
          {margin != null && marginPct != null ? (
            <span className="flex items-baseline gap-1">
              <MoneyDisplay amount={margin} showSign className="text-sm font-semibold" />
              <span className="text-xs text-muted-foreground tabular-nums">({marginPct >= 0 ? "+" : ""}{marginPct.toFixed(0)}%)</span>
            </span>
          ) : <span className="text-sm text-muted-foreground">—</span>}
        </div>
        {it.sticker_price != null && (
          <div className="flex min-h-11 items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-neutral">Sticker</span>
            <span className="text-sm text-muted-foreground tabular-nums">{fmt(it.sticker_price)}</span>
          </div>
        )}
      </div>

      {/* ── Links ── */}
      <div className="mt-2 space-y-1 border-t border-border pt-2">
        <a href={links.sold} target="_blank" rel="noopener noreferrer" className={linkClass}><span>eBay Sold</span><span className="text-muted-foreground">→</span></a>
        <a href={links.listed} target="_blank" rel="noopener noreferrer" className={linkClass}><span>eBay Listed</span><span className="text-muted-foreground">→</span></a>
        {it.category !== "slab" && (
          <a href={links.tcg} target="_blank" rel="noopener noreferrer" className={linkClass}><span>TCGPlayer</span><span className="text-muted-foreground">→</span></a>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="mt-2 space-y-2 border-t border-border pt-4">
        {it.category === "slab" && slabKey && (
          <Button variant="outline" className="w-full" onClick={() => { onClose(); openSlabComps(it, slabKey); }}>View comps</Button>
        )}
        {it.category === "single" && (
          <Button variant="outline" className="w-full" onClick={() => { onClose(); openRawCardModal(it); }}>Price history</Button>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => { onClose(); openEdit(it); }}>Edit</Button>
          <Button variant="outline" className="flex-1" onClick={() => { onClose(); toggleSelect(it.id); }}>{selected ? "Deselect" : "Select"}</Button>
        </div>
      </div>
    </Modal>
  );
}

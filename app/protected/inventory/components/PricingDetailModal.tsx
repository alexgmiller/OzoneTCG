"use client";

import { Modal, MoneyDisplay } from "@/components/ui";
import type { SlabPrice } from "../InventoryServer";
import { type SlabSale } from "@/lib/ebay-client";
import { type FMVResult } from "@/lib/fmv";
import type { Item } from "../types";
import { fmt, fmtDate, getMovement, MovementBadge, isSlabTierStale, setLine, btnOutline, pillClass, pillWarning } from "../utils";

// ── Helpers ──
function pct(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const frac = idx - lo;
  return frac === 0 ? sorted[lo] : sorted[lo] * (1 - frac) + sorted[lo + 1] * frac;
}

function applyOutlierFilter(items: SlabSale[]): SlabSale[] {
  if (items.length < 4) return items;
  const sorted = items.map((s) => s.price).sort((a, b) => a - b);
  const q1 = pct(sorted, 0.25);
  const q3 = pct(sorted, 0.75);
  const iqr = q3 - q1;
  const filtered = items.filter((s) => s.price >= q1 - 1.5 * iqr && s.price <= q3 + 1.5 * iqr);
  return filtered.length > 0 ? filtered : items;
}

function timeLeft(endDateStr: string): string {
  if (!endDateStr) return "";
  const ms = new Date(endDateStr).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  if (ms < 60 * 60 * 1000) return "Ending soon";
  const totalHours = Math.floor(ms / (60 * 60 * 1000));
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (totalHours < 24) return `${totalHours}h ${mins}m left`;
  return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h left`;
}

function hasOpt(s: SlabSale, opt: string) {
  return (s.buyingOptions ?? []).includes(opt);
}

// ── Listing row ──
function ListingRow({ s, left, right }: { s: SlabSale; left: React.ReactNode; right: React.ReactNode }) {
  return (
    <a
      href={s.itemUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex min-h-11 items-center justify-between gap-3 border-t border-border px-2 py-2 transition-colors duration-150 ${s.itemUrl ? "hover:bg-muted" : "cursor-default"}`}
      onClick={s.itemUrl ? undefined : (e) => e.preventDefault()}
    >
      <div className="flex min-w-0 items-center gap-2">{left}</div>
      <div className="flex shrink-0 flex-col items-end">{right}</div>
    </a>
  );
}

// ── Pricing Detail Modal (slab comps) ──
export function PricingDetailModal({
  pricingDetailItem,
  mergedSlabPrices,
  slabRefreshing,
  slabFMVData,
  soldExpanded,
  setSoldExpanded,
  activeExpanded,
  setActiveExpanded,
  setPricingDetailItem,
  handleRefreshSlabPrice,
}: {
  pricingDetailItem: { item: Item; slabKey: string };
  mergedSlabPrices: Record<string, SlabPrice>;
  slabRefreshing: Record<string, boolean>;
  slabFMVData: Record<string, FMVResult>;
  soldExpanded: boolean;
  setSoldExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  activeExpanded: boolean;
  setActiveExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setPricingDetailItem: (v: { item: Item; slabKey: string } | null) => void;
  handleRefreshSlabPrice: (it: Item) => void;
}) {
  const { item: pdi, slabKey } = pricingDetailItem;
  // Derive live from merged prices so background updates show immediately
  const pdSp = mergedSlabPrices[slabKey];
  const isModalRefreshing = slabRefreshing[pdi.id];
  const fmvData = slabFMVData[pdi.id] ?? null;
  const fmvVal = fmvData?.fmv ?? null;

  // Sold: drop Best-Offer-only sales (negotiated price unknown). Active: any listing > $1.
  const validSold = (pdSp?.sold_items ?? []).filter((s) => !(s.buyingOptions.length === 1 && s.buyingOptions[0] === "BEST_OFFER") && s.price > 1);
  const soldLists = applyOutlierFilter(validSold).sort((a, b) => new Date(b.soldDate).getTime() - new Date(a.soldDate).getTime());
  const validActive = (pdSp?.active_items ?? []).filter((s) => s.price > 1);
  const activeLists = applyOutlierFilter(validActive).sort((a, b) => a.price - b.price);

  const soldTypesVary = soldLists.some((s) => hasOpt(s, "AUCTION")) || soldLists.some((s) => hasOpt(s, "BEST_OFFER") && !hasOpt(s, "AUCTION"));
  const soldPrices = soldLists.map((s) => s.price);
  const activePrices = activeLists.map((s) => s.price);
  const range = (xs: number[]) => (xs.length && Math.min(...xs) !== Math.max(...xs) ? `${fmt(Math.min(...xs))} – ${fmt(Math.max(...xs))}` : null);
  const soldCompCount = pdSp?.sold_count ?? soldLists.length;
  const close = () => setPricingDetailItem(null);

  return (
    <Modal open onClose={close} className="max-w-lg max-h-full overflow-y-auto">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div className="flex min-w-0 flex-1 gap-3">
          {pdi.image_url && (
            <div className="w-14 shrink-0 self-start overflow-hidden rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pdi.image_url} alt={pdi.name} className="h-auto w-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight text-foreground">{pdi.name}</div>
            {setLine(pdi) && <div className="mt-0.5 text-xs text-muted-foreground">{setLine(pdi)}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {pdi.grade && <span className={pillClass}>{pdi.grade}</span>}
              {fmvVal != null ? (
                <div className="flex items-baseline gap-2">
                  <MoneyDisplay amount={fmvVal} tone="neutral" className="text-base font-bold" />
                  <span className="text-xs text-muted-foreground">{fmvData?.mode ?? "—"}</span>
                  <MovementBadge pct={getMovement(fmvVal, pdi.acquired_market_price)} />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No price data</span>
              )}
            </div>
            {(fmvData?.soldAnchor != null || fmvData?.listedAnchor != null) && (
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                {fmvData.soldAnchor != null && `Sold: ${fmt(fmvData.soldAnchor)} (${fmvData.soldCount})`}
                {fmvData.soldAnchor != null && fmvData.listedAnchor != null && " · "}
                {fmvData.listedAnchor != null && `Listed: ${fmt(fmvData.listedAnchor)} (${fmvData.activeCount} active)`}
              </div>
            )}
            {pdi.acquired_market_price != null && (
              <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                Acquired at {fmt(pdi.acquired_market_price)}{pdi.acquired_date ? ` · ${fmtDate(pdi.acquired_date)}` : ""}
              </div>
            )}
          </div>
        </div>
        <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" onClick={close} aria-label="Close">✕</button>
      </div>

      {/* ── Recent sales ── */}
      <div className="py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-neutral">Recent sales · {soldCompCount}</div>
          {range(soldPrices) && <div className="text-xs text-muted-foreground tabular-nums">{range(soldPrices)}</div>}
        </div>
        {soldLists.length === 0 ? (
          <div className="py-3 text-center text-sm text-muted-foreground">
            {isModalRefreshing ? "Fetching…" : pdSp?.sold_items != null ? "Sold data unavailable — Marketplace Insights API access required" : "No sold data — hit Refresh to load"}
          </div>
        ) : (
          <div>
            {soldLists.slice(0, soldExpanded ? soldLists.length : 5).map((s, i) => (
              <ListingRow
                key={i}
                s={s}
                left={
                  <>
                    {soldTypesVary && hasOpt(s, "AUCTION") && <span className={pillClass}>Auction</span>}
                    {soldTypesVary && hasOpt(s, "BEST_OFFER") && !hasOpt(s, "AUCTION") && <span className={pillWarning}>Offer</span>}
                    <span className="truncate text-xs text-muted-foreground">{s.title}</span>
                  </>
                }
                right={
                  <>
                    <MoneyDisplay amount={s.price} tone="neutral" className="text-sm font-semibold" />
                    <span className="text-xs text-muted-foreground">{fmtDate(s.soldDate)}</span>
                  </>
                }
              />
            ))}
            {soldLists.length > 5 && (
              <button className="h-11 w-full border-t border-border text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => setSoldExpanded((v) => !v)}>
                {soldExpanded ? "Show less" : `${soldLists.length - 5} more`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Active listings ── */}
      <div className="border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-neutral">Active listings · {activeLists.length}</div>
          {range(activePrices) && <div className="text-xs text-muted-foreground tabular-nums">{range(activePrices)}</div>}
        </div>
        {activeLists.length === 0 ? (
          <div className="py-3 text-center text-sm text-muted-foreground">{isModalRefreshing ? "Fetching…" : "No active listings — hit Refresh to load"}</div>
        ) : (
          <div>
            {activeLists.slice(0, activeExpanded ? activeLists.length : 5).map((s, i) => {
              const isLowest = i === 0 && activeLists.length > 1;
              return (
                <ListingRow
                  key={i}
                  s={s}
                  left={
                    <>
                      {hasOpt(s, "AUCTION") && (
                        <div className="flex shrink-0 items-center gap-1">
                          <span className={pillClass}>Auction</span>
                          {s.soldDate && <span className="text-xs text-muted-foreground">{timeLeft(s.soldDate)}</span>}
                          {s.bidCount != null && <span className="text-xs text-muted-foreground tabular-nums">{s.bidCount}b</span>}
                        </div>
                      )}
                      <span className="truncate text-xs text-muted-foreground">{s.title}</span>
                    </>
                  }
                  right={<MoneyDisplay amount={s.price} tone={isLowest ? "positive" : "neutral"} className="text-sm font-semibold" />}
                />
              );
            })}
            {activeLists.length > 5 && (
              <button className="h-11 w-full border-t border-border text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => setActiveExpanded((v) => !v)}>
                {activeExpanded ? "Show less" : `${activeLists.length - 5} more`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="text-xs text-muted-foreground">
          {pdSp?.last_updated ? `Updated ${fmtDate(pdSp.last_updated)}` : ""}
          {isSlabTierStale(pdSp, fmvVal) && <span className="ml-1 text-warning-strong">· stale</span>}
        </div>
        <button className={btnOutline} disabled={isModalRefreshing} onClick={() => handleRefreshSlabPrice(pdi)}>
          {isModalRefreshing ? "Fetching…" : "↺ Refresh"}
        </button>
      </div>
    </Modal>
  );
}

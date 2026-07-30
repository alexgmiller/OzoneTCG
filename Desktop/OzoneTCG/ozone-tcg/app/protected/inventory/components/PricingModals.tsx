"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { SlabPrice, RawCardPrice } from "../InventoryServer";
import { makeRawCardPriceKey } from "@/lib/justtcg";
import { type SlabSale } from "@/lib/ebay-client";
import { type FMVResult } from "@/lib/fmv";
import type { Item } from "../types";
import { fmt, getMovement, MovementBadge, gradeStyle, isSlabTierStale } from "../utils";

/* ── Pricing Detail Modal ───────────────────────────────────────────── */
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
  // Derive sp live from merged prices so background updates are reflected immediately
  const pdSp = mergedSlabPrices[slabKey];
  const isModalRefreshing = slabRefreshing[pdi.id];
  const fmvData = slabFMVData[pdi.id] ?? null;
  const fmvVal = fmvData?.fmv ?? null;

  // Helpers
  function fmtModalDate(d: string) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function applyOutlierFilter(items: SlabSale[]): SlabSale[] {
    if (items.length < 4) return items;
    const sorted = items.map((s) => s.price).sort((a, b) => a - b);
    const q1 = pct(sorted, 0.25);
    const q3 = pct(sorted, 0.75);
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const filtered = items.filter((s) => s.price >= lower && s.price <= upper);
    return filtered.length > 0 ? filtered : items;
  }

  function pct(sorted: number[], p: number): number {
    if (sorted.length === 1) return sorted[0];
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const frac = idx - lo;
    return frac === 0 ? sorted[lo] : sorted[lo] * (1 - frac) + sorted[lo + 1] * frac;
  }

  function timeLeft(endDateStr: string): string {
    if (!endDateStr) return "";
    const ms = new Date(endDateStr).getTime() - Date.now();
    if (ms <= 0) return "Ended";
    if (ms < 60 * 60 * 1000) return "Ending soon";
    const totalHours = Math.floor(ms / (60 * 60 * 1000));
    const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    if (totalHours < 24) return `${totalHours}h ${mins}m left`;
    const days = Math.floor(totalHours / 24);
    const hrs = totalHours % 24;
    return `${days}d ${hrs}h left`;
  }

  // Build filtered, sorted lists.
  // Sold: exclude only pure Best-Offer-only sales (unknown negotiated price).
  // Fixed+BestOffer listings (buyingOptions has both) are valid sold prices.
  const validSold = (pdSp?.sold_items ?? []).filter(
    (s) => !(s.buyingOptions.length === 1 && s.buyingOptions[0] === "BEST_OFFER") && s.price > 1
  );
  const soldLists = applyOutlierFilter(validSold)
    .sort((a, b) => new Date(b.soldDate).getTime() - new Date(a.soldDate).getTime());

  // Active: include all listings >$1 — asking price is valid signal regardless of offer options.
  const validActive = (pdSp?.active_items ?? []).filter((s) => s.price > 1);
  const activeLists = applyOutlierFilter(validActive).sort((a, b) => a.price - b.price);

  const soldHasAuction = soldLists.some((s) => (s.buyingOptions ?? []).includes("AUCTION"));
  const soldHasBestOffer = soldLists.some((s) => (s.buyingOptions ?? []).includes("BEST_OFFER") && !(s.buyingOptions ?? []).includes("AUCTION"));
  const soldTypesVary = soldHasAuction || soldHasBestOffer;
  const soldPrices = soldLists.map((s) => s.price);
  const activePrices = activeLists.map((s) => s.price);
  const soldMin = soldPrices.length ? Math.min(...soldPrices) : null;
  const soldMax = soldPrices.length ? Math.max(...soldPrices) : null;
  const activeMin = activePrices.length ? Math.min(...activePrices) : null;
  const activeMax = activePrices.length ? Math.max(...activePrices) : null;
  const soldCompCount = pdSp?.sold_count ?? soldLists.length;

  return (
    <div
      className="fixed inset-0 z-[70] modal-backdrop sm:flex sm:items-center sm:justify-center"
      onClick={() => setPricingDetailItem(null)}
    >
      <div
        className="absolute inset-0 flex flex-col bg-background slab-pricing-panel sm:relative sm:inset-auto sm:w-full sm:max-w-lg sm:max-h-[85vh] sm:rounded-2xl sm:overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex gap-3 min-w-0 flex-1">
            {/* Card thumbnail */}
            {pdi.image_url && (
              <div className="w-[60px] flex-shrink-0 rounded overflow-hidden bg-muted/40 self-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pdi.image_url} alt={pdi.name} className="w-full h-auto object-cover" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm leading-tight truncate">{pdi.name}</div>
              {(pdi.set_name || pdi.card_number) && (
                <div className="text-xs opacity-50 mt-0.5">{[pdi.set_name, pdi.card_number ? `#${pdi.card_number}` : ""].filter(Boolean).join(" · ")}</div>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {pdi.grade && <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeStyle(pdi.grade)}`}>{pdi.grade}</span>}
                {fmvVal != null && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold">{fmt(fmvVal)}</span>
                    <span className="text-[10px] opacity-40 font-normal">{fmvData?.mode ?? "—"}</span>
                    <MovementBadge pct={getMovement(fmvVal, pdi.acquired_market_price)} />
                  </div>
                )}
                {fmvVal == null && <span className="text-sm opacity-40">No price data</span>}
              </div>
              {(fmvData?.soldAnchor != null || fmvData?.listedAnchor != null) && (
                <div className="text-[11px] opacity-50 mt-0.5">
                  {fmvData.soldAnchor != null && `Sold: ${fmt(fmvData.soldAnchor)} (${fmvData.soldCount})`}
                  {fmvData.soldAnchor != null && fmvData.listedAnchor != null && " · "}
                  {fmvData.listedAnchor != null && `Listed: ${fmt(fmvData.listedAnchor)} (${fmvData.activeCount} active)`}
                </div>
              )}
              {pdi.acquired_market_price != null && (
                <div className="text-[11px] opacity-40 mt-0.5">
                  Acquired at {fmt(pdi.acquired_market_price)}{pdi.acquired_date ? ` · ${fmtModalDate(pdi.acquired_date)}` : ""}
                </div>
              )}
            </div>
          </div>
          <button className="modal-close-btn flex-shrink-0" onClick={() => setPricingDetailItem(null)}>✕</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 divide-y">
          {/* Recent Sales */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold opacity-50 uppercase tracking-wider">
                RECENT SALES · {soldCompCount} comps
              </div>
              {soldMin != null && soldMax != null && soldMin !== soldMax && (
                <div className="text-xs opacity-40 tabular-nums">{fmt(soldMin)} – {fmt(soldMax)}</div>
              )}
            </div>
            {soldLists.length === 0 ? (
              <div className="text-sm opacity-40 text-center py-3">
                {isModalRefreshing
                  ? "Fetching…"
                  : pdSp?.sold_items != null
                    ? "Sold data unavailable — Marketplace Insights API access required"
                    : "No sold data — hit ↺ Refresh to load"
                }
              </div>
            ) : (
              <div>
                {soldLists.slice(0, soldExpanded ? soldLists.length : 5).map((s, i) => (
                  <a
                    key={i}
                    href={s.itemUrl || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-between gap-2 px-1.5 py-1.5 border-t border-border/30 ${i % 2 === 1 ? "bg-muted/20" : ""} transition-colors group ${s.itemUrl ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"}`}
                    onClick={s.itemUrl ? undefined : (e) => e.preventDefault()}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {soldTypesVary && (s.buyingOptions ?? []).includes("AUCTION") && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium flex-shrink-0">Auction</span>
                      )}
                      {soldTypesVary && (s.buyingOptions ?? []).includes("BEST_OFFER") && !(s.buyingOptions ?? []).includes("AUCTION") && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex-shrink-0">Offer</span>
                      )}
                      <span className="text-xs opacity-50 truncate">{s.title}</span>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className="text-sm font-semibold tabular-nums">{fmt(s.price)}</span>
                      <span className="text-[10px] opacity-40">{fmtModalDate(s.soldDate)}</span>
                    </div>
                  </a>
                ))}
                {soldLists.length > 5 && (
                  <button
                    className="w-full text-xs text-center py-1.5 opacity-40 hover:opacity-70 transition-opacity border-t border-border/30"
                    onClick={() => setSoldExpanded((v) => !v)}
                  >
                    {soldExpanded ? "Show less" : `${soldLists.length - 5} more`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Active Listings */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold opacity-50 uppercase tracking-wider">
                ACTIVE LISTINGS · {activeLists.length} listed
              </div>
              {activeMin != null && activeMax != null && activeMin !== activeMax && (
                <div className="text-xs opacity-40 tabular-nums">{fmt(activeMin)} – {fmt(activeMax)}</div>
              )}
            </div>
            {activeLists.length === 0 ? (
              <div className="text-sm opacity-40 text-center py-3">{isModalRefreshing ? "Fetching…" : "No active listings — hit ↺ Refresh to load"}</div>
            ) : (
              <div>
                {activeLists.slice(0, activeExpanded ? activeLists.length : 5).map((s, i) => {
                  const isAuction = (s.buyingOptions ?? []).includes("AUCTION");
                  const isLowest = i === 0 && activeLists.length > 1;
                  return (
                    <a
                      key={i}
                      href={s.itemUrl || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-between gap-2 px-1.5 py-1.5 border-t border-border/30 ${i % 2 === 1 ? "bg-muted/20" : ""} ${isLowest ? "border-l-2 border-l-emerald-500 pl-2" : ""} transition-colors group ${s.itemUrl ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"}`}
                      onClick={s.itemUrl ? undefined : (e) => e.preventDefault()}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isAuction && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Auction</span>
                            {s.soldDate && <span className="text-[10px] opacity-50">{timeLeft(s.soldDate)}</span>}
                            {s.bidCount != null && <span className="text-[10px] opacity-50">{s.bidCount}b</span>}
                          </div>
                        )}
                        <span className="text-xs opacity-50 truncate">{s.title}</span>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${isLowest ? "text-emerald-600" : ""}`}>{fmt(s.price)}</span>
                    </a>
                  );
                })}
                {activeLists.length > 5 && (
                  <button
                    className="w-full text-xs text-center py-1.5 opacity-40 hover:opacity-70 transition-opacity border-t border-border/30"
                    onClick={() => setActiveExpanded((v) => !v)}
                  >
                    {activeExpanded ? "Show less" : `${activeLists.length - 5} more`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-between gap-2 flex-shrink-0 bg-background">
          <div className="text-xs opacity-40">
            {pdSp?.last_updated ? `Updated ${fmtModalDate(pdSp.last_updated)}` : ""}
            {isSlabTierStale(pdSp, fmvVal) && <span className="text-orange-400 ml-1">· stale</span>}
          </div>
          <button
            className="modal-btn-outline"
            style={{padding:"6px 14px", fontSize:"12px"}}
            disabled={isModalRefreshing}
            onClick={() => handleRefreshSlabPrice(pdi)}
          >
            {isModalRefreshing ? "Fetching…" : "↺ Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Raw Card Pricing Modal ────────────────────────────────────────── */
export function RawPricingModal({
  rawCardDetailItem,
  setRawCardDetailItem,
  mergedRawCardPrices,
  rawCardRefreshing,
  historyDuration,
  setHistoryDuration,
  handleRefreshRawCardPrice,
}: {
  rawCardDetailItem: Item;
  setRawCardDetailItem: (v: Item | null) => void;
  mergedRawCardPrices: Record<string, RawCardPrice>;
  rawCardRefreshing: Record<string, boolean>;
  historyDuration: "7d" | "30d" | "90d" | "180d";
  setHistoryDuration: (d: "7d" | "30d" | "90d" | "180d") => void;
  handleRefreshRawCardPrice: (it: Item) => void;
}) {
  const it = rawCardDetailItem;
  const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
  const rcp = mergedRawCardPrices[rawKey];
  const isRefreshing = rawCardRefreshing[it.id];

  const CONDITIONS: { label: string; key: "nm" | "lp" | "mp" | "hp" | "dmg" }[] = [
    { label: "Near Mint",          key: "nm"  },
    { label: "Lightly Played",     key: "lp"  },
    { label: "Moderately Played",  key: "mp"  },
    { label: "Heavily Played",     key: "hp"  },
    { label: "Damaged",            key: "dmg" },
  ];

  const priceByKey: Record<string, number | null> = rcp
    ? { nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }
    : { nm: null, lp: null, mp: null, hp: null, dmg: null };

  const itemCondKey = CONDITIONS.find((c) => c.label === it.condition)?.key ?? "nm";

  function fmtModalDate(d: string) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center modal-backdrop p-4"
      onClick={() => setRawCardDetailItem(null)}
    >
      <div
        className="modal-panel w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">{it.name}</div>
            {(it.set_name || it.card_number) && (
              <div className="text-xs opacity-50 mt-0.5">{[it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ")}</div>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {it.condition && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">{it.condition}</span>
              )}
              {rcp && priceByKey[itemCondKey] != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold">{fmt(priceByKey[itemCondKey])}</span>
                  <span className="text-[10px] opacity-40 font-normal">Market Value</span>
                  <MovementBadge pct={getMovement(priceByKey[itemCondKey] as number, it.acquired_market_price)} />
                </div>
              )}
              {(!rcp || priceByKey[itemCondKey] == null) && (
                <span className="text-sm opacity-40">{isRefreshing ? "Fetching…" : "No price data"}</span>
              )}
            </div>
            {it.acquired_market_price != null && (
              <div className="text-[11px] opacity-40 mt-1">
                Acquired at {fmt(it.acquired_market_price)}{it.acquired_date ? ` · ${fmtModalDate(it.acquired_date)}` : ""}
              </div>
            )}
          </div>
          <button className="modal-close-btn flex-shrink-0" onClick={() => setRawCardDetailItem(null)}>✕</button>
        </div>

        {/* Condition price table */}
        <div className="px-4 py-3">
          <div className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-2">Condition Prices · TCGPlayer</div>
          {!rcp ? (
            <div className="text-sm opacity-40 text-center py-3">
              {isRefreshing ? "Fetching…" : "No price data — hit ↺ Refresh to load"}
            </div>
          ) : (
            <div className="space-y-1">
              {CONDITIONS.map(({ label, key }) => {
                const price = priceByKey[key];
                const isItemCondition = key === itemCondKey;
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-lg ${isItemCondition ? "bg-blue-50 dark:bg-blue-950/30 ring-1 ring-blue-200 dark:ring-blue-800" : ""}`}
                  >
                    <span className={`text-sm ${isItemCondition ? "font-semibold text-blue-700 dark:text-blue-300" : "opacity-70"}`}>
                      {label}
                      {isItemCondition && <span className="ml-1.5 text-[10px] opacity-60">← this card</span>}
                    </span>
                    <span className={`text-sm tabular-nums ${isItemCondition ? "font-bold text-blue-700 dark:text-blue-300" : "opacity-70"}`}>
                      {price != null ? fmt(price) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Price history chart */}
        {(() => {
          const allHistory: { date: string; price: number }[] = rcp?.price_history ?? [];
          const DURATIONS: { label: string; key: "7d" | "30d" | "90d" | "180d"; days: number }[] = [
            { label: "7d",  key: "7d",  days: 7   },
            { label: "30d", key: "30d", days: 30  },
            { label: "90d", key: "90d", days: 90  },
            { label: "180d",key: "180d",days: 180 },
          ];
          const cutoffDate = new Date();
          const selectedDays = DURATIONS.find((d) => d.key === historyDuration)?.days ?? 90;
          cutoffDate.setDate(cutoffDate.getDate() - selectedDays);
          const cutoffStr = cutoffDate.toISOString().slice(0, 10);
          const filtered = allHistory.filter((p) => p.date >= cutoffStr);

          // Percentage change: first → last point
          const pctChange = filtered.length >= 2
            ? ((filtered[filtered.length - 1].price - filtered[0].price) / filtered[0].price) * 100
            : null;
          const lineColor = pctChange == null ? "#a855f7" : pctChange >= 0 ? "#22c55e" : "#ef4444";

          // X-axis tick formatter — show M/D
          function fmtTick(dateStr: string) {
            const p = dateStr.split("-");
            return `${Number(p[1])}/${Number(p[2])}`;
          }

          return (
            <div className="px-4 py-3 border-t">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="text-xs font-semibold opacity-50 uppercase tracking-wider">Price History · NM</div>
                <div className="flex items-center gap-1">
                  {pctChange != null && (
                    <span className={`text-xs font-semibold tabular-nums mr-1 ${pctChange >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                    </span>
                  )}
                  {DURATIONS.map((d) => (
                    <button
                      key={d.key}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                        historyDuration === d.key
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          : "opacity-40 hover:opacity-70"
                      }`}
                      onClick={() => setHistoryDuration(d.key)}
                    >{d.label}</button>
                  ))}
                </div>
              </div>
              {allHistory.length === 0 ? (
                <div className="text-xs opacity-30 text-center py-4">
                  {isRefreshing ? "Fetching…" : "No history — hit ↺ Refresh to load"}
                </div>
              ) : filtered.length < 3 ? (
                <div className="text-xs opacity-30 text-center py-4">Not enough history for this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={110}>
                  <LineChart data={filtered} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={fmtTick}
                      tick={{ fontSize: 9, opacity: 0.45 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis
                      tick={{ fontSize: 9, opacity: 0.45 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `$${v % 1 === 0 ? v : v.toFixed(2)}`}
                      domain={["auto", "auto"]}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 6, border: "none", background: "var(--background)", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
                      formatter={(v: number | undefined) => [v != null ? `$${v.toFixed(2)}` : "—", "NM Price"]}
                      labelFormatter={(label: unknown) => {
                        const s = String(label ?? "");
                        const p = s.split("-");
                        return `${Number(p[1])}/${Number(p[2])}/${p[0]}`;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke={lineColor}
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3, fill: lineColor }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          );
        })()}

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-between gap-2">
          <div className="text-xs opacity-40">
            {rcp?.last_updated ? `Updated ${fmtModalDate(rcp.last_updated)}` : ""}
            {rcp?.printing && rcp.printing !== "Normal" && (
              <span className="ml-1 opacity-60">· {rcp.printing}</span>
            )}
          </div>
          <button
            className="modal-btn-outline"
            style={{padding:"6px 14px", fontSize:"12px"}}
            disabled={isRefreshing}
            onClick={() => handleRefreshRawCardPrice(it)}
          >
            {isRefreshing ? "Fetching…" : "↺ Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}

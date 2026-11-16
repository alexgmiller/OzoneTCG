"use client";

import { Modal, MoneyDisplay } from "@/components/ui";
import type { RawCardPrice } from "../InventoryServer";
import { makeRawCardPriceKey } from "@/lib/justtcg";
import type { HistoryDuration, Item } from "../types";
import { fmt, fmtDate, getMovement, MovementBadge, setLine, btnOutline, pillClass } from "../utils";
import { Sparkline } from "./Sparkline";

const CONDITIONS: { label: string; key: "nm" | "lp" | "mp" | "hp" | "dmg" }[] = [
  { label: "Near Mint",          key: "nm"  },
  { label: "Lightly Played",     key: "lp"  },
  { label: "Moderately Played",  key: "mp"  },
  { label: "Heavily Played",     key: "hp"  },
  { label: "Damaged",            key: "dmg" },
];

const DURATIONS: { key: HistoryDuration; days: number }[] = [
  { key: "7d",   days: 7   },
  { key: "30d",  days: 30  },
  { key: "90d",  days: 90  },
  { key: "180d", days: 180 },
];

// ── Raw Card Pricing Modal (TCGPlayer) ──
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
  historyDuration: HistoryDuration;
  setHistoryDuration: (d: HistoryDuration) => void;
  handleRefreshRawCardPrice: (it: Item) => void;
}) {
  const it = rawCardDetailItem;
  const rcp = mergedRawCardPrices[makeRawCardPriceKey(it.name, it.set_name, it.card_number)];
  const isRefreshing = rawCardRefreshing[it.id];

  const priceByKey: Record<string, number | null> = rcp
    ? { nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }
    : { nm: null, lp: null, mp: null, hp: null, dmg: null };
  const itemCondKey = CONDITIONS.find((c) => c.label === it.condition)?.key ?? "nm";
  const itemPrice = priceByKey[itemCondKey];

  // ── History window ──
  const allHistory = rcp?.price_history ?? [];
  const selectedDays = DURATIONS.find((d) => d.key === historyDuration)?.days ?? 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - selectedDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = allHistory.filter((p) => p.date >= cutoffStr);
  const pctChange = filtered.length >= 2 ? ((filtered[filtered.length - 1].price - filtered[0].price) / filtered[0].price) * 100 : null;
  const lineTone = pctChange == null ? "text-accent" : pctChange >= 0 ? "text-positive" : "text-negative";
  const histMin = filtered.length ? Math.min(...filtered.map((p) => p.price)) : null;
  const histMax = filtered.length ? Math.max(...filtered.map((p) => p.price)) : null;
  const close = () => setRawCardDetailItem(null);

  return (
    <Modal open onClose={close} className="max-w-sm max-h-full overflow-y-auto">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight text-foreground">{it.name}</div>
          {setLine(it) && <div className="mt-0.5 text-xs text-muted-foreground">{setLine(it)}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {it.condition && <span className={pillClass}>{it.condition}</span>}
            {rcp && itemPrice != null ? (
              <div className="flex items-baseline gap-2">
                <MoneyDisplay amount={itemPrice} tone="neutral" className="text-base font-bold" />
                <span className="text-xs text-muted-foreground">Market</span>
                <MovementBadge pct={getMovement(itemPrice, it.acquired_market_price)} />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">{isRefreshing ? "Fetching…" : "No price data"}</span>
            )}
          </div>
          {it.acquired_market_price != null && (
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              Acquired at {fmt(it.acquired_market_price)}{it.acquired_date ? ` · ${fmtDate(it.acquired_date)}` : ""}
            </div>
          )}
        </div>
        <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" onClick={close} aria-label="Close">✕</button>
      </div>

      {/* ── Condition prices ── */}
      <div className="py-3">
        <div className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-neutral">Condition prices · TCGPlayer</div>
        {!rcp ? (
          <div className="py-3 text-center text-sm text-muted-foreground">{isRefreshing ? "Fetching…" : "No price data — hit Refresh to load"}</div>
        ) : (
          <div className="space-y-1">
            {CONDITIONS.map(({ label, key }) => {
              const price = priceByKey[key];
              const mine = key === itemCondKey;
              return (
                <div key={key} className={`flex min-h-11 items-center justify-between rounded-lg px-3 ${mine ? "bg-accent-tint" : ""}`}>
                  <span className={`text-sm ${mine ? "font-semibold text-accent" : "text-muted-foreground"}`}>
                    {label}{mine && <span className="ml-2 text-xs text-muted-foreground">this card</span>}
                  </span>
                  {price != null ? (
                    <MoneyDisplay amount={price} tone="neutral" className={`text-sm ${mine ? "font-bold" : ""}`} />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Price history ── */}
      <div className="border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-neutral">History · NM</div>
          <div className="flex items-center gap-1">
            {pctChange != null && (
              <span className={`mr-1 text-xs font-semibold tabular-nums ${pctChange >= 0 ? "text-positive" : "text-negative"}`}>
                {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
              </span>
            )}
            {DURATIONS.map((d) => (
              <button
                key={d.key}
                className={`h-11 min-w-11 rounded-lg px-2 text-xs font-medium transition-colors duration-150 ${historyDuration === d.key ? "bg-accent-tint text-accent" : "text-muted-foreground hover:bg-muted"}`}
                onClick={() => setHistoryDuration(d.key)}
              >{d.key}</button>
            ))}
          </div>
        </div>
        {allHistory.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">{isRefreshing ? "Fetching…" : "No history — hit Refresh to load"}</div>
        ) : filtered.length < 3 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Not enough history for this period</div>
        ) : (
          <div>
            <Sparkline values={filtered.map((p) => p.price)} className={lineTone} />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{fmtDate(filtered[0].date)}</span>
              {histMin != null && histMax != null && <span>{fmt(histMin)} – {fmt(histMax)}</span>}
              <span>{fmtDate(filtered[filtered.length - 1].date)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="text-xs text-muted-foreground">
          {rcp?.last_updated ? `Updated ${fmtDate(rcp.last_updated)}` : ""}
          {rcp?.printing && rcp.printing !== "Normal" && <span className="ml-1">· {rcp.printing}</span>}
        </div>
        <button className={btnOutline} disabled={isRefreshing} onClick={() => handleRefreshRawCardPrice(it)}>
          {isRefreshing ? "Fetching…" : "↺ Refresh"}
        </button>
      </div>
    </Modal>
  );
}

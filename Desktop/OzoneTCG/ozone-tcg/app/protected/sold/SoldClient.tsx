"use client";

import { useState } from "react";
import type { SaleGroup } from "./SoldServer";

function fmt(v: number | null) {
  if (v == null) return "-";
  return `$${v.toFixed(2)}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function SoldClient({ sales }: { sales: SaleGroup[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  function toggle(id: string) {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? sales.filter((sale) =>
        sale.items.some(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            it.category.toLowerCase().includes(q) ||
            it.owner.toLowerCase().includes(q) ||
            (it.condition ?? "").toLowerCase().includes(q)
        )
      )
    : sales;

  if (sales.length === 0) {
    return (
      <div className="border rounded-xl p-6 text-sm opacity-70">
        No sales yet. Select items in Inventory and tap Sell to record a sale.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        placeholder="Search sales…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
      />
      <div className="text-xs opacity-50 px-1">
        {filtered.length} sale{filtered.length !== 1 ? "s" : ""}
        {q && ` matching "${query}"`}
      </div>
      {filtered.length === 0 && (
        <div className="border rounded-xl p-6 text-sm opacity-70">No sales match your search.</div>
      )}
      {filtered.map((sale) => {
        const matchedItems = q
          ? sale.items.filter(
              (it) =>
                it.name.toLowerCase().includes(q) ||
                it.category.toLowerCase().includes(q) ||
                it.owner.toLowerCase().includes(q) ||
                (it.condition ?? "").toLowerCase().includes(q)
            )
          : sale.items;
        const isOpen = expandedIds.has(sale.saleId);
        const isSingle = sale.items.length === 1 && !sale.items[0].sale_id;

        return (
          <div key={sale.saleId} className="border rounded-xl overflow-hidden">
            {/* Sale header — tap to expand */}
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left gap-3"
              onClick={() => toggle(sale.saleId)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {isSingle
                    ? sale.items[0].name
                    : `${sale.items.length} items`}
                </div>
                <div className="text-xs opacity-60 mt-0.5">{fmtDate(sale.soldAt)}</div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-sm font-semibold text-green-600">{fmt(sale.total)}</div>
                <span className="text-xs opacity-40">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {/* Expanded item list */}
            {isOpen && (
              <div className="border-t">
                {matchedItems.map((it, i) => {
                  const totalMarket = matchedItems.reduce((s, x) => s + (x.market ?? 0), 0);
                  const pct = totalMarket > 0 && it.market != null
                    ? ((it.market / totalMarket) * 100).toFixed(0)
                    : null;

                  return (
                    <div
                      key={it.id}
                      className={`px-4 py-3 flex items-center justify-between gap-3 ${i > 0 ? "border-t" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{it.name}</div>
                        <div className="text-xs opacity-60 space-x-2">
                          <span className="capitalize">{it.category}</span>
                          {it.condition && <span>• {it.condition}</span>}
                          <span>• {it.owner}</span>
                          {pct && <span className="opacity-70">({pct}% of lot)</span>}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-green-600">{fmt(it.sold_price)}</div>
                        <div className="text-xs opacity-50">mkt {fmt(it.market)}</div>
                      </div>
                    </div>
                  );
                })}

                {/* Sale footer totals */}
                {sale.items.length > 1 && (
                  <div className="border-t px-4 py-2 flex justify-between text-xs opacity-70">
                    <span>Total market value</span>
                    <span>{fmt(sale.items.reduce((s, it) => s + (it.market ?? 0), 0))}</span>
                  </div>
                )}
                <div className="border-t px-4 py-2 flex justify-between text-sm font-semibold">
                  <span>Sale total</span>
                  <span className="text-green-600">{fmt(sale.total)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
